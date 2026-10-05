import { describe, expect, it } from 'vitest';
import {
	adcToVolts,
	baudFor,
	compareFor,
	dutyFor,
	lsb,
	parseInt2,
	pwm,
	timerFits,
	uartFit,
	voltsToAdc
} from './logic';

const near = (a: number, b: number, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('PWM', () => {
	it('gives average and RMS', () => {
		const p = pwm(0.25, 5);
		near(p.avg, 1.25);
		near(p.rms, 2.5);
		near(pwm(0.5, 12, 2).avg, 7);
	});
	it('inverts', () => {
		near(dutyFor(1.25, 5), 0.25);
		expect(() => dutyFor(6, 5)).toThrow(/outside/);
		expect(() => dutyFor(1, 5, 5)).toThrow(/differ/);
		expect(() => pwm(1.5, 5)).toThrow(/between 0 and 100/);
	});
	it('computes compare values', () => {
		expect(compareFor(0.25, 999)).toBe(250);
		expect(compareFor(1, 255)).toBe(256);
	});
});

describe('timers', () => {
	it('finds the AVR 1 kHz setting at 16 MHz, 8 bit', () => {
		const f = timerFits(16e6, 1000, 8, 'avr');
		expect(f[0]).toMatchObject({ prescaler: 64, top: 249 });
		near(f[0].error, 0);
		const n256 = f.find((x) => x.prescaler === 256)!;
		expect(n256.top).toBe(62);
		near(n256.freq, 16e6 / (256 * 63), 1e-6);
		expect(f.some((x) => x.prescaler === 8)).toBe(false);
	});
	it('prefers resolution when errors tie', () => {
		const f = timerFits(16e6, 1000, 16, 'avr');
		expect(f[0]).toMatchObject({ prescaler: 1, top: 15999 });
	});
	it('phase correct halves the rate', () => {
		const f = timerFits(16e6, 1000, 16, 'avr', 'phase');
		expect(f[0]).toMatchObject({ prescaler: 1, top: 8000 });
	});
	it('searches any prescaler', () => {
		const f = timerFits(72e6, 50, 16, 'any');
		near(f[0].error, 0);
		expect(f[0].top).toBeLessThanOrEqual(65535);
		near(72e6 / (f[0].prescaler * (f[0].top + 1)), 50, 1e-9);
	});
	it('reports impossible targets', () => {
		expect(() => timerFits(16e6, 0.5, 8, 'avr')).toThrow(/too low/);
		expect(() => timerFits(16e6, 9e6, 8, 'avr')).toThrow(/half the clock/);
		expect(() => timerFits(0, 1, 8, 'avr')).toThrow(/Clock/);
	});
});

describe('UART', () => {
	it('matches the ATmega328P table at 16 MHz', () => {
		const a = uartFit(16e6, 9600, 16, 'avr');
		expect(a.reg).toBe(103);
		expect(a.error.toFixed(1)).toBe('0.2');
		const b = uartFit(16e6, 115200, 16, 'avr');
		expect(b.reg).toBe(8);
		expect(b.error.toFixed(1)).toBe('-3.5');
		const c = uartFit(16e6, 115200, 8, 'avr');
		expect(c.reg).toBe(16);
		expect(c.error.toFixed(1)).toBe('2.1');
	});
	it('uses fractional divisors', () => {
		const s = uartFit(72e6, 115200, 16, 'frac');
		expect(s.reg).toBe(625);
		near(s.divisor, 39.0625);
		near(s.error, 0);
	});
	it('uses integer divisors', () => {
		const s = uartFit(1.8432e6, 9600, 16, 'int');
		expect(s.reg).toBe(12);
		near(s.error, 0);
		near(baudFor(1.8432e6, 1, 16, 'int'), 115200);
	});
	it('validates', () => {
		expect(() => uartFit(16e6, 0, 16, 'avr')).toThrow(/Baud/);
		expect(() => uartFit(16e6, 9600, 4, 'avr')).toThrow(/8 or 16/);
		expect(() => uartFit(16e6, 10, 16, 'avr')).toThrow(/12 bits/);
		expect(() => baudFor(16e6, 0, 16, 'int')).toThrow(/Divisor/);
	});
});

describe('ADC', () => {
	it('converts both ways', () => {
		near(adcToVolts(512, 10, 5), 2.5);
		near(adcToVolts(4095, 12, 3.3), (4095 * 3.3) / 4096);
		expect(voltsToAdc(2.5, 10, 5)).toBe(512);
		expect(voltsToAdc(5, 10, 5)).toBe(1023);
		expect(voltsToAdc(1.65, 12, 3.3)).toBe(2048);
		near(lsb(10, 5), 5 / 1024);
	});
	it('validates', () => {
		expect(() => adcToVolts(1024, 10, 5)).toThrow(/0 to 1023/);
		expect(() => adcToVolts(1, 0, 5)).toThrow(/Bits/);
		expect(() => adcToVolts(1, 10, 0)).toThrow(/Vref/);
		expect(() => voltsToAdc(-1, 10, 5)).toThrow(/negative/);
	});
	it('reads hex and binary', () => {
		expect(parseInt2('0x3FF')).toBe(1023);
		expect(parseInt2('0b101')).toBe(5);
		expect(parseInt2('1_000')).toBe(1000);
		expect(() => parseInt2('1.5')).toThrow(/whole number/);
	});
});
