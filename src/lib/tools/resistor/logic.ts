/**
 * Resistor colour code (IEC 60062), preferred number series (IEC 60063) and SMD markings.
 *
 * Sources: IEC 60062:2016 "Marking codes for resistors and capacitors" as summarised in the
 * Wikipedia article "Electronic color code"; IEC 60063:2015 for the E series; EIA-96 code table
 * as published by Vishay and Yageo datasheets.
 */

export type Colour =
	| 'black'
	| 'brown'
	| 'red'
	| 'orange'
	| 'yellow'
	| 'green'
	| 'blue'
	| 'violet'
	| 'grey'
	| 'white'
	| 'gold'
	| 'silver'
	| 'pink'
	| 'none';

export interface ColourInfo {
	name: Colour;
	label: string;
	/** Physical colour for the drawing. These are real-world colours, not theme tokens. */
	fill: string;
	digit?: number;
	/** Power of ten */
	mult?: number;
	/** Tolerance in percent */
	tol?: number;
	/** Temperature coefficient, ppm/K */
	tcr?: number;
}

export const colours: ColourInfo[] = [
	{ name: 'black', label: 'Black', fill: '#1a1a1a', digit: 0, mult: 0, tcr: 250 },
	{ name: 'brown', label: 'Brown', fill: '#7b4a24', digit: 1, mult: 1, tol: 1, tcr: 100 },
	{ name: 'red', label: 'Red', fill: '#d1242f', digit: 2, mult: 2, tol: 2, tcr: 50 },
	{ name: 'orange', label: 'Orange', fill: '#f07f13', digit: 3, mult: 3, tol: 0.05, tcr: 15 },
	{ name: 'yellow', label: 'Yellow', fill: '#f5d10c', digit: 4, mult: 4, tol: 0.02, tcr: 25 },
	{ name: 'green', label: 'Green', fill: '#2f9e44', digit: 5, mult: 5, tol: 0.5, tcr: 20 },
	{ name: 'blue', label: 'Blue', fill: '#1c6dd0', digit: 6, mult: 6, tol: 0.25, tcr: 10 },
	{ name: 'violet', label: 'Violet', fill: '#8a3fc7', digit: 7, mult: 7, tol: 0.1, tcr: 5 },
	{ name: 'grey', label: 'Grey', fill: '#8c8c8c', digit: 8, mult: 8, tol: 0.01, tcr: 1 },
	{ name: 'white', label: 'White', fill: '#f4f4f4', digit: 9, mult: 9 },
	{ name: 'gold', label: 'Gold', fill: '#c9a227', mult: -1, tol: 5 },
	{ name: 'silver', label: 'Silver', fill: '#b9bcc0', mult: -2, tol: 10 },
	{ name: 'pink', label: 'Pink', fill: '#f2a2c0', mult: -3 },
	{ name: 'none', label: 'None', fill: 'none', tol: 20 }
];

export const colour = (n: Colour) => colours.find((c) => c.name === n)!;

export type BandCount = 3 | 4 | 5 | 6;
export type Role = 'digit' | 'mult' | 'tol' | 'tcr';

export function roles(n: BandCount): Role[] {
	if (n === 3) return ['digit', 'digit', 'mult'];
	if (n === 4) return ['digit', 'digit', 'mult', 'tol'];
	if (n === 5) return ['digit', 'digit', 'digit', 'mult', 'tol'];
	return ['digit', 'digit', 'digit', 'mult', 'tol', 'tcr'];
}

export function allowed(role: Role, first = false): ColourInfo[] {
	return colours.filter((c) => {
		if (role === 'digit') return c.digit !== undefined && !(first && c.digit === 0);
		if (role === 'mult') return c.mult !== undefined;
		if (role === 'tol') return c.tol !== undefined && c.name !== 'none';
		return c.tcr !== undefined;
	});
}

export interface Decoded {
	ohms: number;
	tol: number;
	tcr?: number;
	min: number;
	max: number;
}

export function decodeBands(bands: Colour[]): Decoded {
	const n = bands.length as BandCount;
	if (![3, 4, 5, 6].includes(n)) throw new Error('A resistor has 3, 4, 5 or 6 bands');
	const r = roles(n);
	let sig = 0;
	let exp = 0;
	let tol = 20;
	let tcr: number | undefined;
	r.forEach((role, i) => {
		const c = colour(bands[i]);
		if (role === 'digit') {
			if (c.digit === undefined)
				throw new Error(`${c.label} is not a digit colour (band ${i + 1})`);
			sig = sig * 10 + c.digit;
		} else if (role === 'mult') {
			if (c.mult === undefined) throw new Error(`${c.label} is not a multiplier colour`);
			exp = c.mult;
		} else if (role === 'tol') {
			if (c.tol === undefined) throw new Error(`${c.label} is not a tolerance colour`);
			tol = c.tol;
		} else {
			if (c.tcr === undefined)
				throw new Error(`${c.label} is not a temperature coefficient colour`);
			tcr = c.tcr;
		}
	});
	const ohms = clean(sig * 10 ** exp);
	return { ohms, tol, tcr, min: clean(ohms * (1 - tol / 100)), max: clean(ohms * (1 + tol / 100)) };
}

/** Removes floating point noise such as 4.7000000000000002. */
export function clean(x: number): number {
	return Number(x.toPrecision(12));
}

const PREFIX: Record<string, number> = {
	p: -12,
	n: -9,
	u: -6,
	µ: -6,
	μ: -6,
	m: -3,
	'': 0,
	r: 0,
	R: 0,
	k: 3,
	K: 3,
	M: 6,
	G: 9
};

/**
 * Parses an engineering value: "4k7", "4.7k", "470R", "0R1", "2M2", "10 ohm", "1.5 kΩ", "20mA".
 * `units` lists accepted unit words (case-insensitive) that may follow.
 */
export function parseValue(s: string, units: string[] = ['ohm', 'ohms', 'Ω', 'Ω']): number {
	let t = s.trim().replace(/\s+/g, '').replace(',', '.');
	if (!t) throw new Error('Enter a value');
	for (const u of [...units].sort((a, b) => b.length - a.length)) {
		if (t.toLowerCase().endsWith(u.toLowerCase()) && t.length > u.length) {
			t = t.slice(0, -u.length);
			break;
		}
	}
	// RKM notation: the prefix letter replaces the decimal point, e.g. 4k7, 0R1, 2M2
	const rkm = /^(\d*)([pnuµμmrRkKMG])(\d+)$/.exec(t);
	if (rkm && rkm[1] + rkm[3]) {
		const v = Number(`${rkm[1] || '0'}.${rkm[3]}`);
		return clean(v * 10 ** PREFIX[rkm[2]]);
	}
	// case matters: M is mega, m is milli
	const m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)([pnuµμmrRkKMG]?)$/.exec(t);
	if (!m) throw new Error(`Could not read "${s.trim()}". Try 4k7, 4.7k or 4700`);
	return clean(Number(m[1]) * 10 ** PREFIX[m[2]]);
}

/** 4700 → "4.7 kΩ" */
export function formatOhms(x: number, unit = 'Ω'): string {
	if (x === 0) return `0 ${unit}`;
	const steps: [number, string][] = [
		[1e9, 'G'],
		[1e6, 'M'],
		[1e3, 'k'],
		[1, ''],
		[1e-3, 'm'],
		[1e-6, 'µ'],
		[1e-9, 'n'],
		[1e-12, 'p']
	];
	const a = Math.abs(x);
	for (const [f, p] of steps) {
		if (a >= f * 0.9999999) return `${clean(Number((x / f).toPrecision(4)))} ${p}${unit}`;
	}
	return `${x.toExponential(3)} ${unit}`;
}

// ---------- E series, IEC 60063 ----------

export const E12 = [10, 12, 15, 18, 22, 27, 33, 39, 47, 56, 68, 82];
export const E24 = [
	10, 11, 12, 13, 15, 16, 18, 20, 22, 24, 27, 30, 33, 36, 39, 43, 47, 51, 56, 62, 68, 75, 82, 91
];
/** Also the EIA-96 SMD code table: code 01 = 100, code 96 = 976. */
export const E96 = [
	100, 102, 105, 107, 110, 113, 115, 118, 121, 124, 127, 130, 133, 137, 140, 143, 147, 150, 154,
	158, 162, 165, 169, 174, 178, 182, 187, 191, 196, 200, 205, 210, 215, 221, 226, 232, 237, 243,
	249, 255, 261, 267, 274, 280, 287, 294, 301, 309, 316, 324, 332, 340, 348, 357, 365, 374, 383,
	392, 402, 412, 422, 432, 442, 453, 464, 475, 487, 499, 511, 523, 536, 549, 562, 576, 590, 604,
	619, 634, 649, 665, 681, 698, 715, 732, 750, 768, 787, 806, 825, 845, 866, 887, 909, 931, 953, 976
];

export type Series = 'E12' | 'E24' | 'E96';
export const series: Record<Series, number[]> = { E12, E24, E96 };

export interface Nearest {
	below: number;
	above: number;
	nearest: number;
	/** Error of the nearest value in percent */
	error: number;
}

/** Nearest preferred values, below, above and closest (by ratio). */
export function nearest(x: number, s: Series): Nearest {
	if (!(x > 0) || !Number.isFinite(x)) throw new Error('Value must be above zero');
	const base = series[s];
	const digits = base[0] === 100 ? 2 : 1;
	const dec = Math.floor(Math.log10(x)) - digits;
	const cands: number[] = [];
	for (const d of [dec - 1, dec, dec + 1]) for (const b of base) cands.push(clean(b * 10 ** d));
	cands.sort((a, b) => a - b);
	let below = cands[0];
	let above = cands[cands.length - 1];
	for (const c of cands) {
		if (c <= x * (1 + 1e-9)) below = c;
		if (c >= x * (1 - 1e-9)) {
			above = c;
			break;
		}
	}
	const nearestV = x / below <= above / x ? below : above;
	return { below, above, nearest: nearestV, error: clean(((nearestV - x) / x) * 100) };
}

export function inSeries(x: number, s: Series): boolean {
	const n = nearest(x, s);
	return Math.abs(n.nearest - x) / x < 1e-9;
}

// ---------- value to bands ----------

export interface Encoded {
	bands: Colour[];
	/** The value the bands actually show (rounded to the available digits). */
	shown: number;
	exact: boolean;
}

export function encodeBands(
	ohms: number,
	n: BandCount,
	tol: Colour = n === 3 ? 'none' : 'gold',
	tcr: Colour = 'brown'
): Encoded {
	if (!(ohms > 0)) {
		if (ohms === 0) throw new Error('A 0 Ω resistor is a single black band');
		throw new Error('Value must be above zero');
	}
	const digits = n >= 5 ? 3 : 2;
	let exp = Math.floor(Math.log10(ohms)) - digits + 1;
	let sig = Math.round(ohms / 10 ** exp);
	if (sig >= 10 ** digits) {
		sig = Math.round(sig / 10);
		exp += 1;
	}
	if (exp < -3)
		throw new Error('Too small for a colour code (pink, ×0.001, is the lowest multiplier)');
	if (exp > 9)
		throw new Error('Too large for a colour code (white, ×10⁹, is the highest multiplier)');
	const ds = String(sig).padStart(digits, '0').split('').map(Number);
	const byDigit = (d: number) => colours.find((c) => c.digit === d)!.name;
	const bands: Colour[] = ds.map(byDigit);
	bands.push(colours.find((c) => c.mult === exp)!.name);
	if (n >= 4) bands.push(tol);
	if (n === 6) bands.push(tcr);
	const shown = clean(sig * 10 ** exp);
	return { bands, shown, exact: Math.abs(shown - ohms) / ohms < 1e-9 };
}

// ---------- SMD codes ----------

const EIA_MULT: Record<string, number> = {
	Z: -3,
	Y: -2,
	R: -2,
	X: -1,
	S: -1,
	A: 0,
	B: 1,
	H: 1,
	C: 2,
	D: 3,
	E: 4,
	F: 5
};

export interface Smd {
	ohms: number;
	system: string;
	/** Other reading of the same marking, if any */
	alt?: { ohms: number; system: string };
}

export function decodeSmd(raw: string): Smd {
	const t = raw.trim().toUpperCase();
	if (!t) throw new Error('Enter an SMD code');
	if (/^0+$/.test(t)) return { ohms: 0, system: 'Zero ohm jumper' };
	const rNotation = /^\d{0,3}R\d{0,3}$/.test(t) && t.length >= 2 && t.length <= 4;
	let m = /^(\d{2})([ZYRXSABHCDEF])$/.exec(t);
	if (m) {
		const i = Number(m[1]);
		if (i >= 1 && i <= 96) {
			const out: Smd = { ohms: clean(E96[i - 1] * 10 ** EIA_MULT[m[2]]), system: 'EIA-96 (1%)' };
			if (rNotation) out.alt = { ohms: Number(t.replace('R', '.')), system: 'R as decimal point' };
			return out;
		}
	}
	if (rNotation) return { ohms: Number(t.replace('R', '.')), system: 'R marks the decimal point' };
	m = /^(\d{2,3})(\d)$/.exec(t);
	if (m) {
		const sys = t.length === 3 ? '3-digit (2%, 5%)' : '4-digit (1%)';
		return { ohms: clean(Number(m[1]) * 10 ** Number(m[2])), system: sys };
	}
	if (/^\d{2}[A-Z]$/.test(t)) throw new Error('EIA-96 codes run from 01 to 96');
	throw new Error(`"${raw.trim()}" is not a known SMD code. Examples: 472, 4702, 4R7, 01C`);
}

export interface SmdCodes {
	three?: string;
	four?: string;
	eia96?: string;
}

function rCode(ohms: number, chars: number): string | undefined {
	const int = Math.floor(ohms);
	const intStr = int > 0 ? String(int) : '';
	const fracLen = chars - 1 - intStr.length;
	if (fracLen < 0) return undefined;
	const frac = Math.round((ohms - int) * 10 ** fracLen);
	if (frac >= 10 ** fracLen || Math.abs(int + frac / 10 ** fracLen - ohms) > 1e-9 * ohms)
		return undefined;
	return intStr + 'R' + (fracLen ? String(frac).padStart(fracLen, '0') : '');
}

function sciCode(ohms: number, digits: number): string | undefined {
	const exp = Math.floor(Math.log10(ohms) + 1e-12) - digits + 1;
	const sig = ohms / 10 ** exp;
	if (Math.abs(sig - Math.round(sig)) > 1e-6 || exp < 0 || exp > 9) return undefined;
	return String(Math.round(sig)) + String(exp);
}

/** Markings that would be printed on an SMD resistor of this value. */
export function encodeSmd(ohms: number): SmdCodes {
	if (ohms === 0) return { three: '000', four: '0000' };
	if (!(ohms > 0)) return {};
	const out: SmdCodes = {
		three: ohms < 10 ? rCode(ohms, 3) : sciCode(ohms, 2),
		four: ohms < 100 ? rCode(ohms, 4) : sciCode(ohms, 3)
	};
	for (const [letter, e] of Object.entries(EIA_MULT)) {
		if (['R', 'S', 'H'].includes(letter)) continue;
		const v = ohms / 10 ** e;
		const i = E96.findIndex((b) => Math.abs(b - v) < 1e-6);
		if (i >= 0) {
			out.eia96 = String(i + 1).padStart(2, '0') + letter;
			break;
		}
	}
	return out;
}
