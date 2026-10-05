/**
 * Reads a number typed by a person. Accepts a decimal comma (12,5) or point (12.5),
 * thousands separators as space, apostrophe or the other mark (1.234,5 or 1,234.5),
 * a Unicode minus and a trailing %.
 *
 * With `comma` set, comma is always the decimal mark and dots are thousands (Danish).
 * Without it the reading is automatic: with both marks the last one is the decimal mark,
 * several of one mark are thousands, and a single comma is a decimal comma unless it is
 * followed by exactly three digits (1,234 is read as 1234).
 */
export function parseNumber(raw: string, comma = false): number {
	let s = raw
		.trim()
		.replace(/[\s  ']/g, '')
		.replace(/−/g, '-')
		.replace(/%$/, '');
	if (!s) throw new Error('Enter a number');
	const dots = (s.match(/\./g) ?? []).length;
	const commas = (s.match(/,/g) ?? []).length;
	if (comma) {
		s = s.replace(/\./g, '').replace(',', '.');
		if (commas > 1) throw new Error(`"${raw.trim()}" has more than one decimal comma`);
	} else if (dots && commas) {
		const decimal = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
		const thousands = decimal === '.' ? ',' : '.';
		if ((s.match(decimal === '.' ? /\./g : /,/g) ?? []).length > 1)
			throw new Error(`"${raw.trim()}" mixes separators in a way that cannot be read`);
		s = s.split(thousands).join('').replace(',', '.');
	} else if (commas > 1) s = s.replace(/,/g, '');
	else if (dots > 1) s = s.replace(/\./g, '');
	else if (commas === 1)
		s = /,\d{3}$/.test(s) && !/^-?0,/.test(s) ? s.replace(',', '') : s.replace(',', '.');
	if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s))
		throw new Error(`"${raw.trim()}" is not a number`);
	return Number(s);
}

/** Rounds away binary noise such as 0.30000000000000004 before display. */
export function clean(x: number): number {
	return Number.isFinite(x) ? Number(x.toPrecision(12)) : x;
}

/** Formats with grouping and a decimal point, or a decimal comma when `comma` is set. */
export function fmt(x: number, comma = false, maxFrac = 6): string {
	if (!Number.isFinite(x)) return String(x);
	const v = clean(x);
	if (v !== 0 && (Math.abs(v) >= 1e15 || Math.abs(v) < 1e-6)) {
		const e = v.toExponential(6).replace(/\.?0+e/, 'e');
		return comma ? e.replace('.', ',') : e;
	}
	return new Intl.NumberFormat(comma ? 'da-DK' : 'en-GB', {
		maximumFractionDigits: maxFrac
	}).format(v);
}

/** Plain value for copying: no grouping, decimal mark as chosen. */
export function plain(x: number, comma = false): string {
	const s = String(clean(x));
	return comma ? s.replace('.', ',') : s;
}

export function percentOf(pct: number, of: number): number {
	return (pct / 100) * of;
}

export function whatPercent(part: number, whole: number): number {
	if (whole === 0) throw new Error('Cannot take a percentage of zero');
	return (part / whole) * 100;
}

export interface Change {
	diff: number;
	/** Relative change in percent, null when the start is zero. */
	percent: number | null;
	/** End value as a multiple of the start, null when the start is zero. */
	factor: number | null;
}

/** Change from a to b. The percentage is relative to |a| so a rise from a negative start is positive. */
export function change(a: number, b: number): Change {
	const diff = b - a;
	if (a === 0) return { diff, percent: null, factor: null };
	return { diff, percent: (diff / Math.abs(a)) * 100, factor: b / a };
}

export interface Vat {
	excl: number;
	vat: number;
	incl: number;
}

/** Adds VAT to a price excluding VAT. */
export function addVat(excl: number, rate: number): Vat {
	const vat = excl * (rate / 100);
	return { excl, vat, incl: excl + vat };
}

/** Takes VAT out of a price including VAT. At 25 % that is 20 % of the price. */
export function removeVat(incl: number, rate: number): Vat {
	if (rate <= -100) throw new Error('Rate must be above -100 %');
	const excl = incl / (1 + rate / 100);
	return { excl, vat: incl - excl, incl };
}

/** Share of a price including VAT that is VAT, in percent: rate / (100 + rate) × 100. */
export function vatShareOfGross(rate: number): number {
	return (rate / (100 + rate)) * 100;
}

/** x is pct % of what? */
export function wholeFromPart(part: number, pct: number): number {
	if (pct === 0) throw new Error('0 % of anything is 0, the whole cannot be found');
	return part / (pct / 100);
}

/** Value before a change of pct % that ended at `after`. A 20 % rise to 120 started at 100. */
export function beforeChange(after: number, pct: number): number {
	if (pct === -100)
		throw new Error('After a 100 % decrease everything is 0, the start cannot be found');
	return after / (1 + pct / 100);
}

function gcd(a: bigint, b: bigint): bigint {
	a = a < 0n ? -a : a;
	b = b < 0n ? -b : b;
	while (b) [a, b] = [b, a % b];
	return a;
}

/** Splits a decimal number into an integer and a power of ten: 1.25 -> [125n, 2]. */
function toScaled(x: number): [bigint, number] {
	const s = String(clean(x));
	if (/e/i.test(s)) throw new Error('Use plain numbers for ratios, not exponent notation');
	const [i, f = ''] = s.split('.');
	return [BigInt(i + f), f.length];
}

export interface Ratio {
	a: bigint;
	b: bigint;
	/** a / b as a decimal, e.g. 1.7778. */
	decimal: number;
	/** Well known name when the ratio matches one exactly, else the closest within 2 %. */
	near: { name: string; exact: boolean } | null;
}

const common: [number, number][] = [
	[1, 1],
	[5, 4],
	[4, 3],
	[3, 2],
	[16, 10],
	[16, 9],
	[1.85, 1],
	[2, 1],
	[2.39, 1],
	[21, 9],
	[32, 9]
];

/** Reduces a:b to lowest terms, also for decimals (1.5:1 becomes 3:2). */
export function simplify(a: number, b: number): Ratio {
	if (!(a > 0 && b > 0)) throw new Error('Both sides of a ratio must be above zero');
	const [ai, ae] = toScaled(a);
	const [bi, be] = toScaled(b);
	const e = Math.max(ae, be);
	const A = ai * 10n ** BigInt(e - ae);
	const B = bi * 10n ** BigInt(e - be);
	const g = gcd(A, B);
	const ra = A / g;
	const rb = B / g;
	const decimal = a / b;
	let near: Ratio['near'] = null;
	let best = 0.02;
	for (const [x, y] of common) {
		const name = `${x}:${y}`;
		if (BigInt(Math.round(x * 100)) * rb === BigInt(Math.round(y * 100)) * ra) {
			near = { name, exact: true };
			break;
		}
		const off = Math.abs(decimal / (x / y) - 1);
		if (off < best) {
			best = off;
			near = { name, exact: false };
		}
	}
	return { a: ra, b: rb, decimal, near };
}

/** New height for a width keeping the ratio w:h, or the reverse with `fromHeight`. */
export function resize(w: number, h: number, value: number, fromHeight = false): number {
	if (!(w > 0 && h > 0)) throw new Error('Both sides of a ratio must be above zero');
	return fromHeight ? (value * w) / h : (value * h) / w;
}
