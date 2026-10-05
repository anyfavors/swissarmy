/**
 * Capacitor markings and RC / LC arithmetic.
 *
 * Sources:
 * - IEC 60062:2016 "Marking codes for resistors and capacitors": three-digit value code
 *   (two significant figures and a multiplier, value in pF), R as decimal point, letter
 *   tolerance codes (B, C, D, F, G absolute in pF below 10 pF; F, G, J, K, M in percent; Z +80/-20 %).
 * - EIA-198 / JIS C 5101 rated voltage code as printed by Murata, KEMET, Nichicon datasheets:
 *   digit = power of ten, letter = mantissa (1H = 5.0 × 10 = 50 V, 2A = 1.0 × 100 = 100 V).
 * - RC charge V(t) = V0 (1 - e^(-t/τ)), discharge V(t) = V0 e^(-t/τ), τ = RC; first-order RC cutoff
 *   fc = 1 / (2πRC); LC resonance f0 = 1 / (2π√(LC)); Xc = 1 / (2πfC), XL = 2πfL. Textbook circuit theory.
 */
import { clean, parseValue } from '../resistor/logic';
import { fmt } from '../ohms-law/logic';

export { clean, fmt };

/** Parses "100n", "100nF", "4.7µ", "47 pF", "0.1u". Value in farads. Empty gives undefined. */
export function parseF(s: string): number | undefined {
	if (!s.trim()) return undefined;
	return parseValue(s, ['F', 'farad', 'farads']);
}
export function parseOhm(s: string): number | undefined {
	if (!s.trim()) return undefined;
	return parseValue(s, ['ohm', 'ohms', 'Ω', 'Ω', 'R']);
}
export function parseH(s: string): number | undefined {
	if (!s.trim()) return undefined;
	return parseValue(s, ['H', 'henry', 'henries']);
}
export function parseHz(s: string): number | undefined {
	if (!s.trim()) return undefined;
	return parseValue(s, ['Hz', 'hertz']);
}

// ---------- tolerance letters, IEC 60062 ----------

export interface Tolerance {
	letter: string;
	text: string;
	/** Percent, symmetric unless plus/minus set */
	pct?: number;
	/** Absolute in pF, used for values below 10 pF */
	pF?: number;
	plus?: number;
	minus?: number;
}

export const TOLERANCES: Tolerance[] = [
	{ letter: 'B', text: '±0.1 pF', pF: 0.1 },
	{ letter: 'C', text: '±0.25 pF', pF: 0.25 },
	{ letter: 'D', text: '±0.5 pF (±0.5 % at 10 pF and up)', pF: 0.5, pct: 0.5 },
	{ letter: 'F', text: '±1 % (±1 pF below 10 pF)', pct: 1, pF: 1 },
	{ letter: 'G', text: '±2 % (±2 pF below 10 pF)', pct: 2, pF: 2 },
	{ letter: 'J', text: '±5 %', pct: 5 },
	{ letter: 'K', text: '±10 %', pct: 10 },
	{ letter: 'M', text: '±20 %', pct: 20 },
	{ letter: 'Z', text: '+80 % / −20 %', plus: 80, minus: 20 }
];

// ---------- rated voltage code (EIA) ----------

/** Mantissa of the voltage code letter. */
export const VOLT_LETTERS: Record<string, number> = {
	A: 1.0,
	B: 1.25,
	C: 1.6,
	D: 2.0,
	E: 2.5,
	F: 3.15,
	G: 4.0,
	H: 5.0,
	J: 6.3,
	K: 8.0,
	V: 3.5,
	W: 4.5
};

/** "1H" → 50, "2A" → 100, "0J" → 6.3 */
export function voltageCode(code: string): number {
	const m = /^([0-4])([A-Z])$/.exec(code.trim().toUpperCase());
	if (!m) throw new Error(`"${code.trim()}" is not a voltage code. Examples: 1H, 2A, 1C`);
	const mant = VOLT_LETTERS[m[2]];
	if (mant === undefined) throw new Error(`Unknown voltage code letter ${m[2]}`);
	return clean(mant * 10 ** Number(m[1]));
}

/** Common voltage codes for the reference table. */
export const VOLT_TABLE = [
	'0G',
	'0J',
	'1A',
	'1C',
	'1D',
	'1E',
	'1V',
	'1H',
	'1J',
	'1K',
	'2A',
	'2C',
	'2D',
	'2E',
	'2F',
	'2V',
	'2G',
	'2W',
	'2H',
	'2J',
	'3A'
].map((c) => ({ code: c, volts: voltageCode(c) }));

// ---------- value code ----------

export interface Decoded {
	/** farads */
	value: number;
	pF: number;
	system: string;
	tol?: Tolerance;
	volts?: number;
	voltCode?: string;
}

/**
 * Reads a capacitor marking: "104", "104K", "4R7", "47", "222J 2A", "1H 473K".
 * Value codes are in pF. Multiplier digit 8 means ×0.01 and 9 means ×0.1, a common convention.
 */
export function decodeCap(raw: string): Decoded {
	const tokens = raw
		.trim()
		.toUpperCase()
		.split(/[\s,/]+/)
		.filter(Boolean);
	if (!tokens.length) throw new Error('Enter a marking such as 104, 4R7 or 473K 2A');
	let volts: number | undefined;
	let voltCode: string | undefined;
	let body: string | undefined;
	const isVolt = (t: string) => /^[0-4][A-Z]$/.test(t) && VOLT_LETTERS[t[1]] !== undefined;
	for (const t of tokens) {
		if (tokens.length > 1 && voltCode === undefined && isVolt(t)) {
			volts = voltageCode(t);
			voltCode = t;
		} else if (body === undefined) body = t;
		else throw new Error(`Could not read "${t}"`);
	}
	if (body === undefined) throw new Error('No value code found, only a voltage code');
	let tol: Tolerance | undefined;
	const tm = /^(.*?)([BCDFGJKMZ])$/.exec(body);
	if (tm && tm[1] && !/R$/.test(tm[1])) {
		tol = TOLERANCES.find((x) => x.letter === tm[2]);
		body = tm[1];
	}
	let pF: number;
	let system: string;
	if (/^\d*R\d+$/.test(body) || /^\d+R$/.test(body)) {
		pF = Number(body.replace('R', '.'));
		system = 'R marks the decimal point, value in pF';
	} else if (/^\d{3}$/.test(body)) {
		const d = Number(body[2]);
		const sig = Number(body.slice(0, 2));
		if (d === 7) throw new Error('Multiplier digit 7 is not used');
		const exp = d === 8 ? -2 : d === 9 ? -1 : d;
		pF = clean(sig * 10 ** exp);
		system = `Two digits ${body.slice(0, 2)} and multiplier ${d === 8 ? '×0.01' : d === 9 ? '×0.1' : `10^${d}`}, value in pF`;
	} else if (/^\d{1,2}$/.test(body)) {
		pF = Number(body);
		system = 'Plain value in pF';
	} else if (/^\d{4}$/.test(body)) {
		const sig = Number(body.slice(0, 3));
		const d = Number(body[3]);
		pF = clean(sig * 10 ** d);
		system = 'Three digits and multiplier, value in pF';
	} else {
		throw new Error(`"${raw.trim()}" is not a capacitor code. Examples: 104, 4R7, 473K, 2A 104J`);
	}
	const value = clean(pF * 1e-12);
	return { value, pF, system, tol, volts, voltCode };
}

/** Three-character marking for a value in farads: 100 nF → "104", 4.7 pF → "4R7". */
export function encodeCap(f: number): string | undefined {
	if (!(f > 0)) return undefined;
	const pF = clean(f * 1e12);
	if (pF < 10) {
		const s = String(Number(pF.toPrecision(2)));
		if (Number(s) !== pF) return undefined;
		return s.includes('.') ? s.replace('.', 'R') : `${s}R0`.slice(0, 3);
	}
	const exp = Math.floor(Math.log10(pF) + 1e-12) - 1;
	const sig = pF / 10 ** exp;
	if (Math.abs(sig - Math.round(sig)) > 1e-6 || exp > 6) return undefined;
	return `${Math.round(sig)}${exp}`;
}

/** Tolerance band in farads. */
export function tolRange(value: number, t: Tolerance): { min: number; max: number } {
	const pF = value * 1e12;
	if (t.plus !== undefined)
		return { min: clean(value * (1 - t.minus! / 100)), max: clean(value * (1 + t.plus / 100)) };
	if (t.pF !== undefined && (pF < 10 || t.pct === undefined))
		return { min: clean((pF - t.pF) * 1e-12), max: clean((pF + t.pF) * 1e-12) };
	return { min: clean(value * (1 - t.pct! / 100)), max: clean(value * (1 + t.pct! / 100)) };
}

/** The same value in pF, nF and µF, without float noise. */
export function units(f: number): { pF: number; nF: number; uF: number } {
	return { pF: clean(f * 1e12), nF: clean(f * 1e9), uF: clean(f * 1e6) };
}

// ---------- RC ----------

export interface Rc {
	tau: number;
	fc: number;
	/** Rows for n = 1..5 time constants */
	rows: { n: number; t: number; charge: number; discharge: number }[];
}

export function rc(r: number, c: number): Rc {
	if (!(r > 0)) throw new Error('R must be above zero');
	if (!(c > 0)) throw new Error('C must be above zero');
	const tau = r * c;
	const rows = [1, 2, 3, 4, 5].map((n) => ({
		n,
		t: n * tau,
		charge: (1 - Math.exp(-n)) * 100,
		discharge: Math.exp(-n) * 100
	}));
	return { tau, fc: 1 / (2 * Math.PI * tau), rows };
}

/** Voltage across the capacitor, in percent of the supply, after t / τ = x. */
export const charge = (x: number) => (1 - Math.exp(-x)) * 100;
export const discharge = (x: number) => Math.exp(-x) * 100;

/**
 * SVG polyline points for the charge and discharge curves over 0 to 5 τ, drawn into a
 * box of width w and height h (y grows downwards).
 */
export function curvePoints(
	w: number,
	h: number,
	steps = 50
): { charge: string; discharge: string } {
	const pts = (f: (x: number) => number) => {
		const out: string[] = [];
		for (let i = 0; i <= steps; i++) {
			const x = (i / steps) * 5;
			out.push(`${round1((x / 5) * w)},${round1(h - (f(x) / 100) * h)}`);
		}
		return out.join(' ');
	};
	return { charge: pts(charge), discharge: pts(discharge) };
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/** Time to reach a given percentage when charging: t = -τ ln(1 - p). */
export function timeToPct(tau: number, pct: number): number {
	if (!(pct > 0 && pct < 100)) throw new Error('Percentage must be between 0 and 100');
	return -tau * Math.log(1 - pct / 100);
}

// ---------- LC and reactance ----------

export function lcResonance(l: number, c: number): number {
	if (!(l > 0)) throw new Error('L must be above zero');
	if (!(c > 0)) throw new Error('C must be above zero');
	return 1 / (2 * Math.PI * Math.sqrt(l * c));
}

export function xc(f: number, c: number): number {
	if (!(f > 0)) throw new Error('Frequency must be above zero');
	if (!(c > 0)) throw new Error('C must be above zero');
	return 1 / (2 * Math.PI * f * c);
}

export function xl(f: number, l: number): number {
	if (!(f > 0)) throw new Error('Frequency must be above zero');
	if (!(l > 0)) throw new Error('L must be above zero');
	return 2 * Math.PI * f * l;
}

/** Characteristic impedance √(L/C) of an LC tank, handy for Q estimates. */
export const lcImpedance = (l: number, c: number) => Math.sqrt(l / c);
