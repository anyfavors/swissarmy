import { describe, expect, it } from 'vitest';
import { astable, monostable, parsePct, solveAstable, solveMono } from './logic';

const near = (a: number, b: number, rel = 2e-3) =>
	expect(Math.abs(a - b) / Math.abs(b)).toBeLessThan(rel);

describe('astable', () => {
	it('matches the datasheet formulas', () => {
		// 1k, 10k, 10 nF: f = 1.44 / (21k × 10n) = 6857 Hz
		const a = astable(1e3, 10e3, 10e-9);
		near(a.freq, 1.44 / (21e3 * 10e-9));
		near(a.high, 0.693 * 11e3 * 10e-9);
		near(a.low, 0.693 * 10e3 * 10e-9);
		near(a.duty, (11 / 21) * 100);
		near(a.period, a.high + a.low, 1e-12);
	});
	it('handles the diode arrangement', () => {
		const a = astable(10e3, 10e3, 100e-9, true);
		near(a.duty, 50, 1e-9);
	});
	it('rejects zero values', () => {
		expect(() => astable(0, 1, 1)).toThrow(/R1/);
		expect(() => astable(1, 0, 1)).toThrow(/R2/);
		expect(() => astable(1, 1, 0)).toThrow(/C must/);
	});
});

describe('solve astable', () => {
	it('finds exact values that reproduce f and duty', () => {
		const p = solveAstable(1000, 60, 100e-9);
		expect(p.diode).toBe(false);
		const exact = astable(p.r1, p.r2, 100e-9);
		near(exact.freq, 1000, 1e-9);
		near(exact.duty, 60, 1e-9);
	});
	it('rounds to E-series and reports what they give', () => {
		const p = solveAstable(1000, 60, 100e-9, 'E24');
		expect([p.r1n, p.r2n].every((r) => r > 0)).toBe(true);
		near(p.actual.freq, 1000, 0.08);
		expect(Math.abs(p.actual.duty - 60)).toBeLessThan(5);
	});
	it('switches to the diode circuit at 50 % and below', () => {
		const p = solveAstable(1000, 25, 100e-9);
		expect(p.diode).toBe(true);
		const exact = astable(p.r1, p.r2, 100e-9, true);
		near(exact.duty, 25, 1e-9);
		expect(p.warnings.join(' ')).toMatch(/diode/);
	});
	it('warns on low R1', () => {
		const p = solveAstable(100e3, 55, 1e-6);
		expect(p.warnings.join(' ')).toMatch(/1 kΩ/);
	});
	it('validates', () => {
		expect(() => solveAstable(0, 50, 1e-9)).toThrow(/Frequency/);
		expect(() => solveAstable(1, 100, 1e-9)).toThrow(/Duty/);
	});
});

describe('monostable', () => {
	it('is 1.1 RC', () => {
		near(monostable(100e3, 10e-6).width, 1.1, 2e-3);
	});
	it('solves R for a pulse', () => {
		const m = solveMono(1, 10e-6);
		near(m.r, 1 / (Math.log(3) * 10e-6), 1e-9);
		expect(m.rn).toBe(91000);
		expect(() => solveMono(0, 1)).toThrow(/Pulse width/);
	});
});

describe('parsePct', () => {
	it('reads percentages', () => {
		expect(parsePct('50%')).toBe(50);
		expect(parsePct(' 33,3 % ')).toBe(33.3);
		expect(parsePct('')).toBeUndefined();
		expect(() => parsePct('x')).toThrow(/not a percentage/);
	});
});
