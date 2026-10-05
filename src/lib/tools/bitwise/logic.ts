import { parseAuto } from '../number-base/logic';

export type Width = 8 | 16 | 32 | 64;
export const widths: Width[] = [8, 16, 32, 64];

export const maskOf = (w: Width): bigint => (1n << BigInt(w)) - 1n;

/** Reads an operand: decimal, or 0x / 0b / 0o prefixed, with an optional sign. */
export function parseOperand(raw: string): bigint {
	return parseAuto(raw);
}

/**
 * The w-bit pattern for n. Accepts the signed and the unsigned range, -2^(w-1) to 2^w - 1,
 * so -1 and 255 both give 0xff at 8 bits.
 */
export function toPattern(n: bigint, w: Width): bigint {
	const W = BigInt(w);
	const min = -(1n << (W - 1n));
	const max = (1n << W) - 1n;
	if (n < min || n > max)
		throw new Error(`${n} does not fit in ${w} bits (range ${min} to ${max})`);
	return n & maskOf(w);
}

/** Reads a pattern as a number: two's complement when signed. */
export function fromPattern(p: bigint, w: Width, signed: boolean): bigint {
	const W = BigInt(w);
	return signed && p >> (W - 1n) ? p - (1n << W) : p;
}

export function parseShift(raw: string): number {
	const s = raw.trim();
	if (!/^\d+$/.test(s)) throw new Error('Shift count must be a whole number, 0 or more');
	const n = Number(s);
	if (n > 4096) throw new Error('Shift count is too large');
	return n;
}

export function shiftLeft(a: bigint, n: number, w: Width): bigint {
	return (a << BigInt(n)) & maskOf(w);
}

/** Logical right shift: zeros come in from the left (>>> in Java and JavaScript). */
export function shiftRightLogical(a: bigint, n: number): bigint {
	return a >> BigInt(n);
}

/** Arithmetic right shift: copies of the sign bit come in from the left. */
export function shiftRightArithmetic(a: bigint, n: number, w: Width): bigint {
	return (fromPattern(a, w, true) >> BigInt(n)) & maskOf(w);
}

export function rotateLeft(a: bigint, n: number, w: Width): bigint {
	const s = BigInt(n % w);
	if (!s) return a;
	return ((a << s) | (a >> (BigInt(w) - s))) & maskOf(w);
}

export function rotateRight(a: bigint, n: number, w: Width): bigint {
	return rotateLeft(a, (w - (n % w)) % w, w);
}

export function popcount(a: bigint): number {
	let c = 0;
	for (let x = a; x; x >>= 1n) c += Number(x & 1n);
	return c;
}

/** Leading zeros within the width. */
export function clz(a: bigint, w: Width): number {
	return a ? w - a.toString(2).length : w;
}

/** Trailing zeros, or the width when the value is zero. */
export function ctz(a: bigint, w: Width): number {
	if (!a) return w;
	let n = 0;
	for (let x = a; !(x & 1n); x >>= 1n) n++;
	return n;
}

export interface Result {
	id: string;
	label: string;
	/** Whether operand B takes part, for the bit grid. */
	usesB: boolean;
	pattern: bigint;
}

/**
 * Every operation on the patterns a and b. `>>` is arithmetic when signed and logical when
 * unsigned, as in C on common compilers, Java and Rust. Shifts by the width or more are not
 * masked to the width as x86 and JavaScript do: all bits shift out.
 */
export function compute(a: bigint, b: bigint, n: number, w: Width, signed: boolean): Result[] {
	const m = maskOf(w);
	return [
		{ id: 'and', label: 'A AND B', usesB: true, pattern: a & b },
		{ id: 'or', label: 'A OR B', usesB: true, pattern: a | b },
		{ id: 'xor', label: 'A XOR B', usesB: true, pattern: a ^ b },
		{ id: 'andnot', label: 'A AND NOT B', usesB: true, pattern: a & ~b & m },
		{ id: 'nota', label: 'NOT A', usesB: false, pattern: ~a & m },
		{ id: 'notb', label: 'NOT B', usesB: true, pattern: ~b & m },
		{ id: 'shl', label: `A << ${n}`, usesB: false, pattern: shiftLeft(a, n, w) },
		{
			id: 'shr',
			label: `A >> ${n}${signed ? ', arithmetic' : ', logical'}`,
			usesB: false,
			pattern: signed ? shiftRightArithmetic(a, n, w) : shiftRightLogical(a, n)
		},
		{ id: 'ushr', label: `A >>> ${n}, logical`, usesB: false, pattern: shiftRightLogical(a, n) },
		{ id: 'rol', label: `A rotate left ${n}`, usesB: false, pattern: rotateLeft(a, n, w) },
		{ id: 'ror', label: `A rotate right ${n}`, usesB: false, pattern: rotateRight(a, n, w) }
	];
}

/**
 * Builds a mask from bit positions such as "0, 3, 7-9". Bit 0 is the least significant.
 */
export function maskFromBits(raw: string, w: Width): bigint {
	const s = raw.trim();
	if (!s) return 0n;
	let mask = 0n;
	for (const part of s.split(/[\s,;]+/).filter(Boolean)) {
		const m = part.match(/^(\d+)(?:[-–](\d+))?$/);
		if (!m) throw new Error(`"${part}" is not a bit position or range like 4-7`);
		let lo = Number(m[1]);
		let hi = m[2] === undefined ? lo : Number(m[2]);
		if (lo > hi) [lo, hi] = [hi, lo];
		if (hi >= w) throw new Error(`Bit ${hi} is outside ${w} bits (0 to ${w - 1})`);
		for (let i = lo; i <= hi; i++) mask |= 1n << BigInt(i);
	}
	return mask;
}

export function parseBit(raw: string, w: Width): number {
	const s = raw.trim();
	if (!/^\d+$/.test(s)) throw new Error('Bit position must be a whole number');
	const n = Number(s);
	if (n >= w) throw new Error(`Bit ${n} is outside ${w} bits (0 to ${w - 1})`);
	return n;
}

export const testBit = (a: bigint, n: number): boolean => ((a >> BigInt(n)) & 1n) === 1n;
export const setBit = (a: bigint, n: number): bigint => a | (1n << BigInt(n));
export const clearBit = (a: bigint, n: number): bigint => a & ~(1n << BigInt(n));
export const toggleBit = (a: bigint, n: number): bigint => a ^ (1n << BigInt(n));

export function hex(p: bigint, w: Width): string {
	return '0x' + p.toString(16).padStart(w / 4, '0');
}

/** Binary digits padded to the width, grouped in nibbles. */
export function bin(p: bigint, w: Width): string {
	return (p.toString(2).padStart(w, '0').match(/.{4}/g) ?? []).join(' ');
}

/** Bits most significant first, split into bytes for the grid. */
export function bytes(p: bigint, w: Width): string[] {
	return p.toString(2).padStart(w, '0').match(/.{8}/g) ?? [];
}
