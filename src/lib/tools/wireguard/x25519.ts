/**
 * X25519 per RFC 7748 section 5, in BigInt. Used where WebCrypto has no X25519, and always to
 * derive a public key from a private key (WebCrypto cannot import a bare private scalar).
 * BigInt arithmetic is not constant time; that matters for a long-running server under
 * remote timing attack, not for a key generated once in a browser tab.
 */

const P = 2n ** 255n - 19n;
const A24 = 121665n;

const mod = (a: bigint) => {
	const r = a % P;
	return r < 0n ? r + P : r;
};

function pow(b: bigint, e: bigint): bigint {
	let r = 1n;
	b = mod(b);
	while (e > 0n) {
		if (e & 1n) r = (r * b) % P;
		b = (b * b) % P;
		e >>= 1n;
	}
	return r;
}

function toLittle(bytes: Uint8Array): bigint {
	let n = 0n;
	for (let i = bytes.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(bytes[i]);
	return n;
}

function fromLittle(n: bigint): Uint8Array {
	const out = new Uint8Array(32);
	for (let i = 0; i < 32; i++) {
		out[i] = Number(n & 0xffn);
		n >>= 8n;
	}
	return out;
}

/** decodeScalar25519: clear the low three bits, clear bit 255, set bit 254. */
export function clamp(k: Uint8Array): Uint8Array {
	if (k.length !== 32) throw new Error('An X25519 scalar is 32 bytes');
	const c = Uint8Array.from(k);
	c[0] &= 248;
	c[31] &= 127;
	c[31] |= 64;
	return c;
}

/** RFC 7748 X25519(k, u): the Montgomery ladder of section 5. */
export function x25519(k: Uint8Array, u: Uint8Array): Uint8Array {
	if (u.length !== 32) throw new Error('An X25519 u-coordinate is 32 bytes');
	const scalar = toLittle(clamp(k));
	// decodeUCoordinate: mask the most significant bit, then reduce.
	const um = Uint8Array.from(u);
	um[31] &= 127;
	const x1 = mod(toLittle(um));
	let x2 = 1n;
	let z2 = 0n;
	let x3 = x1;
	let z3 = 1n;
	let swap = 0n;
	for (let t = 254; t >= 0; t--) {
		const kt = (scalar >> BigInt(t)) & 1n;
		swap ^= kt;
		if (swap) {
			[x2, x3] = [x3, x2];
			[z2, z3] = [z3, z2];
		}
		swap = kt;
		const a = mod(x2 + z2);
		const aa = (a * a) % P;
		const b = mod(x2 - z2);
		const bb = (b * b) % P;
		const e = mod(aa - bb);
		const c = mod(x3 + z3);
		const d = mod(x3 - z3);
		const da = (d * a) % P;
		const cb = (c * b) % P;
		const s = mod(da + cb);
		x3 = (s * s) % P;
		const df = mod(da - cb);
		z3 = (x1 * ((df * df) % P)) % P;
		x2 = (aa * bb) % P;
		z2 = (e * mod(aa + A24 * e)) % P;
	}
	if (swap) {
		[x2, x3] = [x3, x2];
		[z2, z3] = [z3, z2];
	}
	return fromLittle((x2 * pow(z2, P - 2n)) % P);
}

/** The base point u = 9. */
export const BASE = fromLittle(9n);

export const publicFromPrivate = (priv: Uint8Array): Uint8Array => x25519(priv, BASE);
