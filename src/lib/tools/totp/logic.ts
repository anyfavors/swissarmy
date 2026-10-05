/**
 * HOTP (RFC 4226) and TOTP (RFC 6238) with WebCrypto HMAC, plus the otpauth:// key URI format
 * (Google Authenticator "Key Uri Format", the de facto standard; there is no RFC for it).
 */

export type OtpAlgorithm = 'SHA1' | 'SHA256' | 'SHA512';
export const otpAlgorithms: OtpAlgorithm[] = ['SHA1', 'SHA256', 'SHA512'];
const webHash: Record<OtpAlgorithm, string> = {
	SHA1: 'SHA-1',
	SHA256: 'SHA-256',
	SHA512: 'SHA-512'
};

// ---------------------------------------------------------------- base32 (RFC 4648 6)

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Decodes base32. Spaces, hyphens, lowercase and missing padding are tolerated. */
export function base32Decode(input: string): Uint8Array {
	const s = input.replace(/[\s-]/g, '').toUpperCase().replace(/=+$/, '');
	if (!s) throw new Error('The secret is empty');
	const out: number[] = [];
	let bits = 0;
	let value = 0;
	for (let i = 0; i < s.length; i++) {
		const v = B32.indexOf(s[i]);
		if (v < 0) {
			const hint = /[0189]/.test(s[i]) ? ' (base32 has no 0, 1, 8 or 9)' : '';
			throw new Error(`"${s[i]}" at position ${i + 1} is not a base32 character${hint}`);
		}
		value = (value << 5) | v;
		bits += 5;
		if (bits >= 8) {
			out.push((value >>> (bits - 8)) & 0xff);
			bits -= 8;
		}
		value &= (1 << bits) - 1;
	}
	// RFC 4648 lengths: 8n + {0, 2, 4, 5, 7} characters. Others cannot come from an encoder.
	if ([1, 3, 6].includes(s.length % 8))
		throw new Error(`A base32 string cannot have ${s.length} characters (truncated?)`);
	return Uint8Array.from(out);
}

export function base32Encode(bytes: Uint8Array, pad = false): string {
	let out = '';
	let bits = 0;
	let value = 0;
	for (const b of bytes) {
		value = (value << 8) | b;
		bits += 8;
		while (bits >= 5) {
			out += B32[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
		value &= (1 << bits) - 1;
	}
	if (bits > 0) out += B32[(value << (5 - bits)) & 31];
	if (pad) while (out.length % 8) out += '=';
	return out;
}

/** Canonical form: uppercase, no spaces, no padding (what authenticator apps expect in URIs). */
export function normaliseSecret(s: string): string {
	return base32Encode(base32Decode(s));
}

// ---------------------------------------------------------------- HOTP / TOTP

/** 8-byte big-endian counter. Safe for counters up to 2^53. */
export function counterBytes(counter: number): Uint8Array {
	if (!Number.isSafeInteger(counter) || counter < 0)
		throw new Error('Counter must be a whole number from 0');
	const b = new Uint8Array(8);
	const v = new DataView(b.buffer);
	v.setUint32(0, Math.floor(counter / 2 ** 32));
	v.setUint32(4, counter >>> 0);
	return b;
}

/** RFC 4226 5.3: dynamic truncation of the HMAC to a 31-bit number. */
export function truncate(mac: Uint8Array): number {
	const off = mac[mac.length - 1] & 0x0f;
	return (
		(((mac[off] & 0x7f) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3]) >>> 0
	);
}

export async function hmac(
	alg: OtpAlgorithm,
	key: Uint8Array,
	msg: Uint8Array
): Promise<Uint8Array> {
	const k = await crypto.subtle.importKey(
		'raw',
		key as BufferSource,
		{ name: 'HMAC', hash: webHash[alg] },
		false,
		['sign']
	);
	return new Uint8Array(await crypto.subtle.sign('HMAC', k, msg as BufferSource));
}

export async function hotp(
	key: Uint8Array,
	counter: number,
	digits = 6,
	alg: OtpAlgorithm = 'SHA1'
): Promise<string> {
	if (!key.length) throw new Error('The secret is empty');
	const code = truncate(await hmac(alg, key, counterBytes(counter))) % 10 ** digits;
	return String(code).padStart(digits, '0');
}

/** RFC 6238 4.2: T = floor((now - T0) / X), T0 = 0. */
export function timeStep(unixSeconds: number, period = 30): number {
	return Math.floor(unixSeconds / period);
}

export async function totp(
	key: Uint8Array,
	unixSeconds: number,
	digits = 6,
	alg: OtpAlgorithm = 'SHA1',
	period = 30
): Promise<string> {
	return hotp(key, timeStep(unixSeconds, period), digits, alg);
}

export function secondsRemaining(unixSeconds: number, period = 30): number {
	return period - (Math.floor(unixSeconds) % period);
}

// ---------------------------------------------------------------- otpauth URI

export interface OtpConfig {
	type: 'totp' | 'hotp';
	secret: string;
	issuer: string;
	account: string;
	algorithm: OtpAlgorithm;
	digits: number;
	period: number;
	counter: number;
}

export const defaultConfig = (): OtpConfig => ({
	type: 'totp',
	secret: '',
	issuer: '',
	account: '',
	algorithm: 'SHA1',
	digits: 6,
	period: 30,
	counter: 0
});

export interface ParsedUri {
	config: OtpConfig;
	warnings: string[];
}

export function parseOtpauth(uri: string): ParsedUri {
	const m = uri.trim().match(/^otpauth:\/\/([A-Za-z]+)\/([^?#]*)(?:\?([^#]*))?(?:#.*)?$/i);
	if (!m) throw new Error('Not an otpauth:// URI (expected otpauth://totp/Label?secret=...)');
	const type = m[1].toLowerCase();
	if (type !== 'totp' && type !== 'hotp') throw new Error(`Unknown OTP type "${m[1]}"`);
	const warnings: string[] = [];
	let label: string;
	try {
		label = decodeURIComponent(m[2]);
	} catch {
		throw new Error('The label has broken percent-encoding');
	}
	const params = new URLSearchParams(m[3] ?? '');
	const c = defaultConfig();
	c.type = type;
	const colon = label.indexOf(':');
	const labelIssuer = colon >= 0 ? label.slice(0, colon).trim() : '';
	c.account = (colon >= 0 ? label.slice(colon + 1) : label).trim();
	const issuer = params.get('issuer');
	c.issuer = issuer ?? labelIssuer;
	if (issuer !== null && labelIssuer && issuer !== labelIssuer)
		warnings.push(`The label prefix "${labelIssuer}" and the issuer parameter "${issuer}" differ`);

	const secret = params.get('secret');
	if (!secret) throw new Error('The URI has no secret parameter');
	c.secret = normaliseSecret(secret);

	const alg = params.get('algorithm');
	if (alg !== null) {
		const a = alg.toUpperCase().replace('-', '') as OtpAlgorithm;
		if (!otpAlgorithms.includes(a))
			throw new Error(`Unsupported algorithm "${alg}" (SHA1, SHA256 or SHA512)`);
		c.algorithm = a;
		if (a !== 'SHA1')
			warnings.push(
				`${a}: many authenticator apps (Google Authenticator among them) ignore this and use SHA1`
			);
	}
	const digits = params.get('digits');
	if (digits !== null) {
		if (digits !== '6' && digits !== '8') throw new Error(`digits must be 6 or 8, not "${digits}"`);
		c.digits = Number(digits);
	}
	const period = params.get('period');
	if (period !== null) {
		if (!/^\d+$/.test(period) || Number(period) < 1 || Number(period) > 3600)
			throw new Error(`period must be a whole number of seconds (1 to 3600), not "${period}"`);
		c.period = Number(period);
		if (c.period !== 30)
			warnings.push('Some authenticator apps ignore period and always use 30 seconds');
	}
	const counter = params.get('counter');
	if (type === 'hotp') {
		if (counter === null) throw new Error('An hotp URI needs a counter parameter');
		if (!/^\d+$/.test(counter) || !Number.isSafeInteger(Number(counter)))
			throw new Error(`counter must be a whole number, not "${counter}"`);
		c.counter = Number(counter);
	}
	return { config: c, warnings };
}

/** Percent-encodes per RFC 3986, keeping only unreserved characters. */
const pct = (s: string) =>
	encodeURIComponent(s).replace(
		/[!'()*]/g,
		(ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`
	);

export function buildOtpauth(c: OtpConfig): string {
	const secret = normaliseSecret(c.secret);
	if (c.issuer.includes(':') || c.account.includes(':'))
		throw new Error('Issuer and account cannot contain a colon (it separates them in the label)');
	if (!c.account.trim()) throw new Error("Give an account name (for example the user's email)");
	const label = c.issuer ? `${pct(c.issuer)}:${pct(c.account)}` : pct(c.account);
	const q = [`secret=${secret}`];
	if (c.issuer) q.push(`issuer=${pct(c.issuer)}`);
	q.push(`algorithm=${c.algorithm}`, `digits=${c.digits}`);
	if (c.type === 'totp') q.push(`period=${c.period}`);
	else q.push(`counter=${c.counter}`);
	return `otpauth://${c.type}/${label}?${q.join('&')}`;
}

/** RFC 4226 4 R6: the shared secret must be at least 128 bits, 160 recommended. */
export function secretWarnings(key: Uint8Array): string[] {
	const bits = key.length * 8;
	if (bits < 128)
		return [`The secret is ${bits} bits. RFC 4226 requires at least 128 (160 recommended).`];
	if (bits < 160) return [`The secret is ${bits} bits. RFC 4226 recommends 160.`];
	return [];
}

export function randomSecret(bytes = 20): string {
	return base32Encode(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function looksLikeOtpauth(s: string): number {
	return /^\s*otpauth:\/\/(totp|hotp)\//i.test(s) ? 0.95 : 0;
}
