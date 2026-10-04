const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';

const prefixes: Record<string, number> = { '0x': 16, '0b': 2, '0o': 8 };

export const baseName: Record<number, string> = {
	2: 'binary',
	8: 'octal',
	10: 'decimal',
	16: 'hex'
};

/**
 * Parses an integer in the given base into a BigInt.
 * Accepts a leading sign, the matching prefix (0x, 0b, 0o) and _ or spaces between digits.
 */
export function parseInBase(raw: string, base: number): bigint {
	if (!Number.isInteger(base) || base < 2 || base > 36) throw new Error('Base must be 2 to 36');
	let s = raw.trim().replace(/[\s_]/g, '');
	if (!s) throw new Error('Enter a number');
	let neg = false;
	if (s[0] === '-' || s[0] === '+') {
		neg = s[0] === '-';
		s = s.slice(1);
	}
	const p = s.slice(0, 2).toLowerCase();
	if (p in prefixes) {
		if (prefixes[p] !== base)
			throw new Error(`Prefix ${s.slice(0, 2)} means base ${prefixes[p]}, not base ${base}`);
		s = s.slice(2);
	}
	if (!s) throw new Error('No digits after the prefix');
	const b = BigInt(base);
	let n = 0n;
	for (let i = 0; i < s.length; i++) {
		const d = DIGITS.indexOf(s[i].toLowerCase());
		if (d < 0 || d >= base)
			throw new Error(`"${s[i]}" is not a valid ${baseName[base] ?? `base ${base}`} digit`);
		n = n * b + BigInt(d);
	}
	return neg ? -n : n;
}

/** Reads a number with an optional 0x, 0b or 0o prefix, otherwise decimal. */
export function parseAuto(raw: string): bigint {
	const m = raw.trim().match(/^[-+]?(0[xXbBoO])/);
	return parseInBase(raw, m ? prefixes[m[1].toLowerCase()] : 10);
}

export function toBase(n: bigint, base: number): string {
	return n.toString(base);
}

export type Width = 8 | 16 | 32 | 64;
export const widths: Width[] = [8, 16, 32, 64];

export interface TwosComplement {
	width: Width;
	/** The bit pattern as an unsigned value. */
	pattern: bigint;
	signed: bigint;
	unsigned: bigint;
	hex: string;
	bin: string;
}

/**
 * Two's complement bit pattern for a width. Accepts -2^(w-1) to 2^w - 1, so both
 * signed and unsigned readings of the same pattern fit.
 */
export function twosComplement(n: bigint, width: Width): TwosComplement {
	const w = BigInt(width);
	const min = -(1n << (w - 1n));
	const max = (1n << w) - 1n;
	if (n < min || n > max) throw new Error(`Does not fit in ${width} bits (range ${min} to ${max})`);
	const pattern = n < 0n ? (1n << w) + n : n;
	const signed = pattern >= 1n << (w - 1n) ? pattern - (1n << w) : pattern;
	return {
		width,
		pattern,
		signed,
		unsigned: pattern,
		hex: pattern.toString(16).padStart(width / 4, '0'),
		bin: pattern.toString(2).padStart(width, '0')
	};
}

/** Splits a digit string into groups of `size` from the right, e.g. nibbles. */
export function group(digits: string, size = 4, sep = ' '): string {
	const neg = digits.startsWith('-');
	let d = neg ? digits.slice(1) : digits;
	const pad = (size - (d.length % size)) % size;
	d = '0'.repeat(pad) + d;
	const out: string[] = [];
	for (let i = 0; i < d.length; i += size) out.push(d.slice(i, i + size));
	return (neg ? '-' : '') + out.join(sep);
}

/** Smallest of 8/16/32/64 bits that holds n (signed if negative), or null. */
export function fittingWidth(n: bigint): Width | null {
	for (const w of widths) {
		const b = BigInt(w);
		if (n < 0n ? n >= -(1n << (b - 1n)) : n < 1n << b) return w;
	}
	return null;
}

export function looksLikeBaseLiteral(s: string): number {
	const t = s.trim();
	if (/^-?0x[0-9a-fA-F][0-9a-fA-F_]*$/.test(t)) return 0.9;
	if (/^-?0b[01][01_]*$/.test(t)) return 0.9;
	if (/^-?0o[0-7][0-7_]*$/.test(t)) return 0.8;
	return 0;
}
