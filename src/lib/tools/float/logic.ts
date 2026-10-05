/**
 * IEEE 754-2019 binary32 and binary64, done on BigInt bit patterns so that every result is
 * exact: decimal input is rounded once, correctly (round half to even), never via a double
 * first. NaN payloads survive because the pattern, not a JS number, is the source of truth.
 */

export type Format = 'f32' | 'f64';

export interface Spec {
	bits: number;
	expBits: number;
	/** Stored fraction bits (the mantissa without the implicit 1). */
	fracBits: number;
	bias: number;
}

export const specs: Record<Format, Spec> = {
	f32: { bits: 32, expBits: 8, fracBits: 23, bias: 127 },
	f64: { bits: 64, expBits: 11, fracBits: 52, bias: 1023 }
};

export type Kind = 'zero' | 'subnormal' | 'normal' | 'infinity' | 'nan';

export interface Fields {
	sign: 0 | 1;
	/** Biased exponent field. */
	exponent: number;
	fraction: bigint;
	kind: Kind;
	/** Exponent after removing the bias; subnormals use 1 − bias. Null for Inf and NaN. */
	unbiased: number | null;
	/** For NaN: quiet when the top fraction bit is set. */
	quiet?: boolean;
	/** For NaN: the fraction bits without the quiet bit. */
	payload?: bigint;
}

const one = 1n;

export function fields(bits: bigint, f: Format): Fields {
	const s = specs[f];
	const fb = BigInt(s.fracBits);
	const sign = Number(bits >> BigInt(s.bits - 1)) as 0 | 1;
	const expMax = (1 << s.expBits) - 1;
	const exponent = Number((bits >> fb) & BigInt(expMax));
	const fraction = bits & ((one << fb) - one);
	if (exponent === expMax) {
		if (!fraction) return { sign, exponent, fraction, kind: 'infinity', unbiased: null };
		const qbit = one << (fb - one);
		return {
			sign,
			exponent,
			fraction,
			kind: 'nan',
			unbiased: null,
			quiet: (fraction & qbit) !== 0n,
			payload: fraction & (qbit - one)
		};
	}
	if (exponent === 0)
		return {
			sign,
			exponent,
			fraction,
			kind: fraction ? 'subnormal' : 'zero',
			unbiased: 1 - s.bias
		};
	return { sign, exponent, fraction, kind: 'normal', unbiased: exponent - s.bias };
}

/** The finite value as integer × 2^exp. Null for Inf and NaN. */
export function asBinary(bits: bigint, f: Format): { sign: 0 | 1; m: bigint; e: number } | null {
	const s = specs[f];
	const d = fields(bits, f);
	if (d.kind === 'infinity' || d.kind === 'nan') return null;
	const m = d.kind === 'normal' ? d.fraction | (one << BigInt(s.fracBits)) : d.fraction;
	return { sign: d.sign, m, e: (d.unbiased as number) - s.fracBits };
}

/** Exact decimal of sign × m × 2^e, all digits, no rounding. */
export function exactDecimal(sign: 0 | 1, m: bigint, e: number): string {
	let out: string;
	if (e >= 0) out = (m << BigInt(e)).toString();
	else {
		const k = -e;
		const digits = (m * 5n ** BigInt(k)).toString().padStart(k + 1, '0');
		const int = digits.slice(0, digits.length - k);
		const frac = digits.slice(digits.length - k).replace(/0+$/, '');
		out = frac ? `${int}.${frac}` : int;
	}
	return (sign ? '-' : '') + out;
}

/** Exact decimal value of a pattern, or Infinity / NaN. */
export function exactValue(bits: bigint, f: Format): string {
	const b = asBinary(bits, f);
	if (!b) {
		const d = fields(bits, f);
		return d.kind === 'nan' ? 'NaN' : d.sign ? '-Infinity' : 'Infinity';
	}
	return exactDecimal(b.sign, b.m, b.e);
}

const bitLength = (n: bigint): number => (n ? n.toString(2).length : 0);

/**
 * Rounds sign × num / den to the nearest representable value, ties to even, with gradual
 * underflow and overflow to infinity. num and den are positive.
 */
export function roundRational(sign: 0 | 1, num: bigint, den: bigint, f: Format): bigint {
	const s = specs[f];
	const p = s.fracBits + 1;
	const signBit = BigInt(sign) << BigInt(s.bits - 1);
	if (!num) return signBit;
	const minE = 1 - s.bias - s.fracBits; // exponent of the smallest subnormal step
	// Choose e so that num / den / 2^e lies in [2^(p-1), 2^p).
	let e = bitLength(num) - bitLength(den) - p;
	const scaled = (ee: number): [bigint, bigint] =>
		ee >= 0 ? [num, den << BigInt(ee)] : [num << BigInt(-ee), den];
	let [n, d] = scaled(e);
	if (n / d >= one << BigInt(p)) [n, d] = scaled(++e);
	else if (n / d < one << BigInt(p - 1)) [n, d] = scaled(--e);
	if (e < minE) [n, d] = scaled((e = minE));
	let q = n / d;
	const r2 = (n % d) * 2n;
	if (r2 > d || (r2 === d && q & one)) q++;
	if (q === one << BigInt(p)) {
		q >>= one;
		e++;
	}
	const maxE = s.bias - s.fracBits; // e of the largest finite value
	const expMax = BigInt((1 << s.expBits) - 1);
	if (e > maxE) return signBit | (expMax << BigInt(s.fracBits));
	if (q < one << BigInt(p - 1)) return signBit | q; // subnormal (or zero)
	const expField = BigInt(e + s.fracBits + s.bias);
	return signBit | (expField << BigInt(s.fracBits)) | (q - (one << BigInt(s.fracBits)));
}

export const infinity = (sign: 0 | 1, f: Format): bigint =>
	(BigInt(sign) << BigInt(specs[f].bits - 1)) |
	(BigInt((1 << specs[f].expBits) - 1) << BigInt(specs[f].fracBits));

/** The default quiet NaN, as produced by 0/0 on x86 and ARM (sign clear). */
export const quietNaN = (f: Format): bigint =>
	infinity(0, f) | (one << BigInt(specs[f].fracBits - 1));

export interface Parsed {
	bits: bigint;
	/** How the input was read: as a decimal value or as a bit pattern. */
	as: 'decimal' | 'hex float' | 'bits';
	/** True when the value had to be rounded to fit. */
	inexact: boolean;
}

/**
 * Reads a decimal number (1.5, -2e-3, .5), Infinity, NaN, a C hex float (0x1.8p1) or a raw
 * pattern written as 0x with exactly 8 or 16 hex digits (for f32 and f64) or 0b with 32 or 64
 * binary digits. Spaces and _ are ignored. A Danish decimal comma is accepted.
 */
export function parseInput(raw: string, f: Format): Parsed {
	const s = specs[f];
	const t = raw.trim().replace(/[\s_]/g, '');
	if (!t) throw new Error('Enter a number, or a bit pattern as 0x… or 0b…');
	const neg = t.startsWith('-') ? 1 : 0;
	const body = t.replace(/^[-+]/, '');
	if (/^(inf|infinity|∞)$/i.test(body))
		return { bits: infinity(neg, f), as: 'decimal', inexact: false };
	if (/^nan$/i.test(body))
		return {
			bits: quietNaN(f) | (BigInt(neg) << BigInt(s.bits - 1)),
			as: 'decimal',
			inexact: false
		};

	const hf = body.match(/^0x([0-9a-f]*)(?:\.([0-9a-f]*))?p([-+]?\d+)$/i);
	if (hf) {
		const [, ip = '', fp = ''] = hf;
		if (!ip && !fp) throw new Error('Hex float needs digits, like 0x1.8p1');
		const mant = BigInt('0x' + (ip + fp || '0'));
		const exp = Number(hf[3]) - 4 * fp.length;
		return fromBinary(neg, mant, exp, f, 'hex float');
	}

	const hx = body.match(/^0x([0-9a-f]+)$/i);
	if (hx) {
		if (neg) throw new Error('A bit pattern has no sign; set the top bit instead');
		if (hx[1].length !== s.bits / 4)
			throw new Error(
				`A ${f === 'f32' ? 'float32' : 'float64'} pattern is ${s.bits / 4} hex digits, got ${hx[1].length}`
			);
		return { bits: BigInt('0x' + hx[1]), as: 'bits', inexact: false };
	}
	const bn = body.match(/^0b([01]+)$/i);
	if (bn) {
		if (neg) throw new Error('A bit pattern has no sign; set the top bit instead');
		if (bn[1].length !== s.bits)
			throw new Error(
				`A ${f === 'f32' ? 'float32' : 'float64'} pattern is ${s.bits} bits, got ${bn[1].length}`
			);
		return { bits: BigInt('0b' + bn[1]), as: 'bits', inexact: false };
	}

	const dm = body.replace(',', '.').match(/^(\d*)(?:\.(\d*))?(?:e([-+]?\d+))?$/i);
	if (!dm || !(dm[1] || dm[2]))
		throw new Error(`"${raw.trim()}" is not a number, Infinity, NaN or a 0x / 0b bit pattern`);
	const digits = (dm[1] ?? '') + (dm[2] ?? '');
	let exp10 = Number(dm[3] ?? 0) - (dm[2] ?? '').length;
	let mant = BigInt(digits || '0');
	if (!mant) return { bits: BigInt(neg) << BigInt(s.bits - 1), as: 'decimal', inexact: false };
	// Way outside the range: avoid building enormous integers.
	const magnitude = digits.replace(/^0+/, '').length + exp10;
	if (magnitude > 400) return { bits: infinity(neg, f), as: 'decimal', inexact: true };
	if (magnitude < -400)
		return { bits: BigInt(neg) << BigInt(s.bits - 1), as: 'decimal', inexact: true };
	while (mant % 10n === 0n) {
		mant /= 10n;
		exp10++;
	}
	const num = exp10 >= 0 ? mant * 10n ** BigInt(exp10) : mant;
	const den = exp10 >= 0 ? one : 10n ** BigInt(-exp10);
	const bits = roundRational(neg as 0 | 1, num, den, f);
	return { bits, as: 'decimal', inexact: !isExact(bits, f, num, den) };
}

function fromBinary(neg: number, mant: bigint, exp: number, f: Format, as: Parsed['as']): Parsed {
	if (!mant) return { bits: BigInt(neg) << BigInt(specs[f].bits - 1), as, inexact: false };
	if (exp > 2000) return { bits: infinity(neg as 0 | 1, f), as, inexact: true };
	if (exp < -2000) return { bits: BigInt(neg) << BigInt(specs[f].bits - 1), as, inexact: true };
	const num = exp >= 0 ? mant << BigInt(exp) : mant;
	const den = exp >= 0 ? one : one << BigInt(-exp);
	const bits = roundRational(neg as 0 | 1, num, den, f);
	return { bits, as, inexact: !isExact(bits, f, num, den) };
}

function isExact(bits: bigint, f: Format, num: bigint, den: bigint): boolean {
	const b = asBinary(bits, f);
	if (!b) return false;
	// m × 2^e == num / den
	return b.e >= 0 ? (b.m << BigInt(b.e)) * den === num : b.m * den === num << BigInt(-b.e);
}

/** The next value toward +Infinity. NaN has none; +Infinity stays. */
export function nextUp(bits: bigint, f: Format): bigint | null {
	const s = specs[f];
	const d = fields(bits, f);
	if (d.kind === 'nan') return null;
	const signBit = one << BigInt(s.bits - 1);
	if (d.kind === 'infinity') return d.sign ? infinity(1, f) - one : bits;
	if (d.kind === 'zero') return one;
	return d.sign ? (bits - one === signBit ? signBit : bits - one) : bits + one;
}

/** The next value toward −Infinity. */
export function nextDown(bits: bigint, f: Format): bigint | null {
	const s = specs[f];
	const signBit = one << BigInt(s.bits - 1);
	const n = nextUp(bits ^ signBit, f);
	return n === null ? null : n ^ signBit;
}

/**
 * Unit in the last place: the gap from |x| to the next larger magnitude, as in Java Math.ulp.
 * Returns the exponent k so that ULP = 2^k. Null for Inf and NaN.
 */
export function ulpExponent(bits: bigint, f: Format): number | null {
	const d = fields(bits, f);
	if (d.unbiased === null) return null;
	return d.unbiased - specs[f].fracBits;
}

/** C99 hex float notation, e.g. 0x1.999999999999ap-4. */
export function hexFloat(bits: bigint, f: Format): string {
	const s = specs[f];
	const d = fields(bits, f);
	const sg = d.sign ? '-' : '';
	if (d.kind === 'nan') return 'NaN';
	if (d.kind === 'infinity') return `${sg}Infinity`;
	if (d.kind === 'zero') return `${sg}0x0p+0`;
	// Pad the fraction to whole nibbles (f32 has 23 bits, shift left by 1).
	const pad = (4 - (s.fracBits % 4)) % 4;
	const frac = (d.fraction << BigInt(pad))
		.toString(16)
		.padStart((s.fracBits + pad) / 4, '0')
		.replace(/0+$/, '');
	const lead = d.kind === 'normal' ? '1' : '0';
	const e = d.unbiased as number;
	return `${sg}0x${lead}${frac ? '.' + frac : ''}p${e >= 0 ? '+' : ''}${e}`;
}

/** The pattern as a JS number (a double). Float32 values widen exactly. */
export function toNumber(bits: bigint, f: Format): number {
	const dv = new DataView(new ArrayBuffer(8));
	if (f === 'f64') {
		dv.setBigUint64(0, bits);
		return dv.getFloat64(0);
	}
	dv.setUint32(0, Number(bits));
	return dv.getFloat32(0);
}

/**
 * Shortest decimal that reads back to the same pattern. For float64 this is what JavaScript
 * prints; for float32 the fewest digits (up to 9) that round-trip.
 */
export function shortest(bits: bigint, f: Format): string {
	const d = fields(bits, f);
	if (d.kind === 'nan') return 'NaN';
	const x = toNumber(bits, f);
	if (d.kind === 'zero') return d.sign ? '-0' : '0';
	if (f === 'f64') return String(x);
	for (let p = 1; p <= 9; p++) {
		const s = String(Number(x.toPrecision(p)));
		if (parseInput(s, 'f32').bits === bits) return s;
	}
	return String(x);
}

export function hexPattern(bits: bigint, f: Format): string {
	return (
		'0x' +
		bits
			.toString(16)
			.toUpperCase()
			.padStart(specs[f].bits / 4, '0')
	);
}

export function binPattern(bits: bigint, f: Format): string {
	return bits.toString(2).padStart(specs[f].bits, '0');
}

export const kindLabel: Record<Kind, string> = {
	zero: 'Zero',
	subnormal: 'Subnormal',
	normal: 'Normal',
	infinity: 'Infinity',
	nan: 'NaN'
};
