/**
 * Byte encodings beyond Base64.
 * Base32 and base32hex: RFC 4648 sections 6 and 7.
 * Crockford Base32: https://www.crockford.com/base32.html
 * Base58: Bitcoin alphabet, also in draft-msporny-base58.
 * Ascii85: Adobe PostScript Language Reference, ASCII85Encode filter.
 * Z85: ZeroMQ RFC 32 (https://rfc.zeromq.org/spec/32/).
 * Base45: RFC 9285.
 */

export type Encoding =
	| 'base32'
	| 'base32hex'
	| 'crockford'
	| 'base58'
	| 'base58check'
	| 'ascii85'
	| 'z85'
	| 'base45'
	| 'base36';

export const encodings: { id: Encoding; label: string }[] = [
	{ id: 'base32', label: 'Base32' },
	{ id: 'base32hex', label: 'base32hex' },
	{ id: 'crockford', label: 'Crockford' },
	{ id: 'base58', label: 'Base58' },
	{ id: 'base58check', label: 'Base58Check' },
	{ id: 'ascii85', label: 'Ascii85' },
	{ id: 'z85', label: 'Z85' },
	{ id: 'base45', label: 'Base45' },
	{ id: 'base36', label: 'Base36' }
];

function badChar(c: string, name: string): Error {
	return new Error(`Invalid ${name} character "${c}"`);
}

// ---------------------------------------------------------------------------
// Base32 family: 5 bits per character.

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const B32HEX = '0123456789ABCDEFGHIJKLMNOPQRSTUV';
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function encode5(bytes: Uint8Array, alphabet: string, pad: boolean): string {
	let out = '';
	let buf = 0;
	let bits = 0;
	for (const b of bytes) {
		buf = (buf << 8) | b;
		bits += 8;
		while (bits >= 5) {
			out += alphabet[(buf >>> (bits - 5)) & 31];
			bits -= 5;
		}
		buf &= (1 << bits) - 1;
	}
	if (bits > 0) out += alphabet[(buf << (5 - bits)) & 31];
	if (pad) while (out.length % 8) out += '=';
	return out;
}

function decode5(values: number[]): Uint8Array {
	// Valid lengths mod 8: 0, 2, 4, 5, 7 characters.
	if ([1, 3, 6].includes(values.length % 8)) throw new Error('Length is not valid Base32');
	const out: number[] = [];
	let buf = 0;
	let bits = 0;
	for (const v of values) {
		buf = (buf << 5) | v;
		bits += 5;
		if (bits >= 8) {
			out.push((buf >>> (bits - 8)) & 255);
			bits -= 8;
		}
		buf &= (1 << bits) - 1;
	}
	return new Uint8Array(out);
}

export function base32Encode(bytes: Uint8Array, hex = false, pad = true): string {
	return encode5(bytes, hex ? B32HEX : B32, pad);
}

export function base32Decode(input: string, hex = false): Uint8Array {
	const alphabet = hex ? B32HEX : B32;
	const clean = input.replace(/\s+/g, '').toUpperCase();
	const m = clean.match(/^([^=]*)(=*)$/);
	if (!m) throw new Error('Padding in the wrong place');
	const values = Array.from(m[1], (c) => {
		const i = alphabet.indexOf(c);
		if (i < 0) throw badChar(c, hex ? 'base32hex' : 'Base32');
		return i;
	});
	if (m[2] && (m[1].length + m[2].length) % 8) throw new Error('Wrong amount of padding');
	return decode5(values);
}

export function crockfordEncode(bytes: Uint8Array): string {
	return encode5(bytes, CROCKFORD, false);
}

/** Case-insensitive; I and L read as 1, O as 0; hyphens are ignored. */
export function crockfordDecode(input: string): Uint8Array {
	const clean = input
		.replace(/[\s-]+/g, '')
		.toUpperCase()
		.replace(/[IL]/g, '1')
		.replace(/O/g, '0');
	const values = Array.from(clean, (c) => {
		const i = CROCKFORD.indexOf(c);
		if (i < 0) throw badChar(c, 'Crockford Base32');
		return i;
	});
	return decode5(values);
}

// ---------------------------------------------------------------------------
// Big-number bases (Base58, Base36): the bytes are one big-endian integer,
// and each leading zero byte becomes one zero digit.

function bigEncode(bytes: Uint8Array, alphabet: string): string {
	let zeros = 0;
	while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
	let n = 0n;
	for (const b of bytes.subarray(zeros)) n = (n << 8n) | BigInt(b);
	const base = BigInt(alphabet.length);
	let out = '';
	while (n > 0n) {
		out = alphabet[Number(n % base)] + out;
		n /= base;
	}
	return alphabet[0].repeat(zeros) + out;
}

function bigDecode(input: string, alphabet: string, name: string): Uint8Array {
	let zeros = 0;
	while (zeros < input.length && input[zeros] === alphabet[0]) zeros++;
	const base = BigInt(alphabet.length);
	let n = 0n;
	for (const c of input.slice(zeros)) {
		const i = alphabet.indexOf(c);
		if (i < 0) throw badChar(c, name);
		n = n * base + BigInt(i);
	}
	const body: number[] = [];
	while (n > 0n) {
		body.unshift(Number(n & 255n));
		n >>= 8n;
	}
	return new Uint8Array([...new Array(zeros).fill(0), ...body]);
}

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const B36 = '0123456789abcdefghijklmnopqrstuvwxyz';

export function base58Encode(bytes: Uint8Array): string {
	return bigEncode(bytes, B58);
}

export function base58Decode(input: string): Uint8Array {
	return bigDecode(input.replace(/\s+/g, ''), B58, 'Base58');
}

export function base36Encode(bytes: Uint8Array): string {
	return bigEncode(bytes, B36);
}

export function base36Decode(input: string): Uint8Array {
	return bigDecode(input.replace(/\s+/g, '').toLowerCase(), B36, 'Base36');
}

async function sha256d(data: Uint8Array): Promise<Uint8Array> {
	const once = await crypto.subtle.digest('SHA-256', new Uint8Array(data));
	return new Uint8Array(await crypto.subtle.digest('SHA-256', once));
}

/** Base58Check: payload (version byte included) plus the first 4 bytes of SHA-256(SHA-256(payload)). */
export async function base58CheckEncode(payload: Uint8Array): Promise<string> {
	const sum = (await sha256d(payload)).subarray(0, 4);
	const all = new Uint8Array(payload.length + 4);
	all.set(payload);
	all.set(sum, payload.length);
	return base58Encode(all);
}

export interface Base58Check {
	/** Everything before the checksum, version byte included. */
	payload: Uint8Array;
	version: number;
	checksum: Uint8Array;
	expected: Uint8Array;
	valid: boolean;
}

export async function base58CheckDecode(input: string): Promise<Base58Check> {
	const all = base58Decode(input);
	if (all.length < 5)
		throw new Error('Too short for Base58Check (needs a payload and 4 checksum bytes)');
	const payload = all.subarray(0, all.length - 4);
	const checksum = all.subarray(all.length - 4);
	const expected = (await sha256d(payload)).subarray(0, 4);
	const valid = checksum.every((b, i) => b === expected[i]);
	return { payload, version: payload[0], checksum, expected, valid };
}

// ---------------------------------------------------------------------------
// Base85: 4 bytes become 5 characters.

function encode85(bytes: Uint8Array, toChar: (d: number) => string, zero: boolean): string {
	let out = '';
	for (let i = 0; i < bytes.length; i += 4) {
		const n = Math.min(4, bytes.length - i);
		let v = 0;
		for (let j = 0; j < 4; j++) v = v * 256 + (j < n ? bytes[i + j] : 0);
		if (zero && n === 4 && v === 0) {
			out += 'z';
			continue;
		}
		const digits: string[] = [];
		for (let j = 0; j < 5; j++) {
			digits.unshift(toChar(v % 85));
			v = Math.floor(v / 85);
		}
		out += digits.slice(0, n + 1).join('');
	}
	return out;
}

/** Adobe Ascii85, wrapped in <~ ~>. Four zero bytes become "z". */
export function ascii85Encode(bytes: Uint8Array): string {
	return '<~' + encode85(bytes, (d) => String.fromCharCode(d + 33), true) + '~>';
}

export function ascii85Decode(input: string): Uint8Array {
	let s = input.replace(/\s+/g, '');
	if (s.startsWith('<~')) s = s.slice(2);
	if (s.endsWith('~>')) s = s.slice(0, -2);
	const out: number[] = [];
	let group: number[] = [];
	const flush = (count: number) => {
		let v = 0;
		for (let j = 0; j < 5; j++) v = v * 85 + (j < group.length ? group[j] : 84);
		if (v > 0xffffffff) throw new Error('Ascii85 group is out of range');
		for (let j = 0; j < count; j++) out.push((v >>> (24 - 8 * j)) & 255);
		group = [];
	};
	for (const c of s) {
		if (c === 'z') {
			if (group.length) throw new Error('"z" inside a group');
			out.push(0, 0, 0, 0);
			continue;
		}
		const d = c.charCodeAt(0) - 33;
		if (d < 0 || d > 84) throw badChar(c, 'Ascii85');
		group.push(d);
		if (group.length === 5) flush(4);
	}
	if (group.length === 1) throw new Error('Ascii85 ends with a single character');
	if (group.length) flush(group.length - 1);
	return new Uint8Array(out);
}

const Z85 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.-:+=^!/*?&<>()[]{}@%$#';

/** Z85 needs whole 4-byte frames, as the spec says. */
export function z85Encode(bytes: Uint8Array): string {
	if (bytes.length % 4) throw new Error(`Z85 needs a multiple of 4 bytes, this is ${bytes.length}`);
	return encode85(bytes, (d) => Z85[d], false);
}

export function z85Decode(input: string): Uint8Array {
	const s = input.replace(/\s+/g, '');
	if (s.length % 5) throw new Error(`Z85 needs a multiple of 5 characters, this is ${s.length}`);
	const out = new Uint8Array((s.length / 5) * 4);
	for (let i = 0; i < s.length; i += 5) {
		let v = 0;
		for (let j = 0; j < 5; j++) {
			const d = Z85.indexOf(s[i + j]);
			if (d < 0) throw badChar(s[i + j], 'Z85');
			v = v * 85 + d;
		}
		if (v > 0xffffffff) throw new Error('Z85 group is out of range');
		const o = (i / 5) * 4;
		for (let j = 0; j < 4; j++) out[o + j] = (v >>> (24 - 8 * j)) & 255;
	}
	return out;
}

// ---------------------------------------------------------------------------
// Base45 (RFC 9285): 2 bytes become 3 characters, little end first.

const B45 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

export function base45Encode(bytes: Uint8Array): string {
	let out = '';
	for (let i = 0; i < bytes.length; i += 2) {
		if (i + 1 < bytes.length) {
			let n = bytes[i] * 256 + bytes[i + 1];
			for (let j = 0; j < 3; j++) {
				out += B45[n % 45];
				n = Math.floor(n / 45);
			}
		} else {
			const n = bytes[i];
			out += B45[n % 45] + B45[Math.floor(n / 45)];
		}
	}
	return out;
}

/** Spaces are part of the alphabet, so only line breaks are ignored. */
export function base45Decode(input: string): Uint8Array {
	const s = input.replace(/[\r\n]+/g, '');
	if (s.length % 3 === 1) throw new Error('Length is not valid Base45');
	const out: number[] = [];
	const val = (c: string) => {
		const i = B45.indexOf(c);
		if (i < 0) throw badChar(c, 'Base45');
		return i;
	};
	for (let i = 0; i < s.length; i += 3) {
		const c = val(s[i]);
		const d = val(s[i + 1]);
		if (i + 2 < s.length) {
			const n = c + d * 45 + val(s[i + 2]) * 2025;
			if (n > 0xffff) throw new Error(`Base45 triplet "${s.slice(i, i + 3)}" is out of range`);
			out.push(n >> 8, n & 255);
		} else {
			const n = c + d * 45;
			if (n > 0xff) throw new Error(`Base45 pair "${s.slice(i, i + 2)}" is out of range`);
			out.push(n);
		}
	}
	return new Uint8Array(out);
}

// ---------------------------------------------------------------------------

export async function encode(bytes: Uint8Array, enc: Encoding): Promise<string> {
	switch (enc) {
		case 'base32':
			return base32Encode(bytes);
		case 'base32hex':
			return base32Encode(bytes, true);
		case 'crockford':
			return crockfordEncode(bytes);
		case 'base58':
			return base58Encode(bytes);
		case 'base58check':
			return base58CheckEncode(bytes);
		case 'ascii85':
			return ascii85Encode(bytes);
		case 'z85':
			return z85Encode(bytes);
		case 'base45':
			return base45Encode(bytes);
		case 'base36':
			return base36Encode(bytes);
	}
}

/** Decodes; for Base58Check the checksum must match. */
export async function decode(input: string, enc: Encoding): Promise<Uint8Array> {
	switch (enc) {
		case 'base32':
			return base32Decode(input);
		case 'base32hex':
			return base32Decode(input, true);
		case 'crockford':
			return crockfordDecode(input);
		case 'base58':
			return base58Decode(input);
		case 'base58check': {
			const r = await base58CheckDecode(input);
			if (!r.valid) throw new Error('Base58Check checksum does not match');
			return r.payload;
		}
		case 'ascii85':
			return ascii85Decode(input);
		case 'z85':
			return z85Decode(input);
		case 'base45':
			return base45Decode(input);
		case 'base36':
			return base36Decode(input);
	}
}

export function utf8Text(bytes: Uint8Array): string | null {
	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch {
		return null;
	}
}

export function toHex(bytes: Uint8Array): string {
	return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ');
}

/** Ascii85 in Adobe brackets is distinctive enough to claim. */
export function looksLikeAscii85(s: string): number {
	return /^<~[!-uz\s]+~>$/.test(s.trim()) ? 0.9 : 0;
}
