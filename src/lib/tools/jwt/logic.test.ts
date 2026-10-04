import { describe, expect, it } from 'vitest';
import {
	b64urlToBytes,
	bytesToB64url,
	cleanToken,
	decodeToken,
	identityClaims,
	looksLikeJwt,
	parsePublicJwk,
	relativeTime,
	secretBytes,
	spkiFromPem,
	timeClaims,
	verifyJws,
	type DecodedJws
} from './logic';

// RFC 7515 appendix A.1: HS256 example
const a1Token =
	'eyJ0eXAiOiJKV1QiLA0KICJhbGciOiJIUzI1NiJ9' +
	'.eyJpc3MiOiJqb2UiLA0KICJleHAiOjEzMDA4MTkzODAsDQogImh0dHA6Ly9leGFtcGxlLmNvbS9pc19yb290Ijp0cnVlfQ' +
	'.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const a1Key =
	'AyM1SysPpbyDfgZld3umj1qzKObwVMkoqQ-EstJQLr_T-1qS0gZH75aKtMN3Yj0iPS4hcgUuTwjAzZr1Z9CAow';

const enc = (o: unknown) => bytesToB64url(new TextEncoder().encode(JSON.stringify(o)));

function jws(input: string): DecodedJws {
	const d = decodeToken(input);
	if (d.kind !== 'jws') throw new Error('expected JWS');
	return d;
}

function pem(label: string, der: ArrayBuffer): string {
	const b64 = btoa(String.fromCharCode(...new Uint8Array(der)));
	return `-----BEGIN ${label}-----\n${b64.match(/.{1,64}/g)!.join('\n')}\n-----END ${label}-----\n`;
}

async function signToken(
	header: Record<string, unknown>,
	payload: Record<string, unknown>,
	key: CryptoKey,
	params: AlgorithmIdentifier | EcdsaParams | RsaPssParams
): Promise<string> {
	const input = `${enc(header)}.${enc(payload)}`;
	const sig = await crypto.subtle.sign(params, key, new TextEncoder().encode(input));
	return `${input}.${bytesToB64url(new Uint8Array(sig))}`;
}

function tamper(token: string): string {
	const [h, , s] = token.split('.');
	return `${h}.${enc({ sub: 'admin' })}.${s}`;
}

describe('decode', () => {
	it('decodes the RFC 7515 A.1 example', () => {
		const d = jws(a1Token);
		expect(d.header).toEqual({ typ: 'JWT', alg: 'HS256' });
		expect(d.payload).toEqual({ iss: 'joe', exp: 1300819380, 'http://example.com/is_root': true });
		expect(d.signature).toHaveLength(32);
		expect(d.warnings).toEqual([]);
	});

	it('strips Bearer prefix and whitespace', () => {
		expect(cleanToken(`Authorization: Bearer ${a1Token}\n`)).toBe(a1Token);
		expect(cleanToken(' bearer  abc.def.ghi ')).toBe('abc.def.ghi');
	});

	it('warns on alg none', () => {
		const d = jws(`${enc({ alg: 'none' })}.${enc({ sub: 'x' })}.`);
		expect(d.warnings.some((w) => w.level === 'danger' && /unsigned/.test(w.text))).toBe(true);
		const d2 = jws(`${enc({ alg: 'NoNe' })}.${enc({})}.`);
		expect(d2.warnings[0].text).toMatch(/none/);
	});

	it('warns on key injection headers', () => {
		const d = jws(
			`${enc({ alg: 'RS256', jku: 'https://evil.example/jwks', jwk: {}, x5u: 'u', kid: 'k1' })}.${enc({})}.AAAA`
		);
		const texts = d.warnings.map((w) => w.text).join('\n');
		expect(texts).toMatch(/has jku/);
		expect(texts).toMatch(/has x5u/);
		expect(texts).toMatch(/has jwk/);
		expect(d.header.kid).toBe('k1');
	});

	it('warns on an empty signature for a signing alg', () => {
		const d = jws(`${enc({ alg: 'HS256' })}.${enc({})}.`);
		expect(d.warnings[0].text).toMatch(/signature is empty/);
	});

	it('handles a non-JSON payload', () => {
		const d = jws(
			`${enc({ alg: 'HS256' })}.${bytesToB64url(new TextEncoder().encode('hello'))}.AA`
		);
		expect(d.payload).toBeNull();
		expect(d.payloadText).toBe('hello');
	});

	it('detects JWE and reads only the header', () => {
		const d = decodeToken(`${enc({ alg: 'RSA-OAEP', enc: 'A256GCM' })}.aaaa.bbbb.cccc.dddd`);
		expect(d.kind).toBe('jwe');
		expect(d.header.enc).toBe('A256GCM');
	});

	it('rejects malformed tokens with a reason', () => {
		expect(() => decodeToken('')).toThrow(/Paste/);
		expect(() => decodeToken('a.b')).toThrow(/This has 2/);
		expect(() => decodeToken('e$J.a.b')).toThrow(/Header is not base64url: invalid character "\$"/);
		expect(() => decodeToken(`${bytesToB64url(new TextEncoder().encode('[1]'))}.e30.`)).toThrow(
			/Header is not a JSON object/
		);
		expect(() => decodeToken('YWJj.e30.')).toThrow(/Header is not valid JSON/);
		expect(() => b64urlToBytes('abcde')).toThrow(/impossible/);
	});
});

describe('claims', () => {
	const now = Date.UTC(2026, 0, 1);
	const s = now / 1000;

	it('flags expired, not yet valid and future iat', () => {
		const c = timeClaims({ exp: s - 60, nbf: s + 3600, iat: s + 10 }, now);
		const by = Object.fromEntries(c.map((x) => [x.name, x]));
		expect(by.exp.status).toBe('expired');
		expect(by.exp.relative).toBe('1 minute ago');
		expect(by.nbf.status).toBe('not-yet-valid');
		expect(by.nbf.relative).toBe('in 1 hour');
		expect(by.iat.status).toBe('future-iat');
		expect(by.exp.iso).toBe('2025-12-31T23:59:00.000Z');
	});

	it('treats exp equal to now as expired (RFC 7519 on or after)', () => {
		expect(timeClaims({ exp: s }, now)[0].status).toBe('expired');
		expect(timeClaims({ exp: s + 1 }, now)[0].status).toBe('ok');
	});

	it('marks non-numeric dates invalid', () => {
		expect(timeClaims({ exp: '1700000000' }, now)[0].status).toBe('invalid');
	});

	it('lists identity claims, joining audience arrays', () => {
		expect(identityClaims({ iss: 'joe', aud: ['a', 'b'], sub: 's', jti: 'j', x: 1 })).toEqual([
			{ name: 'iss', value: 'joe' },
			{ name: 'sub', value: 's' },
			{ name: 'aud', value: 'a, b' },
			{ name: 'jti', value: 'j' }
		]);
	});

	it('formats relative time', () => {
		expect(relativeTime(now, now)).toBe('now');
		expect(relativeTime(now + 2 * 86400000, now)).toBe('in 2 days');
	});
});

describe('verify HS', () => {
	it('verifies RFC 7515 A.1 with its base64url key', async () => {
		const r = await verifyJws(jws(a1Token), secretBytes(a1Key, 'base64'));
		expect(r.valid).toBe(true);
		expect(r.notes).toEqual([]);
	});

	it('fails with the wrong secret or a tampered payload', async () => {
		expect((await verifyJws(jws(a1Token), secretBytes('secret', 'text'))).valid).toBe(false);
		expect((await verifyJws(jws(tamper(a1Token)), secretBytes(a1Key, 'base64'))).valid).toBe(false);
	});

	it('warns about short secrets', async () => {
		const r = await verifyJws(jws(a1Token), secretBytes('secret', 'text'));
		expect(r.notes[0]).toMatch(/48 bits.*at least 256/);
	});

	it('refuses alg none and public keys for HS', async () => {
		await expect(
			verifyJws(jws(`${enc({ alg: 'none' })}.${enc({})}.`), new Uint8Array(1))
		).rejects.toThrow(/no signature/);
		await expect(verifyJws(jws(a1Token), '-----BEGIN PUBLIC KEY-----')).rejects.toThrow(
			/shared secret/
		);
		await expect(verifyJws(jws(`${enc({ alg: 'EdDSA' })}.${enc({})}.AA`), 'x')).rejects.toThrow(
			/not supported/
		);
	});
});

describe('verify with generated key pairs', () => {
	it('ES256: PEM and JWK, tamper fails', async () => {
		const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
			'sign',
			'verify'
		]);
		const token = await signToken({ alg: 'ES256' }, { sub: 'alice' }, kp.privateKey, {
			name: 'ECDSA',
			hash: 'SHA-256'
		});
		const spki = pem('PUBLIC KEY', await crypto.subtle.exportKey('spki', kp.publicKey));
		const jwk = JSON.stringify(await crypto.subtle.exportKey('jwk', kp.publicKey));
		expect(jws(token).signature).toHaveLength(64);
		expect((await verifyJws(jws(token), spki)).valid).toBe(true);
		expect((await verifyJws(jws(token), jwk)).valid).toBe(true);
		expect((await verifyJws(jws(tamper(token)), spki)).valid).toBe(false);
	});

	it('ES256: wrong signature length is reported', async () => {
		const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
			'sign',
			'verify'
		]);
		const spki = pem('PUBLIC KEY', await crypto.subtle.exportKey('spki', kp.publicKey));
		const r = await verifyJws(jws(`${enc({ alg: 'ES256' })}.${enc({})}.MEUCIQ`), spki);
		expect(r.valid).toBe(false);
		expect(r.notes[0]).toMatch(/64 bytes.*DER/);
	});

	it('RS256 and PS256 with one RSA key, private JWK members are dropped', async () => {
		const kp = await crypto.subtle.generateKey(
			{
				name: 'RSASSA-PKCS1-v1_5',
				modulusLength: 2048,
				publicExponent: new Uint8Array([1, 0, 1]),
				hash: 'SHA-256'
			},
			true,
			['sign', 'verify']
		);
		const token = await signToken({ alg: 'RS256', kid: 'k2' }, { sub: 'bob' }, kp.privateKey, {
			name: 'RSASSA-PKCS1-v1_5'
		});
		const spki = pem('PUBLIC KEY', await crypto.subtle.exportKey('spki', kp.publicKey));
		expect((await verifyJws(jws(token), spki)).valid).toBe(true);
		expect((await verifyJws(jws(tamper(token)), spki)).valid).toBe(false);

		const priv = await crypto.subtle.exportKey('jwk', kp.privateKey);
		const set = JSON.stringify({
			keys: [
				{ kid: 'k1', kty: 'RSA' },
				{ ...priv, kid: 'k2' }
			]
		});
		const r = await verifyJws(jws(token), set);
		expect(r.valid).toBe(true);
		expect(r.notes[0]).toMatch(/private key material/);

		const pss = await crypto.subtle.generateKey(
			{
				name: 'RSA-PSS',
				modulusLength: 2048,
				publicExponent: new Uint8Array([1, 0, 1]),
				hash: 'SHA-256'
			},
			true,
			['sign', 'verify']
		);
		const pssToken = await signToken({ alg: 'PS256' }, { sub: 'c' }, pss.privateKey, {
			name: 'RSA-PSS',
			saltLength: 32
		});
		const pssPem = pem('PUBLIC KEY', await crypto.subtle.exportKey('spki', pss.publicKey));
		expect((await verifyJws(jws(pssToken), pssPem)).valid).toBe(true);
		expect((await verifyJws(jws(tamper(pssToken)), pssPem)).valid).toBe(false);
	});

	it('rejects mismatched key types and private PEMs', async () => {
		const ec = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-384' }, true, [
			'sign',
			'verify'
		]);
		const token = `${enc({ alg: 'RS256' })}.${enc({})}.AAAA`;
		const jwk = JSON.stringify(await crypto.subtle.exportKey('jwk', ec.publicKey));
		await expect(verifyJws(jws(token), jwk)).rejects.toThrow(/needs a RSA key/);
		const ecPem = pem('PUBLIC KEY', await crypto.subtle.exportKey('spki', ec.publicKey));
		const es256 = `${enc({ alg: 'ES256' })}.${enc({})}.${bytesToB64url(new Uint8Array(64))}`;
		await expect(verifyJws(jws(es256), ecPem)).rejects.toThrow(/does not fit ES256/);
		expect(() =>
			spkiFromPem('-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----')
		).toThrow(/private key/);
		expect(() =>
			spkiFromPem('-----BEGIN RSA PUBLIC KEY-----\nAAAA\n-----END RSA PUBLIC KEY-----')
		).toThrow(/PKCS#1/);
		expect(() => parsePublicJwk('{"kty":"oct","k":"AA"}')).toThrow(/HMAC secret/);
		expect(() => parsePublicJwk('{"keys":[{"kid":"a"}]}', 'b')).toThrow(/No key with kid "b"/);
	});
});

describe('certificates', () => {
	// Self-signed P-256 certificate made with openssl, and its public key from `openssl x509 -pubkey`.
	const cert = `-----BEGIN CERTIFICATE-----
MIIBjjCCATOgAwIBAgIUDx8Z9VNXW42qawlltGDveWqodmAwCgYIKoZIzj0EAwIw
HDEaMBgGA1UEAwwRZmllbGQtbWFudWFsLXRlc3QwHhcNMjYxMDA0MjAwNDMzWhcN
MzYxMDAxMjAwNDMzWjAcMRowGAYDVQQDDBFmaWVsZC1tYW51YWwtdGVzdDBZMBMG
ByqGSM49AgEGCCqGSM49AwEHA0IABAC3CIC6eDj7GzFcw1otj5qaW/ZcUE9f2cxN
RHW0YWXQp+qn/pRf5RFbxZ1UyLIdAtTE/TgLjPmj53Tr5n+eMwKjUzBRMB0GA1Ud
DgQWBBRMyju+EwSNG9+8qPMu+Ln2InFmKjAfBgNVHSMEGDAWgBRMyju+EwSNG9+8
qPMu+Ln2InFmKjAPBgNVHRMBAf8EBTADAQH/MAoGCCqGSM49BAMCA0kAMEYCIQC5
T4J9n0gv13P5olOqY1f03OKzftj6LRBU1wa/IAn0zwIhAIxi5y38RLlXELJy06vb
m9D2Zghwd3rFH4kBbb82s9Sa
-----END CERTIFICATE-----`;
	const pub = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEALcIgLp4OPsbMVzDWi2Pmppb9lxQ
T1/ZzE1EdbRhZdCn6qf+lF/lEVvFnVTIsh0C1MT9OAuM+aPndOvmf54zAg==
-----END PUBLIC KEY-----`;

	it('extracts the SPKI from an X.509 certificate', () => {
		expect(spkiFromPem(cert)).toEqual(spkiFromPem(pub));
	});
});

describe('detect', () => {
	it('recognises JWS and JWE compact', () => {
		expect(looksLikeJwt(a1Token)).toBe(0.95);
		expect(looksLikeJwt(`${enc({ alg: 'RSA-OAEP' })}.aa.bb.cc.dd`)).toBe(0.9);
		expect(looksLikeJwt('SGVsbG8gd29ybGQ=')).toBe(0);
		expect(looksLikeJwt('example.com.au')).toBe(0);
		expect(looksLikeJwt('1700000000')).toBe(0);
	});
});
