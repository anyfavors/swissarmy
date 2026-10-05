/**
 * NE555 timer arithmetic.
 *
 * Source: Texas Instruments NE555 datasheet (SLFS022), section 8.3 "Feature Description":
 * astable tH = 0.693 (RA + RB) C, tL = 0.693 RB C, f = 1.44 / ((RA + 2 RB) C);
 * monostable tw = 1.1 RA C. The constants are ln 2 = 0.6931 and ln 3 = 1.0986, from charging
 * between 1/3 and 2/3 of Vcc. We use the exact logarithms; results match the datasheet rounding.
 */
import { clean, nearest, type Series } from '../resistor/logic';
import { fmt } from '../ohms-law/logic';

export { clean, fmt };

const LN2 = Math.LN2;
const LN3 = Math.log(3);

export interface Astable {
	high: number;
	low: number;
	period: number;
	freq: number;
	/** Percent of the period the output is high */
	duty: number;
}

/**
 * Astable output for R1 (RA, Vcc to pin 7), R2 (RB, pin 7 to pins 6/2) and C.
 * With `diode` a diode across R2 charges C through R1 only (diode drop ignored).
 */
export function astable(r1: number, r2: number, c: number, diode = false): Astable {
	if (!(r1 > 0)) throw new Error('R1 must be above zero');
	if (!(r2 > 0)) throw new Error('R2 must be above zero');
	if (!(c > 0)) throw new Error('C must be above zero');
	const high = LN2 * (diode ? r1 : r1 + r2) * c;
	const low = LN2 * r2 * c;
	const period = high + low;
	return { high, low, period, freq: 1 / period, duty: (high / period) * 100 };
}

export interface AstablePick {
	/** Exact values */
	r1: number;
	r2: number;
	/** Nearest preferred values */
	r1n: number;
	r2n: number;
	diode: boolean;
	/** What the nearest values give */
	actual: Astable;
	warnings: string[];
}

/**
 * Solves R1 and R2 for a frequency and duty cycle with a chosen C.
 * Without a diode duty must be above 50 %. At or below 50 % the diode arrangement is used.
 */
export function solveAstable(
	freq: number,
	dutyPct: number,
	c: number,
	s: Series = 'E24',
	forceDiode = false
): AstablePick {
	if (!(freq > 0)) throw new Error('Frequency must be above zero');
	if (!(c > 0)) throw new Error('C must be above zero');
	if (!(dutyPct > 0 && dutyPct < 100)) throw new Error('Duty cycle must be between 0 and 100 %');
	const d = dutyPct / 100;
	const diode = forceDiode || d <= 0.5;
	const th = d / freq;
	const tl = (1 - d) / freq;
	const r2 = tl / (LN2 * c);
	const r1 = diode ? th / (LN2 * c) : th / (LN2 * c) - r2;
	const r1n = nearest(r1, s).nearest;
	const r2n = nearest(r2, s).nearest;
	const actual = astable(r1n, r2n, c, diode);
	const warnings: string[] = [];
	if (r1n < 1e3)
		warnings.push(
			'R1 under 1 kΩ: the discharge transistor sinks Vcc / R1, keep R1 at 1 kΩ or more'
		);
	if (Math.max(r1n, r2n) > 10e6)
		warnings.push('Over 10 MΩ: leakage and threshold current start to matter, use a bigger C');
	if (Math.min(r1n, r2n) < 100) warnings.push('Very low resistance, use a smaller C');
	if (!forceDiode && d <= 0.5)
		warnings.push('Duty at or below 50 % needs a diode across R2, values are for that circuit');
	return { r1, r2, r1n, r2n, diode, actual, warnings };
}

export interface Mono {
	width: number;
}

export function monostable(r: number, c: number): Mono {
	if (!(r > 0)) throw new Error('R must be above zero');
	if (!(c > 0)) throw new Error('C must be above zero');
	return { width: LN3 * r * c };
}

/** R for a pulse width with a chosen C, with the nearest preferred value. */
export function solveMono(width: number, c: number, s: Series = 'E24') {
	if (!(width > 0)) throw new Error('Pulse width must be above zero');
	if (!(c > 0)) throw new Error('C must be above zero');
	const r = width / (LN3 * c);
	const rn = nearest(r, s).nearest;
	return { r, rn, actual: monostable(rn, c).width };
}

/** Parses "50", "50%", "33.3 %" */
export function parsePct(s: string): number | undefined {
	const t = s.trim().replace(/\s*%$/, '').replace(',', '.');
	if (!t) return undefined;
	const n = Number(t);
	if (!Number.isFinite(n)) throw new Error(`"${s.trim()}" is not a percentage`);
	return n;
}

export { parseValue } from '../resistor/logic';
