// Password and passphrase generation with a cryptographic RNG, and exact entropy for the
// generation space. The wordlist lives in eff-large.ts and is passed in, so this module stays small.

export type RandomBelow = (n: number) => number;

const RANGE = 2 ** 32;

/**
 * Rejection threshold for mapping a uniform value in [0, range) to [0, n) by `x % n`.
 * Values at or above the threshold are drawn again. The threshold is the largest multiple of n
 * that fits in the range, so every residue is hit by exactly threshold / n source values.
 */
export function rejectionLimit(n: number, range = RANGE): number {
	if (!Number.isInteger(n) || n < 1 || n > range) throw new Error(`Cannot pick from ${n} options`);
	return range - (range % n);
}

/** Uniform integer in [0, n) from a source of uniform integers in [0, range). */
export function uniformBelow(n: number, next: () => number, range = RANGE): number {
	const limit = rejectionLimit(n, range);
	for (;;) {
		const x = next();
		if (x < limit) return x % n;
	}
}

/** Uniform integer in [0, n) from crypto.getRandomValues. */
export const cryptoBelow: RandomBelow = (() => {
	const pool = new Uint32Array(64);
	let i = pool.length;
	const next = () => {
		if (i >= pool.length) {
			crypto.getRandomValues(pool);
			i = 0;
		}
		return pool[i++];
	};
	return (n: number) => uniformBelow(n, next);
})();

// ---------------------------------------------------------------------------
// Random characters

export const SETS = {
	lower: 'abcdefghijklmnopqrstuvwxyz',
	upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
	digits: '0123456789',
	symbols: '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~'
} as const;

export type SetName = keyof typeof SETS;
export const AMBIGUOUS = '0O1lI|';

export interface CharOptions {
	length: number;
	sets: SetName[];
	excludeAmbiguous: boolean;
	/** Require at least one character from each selected set. */
	requireEach: boolean;
}

export function charsFor(set: SetName, excludeAmbiguous: boolean): string {
	const s = SETS[set];
	return excludeAmbiguous ? [...s].filter((c) => !AMBIGUOUS.includes(c)).join('') : s;
}

function checkCharOptions(o: CharOptions): string[] {
	if (!o.sets.length) throw new Error('Select at least one character set');
	if (!Number.isInteger(o.length) || o.length < 1) throw new Error('Length must be at least 1');
	if (o.requireEach && o.length < o.sets.length) {
		throw new Error('Length is shorter than the number of required sets');
	}
	return o.sets.map((s) => charsFor(s, o.excludeAmbiguous));
}

/**
 * Generates a password uniformly over all strings of the given length from the combined alphabet.
 * With requireEach, candidates missing a set are thrown away and drawn again, which keeps the
 * result uniform over the strings that satisfy the rule (no forced positions, no shuffling bias).
 */
export function generateChars(o: CharOptions, rand: RandomBelow = cryptoBelow): string {
	const groups = checkCharOptions(o);
	const alphabet = groups.join('');
	for (;;) {
		let out = '';
		for (let i = 0; i < o.length; i++) out += alphabet[rand(alphabet.length)];
		if (!o.requireEach || groups.every((g) => [...out].some((c) => g.includes(c)))) return out;
	}
}

/**
 * Exact number of possible outputs. Without requireEach: N^L.
 * With it, inclusion-exclusion over the sets that could be missing:
 * sum over subsets S of (-1)^|S| * (N - |chars in S|)^L.
 */
export function charSpace(o: CharOptions): bigint {
	const groups = checkCharOptions(o);
	const N = groups.reduce((a, g) => a + g.length, 0);
	const L = BigInt(o.length);
	if (!o.requireEach) return BigInt(N) ** L;
	let total = 0n;
	const k = groups.length;
	for (let mask = 0; mask < 1 << k; mask++) {
		let missing = 0;
		let bits = 0;
		for (let j = 0; j < k; j++) {
			if (mask & (1 << j)) {
				missing += groups[j].length;
				bits++;
			}
		}
		const term = BigInt(N - missing) ** L;
		total += bits % 2 ? -term : term;
	}
	return total;
}

/** log2 of a positive BigInt, accurate to double precision. */
export function log2Big(x: bigint): number {
	if (x <= 0n) throw new Error('log2 of a non-positive number');
	const bits = x.toString(2).length;
	if (bits <= 53) return Math.log2(Number(x));
	const shift = BigInt(bits - 53);
	return Number(shift) + Math.log2(Number(x >> shift));
}

// ---------------------------------------------------------------------------
// Passphrases

export interface PhraseOptions {
	words: number;
	separator: string;
	capitalise: boolean;
	/** Append one random digit 0-9 at the end. */
	digit: boolean;
}

export function generatePhrase(
	list: readonly string[],
	o: PhraseOptions,
	rand: RandomBelow = cryptoBelow
): string {
	if (!list.length) throw new Error('Wordlist is empty');
	if (!Number.isInteger(o.words) || o.words < 1) throw new Error('Word count must be at least 1');
	const picked: string[] = [];
	for (let i = 0; i < o.words; i++) {
		const w = list[rand(list.length)];
		picked.push(o.capitalise ? w[0].toUpperCase() + w.slice(1) : w);
	}
	let out = picked.join(o.separator);
	if (o.digit) out += o.separator + String(rand(10));
	return out;
}

/**
 * Bits of entropy of the passphrase generator, assuming the attacker knows the wordlist,
 * the word count, the separator and the capitalisation rule (Kerckhoffs). Capitalising every word
 * and the choice of separator are fixed rules and add nothing. The appended digit adds log2(10).
 */
export function phraseBits(listSize: number, o: PhraseOptions): number {
	return o.words * Math.log2(listSize) + (o.digit ? Math.log2(10) : 0);
}

// ---------------------------------------------------------------------------
// Crack time

export const OFFLINE_RATE = 1e10; // guesses per second
export const ONLINE_RATE = 100 / 3600; // 100 guesses per hour

/** Average seconds to find the password: half the space at the given rate. */
export function averageSeconds(bits: number, ratePerSecond: number): number {
	return 2 ** (bits - 1) / ratePerSecond;
}

const YEAR = 365.25 * 86400;

export function humanDuration(seconds: number): string {
	if (!Number.isFinite(seconds)) return 'longer than can be expressed';
	if (seconds < 1) return 'less than a second';
	const steps: [number, string][] = [
		[YEAR, 'year'],
		[86400, 'day'],
		[3600, 'hour'],
		[60, 'minute'],
		[1, 'second']
	];
	for (const [size, name] of steps) {
		if (seconds >= size) {
			const n = seconds / size;
			if (name === 'year' && n >= 1e6) {
				const exp = Math.floor(Math.log10(n));
				return `about 10^${exp} years`;
			}
			const r = n >= 100 ? Math.round(n).toLocaleString('en-US') : String(Math.round(n));
			return `about ${r} ${name}${r === '1' ? '' : 's'}`;
		}
	}
	return 'less than a second';
}

/** Rough verdict for the offline case. */
export function strengthLabel(bits: number): string {
	if (bits < 50) return 'Weak against offline attack';
	if (bits < 64) return 'Moderate: fine behind rate limits, marginal offline';
	if (bits < 80) return 'Strong';
	return 'Very strong';
}
