import { describe, expect, it } from 'vitest';
import { histogram, modes, parseList, percentile, sum, summarise, welford } from './logic';

/** NIST StRD NumAcc3/NumAcc4 layout: the centre value, then 500 pairs of centre ∓ 0.1. */
function numAcc(centre: number): number[] {
	const xs = [centre + 0.2];
	for (let i = 0; i < 500; i++) xs.push(centre + 0.1, centre + 0.3);
	return xs;
}

describe('parseList', () => {
	it('splits on any separator', () => {
		expect(parseList('1, 2;3\t4\n5 | 6').values).toEqual([1, 2, 3, 4, 5, 6]);
		expect(parseList('−1.5e2 7% .5').values).toEqual([-150, 7, 0.5]);
	});

	it('reports what it skipped', () => {
		expect(parseList('value\n1\n2\nn/a\n3')).toEqual({
			values: [1, 2, 3],
			skipped: ['value', 'n/a']
		});
	});

	it('reads Danish decimal commas when asked', () => {
		expect(parseList('1,5 2,25\n3', true).values).toEqual([1.5, 2.25, 3]);
		expect(parseList('1.234,5; 1.234; 2.5', true).values).toEqual([1234.5, 1234, 2.5]);
		expect(parseList('1,5 2,25').values).toEqual([1, 5, 2, 25]);
	});
});

describe('NIST StRD univariate datasets', () => {
	// https://www.itl.nist.gov/div898/strd/univ/numacc1.html: mean 10000002, sd 1
	it('NumAcc1', () => {
		const s = summarise([10000001, 10000003, 10000002]);
		expect(s.mean).toBe(10000002);
		expect(s.sampleSd).toBe(1);
	});

	// NumAcc3: 1001 values around 1000000.2, certified mean 1000000.2, sd 0.1
	it('NumAcc3', () => {
		const s = summarise(numAcc(1000000));
		expect(s.count).toBe(1001);
		expect(s.mean).toBeCloseTo(1000000.2, 8);
		expect(s.sampleSd!).toBeCloseTo(0.1, 9);
	});

	// NumAcc4: 1001 values around 10000000.2, certified mean 10000000.2, sd 0.1
	it('NumAcc4, where the textbook one-pass formula fails', () => {
		const xs = numAcc(10000000);
		const s = summarise(xs);
		expect(s.mean).toBeCloseTo(10000000.2, 7);
		expect(s.sampleSd!).toBeCloseTo(0.1, 8);
		// Sum of squares minus square of sums loses all digits here.
		const n = xs.length;
		const naive = Math.sqrt(
			(xs.reduce((a, x) => a + x * x, 0) - xs.reduce((a, x) => a + x, 0) ** 2 / n) / (n - 1)
		);
		expect(Number.isNaN(naive) || Math.abs(naive - 0.1) > 1e-3).toBe(true);
	});
});

describe('summary', () => {
	it('matches a textbook example', () => {
		const s = summarise([2, 4, 4, 4, 5, 5, 7, 9]);
		expect(s.mean).toBe(5);
		expect(s.populationSd).toBe(2);
		expect(s.populationVariance).toBe(4);
		expect(s.sampleVariance!).toBeCloseTo(32 / 7, 12);
		expect(s.median).toBe(4.5);
		expect(s.modes).toEqual({ values: [4], count: 3 });
		expect(s.sum).toBe(40);
		expect(s.range).toBe(7);
	});

	it('handles a single value', () => {
		const s = summarise([42]);
		expect(s.sampleVariance).toBe(null);
		expect(s.populationSd).toBe(0);
		expect(s.histogram).toEqual([{ lo: 42, hi: 42, count: 1, bar: 24 }]);
	});

	it('finds outliers with Tukey fences', () => {
		const s = summarise([1, 2, 3, 4, 5, 6, 7, 8, 9, 100]);
		expect(s.q1).toBe(3.25);
		expect(s.q3).toBe(7.75);
		expect(s.upperFence).toBe(14.5);
		expect(s.outliers).toEqual([100]);
	});

	it('rejects an empty list', () => {
		expect(() => summarise([])).toThrow(/No numbers/);
	});
});

describe('percentile (PERCENTILE.INC)', () => {
	// Examples from Microsoft's PERCENTILE.INC and QUARTILE.INC documentation.
	it('matches Excel', () => {
		expect(percentile([1, 2, 3, 4], 0.3)).toBeCloseTo(1.9, 12);
		const q = [1, 2, 4, 7, 8, 9, 10, 12];
		expect(percentile(q, 0.25)).toBe(3.5);
		expect(percentile(q, 0)).toBe(1);
		expect(percentile(q, 1)).toBe(12);
		expect(() => percentile(q, 1.5)).toThrow();
	});
});

describe('helpers', () => {
	it('sums without losing small terms', () => {
		expect(sum([1e16, 1, -1e16])).toBe(1);
		expect(sum([0.1, 0.2, 0.3])).toBe(0.6);
	});

	it('welford mean', () => {
		expect(welford([1, 2, 3, 4]).mean).toBe(2.5);
	});

	it('modes', () => {
		expect(modes([1, 2, 3])).toEqual({ values: [], count: 1 });
		expect(modes([1, 1, 2, 2])).toEqual({ values: [], count: 2 });
		expect(modes([1, 1, 2, 2, 3])).toEqual({ values: [1, 2], count: 2 });
	});

	it('histogram uses fixed nice widths and counts everything', () => {
		const xs = Array.from({ length: 100 }, (_, i) => i);
		const h = histogram(xs);
		expect(h.reduce((a, b) => a + b.count, 0)).toBe(100);
		const widths = new Set(h.map((b) => b.hi - b.lo));
		expect(widths.size).toBe(1);
		expect(h[0].lo).toBe(0);
		expect(Math.max(...h.map((b) => b.bar))).toBe(24);
		const d = histogram([0.1, 0.2, 0.3, 0.7]);
		expect(d.reduce((a, b) => a + b.count, 0)).toBe(4);
	});
});
