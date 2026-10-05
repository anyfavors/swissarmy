/** Symbol table in descending order, with the six subtractive pairs. */
const table: [number, string][] = [
	[1000, 'M'],
	[900, 'CM'],
	[500, 'D'],
	[400, 'CD'],
	[100, 'C'],
	[90, 'XC'],
	[50, 'L'],
	[40, 'XL'],
	[10, 'X'],
	[9, 'IX'],
	[5, 'V'],
	[4, 'IV'],
	[1, 'I']
];

const letterValue: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };

export interface Part {
	/** Place value this part stands for, e.g. 900. */
	value: number;
	numeral: string;
	/** True for IV, IX, XL, XC, CD, CM. */
	subtractive: boolean;
	/** Letter arithmetic, e.g. "1000 − 100" for CM or "5 + 1 + 1" for VII. */
	explain: string;
}

export const MIN = 1;
export const MAX = 3999;

function checkRange(n: number): void {
	if (!Number.isInteger(n)) throw new Error('Roman numerals only write whole numbers');
	if (n < MIN)
		throw new Error('Roman numerals have no zero or negative numbers, the range is 1 to 3999');
	if (n > MAX)
		throw new Error(
			'Above 3999 the standard form runs out (MMMM is not standard); the range is 1 to 3999'
		);
}

/** Splits n into thousands, hundreds, tens and units, each written as one group. */
export function decompose(n: number): Part[] {
	checkRange(n);
	const parts: Part[] = [];
	for (const place of [1000, 100, 10, 1]) {
		const digit = Math.floor(n / place) % 10;
		if (!digit) continue;
		let rest = digit * place;
		let numeral = '';
		for (const [v, s] of table) {
			if (v > rest || v < place) continue;
			while (rest >= v) {
				numeral += s;
				rest -= v;
			}
		}
		const subtractive = digit === 4 || digit === 9;
		const vals = [...numeral].map((c) => letterValue[c]);
		const explain = subtractive ? `${vals[1]} − ${vals[0]}` : vals.join(' + ');
		parts.push({ value: digit * place, numeral, subtractive, explain });
	}
	return parts;
}

export function toRoman(n: number): string {
	return decompose(n)
		.map((p) => p.numeral)
		.join('');
}

/** Reads an integer for toRoman, allowing spaces, _ and a leading +. */
export function parseInteger(raw: string): number {
	const s = raw.trim().replace(/[\s_]/g, '');
	if (!s) throw new Error('Enter a number from 1 to 3999');
	if (!/^[-+]?\d+$/.test(s)) throw new Error(`"${raw.trim()}" is not a whole number`);
	const n = Number(s);
	checkRange(n);
	return n;
}

/** Value by the usual left to right rule, without any validation of form. */
function looseValue(s: string): number {
	let total = 0;
	for (let i = 0; i < s.length; i++) {
		const v = letterValue[s[i]];
		const next = letterValue[s[i + 1]] ?? 0;
		total += v < next ? -v : v;
	}
	return total;
}

const canonical = /^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;

/** Explains why a numeral is not in standard form. Returns null when it is standard. */
function diagnose(s: string): string | null {
	if (canonical.test(s)) return null;
	const m4 = s.match(/([IXCM])\1\1\1+/);
	if (m4) {
		if (m4[1] === 'M') return 'MMMM is not standard: the standard form stops at 3999 (MMMCMXCIX)';
		const run = m4[0];
		return `${run} repeats ${run[0]} more than three times`;
	}
	const m5 = s.match(/([VLD]).*\1/);
	if (m5)
		return `${m5[1]} may appear only once (${m5[1]}${m5[1]} would be ${letterValue[m5[1]] * 2})`;
	for (let i = 0; i < s.length - 1; i++) {
		const a = s[i];
		const b = s[i + 1];
		const va = letterValue[a];
		const vb = letterValue[b];
		if (va >= vb) continue;
		if ('VLD'.includes(a)) return `${a}${b}: ${a} is never subtracted`;
		const allowed: Record<string, string> = { I: 'V and X', X: 'L and C', C: 'D and M' };
		if (vb > va * 10) return `${a}${b}: ${a} can only be subtracted from ${allowed[a]}`;
		if (i > 0 && letterValue[s[i - 1]] <= va && s[i - 1] !== b)
			return `${s[i - 1]}${a}${b}: only one ${a} may stand before ${b}`;
		if (i > 0 && s[i - 1] === a) return `${a}${a}${b}: only one ${a} may stand before ${b}`;
	}
	return 'Letters are not in standard order';
}

export interface FromRoman {
	value: number;
	numeral: string;
}

/**
 * Strict reading: only the standard form is accepted, e.g. IV not IIII, XLIX not IL.
 * Lower case is accepted and upper-cased.
 */
export function fromRoman(raw: string): FromRoman {
	const s = raw.trim().toUpperCase();
	if (!s) throw new Error('Enter a Roman numeral');
	for (const c of s) {
		if (!(c in letterValue)) {
			if (c === 'N') throw new Error('N (nulla) for zero is medieval, not a standard numeral');
			throw new Error(`"${c}" is not a Roman numeral letter (I V X L C D M)`);
		}
	}
	const why = diagnose(s);
	if (why) {
		const v = looseValue(s);
		let hint = '';
		if (v >= MIN && v <= MAX) hint = `. If you meant ${v}, write ${toRoman(v)}`;
		let clock = '';
		if (/I{4}/.test(s))
			clock = '. Clock faces often show IIII for 4 by tradition, but it is not the standard form';
		throw new Error(`Not a standard numeral: ${why}${hint}${clock}`);
	}
	const value = looseValue(s);
	return { value, numeral: s };
}

export function looksLikeRoman(raw: string): number {
	const s = raw.trim();
	if (s.length < 4 || !/^[IVXLCDM]+$/.test(s)) return 0;
	return canonical.test(s) ? 0.6 : 0;
}
