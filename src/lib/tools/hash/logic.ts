export type DigestAlgo = 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';
export type HmacAlgo = 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';

export const digestAlgos: DigestAlgo[] = ['MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'];
export const hmacAlgos: HmacAlgo[] = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'];

/** Output length in bytes per algorithm, used to hint what an expected hash could be. */
export const digestBytes: Record<DigestAlgo, number> = {
	MD5: 16,
	'SHA-1': 20,
	'SHA-256': 32,
	'SHA-384': 48,
	'SHA-512': 64
};

/** Algorithms that must not be relied on where an attacker can choose the input. */
export const weakAlgos: DigestAlgo[] = ['MD5', 'SHA-1'];

// ---------------------------------------------------------------------------
// MD5 (RFC 1321). WebCrypto does not offer MD5, so it is implemented here.

const S = [
	7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14,
	20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6,
	10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
];

/** T[i] = floor(2^32 * abs(sin(i + 1))), RFC 1321 section 3.4. */
const T = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) | 0);

export function md5(data: Uint8Array): Uint8Array {
	const len = data.length;
	// Padding: 0x80, zeros up to 56 mod 64, then the bit length as 64-bit little endian.
	const total = (((len + 8) >>> 6) + 1) << 6;
	const buf = new Uint8Array(total);
	buf.set(data);
	buf[len] = 0x80;
	const view = new DataView(buf.buffer);
	const bitsLo = (len * 8) >>> 0;
	const bitsHi = Math.floor(len / 0x20000000) >>> 0;
	view.setUint32(total - 8, bitsLo, true);
	view.setUint32(total - 4, bitsHi, true);

	let a0 = 0x67452301 | 0;
	let b0 = 0xefcdab89 | 0;
	let c0 = 0x98badcfe | 0;
	let d0 = 0x10325476 | 0;
	const M = new Int32Array(16);

	for (let off = 0; off < total; off += 64) {
		for (let j = 0; j < 16; j++) M[j] = view.getInt32(off + j * 4, true);
		let a = a0;
		let b = b0;
		let c = c0;
		let d = d0;
		for (let i = 0; i < 64; i++) {
			let f: number;
			let g: number;
			if (i < 16) {
				f = (b & c) | (~b & d);
				g = i;
			} else if (i < 32) {
				f = (d & b) | (~d & c);
				g = (5 * i + 1) & 15;
			} else if (i < 48) {
				f = b ^ c ^ d;
				g = (3 * i + 5) & 15;
			} else {
				f = c ^ (b | ~d);
				g = (7 * i) & 15;
			}
			const sum = (a + f + T[i] + M[g]) | 0;
			a = d;
			d = c;
			c = b;
			b = (b + ((sum << S[i]) | (sum >>> (32 - S[i])))) | 0;
		}
		a0 = (a0 + a) | 0;
		b0 = (b0 + b) | 0;
		c0 = (c0 + c) | 0;
		d0 = (d0 + d) | 0;
	}

	const out = new Uint8Array(16);
	const ov = new DataView(out.buffer);
	ov.setInt32(0, a0, true);
	ov.setInt32(4, b0, true);
	ov.setInt32(8, c0, true);
	ov.setInt32(12, d0, true);
	return out;
}

// ---------------------------------------------------------------------------
// SHA family and HMAC via WebCrypto

/** Copies into a fresh ArrayBuffer-backed array, which is what WebCrypto's types want. */
function plain(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
	return new Uint8Array(bytes);
}

export async function digest(algo: DigestAlgo, data: Uint8Array): Promise<Uint8Array> {
	if (algo === 'MD5') return md5(data);
	return new Uint8Array(await crypto.subtle.digest(algo, plain(data)));
}

export async function digestAll(data: Uint8Array): Promise<Record<DigestAlgo, Uint8Array>> {
	const out = await Promise.all(digestAlgos.map((a) => digest(a, data)));
	return Object.fromEntries(digestAlgos.map((a, i) => [a, out[i]])) as Record<
		DigestAlgo,
		Uint8Array
	>;
}

export async function hmac(algo: HmacAlgo, key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
	if (key.length === 0) throw new Error('HMAC key is empty');
	const k = await crypto.subtle.importKey('raw', plain(key), { name: 'HMAC', hash: algo }, false, [
		'sign'
	]);
	return new Uint8Array(await crypto.subtle.sign('HMAC', k, plain(data)));
}

export async function hmacAll(
	key: Uint8Array,
	data: Uint8Array
): Promise<Record<HmacAlgo, Uint8Array>> {
	const out = await Promise.all(hmacAlgos.map((a) => hmac(a, key, data)));
	return Object.fromEntries(hmacAlgos.map((a, i) => [a, out[i]])) as Record<HmacAlgo, Uint8Array>;
}

// ---------------------------------------------------------------------------
// Encoding

export function toHex(bytes: Uint8Array): string {
	let s = '';
	for (const b of bytes) s += b.toString(16).padStart(2, '0');
	return s;
}

export function toBase64(bytes: Uint8Array): string {
	let bin = '';
	for (let i = 0; i < bytes.length; i += 0x8000) {
		bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(bin);
}

/** Parses hex, tolerating whitespace, colons and a 0x prefix. */
export function hexToBytes(input: string): Uint8Array {
	const clean = input.replace(/^0x/i, '').replace(/[\s:]/g, '');
	const bad = clean.match(/[^0-9a-f]/i);
	if (bad) throw new Error(`Invalid hex character "${bad[0]}"`);
	if (clean.length % 2) throw new Error('Hex key has an odd number of digits');
	const out = new Uint8Array(clean.length / 2);
	for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
	return out;
}

export type KeyEncoding = 'text' | 'hex';

export function parseKey(input: string, enc: KeyEncoding): Uint8Array {
	return enc === 'hex' ? hexToBytes(input) : new TextEncoder().encode(input);
}

// ---------------------------------------------------------------------------
// Comparing against an expected value

/**
 * Pulls the hash out of what people paste: a bare value, `sha256sum` output
 * ("<hash>  file.iso"), BSD style ("SHA256 (file.iso) = <hash>") or hex split by spaces or colons.
 */
export function normaliseExpected(input: string): string {
	const t = input.trim();
	if (!t) return '';
	const bsd = t.match(/=\s*([0-9a-z+/=]+)$/i);
	if (bsd && /\)\s*=/.test(t)) return bsd[1];
	const first = t.split(/\s+/)[0];
	if (/^[0-9a-f]{32,}$/i.test(first) && /\s/.test(t)) return first;
	return t.replace(/[\s:]/g, '');
}

/**
 * Names of the results that equal the expected value. Hex compares case-insensitively,
 * Base64 compares exactly (it is case-sensitive).
 */
export function matchExpected<K extends string>(
	expected: string,
	results: Partial<Record<K, Uint8Array>>
): K[] {
	const e = normaliseExpected(expected);
	if (!e) return [];
	const hits: K[] = [];
	for (const [name, bytes] of Object.entries(results) as [K, Uint8Array | undefined][]) {
		if (!bytes) continue;
		if (e.toLowerCase() === toHex(bytes) || e === toBase64(bytes)) hits.push(name);
	}
	return hits;
}

/** When nothing matches: which algorithms would produce a value of this length. */
export function lengthHint(expected: string): DigestAlgo[] {
	const e = normaliseExpected(expected);
	if (!/^[0-9a-f]+$/i.test(e)) return [];
	return digestAlgos.filter((a) => digestBytes[a] * 2 === e.length);
}

export function formatSize(n: number): string {
	if (n < 1024) return `${n} bytes`;
	const units = ['KiB', 'MiB', 'GiB', 'TiB'];
	let v = n;
	let i = -1;
	while (v >= 1024 && i < units.length - 1) {
		v /= 1024;
		i++;
	}
	return `${v.toFixed(v < 10 ? 2 : 1)} ${units[i]} (${n.toLocaleString('en-US')} bytes)`;
}
