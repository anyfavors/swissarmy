import { describe, expect, it } from 'vitest';
import { bestPairs, combine, divider, fmt, idealR2, ledResistor, parseQty, solve } from './logic';

describe('quantities', () => {
	it('parses units and prefixes', () => {
		expect(parseQty('5V', 'V')).toBe(5);
		expect(parseQty('20mA', 'A')).toBe(0.02);
		expect(parseQty('20 ma', 'A')).toBe(0.02);
		expect(parseQty('4k7', 'R')).toBe(4700);
		expect(parseQty('0.25 W', 'W')).toBe(0.25);
		expect(parseQty('  ', 'V')).toBeUndefined();
		expect(() => parseQty('five', 'V')).toThrow(/Could not read/);
	});

	it('formats with prefixes', () => {
		expect(fmt(0.02, 'A')).toBe('20 mA');
		expect(fmt(4700, 'Ω')).toBe('4.7 kΩ');
		expect(fmt(0.000123, 'W')).toBe('123 µW');
	});
});

describe("Ohm's law", () => {
	it('solves from every pair', () => {
		const full = { V: 12, I: 0.5, R: 24, P: 6 };
		const pairs: (keyof typeof full)[][] = [
			['V', 'I'],
			['V', 'R'],
			['V', 'P'],
			['I', 'R'],
			['I', 'P'],
			['R', 'P']
		];
		for (const [a, b] of pairs) {
			expect(solve({ [a]: full[a], [b]: full[b] })).toEqual(full);
		}
	});

	it('wants exactly two values', () => {
		expect(() => solve({ V: 1 })).toThrow(/exactly two/);
		expect(() => solve({ V: 1, I: 1, R: 1 })).toThrow(/3 given/);
		expect(() => solve({ V: 5, R: 0 })).toThrow(/short circuit/);
		expect(() => solve({ R: -1, I: 1 })).toThrow(/negative/);
	});
});

describe('voltage divider', () => {
	it('computes Vout, current and power', () => {
		const d = divider(12, 10000, 10000);
		expect(d.vout).toBe(6);
		expect(d.current).toBe(0.0006);
		expect(d.p1).toBe(0.0036);
		expect(d.rout).toBe(5000);
	});

	it('finds R2 for a target', () => {
		expect(idealR2(5, 3.3, 10000)).toBe(19411.7647059);
		expect(() => idealR2(5, 6, 1000)).toThrow(/between 0 and Vin/);
	});

	it('picks E24 pairs close to the target', () => {
		const best = bestPairs(5, 3.3);
		expect(best.length).toBe(5);
		expect(Math.abs(best[0].error)).toBeLessThan(0.5);
		for (let i = 1; i < best.length; i++)
			expect(Math.abs(best[i].error)).toBeGreaterThanOrEqual(Math.abs(best[i - 1].error));
		const half = bestPairs(10, 5);
		expect(half[0].error).toBe(0);
		expect(half[0].r1).toBe(half[0].r2);
	});
});

describe('LED resistor', () => {
	it('classic 5 V, red LED 2 V at 20 mA', () => {
		const l = ledResistor(5, 2, 0.02);
		expect(l.ideal).toBe(150);
		expect(l.chosen).toBe(150);
		expect(l.current).toBe(0.02);
		expect(l.power).toBe(0.06);
		expect(l.rating).toBe(0.125);
	});

	it('rounds up to the next E24 value and handles strings', () => {
		const l = ledResistor(12, 3.1, 0.02, 3);
		expect(l.ideal).toBe(135);
		expect(l.chosen).toBe(150);
		expect(l.current).toBe(0.018);
		expect(l.rating).toBe(0.125);
		expect(ledResistor(24, 2, 0.1).rating).toBe(5);
		expect(ledResistor(24, 2, 0.35).rating).toBeUndefined();
	});

	it('refuses impossible strings', () => {
		expect(() => ledResistor(5, 2, 0.02, 3)).toThrow(/not above 3 × 2 V/);
		expect(() => ledResistor(5, 2, 0)).toThrow(/above zero/);
	});
});

describe('series and parallel', () => {
	it('sums lists', () => {
		const c = combine('10k, 10k\n4k7');
		expect(c.values).toEqual([10000, 10000, 4700]);
		expect(c.series).toBe(24700);
		expect(c.parallel).toBe(2422.68041237);
		expect(combine('100 100').parallel).toBe(50);
		expect(combine('10 ohm 22 ohm').values).toEqual([10, 22]);
		expect(combine('0, 100').parallel).toBe(0);
	});

	it('explains bad input', () => {
		expect(() => combine('')).toThrow(/Enter resistor values/);
		expect(() => combine('10k, banana')).toThrow(/banana/);
	});
});
