/*
 * The request bytes are checked two ways: with the certificate tool's own DER/X.509 decoder,
 * and with `openssl req -verify` when an openssl binary is on PATH (skipped otherwise).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { parseDer, readOid } from '../certificate/asn1';
import { parseCsr } from '../certificate/x509';
import { encodeLength, integer, oid, setOf, tlv } from './der';
import {
	algorithms,
	ecdsaRawToDer,
	emptySubject,
	encodeSubject,
	generateCsr,
	opensslCommand,
	parseIPv6,
	parseSans,
	shellQuote,
	supportsEd25519,
	type KeyAlg,
	type Subject
} from './logic';

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

function hasOpenssl(): boolean {
	try {
		execFileSync('openssl', ['version'], { stdio: 'pipe' });
		return true;
	} catch {
		return false;
	}
}
const openssl = hasOpenssl();

/** Runs openssl with stdin, fails on a non-zero exit, returns stdout and stderr together. */
function run(args: string[], input: string): string {
	const r = spawnSync('openssl', args, { input, encoding: 'utf8' });
	if (r.status !== 0) throw new Error(`openssl ${args.join(' ')} failed: ${r.stderr}`);
	return r.stdout + r.stderr;
}
function stdout(args: string[], input: string): string {
	return execFileSync('openssl', args, { input, stdio: 'pipe' }).toString();
}

describe('DER encoder', () => {
	it('encodes lengths in short and long form', () => {
		expect(hex(encodeLength(0))).toBe('00');
		expect(hex(encodeLength(127))).toBe('7f');
		expect(hex(encodeLength(128))).toBe('8180');
		expect(hex(encodeLength(255))).toBe('81ff');
		expect(hex(encodeLength(256))).toBe('820100');
		expect(hex(encodeLength(65536))).toBe('83010000');
	});

	it('encodes OIDs (X.690 8.19)', () => {
		expect(hex(oid('1.2.840.113549'))).toBe('06062a864886f70d');
		expect(hex(oid('2.5.29.17'))).toBe('0603551d11');
		expect(hex(oid('1.3.101.112'))).toBe('06032b6570');
		expect(hex(oid('2.999.3'))).toBe('0603883703');
		expect(() => oid('1.40.1')).toThrow('Bad OID');
		for (const o of ['1.2.840.113549.1.9.14', '1.2.840.10045.4.3.3', '2.5.4.3'])
			expect(readOid(parseDer(oid(o)))).toBe(o);
	});

	it('encodes INTEGERs minimally with a sign octet when needed', () => {
		expect(hex(integer(Uint8Array.of(0, 0, 1)))).toBe('020101');
		expect(hex(integer(Uint8Array.of(0x80)))).toBe('02020080');
		expect(hex(integer(Uint8Array.of(0, 0)))).toBe('020100');
		expect(hex(integer(Uint8Array.of(0x7f, 0xff)))).toBe('02027fff');
	});

	it('sorts SET OF elements', () => {
		const a = tlv(0x04, Uint8Array.of(2));
		const b = tlv(0x04, Uint8Array.of(1));
		expect(hex(setOf(a, b))).toBe('3106' + '040101' + '040102');
	});

	it('round-trips through the certificate DER reader', () => {
		const big = tlv(0x04, new Uint8Array(300));
		const n = parseDer(big);
		expect(n.end - n.contentStart).toBe(300);
	});

	it('converts raw ECDSA signatures to DER', () => {
		const raw = new Uint8Array(64);
		raw[0] = 0x80; // r has the top bit set: needs a 0x00 prefix
		raw[63] = 1; // s is 1 with 31 leading zeros
		const der = ecdsaRawToDer(raw);
		const n = parseDer(der);
		expect(n.children).toHaveLength(2);
		expect(hex(der.subarray(0, 6))).toBe('3026' + '0221' + '0080');
		expect(hex(der.subarray(der.length - 3))).toBe('020101');
	});
});

describe('subject', () => {
	it('encodes C as PrintableString, email as IA5String, the rest as UTF8String', () => {
		const s: Subject = { ...emptySubject(), C: 'dk', CN: 'Ærø', emailAddress: 'a@example.com' };
		const n = parseDer(encodeSubject(s).der);
		const tags = n.children.map((rdn) => rdn.children[0].children[1].tag);
		expect(tags).toEqual([19, 12, 22]);
	});

	it('rejects bad values', () => {
		const base = emptySubject();
		expect(() => encodeSubject({ ...base, C: 'DNK' })).toThrow('two-letter');
		expect(() => encodeSubject({ ...base, CN: 'x'.repeat(65) })).toThrow('longer than 64');
		expect(() => encodeSubject({ ...base, CN: 'a\u0000b' })).toThrow('control character');
		expect(() => encodeSubject({ ...base, emailAddress: 'nope' })).toThrow('address');
		expect(() => encodeSubject({ ...base, emailAddress: 'ø@example.com' })).toThrow('ASCII');
	});
});

describe('subject alternative names', () => {
	it('infers types and normalises', () => {
		const s = parseSans(
			'Example.COM, *.example.com\n192.0.2.1 2001:DB8:0:0:0:0:0:1 admin@example.com IP:::1 DNS:10.0.0.1'
		);
		expect(s.map((x) => `${x.type}:${x.value}`)).toEqual([
			'DNS:example.com',
			'DNS:*.example.com',
			'IP:192.0.2.1',
			'IP:2001:db8::1',
			'email:admin@example.com',
			'IP:::1',
			// An explicit DNS: prefix wins even when the value looks like an address.
			'DNS:10.0.0.1'
		]);
	});

	it('converts IDNs to punycode', () => {
		const [s] = parseSans('bücher.example');
		expect(s.value).toBe('xn--bcher-kva.example');
		expect(s.input).toBe('bücher.example');
	});

	it('drops duplicates', () => {
		expect(parseSans('a.example a.example A.example.')).toHaveLength(1);
	});

	it('rejects bad names and addresses', () => {
		expect(() => parseSans('foo_bar.example')).toThrow('underscores');
		expect(() => parseSans('a.*.example')).toThrow('wildcard');
		expect(() => parseSans('-a.example')).toThrow('hyphen');
		expect(() => parseSans('a..example')).toThrow('empty label');
		expect(() => parseSans('IP:300.1.1.1')).toThrow('not an IPv4 or IPv6');
		expect(() => parseSans('IP:010.0.0.1')).toThrow('not an IPv4 or IPv6');
		expect(() => parseSans('x'.repeat(64) + '.example')).toThrow('63');
	});

	it('parses IPv6 forms (RFC 4291 2.2)', () => {
		expect(hex(parseIPv6('::')!)).toBe('0'.repeat(32));
		expect(hex(parseIPv6('::ffff:192.0.2.1')!)).toBe('00000000000000000000ffffc0000201');
		expect(hex(parseIPv6('[fe80::1]')!)).toBe('fe800000000000000000000000000001');
		expect(hex(parseIPv6('1:2:3:4:5:6:7:8')!)).toBe('00010002000300040005000600070008');
		expect(parseIPv6('1:2:3:4:5:6:7:8:9')).toBeNull();
		expect(parseIPv6('1::2::3')).toBeNull();
		expect(parseIPv6('1:2:3:4::5:6:7:8')).toBeNull();
		expect(parseIPv6('12345::')).toBeNull();
	});
});

describe('openssl command', () => {
	it('escapes subject values and quotes for the shell', () => {
		const cmd = opensslCommand({
			alg: 'p-256',
			subject: { ...emptySubject(), C: 'dk', O: "Bob's A/S, Inc", CN: 'example.com' },
			sans: parseSans('example.com 192.0.2.1')
		});
		expect(cmd).toContain('-newkey ec -pkeyopt ec_paramgen_curve:P-256 -sha256');
		expect(cmd).toContain(`-subj '/C=DK/O=Bob'\\''s A\\/S\\, Inc/CN=example.com'`);
		expect(cmd).toContain(`-addext 'subjectAltName=DNS:example.com,IP:192.0.2.1'`);
	});

	it('marks SAN critical with an empty subject', () => {
		const cmd = opensslCommand({
			alg: 'ed25519',
			subject: emptySubject(),
			sans: parseSans('a.example')
		});
		expect(cmd).toContain("-subj '/'");
		expect(cmd).toContain('subjectAltName=critical,DNS:a.example');
	});

	it('quotes', () => {
		expect(shellQuote("it's")).toBe(`'it'\\''s'`);
	});
});

const subject: Subject = {
	CN: 'www.example.com',
	O: 'Example A/S',
	OU: 'IT Security',
	L: 'København',
	ST: 'Hovedstaden',
	C: 'DK',
	emailAddress: 'pki@example.com'
};
const sanText = 'www.example.com example.com 192.0.2.10 2001:db8::10 pki@example.com';

const expectedKey: Record<KeyAlg, { algorithm: string; bits?: number; curve?: string }> = {
	'rsa-2048': { algorithm: 'RSA', bits: 2048 },
	'rsa-3072': { algorithm: 'RSA', bits: 3072 },
	'rsa-4096': { algorithm: 'RSA', bits: 4096 },
	'p-256': { algorithm: 'EC', curve: 'P-256' },
	'p-384': { algorithm: 'EC', curve: 'P-384' },
	ed25519: { algorithm: 'Ed25519' }
};

const ed25519 = await supportsEd25519();
// RSA 4096 generation is slow; 2048 and 3072 cover the RSA path.
const tested: KeyAlg[] = ['rsa-2048', 'rsa-3072', 'p-256', 'p-384', 'ed25519'];

describe.each(tested)('generated request %s', (alg) => {
	const skip = alg === 'ed25519' && !ed25519;
	let result: Awaited<ReturnType<typeof generateCsr>>;

	it.skipIf(skip)(
		'parses with the certificate decoder',
		async () => {
			result = await generateCsr({ alg, subject, sans: parseSans(sanText) });
			const csr = parseCsr(result.csrDer);
			expect(csr.version).toBe(1);
			expect(csr.subject.text).toBe(
				'C=DK, ST=Hovedstaden, L=København, O=Example A/S, OU=IT Security, CN=www.example.com, emailAddress=pki@example.com'
			);
			expect(csr.san.map((g) => `${g.type}:${g.value}`)).toEqual([
				'DNS:www.example.com',
				'DNS:example.com',
				'IP:192.0.2.10',
				'IP:2001:db8::10',
				'email:pki@example.com'
			]);
			expect(csr.publicKey).toMatchObject(expectedKey[alg]);
			expect(csr.signatureAlgorithm).toBe(algorithms.find((a) => a.id === alg)!.sigAlgName);
			expect(result.csrPem).toMatch(/^-----BEGIN CERTIFICATE REQUEST-----\n/);
			expect(result.keyPem).toMatch(/^-----BEGIN PRIVATE KEY-----\n/);
		},
		30_000
	);

	it.skipIf(skip || !openssl)('verifies with openssl req -verify, key matches', () => {
		const out = run(['req', '-verify', '-noout'], result.csrPem);
		// OpenSSL 3 prints "Certificate request self-signature verify OK", 1.1 "verify OK".
		expect(out).toMatch(/verify OK/);
		const fromCsr = stdout(['req', '-pubkey', '-noout'], result.csrPem);
		const fromKey = stdout(['pkey', '-pubout'], result.keyPem);
		expect(fromKey).toBe(fromCsr);
		const text = stdout(['req', '-noout', '-text'], result.csrPem);
		expect(text).toContain('DNS:www.example.com, DNS:example.com, IP Address:192.0.2.10');
	});
});

describe('edge cases', () => {
	it('requires a subject or SAN', async () => {
		await expect(generateCsr({ alg: 'p-256', subject: emptySubject(), sans: [] })).rejects.toThrow(
			'at least a common name'
		);
	});

	it.skipIf(!openssl)('SAN-only request: critical SAN, verifies', async () => {
		const r = await generateCsr({
			alg: 'p-256',
			subject: emptySubject(),
			sans: parseSans('a.example')
		});
		const csr = parseCsr(r.csrDer);
		expect(csr.subject.parts).toHaveLength(0);
		expect(csr.extensions[0].critical).toBe(true);
		expect(run(['req', '-verify', '-noout'], r.csrPem)).toMatch(/verify OK/);
	});

	it.skipIf(!openssl)('request without SANs has an empty attribute set and verifies', async () => {
		const r = await generateCsr({
			alg: 'p-256',
			subject: { ...emptySubject(), CN: 'x' },
			sans: []
		});
		expect(parseCsr(r.csrDer).extensions).toHaveLength(0);
		expect(run(['req', '-verify', '-noout'], r.csrPem)).toMatch(/verify OK/);
	});
});

describe('openssl cross-checks', () => {
	it.skipIf(!openssl)('openssl rejects a request with a tampered signature', async () => {
		const r = await generateCsr({
			alg: 'p-256',
			subject: { ...emptySubject(), CN: 'x' },
			sans: []
		});
		const der = r.csrDer.slice();
		der[der.length - 5] ^= 0x01;
		let b = '';
		for (const x of der) b += String.fromCharCode(x);
		const pem = `-----BEGIN CERTIFICATE REQUEST-----\n${btoa(b)
			.match(/.{1,64}/g)!
			.join('\n')}\n-----END CERTIFICATE REQUEST-----\n`;
		const res = spawnSync('openssl', ['req', '-verify', '-noout'], {
			input: pem,
			encoding: 'utf8'
		});
		expect(res.stdout + res.stderr).not.toMatch(/verify OK/);
	});

	it.skipIf(!openssl)('the shown openssl command produces the same subject and SANs', async () => {
		const { mkdtempSync, readFileSync, rmSync } = await import('node:fs');
		const { tmpdir } = await import('node:os');
		const { join } = await import('node:path');
		const dir = mkdtempSync(join(tmpdir(), 'csr-'));
		try {
			const input = { alg: 'p-256' as const, subject, sans: parseSans(sanText) };
			execFileSync('sh', ['-c', opensslCommand(input)], { cwd: dir, stdio: 'pipe' });
			const pem = readFileSync(join(dir, 'request.csr'), 'utf8');
			const theirs = parseCsr(
				Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g, '')), (c) => c.charCodeAt(0))
			);
			const ours = parseCsr((await generateCsr(input)).csrDer);
			expect(theirs.subject.text).toBe(ours.subject.text);
			expect(theirs.san).toEqual(ours.san);
			expect(theirs.signatureAlgorithm).toBe(ours.signatureAlgorithm);
			// Same string types too: compare the encoded Name byte for byte.
			expect(hex(theirs.subject.der)).toBe(hex(ours.subject.der));
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
