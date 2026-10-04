// JWT / JWS compact serialisation (RFC 7519, RFC 7515), detection of JWE (RFC 7516),
// and optional signature verification with WebCrypto (algorithms from RFC 7518).

export type Json = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Base64url

const B64URL = /^[A-Za-z0-9_-]*$/;

export function b64urlToBytes(seg: string, what = 'Segment'): Uint8Array {
	const s = seg.replace(/=+$/, '');
	if (!B64URL.test(s)) {
		const bad = s.match(/[^A-Za-z0-9_-]/);
		throw new Error(`${what} is not base64url: invalid character "${bad?.[0]}"`);
	}
	if (s.length % 4 === 1) throw new Error(`${what} has an impossible base64url length`);
	const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
	const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

export function bytesToB64url(bytes: Uint8Array): string {
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Accepts standard or URL-safe Base64, with or without padding and line breaks. */
export function base64AnyToBytes(input: string): Uint8Array {
	const s = input.replace(/\s+/g, '').replace(/\+/g, '-').replace(/\//g, '_');
	return b64urlToBytes(s, 'Secret');
}

function decodeJsonSegment(seg: string, what: string): Json {
	const bytes = b64urlToBytes(seg, what);
	let text: string;
	try {
		text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch {
		throw new Error(`${what} is not valid UTF-8`);
	}
	let v: unknown;
	try {
		v = JSON.parse(text);
	} catch {
		throw new Error(`${what} is not valid JSON`);
	}
	if (!v || typeof v !== 'object' || Array.isArray(v))
		throw new Error(`${what} is not a JSON object`);
	return v as Json;
}

// ---------------------------------------------------------------------------
// Parsing

export interface Warning {
	level: 'danger' | 'info';
	text: string;
}

export interface DecodedJws {
	kind: 'jws';
	header: Json;
	/** Parsed payload when it is a JSON object, otherwise null and see payloadText. */
	payload: Json | null;
	payloadText: string;
	signature: Uint8Array;
	signatureB64: string;
	/** ASCII bytes of "header.payload", the input to the signature. */
	signingInput: Uint8Array;
	warnings: Warning[];
}

export interface DecodedJwe {
	kind: 'jwe';
	header: Json;
	warnings: Warning[];
}

export type Decoded = DecodedJws | DecodedJwe;

/** Strips whitespace and an "Authorization: Bearer" style prefix. */
export function cleanToken(input: string): string {
	return input
		.trim()
		.replace(/^(authorization:\s*)?bearer\s+/i, '')
		.replace(/\s+/g, '');
}

export function decodeToken(input: string): Decoded {
	const token = cleanToken(input);
	if (!token) throw new Error('Paste a token');
	const parts = token.split('.');
	if (parts.length === 5) {
		const header = decodeJsonSegment(parts[0], 'Header');
		const warnings: Warning[] = [];
		headerWarnings(header, warnings);
		return { kind: 'jwe', header, warnings };
	}
	if (parts.length !== 3) {
		throw new Error(
			`A JWS has 3 parts and a JWE has 5, separated by dots. This has ${parts.length}.`
		);
	}
	const [h, p, s] = parts;
	const header = decodeJsonSegment(h, 'Header');
	const payloadBytes = b64urlToBytes(p, 'Payload');
	const payloadText = new TextDecoder().decode(payloadBytes);
	let payload: Json | null = null;
	try {
		const v = JSON.parse(payloadText);
		if (v && typeof v === 'object' && !Array.isArray(v)) payload = v as Json;
	} catch {
		payload = null;
	}
	const signature = b64urlToBytes(s, 'Signature');
	const warnings: Warning[] = [];
	headerWarnings(header, warnings);
	const alg = typeof header.alg === 'string' ? header.alg : '';
	if (alg.toLowerCase() !== 'none' && signature.length === 0) {
		warnings.push({ level: 'danger', text: `Header says ${alg} but the signature is empty.` });
	}
	if (alg.toLowerCase() === 'none' && signature.length > 0) {
		warnings.push({ level: 'info', text: 'alg is none but a signature is present.' });
	}
	if (header.b64 === false) {
		warnings.push({
			level: 'info',
			text: 'b64 is false (RFC 7797): the payload is not encoded and verification here will not apply.'
		});
	}
	if (payload === null) {
		warnings.push({
			level: 'info',
			text: 'The payload is not a JSON object, so it has no claims.'
		});
	}
	return {
		kind: 'jws',
		header,
		payload,
		payloadText,
		signature,
		signatureB64: s,
		signingInput: new TextEncoder().encode(`${h}.${p}`),
		warnings
	};
}

function headerWarnings(header: Json, out: Warning[]): void {
	const alg = header.alg;
	if (alg === undefined) out.push({ level: 'danger', text: 'Header has no alg.' });
	else if (typeof alg === 'string' && alg.toLowerCase() === 'none') {
		out.push({
			level: 'danger',
			text: 'alg is "none": the token is unsigned. Anyone can forge it. A verifier must reject it.'
		});
	}
	for (const [k, what] of [
		['jku', 'a URL to fetch keys from'],
		['x5u', 'a URL to fetch a certificate from'],
		['jwk', 'an embedded public key'],
		['x5c', 'an embedded certificate chain']
	] as const) {
		if (k in header) {
			out.push({
				level: 'danger',
				text: `Header has ${k}, ${what}. If a verifier trusts it, an attacker can sign with their own key. Only use keys from a pinned, trusted source.`
			});
		}
	}
	if ('crit' in header) {
		out.push({
			level: 'info',
			text: `Header has crit: ${JSON.stringify(header.crit)}. A verifier must understand these extensions or reject the token.`
		});
	}
}

// ---------------------------------------------------------------------------
// Claims

export interface TimeClaim {
	name: 'exp' | 'nbf' | 'iat';
	value: unknown;
	/** Milliseconds since epoch, or null when the value is not a NumericDate. */
	ms: number | null;
	iso: string;
	relative: string;
	status: 'ok' | 'expired' | 'not-yet-valid' | 'future-iat' | 'invalid';
}

export function relativeTime(ms: number, now: number): string {
	const diff = ms - now;
	const abs = Math.abs(diff) / 1000;
	const units: [number, string][] = [
		[365.25 * 86400, 'year'],
		[30.44 * 86400, 'month'],
		[86400, 'day'],
		[3600, 'hour'],
		[60, 'minute'],
		[1, 'second']
	];
	if (abs < 1) return 'now';
	for (const [size, name] of units) {
		if (abs >= size) {
			const n = Math.floor(abs / size);
			const s = `${n} ${name}${n === 1 ? '' : 's'}`;
			return diff < 0 ? `${s} ago` : `in ${s}`;
		}
	}
	return 'now';
}

export function timeClaims(payload: Json, now: number): TimeClaim[] {
	const out: TimeClaim[] = [];
	for (const name of ['iat', 'nbf', 'exp'] as const) {
		if (!(name in payload)) continue;
		const value = payload[name];
		if (typeof value !== 'number' || !Number.isFinite(value)) {
			out.push({ name, value, ms: null, iso: '', relative: '', status: 'invalid' });
			continue;
		}
		const ms = value * 1000;
		const d = new Date(ms);
		if (Number.isNaN(d.getTime())) {
			out.push({ name, value, ms: null, iso: '', relative: '', status: 'invalid' });
			continue;
		}
		let status: TimeClaim['status'] = 'ok';
		// RFC 7519: exp means the token must not be accepted on or after that time,
		// nbf means not before. No clock skew leeway is applied here.
		if (name === 'exp' && now >= ms) status = 'expired';
		if (name === 'nbf' && now < ms) status = 'not-yet-valid';
		if (name === 'iat' && ms > now) status = 'future-iat';
		out.push({ name, value, ms, iso: d.toISOString(), relative: relativeTime(ms, now), status });
	}
	return out;
}

export const claimNames: Record<string, string> = {
	iss: 'Issuer',
	sub: 'Subject',
	aud: 'Audience',
	jti: 'JWT ID',
	exp: 'Expires',
	nbf: 'Not before',
	iat: 'Issued at'
};

/** Registered string claims, formatted for display. */
export function identityClaims(payload: Json): { name: string; value: string }[] {
	const out: { name: string; value: string }[] = [];
	for (const name of ['iss', 'sub', 'aud', 'jti']) {
		if (!(name in payload)) continue;
		const v = payload[name];
		out.push({
			name,
			value: Array.isArray(v)
				? v.map(String).join(', ')
				: typeof v === 'string'
					? v
					: JSON.stringify(v)
		});
	}
	return out;
}

// ---------------------------------------------------------------------------
// Verification

type Family = 'HS' | 'RS' | 'PS' | 'ES';

export interface AlgInfo {
	family: Family;
	hash: 'SHA-256' | 'SHA-384' | 'SHA-512';
	bits: 256 | 384 | 512;
	curve?: 'P-256' | 'P-384' | 'P-521';
	/** ES signature length in bytes (r || s). */
	sigLen?: number;
}

export function algInfo(alg: unknown): AlgInfo | null {
	if (typeof alg !== 'string') return null;
	const m = alg.match(/^(HS|RS|PS|ES)(256|384|512)$/);
	if (!m) return null;
	const family = m[1] as Family;
	const bits = Number(m[2]) as 256 | 384 | 512;
	const info: AlgInfo = { family, bits, hash: `SHA-${bits}` };
	if (family === 'ES') {
		info.curve = bits === 256 ? 'P-256' : bits === 384 ? 'P-384' : 'P-521';
		info.sigLen = bits === 256 ? 64 : bits === 384 ? 96 : 132;
	}
	return info;
}

export type SecretEncoding = 'text' | 'base64';

export function secretBytes(secret: string, enc: SecretEncoding): Uint8Array {
	return enc === 'base64' ? base64AnyToBytes(secret) : new TextEncoder().encode(secret);
}

function buf(b: Uint8Array): Uint8Array<ArrayBuffer> {
	return new Uint8Array(b);
}

// --- PEM and a minimal DER reader, enough to pull the SPKI out of a certificate

interface Tlv {
	tag: number;
	start: number;
	len: number;
	end: number;
	/** Offset of the first byte of the whole element (tag). */
	head: number;
}

function readTlv(der: Uint8Array, pos: number): Tlv {
	const head = pos;
	if (pos + 2 > der.length) throw new Error('DER data ends early');
	const tag = der[pos++];
	let len = der[pos++];
	if (len & 0x80) {
		const n = len & 0x7f;
		if (n === 0 || n > 4 || pos + n > der.length) throw new Error('Unsupported DER length');
		len = 0;
		for (let i = 0; i < n; i++) len = len * 256 + der[pos++];
	}
	if (pos + len > der.length) throw new Error('DER element runs past the end');
	return { tag, start: pos, len, end: pos + len, head };
}

/** Extracts subjectPublicKeyInfo from an X.509 certificate (RFC 5280 section 4.1). */
export function spkiFromCertificate(der: Uint8Array): Uint8Array {
	const cert = readTlv(der, 0);
	if (cert.tag !== 0x30) throw new Error('Certificate is not a DER SEQUENCE');
	const tbs = readTlv(der, cert.start);
	if (tbs.tag !== 0x30) throw new Error('tbsCertificate is not a SEQUENCE');
	let pos = tbs.start;
	let el = readTlv(der, pos);
	if (el.tag === 0xa0) {
		pos = el.end;
		el = readTlv(der, pos);
	}
	// serialNumber, signature, issuer, validity, subject, then subjectPublicKeyInfo
	for (let i = 0; i < 5; i++) {
		pos = el.end;
		el = readTlv(der, pos);
	}
	if (el.tag !== 0x30) throw new Error('Could not find the public key in the certificate');
	return der.slice(el.head, el.end);
}

export interface PemBlock {
	label: string;
	der: Uint8Array;
}

export function parsePem(pem: string): PemBlock {
	const m = pem.match(/-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/);
	if (!m) throw new Error('No complete PEM block found');
	return { label: m[1], der: base64AnyToBytes(m[2]) };
}

/** Returns SPKI DER bytes, or throws with a reason for the PEM types that do not work. */
export function spkiFromPem(pem: string): Uint8Array {
	const { label, der } = parsePem(pem);
	if (label === 'PUBLIC KEY') return der;
	if (label === 'CERTIFICATE') return spkiFromCertificate(der);
	if (label === 'RSA PUBLIC KEY') {
		throw new Error(
			'This is a PKCS#1 RSA key (BEGIN RSA PUBLIC KEY). Convert it to SPKI: openssl rsa -RSAPublicKey_in -pubout'
		);
	}
	if (/PRIVATE KEY/.test(label)) {
		throw new Error(
			'This is a private key. Verification needs only the public key, and private keys should not be pasted into web pages.'
		);
	}
	throw new Error(`Unsupported PEM type "${label}". Use BEGIN PUBLIC KEY or BEGIN CERTIFICATE.`);
}

const PRIVATE_JWK_MEMBERS = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k'];

export interface ParsedJwk {
	jwk: JsonWebKey;
	/** Set when private members were dropped. */
	hadPrivate: boolean;
}

/** Parses a JWK or a JWK Set. From a set, picks the key matching kid, or the only key. */
export function parsePublicJwk(text: string, kid?: unknown): ParsedJwk {
	let v: unknown;
	try {
		v = JSON.parse(text);
	} catch {
		throw new Error('Key is neither PEM nor valid JSON');
	}
	if (!v || typeof v !== 'object') throw new Error('JWK must be a JSON object');
	let jwk = v as Record<string, unknown>;
	if (Array.isArray(jwk.keys)) {
		const keys = jwk.keys as Record<string, unknown>[];
		const found =
			kid !== undefined ? keys.find((k) => k.kid === kid) : keys.length === 1 ? keys[0] : undefined;
		if (!found) {
			throw new Error(
				kid !== undefined
					? `No key with kid "${String(kid)}" in the JWK Set`
					: 'The JWK Set has several keys and the token has no kid'
			);
		}
		jwk = found;
	}
	if (jwk.kty === 'oct')
		throw new Error('This is a symmetric (oct) key. Use it as the HMAC secret.');
	const hadPrivate = PRIVATE_JWK_MEMBERS.some((m) => m in jwk);
	const pub: Record<string, unknown> = {};
	for (const [k, val] of Object.entries(jwk)) {
		if (!PRIVATE_JWK_MEMBERS.includes(k) && k !== 'key_ops' && k !== 'use') pub[k] = val;
	}
	return { jwk: pub as JsonWebKey, hadPrivate };
}

export interface VerifyResult {
	valid: boolean;
	notes: string[];
}

/**
 * Verifies the signature of a decoded JWS with the algorithm named in its header.
 * `key` is the HMAC secret bytes for HS*, or a PEM / JWK string for RS*, PS* and ES*.
 * Throws when the key or algorithm cannot be used, returns valid=false when the signature is wrong.
 */
export async function verifyJws(jws: DecodedJws, key: Uint8Array | string): Promise<VerifyResult> {
	const alg = jws.header.alg;
	const info = algInfo(alg);
	if (!info) {
		if (typeof alg === 'string' && alg.toLowerCase() === 'none') {
			throw new Error(
				'alg is none: there is no signature to verify. Treat the token as untrusted.'
			);
		}
		throw new Error(`Verification of alg ${JSON.stringify(alg)} is not supported here`);
	}
	const notes: string[] = [];
	const data = buf(jws.signingInput);
	const sig = buf(jws.signature);

	if (info.family === 'HS') {
		if (typeof key === 'string') throw new Error('HS algorithms need a shared secret');
		if (key.length === 0) throw new Error('Secret is empty');
		if (key.length * 8 < info.bits) {
			notes.push(
				`The secret is ${key.length * 8} bits. RFC 7518 requires at least ${info.bits} bits for ${String(alg)}. Short secrets can be brute forced offline from any token.`
			);
		}
		const k = await crypto.subtle.importKey(
			'raw',
			buf(key),
			{ name: 'HMAC', hash: info.hash },
			false,
			['verify']
		);
		return { valid: await crypto.subtle.verify('HMAC', k, sig, data), notes };
	}

	if (typeof key !== 'string' || !key.trim()) throw new Error('Paste a public key (PEM or JWK)');

	let importAlg: RsaHashedImportParams | EcKeyImportParams;
	let verifyAlg: AlgorithmIdentifier | RsaPssParams | EcdsaParams;
	if (info.family === 'RS') {
		importAlg = { name: 'RSASSA-PKCS1-v1_5', hash: info.hash };
		verifyAlg = { name: 'RSASSA-PKCS1-v1_5' };
	} else if (info.family === 'PS') {
		importAlg = { name: 'RSA-PSS', hash: info.hash };
		// RFC 7518 section 3.5: salt length equals the hash output size.
		verifyAlg = { name: 'RSA-PSS', saltLength: info.bits / 8 };
	} else {
		importAlg = { name: 'ECDSA', namedCurve: info.curve! };
		verifyAlg = { name: 'ECDSA', hash: info.hash };
		if (sig.length !== info.sigLen) {
			notes.push(
				`${String(alg)} signatures are ${info.sigLen} bytes (r || s), this one is ${sig.length}.${sig[0] === 0x30 ? ' It looks DER encoded, which JWS does not allow.' : ''}`
			);
			return { valid: false, notes };
		}
	}

	// Parse first so our own messages pass through, then let WebCrypto judge the key itself.
	const trimmed = key.trim();
	let spki: Uint8Array | null = null;
	let jwk: JsonWebKey | null = null;
	if (trimmed.startsWith('-----')) {
		spki = spkiFromPem(trimmed);
	} else {
		const parsed = parsePublicJwk(trimmed, jws.header.kid);
		jwk = parsed.jwk;
		if (parsed.hadPrivate) {
			notes.push(
				'The JWK contained private key material. Only the public part was used. Do not paste private keys into web pages.'
			);
		}
		const expectKty = info.family === 'ES' ? 'EC' : 'RSA';
		if (jwk.kty !== expectKty) {
			throw new Error(
				`${String(alg)} needs a ${expectKty} key, this JWK is kty ${String(jwk.kty)}`
			);
		}
		if (jwk.alg && jwk.alg !== alg) {
			throw new Error(`The JWK is for ${jwk.alg}, the token says ${String(alg)}`);
		}
		delete jwk.alg;
	}

	let cryptoKey: CryptoKey;
	try {
		cryptoKey = spki
			? await crypto.subtle.importKey('spki', buf(spki), importAlg, false, ['verify'])
			: await crypto.subtle.importKey('jwk', jwk!, importAlg, false, ['verify']);
	} catch (e) {
		throw new Error(
			`The key does not fit ${String(alg)}: ${(e as Error).message || (e as Error).name}. Check the key type and curve.`
		);
	}
	return { valid: await crypto.subtle.verify(verifyAlg, cryptoKey, sig, data), notes };
}

// ---------------------------------------------------------------------------
// Detection

/** JWS compact: three base64url parts, header starting with eyJ ({"). JWE: five parts. */
export function looksLikeJwt(input: string): number {
	const t = input.trim();
	if (/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(t)) return 0.95;
	if (/^eyJ[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]*){4}$/.test(t)) return 0.9;
	return 0;
}
