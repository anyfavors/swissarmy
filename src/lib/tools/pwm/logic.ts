/**
 * PWM, timer, UART baud and ADC arithmetic for microcontrollers.
 *
 * Sources:
 * - Microchip ATmega328P datasheet (DS40002061): Timer/Counter1 fast PWM
 *   f = fclk / (N × (1 + TOP)), phase correct f = fclk / (2 × N × TOP), prescalers 1, 8, 64, 256,
 *   1024 (Timer0/1) and 1, 8, 32, 64, 128, 256, 1024 (Timer2). USART: baud = fclk / (16 (UBRR + 1)),
 *   or / (8 (UBRR + 1)) with U2X.
 * - ST RM0090 / RM0008 reference manuals: timer update rate fclk / ((PSC + 1)(ARR + 1)),
 *   PSC is 16 bits; USART baud = fclk / USARTDIV with 16× oversampling, USARTDIV in 1/16 steps.
 * - ADC transfer: code = Vin × 2^n / Vref (ATmega328P datasheet 24.7, "ADC = Vin · 1024 / Vref").
 */

// ---------- PWM ----------

export interface Pwm {
	avg: number;
	rms: number;
	duty: number;
}

/** Average and RMS of a square wave between vLow and vHigh at duty (0 to 1). */
export function pwm(duty: number, vHigh: number, vLow = 0): Pwm {
	if (!(duty >= 0 && duty <= 1)) throw new Error('Duty cycle must be between 0 and 100 %');
	return {
		duty,
		avg: vLow + duty * (vHigh - vLow),
		rms: Math.sqrt(duty * vHigh * vHigh + (1 - duty) * vLow * vLow)
	};
}

/** Duty (0 to 1) that gives an average voltage. */
export function dutyFor(avg: number, vHigh: number, vLow = 0): number {
	if (vHigh === vLow) throw new Error('High and low level must differ');
	const d = (avg - vLow) / (vHigh - vLow);
	if (d < -1e-12 || d > 1 + 1e-12) throw new Error('That average is outside the two levels');
	return Math.min(1, Math.max(0, d));
}

/** Compare register value for a duty with counter period TOP + 1 (STM32 CCR, ARR). */
export function compareFor(duty: number, top: number): number {
	return Math.round(duty * (top + 1));
}

// ---------- timers ----------

export type PrescalerSet = 'avr' | 'avr2' | 'any';
export const PRESCALERS: Record<PrescalerSet, { name: string; short: string; list?: number[] }> = {
	avr: {
		short: 'AVR T0, T1',
		name: 'AVR Timer0/1: 1, 8, 64, 256, 1024',
		list: [1, 8, 64, 256, 1024]
	},
	avr2: {
		short: 'AVR T2',
		name: 'AVR Timer2: 1, 8, 32, 64, 128, 256, 1024',
		list: [1, 8, 32, 64, 128, 256, 1024]
	},
	any: { short: 'Any (STM32)', name: 'Any 1 to 65536 (STM32 PSC + 1)' }
};

export type TimerMode = 'fast' | 'phase';

export interface TimerFit {
	prescaler: number;
	top: number;
	freq: number;
	/** Percent */
	error: number;
	/** Duty resolution in bits */
	bits: number;
}

function fit(
	clk: number,
	target: number,
	n: number,
	max: number,
	mode: TimerMode
): TimerFit | undefined {
	const ideal = mode === 'fast' ? clk / (n * target) - 1 : clk / (2 * n * target);
	let top = Math.round(ideal);
	if (top > max) return undefined;
	if (top < 1) top = 1;
	const freq = mode === 'fast' ? clk / (n * (top + 1)) : clk / (2 * n * top);
	return {
		prescaler: n,
		top,
		freq,
		error: ((freq - target) / target) * 100,
		bits: Math.log2(top + 1)
	};
}

/**
 * Prescaler and TOP (ARR) for a target frequency. Returns every working prescaler from a fixed
 * list, or the best few for the 'any' set, best first: lowest error, then finest resolution.
 */
export function timerFits(
	clk: number,
	target: number,
	counterBits: number,
	set: PrescalerSet,
	mode: TimerMode = 'fast'
): TimerFit[] {
	if (!(clk > 0)) throw new Error('Clock must be above zero');
	if (!(target > 0)) throw new Error('Target frequency must be above zero');
	if (!(counterBits >= 2 && counterBits <= 32)) throw new Error('Counter must be 2 to 32 bits');
	if (target > clk / 2) throw new Error('Target is above half the clock');
	const max = 2 ** counterBits - 1;
	const out: TimerFit[] = [];
	const list = PRESCALERS[set].list;
	if (list) {
		for (const n of list) {
			const f = fit(clk, target, n, max, mode);
			if (f) out.push(f);
		}
	} else {
		for (let n = 1; n <= 65536; n++) {
			const f = fit(clk, target, n, max, mode);
			if (f) out.push(f);
		}
	}
	if (!out.length)
		throw new Error('Target too low for this counter and prescaler, use a wider counter');
	out.sort((a, b) => Math.abs(a.error) - Math.abs(b.error) || b.top - a.top);
	if (!list) {
		// Keep the best, then the best per error level, so the list stays short
		const seen = new Set<string>();
		return out
			.filter((f) => {
				const k = Math.abs(f.error).toFixed(6);
				if (seen.has(k)) return false;
				seen.add(k);
				return true;
			})
			.slice(0, 5);
	}
	return out;
}

// ---------- UART ----------

export type UartStyle = 'avr' | 'int' | 'frac';
export const UART_STYLES: Record<UartStyle, string> = {
	avr: 'AVR UBRR: baud = fclk / (OS × (UBRR + 1))',
	int: 'Integer divisor: baud = fclk / (OS × div)',
	frac: 'STM32 USARTDIV in 1/16 steps: baud = fclk / (OS × div)'
};

export interface UartFit {
	/** Register value: UBRR, the divisor, or BRR (USARTDIV × 16) */
	reg: number;
	divisor: number;
	actual: number;
	/** Percent */
	error: number;
}

/** Baud rate for a register value. */
export function baudFor(clk: number, reg: number, os: number, style: UartStyle): number {
	if (!(clk > 0)) throw new Error('Clock must be above zero');
	if (style === 'avr') {
		if (!(reg >= 0)) throw new Error('UBRR cannot be negative');
		return clk / (os * (reg + 1));
	}
	if (!(reg > 0)) throw new Error('Divisor must be above zero');
	return style === 'frac' ? clk / (os * (reg / 16)) : clk / (os * reg);
}

export function uartFit(clk: number, baud: number, os: number, style: UartStyle): UartFit {
	if (!(clk > 0)) throw new Error('Clock must be above zero');
	if (!(baud > 0)) throw new Error('Baud rate must be above zero');
	if (![8, 16].includes(os)) throw new Error('Oversampling is 8 or 16');
	let reg: number;
	let divisor: number;
	if (style === 'avr') {
		reg = Math.max(0, Math.round(clk / (os * baud) - 1));
		if (reg > 4095) throw new Error('UBRR is 12 bits, the baud rate is too low for this clock');
		divisor = reg + 1;
	} else if (style === 'frac') {
		reg = Math.max(16, Math.round((16 * clk) / (os * baud)));
		divisor = reg / 16;
	} else {
		reg = Math.max(1, Math.round(clk / (os * baud)));
		divisor = reg;
	}
	const actual = baudFor(clk, reg, os, style);
	return { reg, divisor, actual, error: ((actual - baud) / baud) * 100 };
}

export const STANDARD_BAUDS = [
	1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600
];

// ---------- ADC ----------

export function adcToVolts(code: number, bits: number, vref: number): number {
	checkAdc(bits, vref);
	const max = 2 ** bits - 1;
	if (!Number.isInteger(code) || code < 0 || code > max)
		throw new Error(`Reading must be a whole number from 0 to ${max}`);
	return (code * vref) / 2 ** bits;
}

export function voltsToAdc(v: number, bits: number, vref: number): number {
	checkAdc(bits, vref);
	if (v < 0) throw new Error('Voltage cannot be negative for a single-ended ADC');
	return Math.min(2 ** bits - 1, Math.floor((v * 2 ** bits) / vref));
}

export function lsb(bits: number, vref: number): number {
	checkAdc(bits, vref);
	return vref / 2 ** bits;
}

function checkAdc(bits: number, vref: number) {
	if (!(Number.isInteger(bits) && bits >= 1 && bits <= 32)) throw new Error('Bits must be 1 to 32');
	if (!(vref > 0)) throw new Error('Vref must be above zero');
}

/** Reads "1023", "0x3FF", "0b1111111111". */
export function parseInt2(s: string): number {
	const t = s.trim().replace(/_/g, '');
	if (!t) throw new Error('Enter a reading');
	let n: number;
	if (/^0x[0-9a-f]+$/i.test(t)) n = parseInt(t.slice(2), 16);
	else if (/^0b[01]+$/i.test(t)) n = parseInt(t.slice(2), 2);
	else if (/^\d+$/.test(t)) n = Number(t);
	else throw new Error(`"${s.trim()}" is not a whole number`);
	return n;
}
