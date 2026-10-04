/*
 * Fixtures were generated with OpenSSL 3.0.13 (see fixtures.ts). Commands, abbreviated:
 *   openssl req -x509 -newkey rsa:2048 -config rsa.cnf -sha256 -set_serial 0x1a2b3c4d5e6f -days 365
 *   openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -days 10000 (notAfter in 2054: GeneralizedTime)
 *   openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-384 -sha384 (CA, pathlen:0)
 *   openssl req -new (leaf CSR with SAN) then openssl x509 -req -CA ca.pem -set_serial 4096 (leaf with CRL DP, AIA, policies)
 *   openssl req -x509 -newkey ed25519 / -sigopt rsa_padding_mode:pss / -pkeyopt ec_paramgen_curve:P-521 -sha512
 * Every expected value below is copied from `openssl x509 -text -fingerprint` or `openssl req -text`.
 */
import { describe, expect, it } from 'vitest';
import { parseDer, readTime } from './asn1';
import {
	checkChain,
	decodeInput,
	fingerprint,
	formatIPv6,
	keyText,
	looksLikeCertificate,
	serialText,
	validityStatus,
	type ParsedCertificate,
	type ParsedCsr
} from './logic';
import { caPem, ecPem, edPem, leafCsrPem, leafPem, p521Pem, pssPem, rsaPem } from './fixtures';
import { parseName } from './x509';

function cert(pem: string): ParsedCertificate {
	const r = decodeInput(pem);
	expect(r.items).toHaveLength(1);
	expect(r.items[0].error).toBeUndefined();
	return r.items[0].parsed as ParsedCertificate;
}

const T0 = Date.UTC(2026, 9, 4, 19, 58, 43);

describe('RSA self-signed certificate', () => {
	const c = cert(rsaPem);

	it('reads version, serial and algorithms', () => {
		expect(c.kind).toBe('certificate');
		expect(c.version).toBe(3);
		expect(c.serial).toBe('1a2b3c4d5e6f');
		expect(serialText(c.serial)).toBe('1a:2b:3c:4d:5e:6f');
		expect(c.signatureAlgorithm).toBe('sha256WithRSAEncryption');
		expect(c.publicKey).toMatchObject({ algorithm: 'RSA', bits: 2048, exponent: 65537 });
		expect(keyText(c.publicKey)).toBe('RSA 2048 bit, e=65537');
	});

	it('reads subject and issuer in OpenSSL order and short names', () => {
		const dn =
			'C=DK, ST=Hovedstaden, L=Copenhagen, O=Field Manual Test, OU=Ops, CN=rsa.example.test, emailAddress=ops@example.test';
		expect(c.subject.text).toBe(dn);
		expect(c.issuer.text).toBe(dn);
		expect(c.selfIssued).toBe(true);
	});

	it('reads UTCTime validity', () => {
		expect(c.notBefore).toBe(T0);
		expect(c.notAfter).toBe(Date.UTC(2027, 9, 4, 19, 58, 43));
	});

	it('reads SAN with DNS, IPv4, IPv6, email and URI', () => {
		expect(c.san.map((g) => `${g.type}:${g.value}`)).toEqual([
			'DNS:rsa.example.test',
			'DNS:*.rsa.example.test',
			'IP:192.0.2.10',
			// OpenSSL prints 2001:DB8:0:0:0:0:0:1, this is the RFC 5952 form of the same address.
			'IP:2001:db8::1',
			'email:admin@example.test',
			'URI:https://example.test/id'
		]);
	});

	it('reads key usage, EKU (with an unknown OID), basic constraints, SKI and criticality', () => {
		expect(c.keyUsage).toEqual(['digitalSignature', 'keyEncipherment']);
		expect(c.extKeyUsage).toEqual(['serverAuth', 'clientAuth', '1.3.6.1.4.1.99999.1']);
		expect(c.basicConstraints).toEqual({ ca: false, pathLen: undefined });
		expect(c.subjectKeyId).toBe('28:8A:3A:7F:EF:8F:11:28:6B:B0:DC:9C:9A:38:4C:1D:EF:5B:26:8C');
		const crit = Object.fromEntries(c.extensions.map((e) => [e.name, e.critical]));
		expect(crit).toEqual({
			'Basic Constraints': true,
			'Key Usage': true,
			'Extended Key Usage': false,
			'Subject Alternative Name': false,
			'Subject Key Identifier': false
		});
	});

	it('computes SHA-1 and SHA-256 fingerprints of the DER', async () => {
		expect(await fingerprint(c.der, 'SHA-1')).toBe(
			'59:EB:9D:5B:AD:9E:64:23:CB:03:5F:0B:6B:68:11:D0:AE:E1:D6:B7'
		);
		expect(await fingerprint(c.der, 'SHA-256')).toBe(
			'09:0A:3F:14:51:B0:FF:41:3C:92:B9:D0:B2:D0:FF:BF:49:20:B6:0D:CD:EF:79:F7:E7:21:C1:CE:AF:8B:67:3B'
		);
	});

	it('accepts the same certificate as bare Base64 DER', () => {
		const body = rsaPem.replace(/-----[A-Z ]+-----/g, '');
		const r = decodeInput(body);
		expect(r.items[0].label).toBe('Base64 DER');
		expect((r.items[0].parsed as ParsedCertificate).serial).toBe('1a2b3c4d5e6f');
	});
});

describe('EC and EdDSA certificates', () => {
	it('reads P-256 and a GeneralizedTime notAfter (2054)', async () => {
		const c = cert(ecPem);
		expect(c.signatureAlgorithm).toBe('ecdsa-with-SHA256');
		expect(c.publicKey).toMatchObject({ algorithm: 'EC', curve: 'P-256', bits: 256 });
		expect(c.serial).toBe('47e66d3f509f254c46bd4a95f9b1ae690ab986d6');
		expect(c.notAfter).toBe(Date.UTC(2054, 1, 19, 19, 58, 43));
		expect(c.subject.text).toBe('CN=ec.example.test, O=Field Manual Test');
		expect(await fingerprint(c.der, 'SHA-256')).toBe(
			'BF:3D:65:36:EE:64:39:5A:B9:84:61:08:C7:27:AB:A0:B8:21:A3:98:07:E2:3A:C5:73:14:C2:2A:62:80:C2:86'
		);
	});

	it('reads P-521 with ecdsa-with-SHA512', () => {
		const c = cert(p521Pem);
		expect(c.signatureAlgorithm).toBe('ecdsa-with-SHA512');
		expect(c.publicKey).toMatchObject({ curve: 'P-521', bits: 521 });
	});

	it('reads Ed25519 and DC / serialNumber name attributes', () => {
		const c = cert(edPem);
		expect(c.signatureAlgorithm).toBe('Ed25519');
		expect(c.publicKey.algorithm).toBe('Ed25519');
		expect(c.subject.text).toBe('CN=ed25519.example.test, DC=example, DC=test, serialNumber=42');
		expect(c.basicConstraints).toEqual({ ca: true, pathLen: undefined });
	});

	it('reads RSASSA-PSS with its hash', () => {
		const c = cert(pssPem);
		expect(c.signatureAlgorithm).toBe('RSASSA-PSS (SHA-256)');
		expect(c.publicKey.bits).toBe(2048);
	});
});

describe('CA and leaf', () => {
	const ca = cert(caPem);
	const leaf = cert(leafPem);

	it('reads the CA', () => {
		expect(ca.signatureAlgorithm).toBe('ecdsa-with-SHA384');
		expect(ca.publicKey).toMatchObject({ curve: 'P-384', bits: 384 });
		expect(ca.basicConstraints).toEqual({ ca: true, pathLen: 0 });
		expect(ca.keyUsage).toEqual(['keyCertSign', 'cRLSign']);
		expect(ca.subjectKeyId).toBe('EC:4C:FC:77:97:8A:80:05:18:BF:12:FF:0F:D4:4B:28:0A:B9:76:B1');
		expect(ca.authorityKeyId).toBe(ca.subjectKeyId);
	});

	it('reads leaf CRL DP, AIA and policies', () => {
		expect(leaf.serial).toBe('1000');
		expect(leaf.issuer.text).toBe('C=DK, O=Field Manual Test, CN=Field Manual Test Root CA');
		expect(leaf.authorityKeyId).toBe(ca.subjectKeyId);
		expect(leaf.crlDistributionPoints).toEqual(['http://crl.example.test/root.crl']);
		expect(leaf.ocsp).toEqual(['http://ocsp.example.test']);
		expect(leaf.caIssuers).toEqual(['http://ca.example.test/root.crt']);
		expect(leaf.policies).toEqual(['2.23.140.1.2.1', '1.3.6.1.4.1.99999.2']);
		const pol = leaf.extensions.find((e) => e.name === 'Certificate Policies')!;
		expect(pol.lines[0]).toBe('2.23.140.1.2.1 (CA/B Forum Domain Validated)');
		expect(leaf.basicConstraints).toEqual({ ca: false, pathLen: undefined });
		expect(leaf.extensions.find((e) => e.name === 'Basic Constraints')!.critical).toBe(false);
	});

	it('reports a correct chain', () => {
		const r = decodeInput(leafPem + '\n' + caPem);
		expect(r.items).toHaveLength(2);
		const rep = checkChain(r.items.map((i) => i.parsed as ParsedCertificate))!;
		expect(rep.ok).toBe(true);
		expect(rep.message).toBe('Chain order looks correct');
		expect(rep.links[0]).toEqual({ from: 1, to: 2, nameOk: true, keyIdOk: true });
	});

	it('spots a reversed chain', () => {
		const rep = checkChain([ca, leaf])!;
		expect(rep.ok).toBe(false);
		expect(rep.message).toMatch(/reverse order/);
	});

	it('names the broken link', () => {
		const rsa = cert(rsaPem);
		const rep = checkChain([leaf, ca, rsa])!;
		expect(rep.ok).toBe(false);
		expect(rep.message).toBe('Broken link #2 to #3: issuer DN does not match the next subject DN');
	});

	it('flags matching names but different key identifiers', () => {
		const fake = { ...ca, subjectKeyId: 'AA:BB' };
		const rep = checkChain([leaf, fake])!;
		expect(rep.message).toBe('Broken link #1 to #2: AKI does not match the next SKI');
	});

	it('returns null for a single certificate', () => {
		expect(checkChain([leaf])).toBeNull();
	});
});

describe('CSR', () => {
	it('reads subject, key and requested SAN', () => {
		const r = decodeInput(leafCsrPem);
		const csr = r.items[0].parsed as ParsedCsr;
		expect(r.items[0].label).toBe('CERTIFICATE REQUEST');
		expect(csr.kind).toBe('csr');
		expect(csr.version).toBe(1);
		expect(csr.subject.text).toBe('CN=leaf.example.test, O=Field Manual Test');
		expect(csr.publicKey).toMatchObject({ algorithm: 'RSA', bits: 2048 });
		expect(csr.signatureAlgorithm).toBe('sha256WithRSAEncryption');
		expect(csr.san.map((g) => g.value)).toEqual(['leaf.example.test', 'www.leaf.example.test']);
		expect(csr.extensions.map((e) => e.name)).toEqual(['Subject Alternative Name']);
	});
});

describe('private keys', () => {
	// Not a real key: the body is never looked at.
	const fake = '-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----';

	it.each([
		'PRIVATE KEY',
		'RSA PRIVATE KEY',
		'EC PRIVATE KEY',
		'ENCRYPTED PRIVATE KEY',
		'OPENSSH PRIVATE KEY'
	])('refuses %s', (t) => {
		const r = decodeInput(`-----BEGIN ${t}-----\nAAAA\n-----END ${t}-----`);
		expect(r.privateKey).toBe(t);
		expect(r.items).toEqual([]);
	});

	it('refuses the whole paste when a key sits next to a certificate', () => {
		const r = decodeInput(leafPem + '\n' + fake);
		expect(r.privateKey).toBe('PRIVATE KEY');
		expect(r.items).toEqual([]);
	});
});

describe('errors and helpers', () => {
	it('reports bad input', () => {
		expect(decodeInput('-----BEGIN CERTIFICATE-----\nMIIB').items[0].error).toMatch(/END line/);
		expect(decodeInput('not base64 at all!').items[0].error).toMatch(/Base64/);
		expect(
			decodeInput('-----BEGIN CERTIFICATE-----\nMAA=\n-----END CERTIFICATE-----').items[0].error
		).toMatch(/three parts/);
		expect(
			decodeInput('-----BEGIN PUBLIC KEY-----\nMAA=\n-----END PUBLIC KEY-----').items[0].error
		).toMatch(/not a certificate/);
		expect(
			decodeInput('-----BEGIN CERTIFICATE-----\nMIIF\n-----END CERTIFICATE-----').items[0].error
		).toMatch(/Truncated|past the end/);
	});

	it('shows unknown name attributes as dotted OIDs', () => {
		// SEQUENCE { SET { SEQUENCE { OID 1.2.3.4.5, PrintableString "x" } } }
		const der = new Uint8Array([
			0x30, 0x0d, 0x31, 0x0b, 0x30, 0x09, 0x06, 0x04, 0x2a, 0x03, 0x04, 0x05, 0x13, 0x01, 0x78
		]);
		expect(parseName(parseDer(der)).text).toBe('1.2.3.4.5=x');
	});

	it('applies the RFC 5280 UTCTime century rule', () => {
		const t = (s: string) =>
			readTime(parseDer(new Uint8Array([0x17, s.length, ...new TextEncoder().encode(s)])));
		expect(t('500101000000Z')).toBe(Date.UTC(1950, 0, 1));
		expect(t('491231235959Z')).toBe(Date.UTC(2049, 11, 31, 23, 59, 59));
	});

	it('describes validity', () => {
		const nb = T0;
		const na = T0 + 30 * 86_400_000;
		expect(validityStatus(nb, na, T0 + 86_400_000)).toEqual({
			state: 'valid',
			text: 'Valid for 29 more days'
		});
		expect(validityStatus(nb, na, na + 3 * 86_400_000)).toEqual({
			state: 'expired',
			text: 'Expired 3 days ago'
		});
		expect(validityStatus(nb, na, nb - 86_400_000).state).toBe('notyet');
		expect(validityStatus(nb, na, nb - 86_400_000).text).toBe('Not yet valid, starts in 1 day');
	});

	it('formats IPv6 per RFC 5952', () => {
		const b = new Uint8Array(16);
		expect(formatIPv6(b)).toBe('::');
		b[15] = 1;
		expect(formatIPv6(b)).toBe('::1');
		const c = new Uint8Array([0x20, 0x01, 0x0d, 0xb8, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1]);
		expect(formatIPv6(c)).toBe('2001:db8:0:1::1');
	});

	it('detects PEM certificates and requests only', () => {
		expect(looksLikeCertificate(rsaPem)).toBe(0.99);
		expect(looksLikeCertificate(leafCsrPem)).toBe(0.99);
		expect(looksLikeCertificate('-----BEGIN PUBLIC KEY-----')).toBe(0);
		expect(looksLikeCertificate('MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA')).toBe(0);
	});
});
