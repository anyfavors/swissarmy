import { describe, expect, it } from 'vitest';
import { words } from './eff-large';
import {
	AMBIGUOUS,
	averageSeconds,
	charSpace,
	charsFor,
	cryptoBelow,
	generateChars,
	generatePhrase,
	humanDuration,
	log2Big,
	OFFLINE_RATE,
	ONLINE_RATE,
	phraseBits,
	rejectionLimit,
	uniformBelow,
	type CharOptions
} from './logic';

/** Deterministic source for tests: cycles through the given values. */
function seq(values: number[]) {
	let i = 0;
	return () => values[i++ % values.length];
}

describe('rejection sampling', () => {
	it('threshold is the largest multiple of n in the range', () => {
		for (const n of [1, 2, 3, 10, 26, 62, 94, 7776, 2 ** 31 + 1, 2 ** 32]) {
			const limit = rejectionLimit(n);
			expect(limit % n).toBe(0);
			expect(limit).toBeLessThanOrEqual(2 ** 32);
			expect(2 ** 32 - limit).toBeLessThan(n);
		}
		expect(rejectionLimit(10, 256)).toBe(250);
		expect(() => rejectionLimit(0)).toThrow();
	});

	it('maps every accepted source value so each output has the same count (exhaustive, 8-bit)', () => {
		for (const n of [3, 7, 10, 26, 94, 100, 200, 255, 256]) {
			const counts = new Array(n).fill(0);
			const limit = rejectionLimit(n, 256);
			for (let x = 0; x < limit; x++) counts[uniformBelow(n, seq([x]), 256)]++;
			expect(new Set(counts).size, `n=${n}`).toBe(1);
			expect(counts[0]).toBe(limit / n);
		}
	});

	it('redraws values at or above the threshold', () => {
		// n = 10, range 256: 250..255 are rejected, so 252 then 13 yields 3.
		expect(uniformBelow(10, seq([252, 13]), 256)).toBe(3);
		expect(uniformBelow(10, seq([255, 250, 249]), 256)).toBe(9);
	});

	it('cryptoBelow stays in range and covers it', () => {
		const seen = new Set<number>();
		for (let i = 0; i < 2000; i++) {
			const v = cryptoBelow(7);
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThan(7);
			seen.add(v);
		}
		expect(seen.size).toBe(7);
	});
});

describe('random characters', () => {
	const all: CharOptions = {
		length: 20,
		sets: ['lower', 'upper', 'digits', 'symbols'],
		excludeAmbiguous: false,
		requireEach: true
	};

	it('has 94 printable ASCII characters across the four sets', () => {
		const chars = all.sets.map((s) => charsFor(s, false)).join('');
		expect(chars).toHaveLength(94);
		expect(new Set(chars).size).toBe(94);
		for (const c of chars) expect(c.charCodeAt(0)).toBeGreaterThan(32);
	});

	it('removes ambiguous characters', () => {
		const chars = all.sets.map((s) => charsFor(s, true)).join('');
		expect(chars).toHaveLength(94 - AMBIGUOUS.length);
		for (const c of AMBIGUOUS) expect(chars).not.toContain(c);
	});

	it('generates the requested length with every required set', () => {
		for (let i = 0; i < 200; i++) {
			const p = generateChars({ ...all, length: 8 });
			expect(p).toHaveLength(8);
			expect(p).toMatch(/[a-z]/);
			expect(p).toMatch(/[A-Z]/);
			expect(p).toMatch(/[0-9]/);
			expect(p).toMatch(/[^a-zA-Z0-9]/);
		}
		const noAmb = generateChars({ ...all, length: 128, excludeAmbiguous: true });
		for (const c of AMBIGUOUS) expect(noAmb).not.toContain(c);
	});

	it('rejects whole candidates that miss a set instead of patching them', () => {
		// Alphabet "abc...z0...9" (36). First candidate "ab" has no digit, so it is redrawn whole.
		const picks = [0, 1, 2, 26];
		let i = 0;
		const p = generateChars(
			{ length: 2, sets: ['lower', 'digits'], excludeAmbiguous: false, requireEach: true },
			() => picks[i++]
		);
		expect(p).toBe('c0');
		expect(i).toBe(4);
	});

	it('counts the space exactly, with inclusion-exclusion when sets are required', () => {
		expect(charSpace({ ...all, requireEach: false, length: 10 })).toBe(94n ** 10n);
		// lower + digits, length 2, at least one of each: 2 * 26 * 10 = 520
		expect(
			charSpace({
				length: 2,
				sets: ['lower', 'digits'],
				excludeAmbiguous: false,
				requireEach: true
			})
		).toBe(520n);
		// brute force check on a small case: lower + digits, length 3
		let n = 0;
		const a = charsFor('lower', false) + charsFor('digits', false);
		for (const x of a)
			for (const y of a)
				for (const z of a) {
					const s = x + y + z;
					if (/[a-z]/.test(s) && /[0-9]/.test(s)) n++;
				}
		expect(
			charSpace({
				length: 3,
				sets: ['lower', 'digits'],
				excludeAmbiguous: false,
				requireEach: true
			})
		).toBe(BigInt(n));
	});

	it('computes entropy in bits', () => {
		expect(log2Big(1024n)).toBe(10);
		expect(log2Big(94n ** 20n)).toBeCloseTo(20 * Math.log2(94), 9);
		const req = log2Big(charSpace({ ...all, length: 16 }));
		expect(req).toBeLessThan(16 * Math.log2(94));
		expect(req).toBeGreaterThan(16 * Math.log2(94) - 1);
	});

	it('explains invalid options', () => {
		expect(() => generateChars({ ...all, sets: [] })).toThrow(/at least one/);
		expect(() =>
			charSpace({ length: 1, sets: ['lower', 'upper'], excludeAmbiguous: false, requireEach: true })
		).toThrow(/shorter/);
	});
});

describe('EFF large wordlist', () => {
	it('has 7776 unique lowercase words in dice order', () => {
		expect(words).toHaveLength(7776);
		expect(new Set(words).size).toBe(7776);
		for (const w of words) expect(w).toMatch(/^[a-z]+(-[a-z]+)?$/);
		expect(words[0]).toBe('abacus');
		expect(words[7775]).toBe('zoom');
	});
});

describe('passphrases', () => {
	const o = { words: 6, separator: '-', capitalise: false, digit: false };

	it('picks words by index and applies the options', () => {
		const list = ['alpha', 'bravo', 'charlie'];
		const picks = [2, 0, 1, 7];
		let i = 0;
		const r = () => picks[i++];
		expect(
			generatePhrase(list, { words: 3, separator: '.', capitalise: true, digit: true }, r)
		).toBe('Charlie.Alpha.Bravo.7');
	});

	it('generates from the real list', () => {
		const p = generatePhrase(words, o);
		const parts = p.split('-');
		expect(parts.length).toBeGreaterThanOrEqual(6);
		expect(generatePhrase(words, { ...o, separator: ' ' }).split(' ')).toHaveLength(6);
	});

	it('entropy is word count times log2(7776), plus log2(10) for the digit', () => {
		expect(phraseBits(7776, o)).toBeCloseTo(77.55, 2);
		expect(phraseBits(7776, { ...o, words: 4, digit: true })).toBeCloseTo(
			4 * Math.log2(7776) + Math.log2(10),
			9
		);
		expect(phraseBits(7776, { ...o, capitalise: true })).toBe(phraseBits(7776, o));
	});
});

describe('crack time', () => {
	it('uses half the space at the given rate', () => {
		expect(averageSeconds(11, 1)).toBe(1024);
		expect(averageSeconds(40, OFFLINE_RATE)).toBeCloseTo(54.98, 1);
		expect(averageSeconds(20, ONLINE_RATE)).toBeCloseTo(524288 * 36, 0);
	});

	it('formats durations', () => {
		expect(humanDuration(0.2)).toBe('less than a second');
		expect(humanDuration(90)).toBe('about 2 minutes');
		expect(humanDuration(3600)).toBe('about 1 hour');
		expect(humanDuration(86400 * 400)).toBe('about 1 year');
		expect(humanDuration(365.25 * 86400 * 3.2e9)).toBe('about 10^9 years');
		expect(humanDuration(Infinity)).toMatch(/longer/);
	});
});
