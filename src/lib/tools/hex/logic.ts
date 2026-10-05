/** Hex, binary and decimal byte notations, a hexdump and endianness swaps. */

export type HexStyle = 'plain' | 'spaced' | 'prefixed' | 'c' | 'escaped';

export const hexStyles: { id: HexStyle; label: string }[] = [
	{ id: 'spaced', label: '48 65' },
	{ id: 'plain', label: '4865' },
	{ id: 'prefixed', label: '0x48 0x65' },
	{ id: 'c', label: '{0x48, 0x65}' },
	{ id: 'escaped', label: '\\x48\\x65' }
];

export function utf8(text: string): Uint8Array {
	return new TextEncoder().encode(text);
}

export interface Decoded {
	text: string;
	/** False when the bytes are not valid UTF-8. */
	utf8: boolean;
}

export function bytesToText(bytes: Uint8Array): Decoded {
	try {
		return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), utf8: true };
	} catch {
		return { text: new TextDecoder('utf-8').decode(bytes), utf8: false };
	}
}

const h2 = (b: number, upper: boolean) => {
	const s = b.toString(16).padStart(2, '0');
	return upper ? s.toUpperCase() : s;
};

export function formatHex(bytes: Uint8Array, style: HexStyle = 'spaced', upper = false): string {
	const parts = Array.from(bytes, (b) => h2(b, upper));
	switch (style) {
		case 'plain':
			return parts.join('');
		case 'spaced':
			return parts.join(' ');
		case 'prefixed':
			return parts.map((p) => '0x' + p).join(' ');
		case 'c':
			return parts.length ? `{ ${parts.map((p) => '0x' + p).join(', ')} }` : '{ }';
		case 'escaped':
			return parts.map((p) => '\\x' + p).join('');
	}
}

/**
 * Reads hex in the common notations: plain or spaced pairs, 0x prefixes, C arrays,
 * \x escapes, colon separated. A prefixed token with an odd number of digits gets a
 * leading zero (0x5 is 05); unprefixed digits must come in pairs.
 */
export function parseHex(input: string): Uint8Array {
	let s = input.trim();
	// Drop a C declaration around an array: unsigned char x[] = { ... };
	const brace = s.match(/\{([\s\S]*)\}\s*;?$/);
	if (brace) s = brace[1];
	const tokens = s.split(/[\s,;:{}]+/).filter(Boolean);
	let digits = '';
	for (const tok of tokens) {
		let pieces: string[];
		let prefixed = false;
		if (/\\x/i.test(tok)) {
			if (!/^(\\x[0-9a-f]{1,2})+$/i.test(tok))
				throw new Error(`Cannot read "${tok}" as \\x escapes`);
			pieces = tok.split(/\\x/i).filter(Boolean);
			prefixed = true;
		} else if (/^0x/i.test(tok)) {
			pieces = [tok.slice(2)];
			prefixed = true;
		} else {
			pieces = [tok];
		}
		for (const p of pieces) {
			const bad = p.match(/[^0-9a-f]/i);
			if (bad) throw new Error(`Invalid hex character "${bad[0]}"`);
			if (!p) throw new Error('Empty 0x prefix');
			if (p.length % 2) {
				if (!prefixed) throw new Error(`"${p}" has an odd number of hex digits`);
				digits += '0' + p;
			} else digits += p;
		}
	}
	const out = new Uint8Array(digits.length / 2);
	for (let i = 0; i < out.length; i++) out[i] = parseInt(digits.slice(i * 2, i * 2 + 2), 16);
	return out;
}

export function formatBinary(bytes: Uint8Array): string {
	return Array.from(bytes, (b) => b.toString(2).padStart(8, '0')).join(' ');
}

/**
 * Reads bits. Space separated groups are bytes (shorter groups get leading zeros);
 * an unbroken run must be a multiple of 8 bits.
 */
export function parseBinary(input: string): Uint8Array {
	const s = input.replace(/0b/gi, ' ').trim();
	if (!s) return new Uint8Array();
	const bad = s.match(/[^01\s,]/);
	if (bad) throw new Error(`Invalid binary character "${bad[0]}"`);
	const tokens = s.split(/[\s,]+/).filter(Boolean);
	const bytes: number[] = [];
	for (const t of tokens) {
		if (t.length <= 8) bytes.push(parseInt(t, 2));
		else if (t.length % 8) throw new Error(`"${t.slice(0, 12)}..." is not a multiple of 8 bits`);
		else for (let i = 0; i < t.length; i += 8) bytes.push(parseInt(t.slice(i, i + 8), 2));
	}
	return new Uint8Array(bytes);
}

export function formatDecimal(bytes: Uint8Array): string {
	return Array.from(bytes).join(' ');
}

export function parseDecimal(input: string): Uint8Array {
	const s = input.replace(/^[\s[{(]+|[\s\]})]+$/g, '');
	if (!s) return new Uint8Array();
	const tokens = s.split(/[\s,;]+/).filter(Boolean);
	return new Uint8Array(
		tokens.map((t) => {
			if (!/^\d+$/.test(t)) throw new Error(`"${t}" is not a decimal byte`);
			const n = Number(t);
			if (n > 255) throw new Error(`${t} is larger than a byte (0 to 255)`);
			return n;
		})
	);
}

export type Width = 2 | 4 | 8;

/** Reverses the byte order inside each 16, 32 or 64-bit word. */
export function swapEndian(bytes: Uint8Array, width: Width): Uint8Array {
	if (bytes.length % width)
		throw new Error(`${bytes.length} bytes is not a whole number of ${width * 8}-bit words`);
	const out = new Uint8Array(bytes.length);
	for (let i = 0; i < bytes.length; i += width)
		for (let j = 0; j < width; j++) out[i + j] = bytes[i + width - 1 - j];
	return out;
}

/** Bytes shown in the dump; bigger inputs are cut. */
export const DUMP_LIMIT = 64 * 1024;

const printable = (b: number) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.');

/**
 * Canonical hexdump, the layout of `hexdump -C` and `xxd`: offset, 16 bytes in
 * two groups of 8, then the printable ASCII between bars. Ends with the total length.
 */
export function hexdump(bytes: Uint8Array, limit = DUMP_LIMIT): string {
	const n = Math.min(bytes.length, limit);
	const lines: string[] = [];
	for (let off = 0; off < n; off += 16) {
		const row = bytes.subarray(off, Math.min(off + 16, n));
		let hex = '';
		for (let i = 0; i < 16; i++) {
			hex += i < row.length ? h2(row[i], false) + ' ' : '   ';
			if (i === 7) hex += ' ';
		}
		const ascii = Array.from(row, printable).join('');
		lines.push(`${off.toString(16).padStart(8, '0')}  ${hex} |${ascii}|`);
	}
	lines.push(n.toString(16).padStart(8, '0'));
	return lines.join('\n');
}

export type InputKind = 'text' | 'hex' | 'binary' | 'decimal';

export function parseInput(input: string, kind: InputKind): Uint8Array {
	switch (kind) {
		case 'text':
			return utf8(input);
		case 'hex':
			return parseHex(input);
		case 'binary':
			return parseBinary(input);
		case 'decimal':
			return parseDecimal(input);
	}
}

/** Likelihood that pasted text is hex bytes in one of the explicit notations. */
export function looksLikeHexBytes(s: string): number {
	const t = s.trim();
	if (/^(\\x[0-9a-f]{2}){4,}$/i.test(t)) return 0.85;
	if (/^\{\s*0x[0-9a-f]{1,2}(\s*,\s*0x[0-9a-f]{1,2}){3,}\s*,?\s*\}$/i.test(t)) return 0.85;
	// Spaced pairs: at least 8 bytes, and not only digits (which reads as numbers).
	if (/^[0-9a-f]{2}( [0-9a-f]{2}){7,}$/i.test(t) && /[a-f]/i.test(t)) return 0.6;
	return 0;
}
