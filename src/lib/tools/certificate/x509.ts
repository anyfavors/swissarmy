/** X.509 certificate (RFC 5280) and PKCS#10 request (RFC 2986) decoding on top of asn1.ts. */
import {
	UNIVERSAL as U,
	content,
	hex,
	isContext,
	isUniversal,
	need,
	parseDer,
	parseInner,
	raw,
	readBoolean,
	readIntegerHex,
	readOid,
	readSmallInt,
	readString,
	readTime,
	type Node
} from './asn1';

/** Attribute types in distinguished names, short names as OpenSSL prints them. */
export const dnNames: Record<string, string> = {
	'2.5.4.3': 'CN',
	'2.5.4.4': 'SN',
	'2.5.4.5': 'serialNumber',
	'2.5.4.6': 'C',
	'2.5.4.7': 'L',
	'2.5.4.8': 'ST',
	'2.5.4.9': 'street',
	'2.5.4.10': 'O',
	'2.5.4.11': 'OU',
	'2.5.4.12': 'title',
	'2.5.4.13': 'description',
	'2.5.4.15': 'businessCategory',
	'2.5.4.17': 'postalCode',
	'2.5.4.42': 'GN',
	'2.5.4.43': 'initials',
	'2.5.4.44': 'generationQualifier',
	'2.5.4.46': 'dnQualifier',
	'2.5.4.65': 'pseudonym',
	'2.5.4.97': 'organizationIdentifier',
	'0.9.2342.19200300.100.1.25': 'DC',
	'0.9.2342.19200300.100.1.1': 'UID',
	'1.2.840.113549.1.9.1': 'emailAddress',
	'1.3.6.1.4.1.311.60.2.1.1': 'jurisdictionL',
	'1.3.6.1.4.1.311.60.2.1.2': 'jurisdictionST',
	'1.3.6.1.4.1.311.60.2.1.3': 'jurisdictionC'
};

export const sigAlgNames: Record<string, string> = {
	'1.2.840.113549.1.1.4': 'md5WithRSAEncryption',
	'1.2.840.113549.1.1.5': 'sha1WithRSAEncryption',
	'1.2.840.113549.1.1.14': 'sha224WithRSAEncryption',
	'1.2.840.113549.1.1.11': 'sha256WithRSAEncryption',
	'1.2.840.113549.1.1.12': 'sha384WithRSAEncryption',
	'1.2.840.113549.1.1.13': 'sha512WithRSAEncryption',
	'1.2.840.113549.1.1.10': 'RSASSA-PSS',
	'1.2.840.10045.4.1': 'ecdsa-with-SHA1',
	'1.2.840.10045.4.3.1': 'ecdsa-with-SHA224',
	'1.2.840.10045.4.3.2': 'ecdsa-with-SHA256',
	'1.2.840.10045.4.3.3': 'ecdsa-with-SHA384',
	'1.2.840.10045.4.3.4': 'ecdsa-with-SHA512',
	'1.2.840.10040.4.3': 'dsa-with-SHA1',
	'2.16.840.1.101.3.4.3.2': 'dsa-with-SHA256',
	'1.3.101.112': 'Ed25519',
	'1.3.101.113': 'Ed448',
	'1.2.643.7.1.1.3.2': 'GOST R 34.10-2012 (256)',
	'1.2.156.10197.1.501': 'SM2-with-SM3'
};

const hashNames: Record<string, string> = {
	'1.3.14.3.2.26': 'SHA-1',
	'2.16.840.1.101.3.4.2.4': 'SHA-224',
	'2.16.840.1.101.3.4.2.1': 'SHA-256',
	'2.16.840.1.101.3.4.2.2': 'SHA-384',
	'2.16.840.1.101.3.4.2.3': 'SHA-512'
};

export const curveNames: Record<string, string> = {
	'1.2.840.10045.3.1.7': 'P-256',
	'1.3.132.0.34': 'P-384',
	'1.3.132.0.35': 'P-521',
	'1.3.132.0.10': 'secp256k1',
	'1.2.840.10045.3.1.1': 'P-192',
	'1.3.132.0.33': 'P-224',
	'1.3.36.3.3.2.8.1.1.7': 'brainpoolP256r1',
	'1.3.36.3.3.2.8.1.1.11': 'brainpoolP384r1',
	'1.3.36.3.3.2.8.1.1.13': 'brainpoolP512r1'
};

const curveBits: Record<string, number> = {
	'P-256': 256,
	'P-384': 384,
	'P-521': 521,
	secp256k1: 256,
	'P-192': 192,
	'P-224': 224,
	brainpoolP256r1: 256,
	brainpoolP384r1: 384,
	brainpoolP512r1: 512
};

export const ekuNames: Record<string, string> = {
	'1.3.6.1.5.5.7.3.1': 'serverAuth',
	'1.3.6.1.5.5.7.3.2': 'clientAuth',
	'1.3.6.1.5.5.7.3.3': 'codeSigning',
	'1.3.6.1.5.5.7.3.4': 'emailProtection',
	'1.3.6.1.5.5.7.3.8': 'timeStamping',
	'1.3.6.1.5.5.7.3.9': 'OCSPSigning',
	'2.5.29.37.0': 'anyExtendedKeyUsage',
	'1.3.6.1.4.1.311.10.3.3': 'msSGC',
	'1.3.6.1.4.1.311.20.2.2': 'msSmartcardLogin',
	'1.3.6.1.5.5.7.3.17': 'ipsecIKE'
};

export const extNames: Record<string, string> = {
	'2.5.29.14': 'Subject Key Identifier',
	'2.5.29.15': 'Key Usage',
	'2.5.29.17': 'Subject Alternative Name',
	'2.5.29.18': 'Issuer Alternative Name',
	'2.5.29.19': 'Basic Constraints',
	'2.5.29.30': 'Name Constraints',
	'2.5.29.31': 'CRL Distribution Points',
	'2.5.29.32': 'Certificate Policies',
	'2.5.29.35': 'Authority Key Identifier',
	'2.5.29.36': 'Policy Constraints',
	'2.5.29.37': 'Extended Key Usage',
	'2.5.29.54': 'Inhibit anyPolicy',
	'1.3.6.1.5.5.7.1.1': 'Authority Information Access',
	'1.3.6.1.5.5.7.1.11': 'Subject Information Access',
	'1.3.6.1.5.5.7.1.24': 'TLS Feature (OCSP Must-Staple)',
	'1.3.6.1.4.1.11129.2.4.2': 'Certificate Transparency SCTs',
	'1.3.6.1.4.1.11129.2.4.3': 'CT Precertificate Poison',
	'2.16.840.1.113730.1.1': 'Netscape Cert Type',
	'2.16.840.1.113730.1.13': 'Netscape Comment'
};

export const policyNames: Record<string, string> = {
	'2.5.29.32.0': 'anyPolicy',
	'2.23.140.1.1': 'CA/B Forum EV',
	'2.23.140.1.2.1': 'CA/B Forum Domain Validated',
	'2.23.140.1.2.2': 'CA/B Forum Organization Validated',
	'2.23.140.1.2.3': 'CA/B Forum Individual Validated',
	'2.23.140.1.4.1': 'CA/B Forum Code Signing',
	'1.3.6.1.4.1.44947.1.1.1': "Let's Encrypt ISRG Domain Validated"
};

const keyUsageBits = [
	'digitalSignature',
	'nonRepudiation',
	'keyEncipherment',
	'dataEncipherment',
	'keyAgreement',
	'keyCertSign',
	'cRLSign',
	'encipherOnly',
	'decipherOnly'
];

export interface DnPart {
	oid: string;
	/** Short name, or the dotted OID when unknown. */
	name: string;
	value: string;
}

export interface Dn {
	parts: DnPart[];
	/** OpenSSL-style one-line form, e.g. "C=DK, O=Example, CN=example.com". */
	text: string;
	/** Raw DER of the Name, for exact comparisons. */
	der: Uint8Array;
}

export interface GeneralName {
	type: 'DNS' | 'IP' | 'email' | 'URI' | 'DirName' | 'RID' | 'otherName' | 'other';
	value: string;
}

export interface PublicKeyInfo {
	algorithm: string;
	oid: string;
	/** Key size in bits when known (RSA modulus, EC curve, EdDSA). */
	bits?: number;
	curve?: string;
	exponent?: number;
}

export interface Extension {
	oid: string;
	name: string;
	critical: boolean;
	/** Human-readable lines for display. */
	lines: string[];
}

export interface ParsedCommon {
	subject: Dn;
	publicKey: PublicKeyInfo;
	signatureAlgorithm: string;
	extensions: Extension[];
	san: GeneralName[];
	der: Uint8Array;
}

export interface ParsedCertificate extends ParsedCommon {
	kind: 'certificate';
	version: number;
	serial: string;
	issuer: Dn;
	notBefore: number;
	notAfter: number;
	keyUsage: string[];
	extKeyUsage: string[];
	basicConstraints?: { ca: boolean; pathLen?: number };
	subjectKeyId?: string;
	authorityKeyId?: string;
	crlDistributionPoints: string[];
	ocsp: string[];
	caIssuers: string[];
	policies: string[];
	selfIssued: boolean;
}

export interface ParsedCsr extends ParsedCommon {
	kind: 'csr';
	version: number;
}

function oidLabel(oid: string, table: Record<string, string>): string {
	return table[oid] ?? oid;
}

function escapeDnValue(v: string): string {
	return /[,+=]/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : v;
}

export function parseName(n: Node): Dn {
	need(n, U.SEQUENCE, 'a Name (SEQUENCE)');
	const parts: DnPart[] = [];
	const rdnTexts: string[] = [];
	for (const rdn of n.children) {
		if (!isUniversal(rdn, U.SET)) throw new Error('Expected an RDN (SET) in the name');
		const inRdn: string[] = [];
		for (const atv of rdn.children) {
			const oid = readOid(need(atv.children[0], U.OID, 'an attribute type OID'));
			const valNode = atv.children[1];
			if (!valNode) throw new Error('Name attribute without a value');
			const value = valNode.constructed ? `#${hex(raw(valNode))}` : readString(valNode);
			const name = dnNames[oid] ?? oid;
			parts.push({ oid, name, value });
			inRdn.push(`${name}=${escapeDnValue(value)}`);
		}
		rdnTexts.push(inRdn.join(' + '));
	}
	return { parts, text: rdnTexts.join(', '), der: raw(n) };
}

/** RFC 5952 text form of an IPv6 address. */
export function formatIPv6(b: Uint8Array): string {
	const words: number[] = [];
	for (let i = 0; i < 16; i += 2) words.push((b[i] << 8) | b[i + 1]);
	let bestStart = -1;
	let bestLen = 0;
	for (let i = 0; i < 8;) {
		if (words[i] !== 0) {
			i++;
			continue;
		}
		let j = i;
		while (j < 8 && words[j] === 0) j++;
		if (j - i > bestLen && j - i >= 2) {
			bestStart = i;
			bestLen = j - i;
		}
		i = j;
	}
	const h = words.map((w) => w.toString(16));
	if (bestStart < 0) return h.join(':');
	return `${h.slice(0, bestStart).join(':')}::${h.slice(bestStart + bestLen).join(':')}`;
}

function parseGeneralName(n: Node): GeneralName {
	if (n.cls !== 2) return { type: 'other', value: hex(raw(n)) };
	const ascii = () => new TextDecoder('utf-8').decode(content(n));
	switch (n.tag) {
		case 0: {
			const oid = n.children[0] ? readOid(n.children[0]) : '?';
			return { type: 'otherName', value: oid };
		}
		case 1:
			return { type: 'email', value: ascii() };
		case 2:
			return { type: 'DNS', value: ascii() };
		case 4:
			return { type: 'DirName', value: n.children[0] ? parseName(n.children[0]).text : '' };
		case 6:
			return { type: 'URI', value: ascii() };
		case 7: {
			const b = content(n);
			if (b.length === 4) return { type: 'IP', value: Array.from(b).join('.') };
			if (b.length === 16) return { type: 'IP', value: formatIPv6(b) };
			// Name constraints carry address + mask (8 or 32 bytes).
			return { type: 'IP', value: hex(b, ':') };
		}
		case 8: {
			// Implicit OID: decode contents directly.
			const fake: Node = { ...n, cls: 0, tag: U.OID };
			return { type: 'RID', value: readOid(fake) };
		}
		default:
			return { type: 'other', value: `[${n.tag}] ${hex(content(n))}` };
	}
}

function parseGeneralNames(seq: Node): GeneralName[] {
	return seq.children.map(parseGeneralName);
}

export function gnText(g: GeneralName): string {
	return `${g.type}:${g.value}`;
}

function parseAlgorithm(n: Node): string {
	need(n, U.SEQUENCE, 'an AlgorithmIdentifier');
	const oid = readOid(need(n.children[0], U.OID, 'an algorithm OID'));
	const name = sigAlgNames[oid] ?? oid;
	if (oid === '1.2.840.113549.1.1.10') {
		// RSASSA-PSS-params: [0] hashAlgorithm, default SHA-1.
		let hash = 'SHA-1';
		const params = n.children[1];
		if (params && isUniversal(params, U.SEQUENCE)) {
			const h = params.children.find((c) => isContext(c, 0));
			const alg = h?.children[0]?.children[0];
			if (alg) {
				const hOid = readOid(alg);
				hash = hashNames[hOid] ?? hOid;
			}
		}
		return `RSASSA-PSS (${hash})`;
	}
	return name;
}

function bitLength(b: Uint8Array): number {
	let i = 0;
	while (i < b.length - 1 && b[i] === 0) i++;
	if (i >= b.length) return 0;
	return (b.length - i - 1) * 8 + (32 - Math.clz32(b[i]));
}

function parseSpki(n: Node): PublicKeyInfo {
	need(n, U.SEQUENCE, 'SubjectPublicKeyInfo');
	const alg = need(n.children[0], U.SEQUENCE, 'a key AlgorithmIdentifier');
	const oid = readOid(need(alg.children[0], U.OID, 'a key algorithm OID'));
	const key = need(n.children[1], U.BIT_STRING, 'the public key BIT STRING');
	switch (oid) {
		case '1.2.840.113549.1.1.1':
		case '1.2.840.113549.1.1.10': {
			const rsa = parseInner(key, 1);
			const mod = content(need(rsa.children[0], U.INTEGER, 'the RSA modulus'));
			const exp = readSmallInt(need(rsa.children[1], U.INTEGER, 'the RSA exponent'));
			return {
				algorithm: oid.endsWith('.10') ? 'RSASSA-PSS' : 'RSA',
				oid,
				bits: bitLength(mod),
				exponent: exp
			};
		}
		case '1.2.840.10045.2.1': {
			const p = alg.children[1];
			const curveOid = p && isUniversal(p, U.OID) ? readOid(p) : undefined;
			const curve = curveOid ? (curveNames[curveOid] ?? curveOid) : 'explicit parameters';
			return { algorithm: 'EC', oid, curve, bits: curveBits[curve] };
		}
		case '1.3.101.112':
			return { algorithm: 'Ed25519', oid, bits: 256 };
		case '1.3.101.113':
			return { algorithm: 'Ed448', oid, bits: 456 };
		case '1.3.101.110':
			return { algorithm: 'X25519', oid, bits: 256 };
		case '1.3.101.111':
			return { algorithm: 'X448', oid, bits: 448 };
		case '1.2.840.10040.4.1': {
			const params = alg.children[1];
			const pBits = params?.children[0] ? bitLength(content(params.children[0])) : undefined;
			return { algorithm: 'DSA', oid, bits: pBits };
		}
		default:
			return { algorithm: oid, oid };
	}
}

function colonHex(b: Uint8Array): string {
	return hex(b, ':').toUpperCase();
}

interface ExtResult {
	ext: Extension;
	apply: (c: Partial<ParsedCertificate>) => void;
}

function parseExtension(n: Node): ExtResult {
	need(n, U.SEQUENCE, 'an Extension');
	const oid = readOid(need(n.children[0], U.OID, 'an extension OID'));
	let i = 1;
	let critical = false;
	if (n.children[i] && isUniversal(n.children[i], U.BOOLEAN))
		critical = readBoolean(n.children[i++]);
	const octets = need(n.children[i], U.OCTET_STRING, 'the extension value');
	const ext: Extension = { oid, name: extNames[oid] ?? oid, critical, lines: [] };
	let apply: ExtResult['apply'] = () => {};
	try {
		const v = parseInner(octets);
		switch (oid) {
			case '2.5.29.17':
			case '2.5.29.18': {
				const names = parseGeneralNames(v);
				ext.lines = names.map(gnText);
				if (oid === '2.5.29.17') apply = (c) => (c.san = names);
				break;
			}
			case '2.5.29.15': {
				const b = content(v);
				const used: string[] = [];
				const nbits = (b.length - 1) * 8 - (b[0] ?? 0);
				for (let bit = 0; bit < nbits; bit++) {
					if (b[1 + (bit >> 3)] & (0x80 >> (bit & 7))) used.push(keyUsageBits[bit] ?? `bit ${bit}`);
				}
				ext.lines = [used.join(', ') || '(none)'];
				apply = (c) => (c.keyUsage = used);
				break;
			}
			case '2.5.29.37': {
				const list = v.children.map((o) => oidLabel(readOid(o), ekuNames));
				ext.lines = [list.join(', ')];
				apply = (c) => (c.extKeyUsage = list);
				break;
			}
			case '2.5.29.19': {
				let ca = false;
				let pathLen: number | undefined;
				for (const c of v.children) {
					if (isUniversal(c, U.BOOLEAN)) ca = readBoolean(c);
					else if (isUniversal(c, U.INTEGER)) pathLen = readSmallInt(c);
				}
				ext.lines = [
					`CA: ${ca ? 'TRUE' : 'FALSE'}${pathLen !== undefined ? `, pathLen: ${pathLen}` : ''}`
				];
				apply = (c) => (c.basicConstraints = { ca, pathLen });
				break;
			}
			case '2.5.29.14': {
				const id = colonHex(content(v));
				ext.lines = [id];
				apply = (c) => (c.subjectKeyId = id);
				break;
			}
			case '2.5.29.35': {
				let id: string | undefined;
				for (const c of v.children) {
					if (isContext(c, 0)) {
						id = colonHex(content(c));
						ext.lines.push(`keyid: ${id}`);
					} else if (isContext(c, 1))
						ext.lines.push(`issuer: ${parseGeneralNames(c).map(gnText).join(', ')}`);
					else if (isContext(c, 2)) ext.lines.push(`serial: ${hex(content(c))}`);
				}
				apply = (c) => (c.authorityKeyId = id);
				break;
			}
			case '2.5.29.31': {
				const urls: string[] = [];
				for (const dp of v.children) {
					const dpn = dp.children.find((c) => isContext(c, 0));
					const full = dpn?.children.find((c) => isContext(c, 0));
					if (full)
						for (const g of parseGeneralNames(full))
							urls.push(g.type === 'URI' ? g.value : gnText(g));
					const issuer = dp.children.find((c) => isContext(c, 2));
					if (issuer)
						ext.lines.push(`CRL issuer: ${parseGeneralNames(issuer).map(gnText).join(', ')}`);
				}
				ext.lines.unshift(...urls);
				apply = (c) => (c.crlDistributionPoints = urls);
				break;
			}
			case '1.3.6.1.5.5.7.1.1':
			case '1.3.6.1.5.5.7.1.11': {
				const ocsp: string[] = [];
				const caIssuers: string[] = [];
				for (const ad of v.children) {
					const method = readOid(ad.children[0]);
					const loc = parseGeneralName(ad.children[1]);
					const val = loc.type === 'URI' ? loc.value : gnText(loc);
					if (method === '1.3.6.1.5.5.7.48.1') {
						ocsp.push(val);
						ext.lines.push(`OCSP: ${val}`);
					} else if (method === '1.3.6.1.5.5.7.48.2') {
						caIssuers.push(val);
						ext.lines.push(`CA issuers: ${val}`);
					} else ext.lines.push(`${method}: ${val}`);
				}
				if (oid === '1.3.6.1.5.5.7.1.1')
					apply = (c) => {
						c.ocsp = ocsp;
						c.caIssuers = caIssuers;
					};
				break;
			}
			case '2.5.29.32': {
				const ids = v.children.map((p) => readOid(p.children[0]));
				ext.lines = ids.map((id) => (policyNames[id] ? `${id} (${policyNames[id]})` : id));
				apply = (c) => (c.policies = ids);
				break;
			}
			default:
				ext.lines = [`${content(octets).length} bytes, not decoded`];
		}
	} catch {
		ext.lines = [`${content(octets).length} bytes, could not decode`];
	}
	return { ext, apply };
}

function baseCert(): Partial<ParsedCertificate> {
	return {
		san: [],
		keyUsage: [],
		extKeyUsage: [],
		crlDistributionPoints: [],
		ocsp: [],
		caIssuers: [],
		policies: []
	};
}

export function parseCertificate(der: Uint8Array): ParsedCertificate {
	const root = parseDer(der);
	need(root, U.SEQUENCE, 'a Certificate (SEQUENCE)');
	if (root.children.length !== 3)
		throw new Error('A certificate has three parts: TBS, algorithm, signature');
	const tbs = need(root.children[0], U.SEQUENCE, 'TBSCertificate');
	const f = tbs.children;
	let i = 0;
	let version = 1;
	if (f[i] && isContext(f[i], 0)) {
		version = readSmallInt(f[i].children[0]) + 1;
		i++;
	}
	const serial = readIntegerHex(need(f[i++], U.INTEGER, 'the serial number'));
	i++; // inner signature AlgorithmIdentifier; the outer one is reported.
	const issuer = parseName(f[i++]);
	const validity = need(f[i++], U.SEQUENCE, 'Validity');
	const notBefore = readTime(validity.children[0]);
	const notAfter = readTime(validity.children[1]);
	const subject = parseName(f[i++]);
	const publicKey = parseSpki(f[i++]);
	const out = baseCert();
	const extensions: Extension[] = [];
	for (; i < f.length; i++) {
		if (isContext(f[i], 3)) {
			const seq = need(f[i].children[0], U.SEQUENCE, 'Extensions');
			for (const e of seq.children) {
				const r = parseExtension(e);
				extensions.push(r.ext);
				r.apply(out);
			}
		}
	}
	const signatureAlgorithm = parseAlgorithm(root.children[1]);
	return {
		...(out as ParsedCertificate),
		kind: 'certificate',
		version,
		serial,
		issuer,
		notBefore,
		notAfter,
		subject,
		publicKey,
		signatureAlgorithm,
		extensions,
		der,
		selfIssued: dnEqual(subject, issuer)
	};
}

export function parseCsr(der: Uint8Array): ParsedCsr {
	const root = parseDer(der);
	need(root, U.SEQUENCE, 'a CertificationRequest (SEQUENCE)');
	const info = need(root.children[0], U.SEQUENCE, 'CertificationRequestInfo');
	const version = readSmallInt(need(info.children[0], U.INTEGER, 'the CSR version')) + 1;
	const subject = parseName(info.children[1]);
	const publicKey = parseSpki(info.children[2]);
	const out = baseCert();
	const extensions: Extension[] = [];
	const attrs = info.children[3];
	if (attrs && isContext(attrs, 0)) {
		for (const a of attrs.children) {
			const oid = readOid(a.children[0]);
			// PKCS#9 extensionRequest
			if (oid === '1.2.840.113549.1.9.14') {
				const seq = a.children[1]?.children[0];
				for (const e of seq?.children ?? []) {
					const r = parseExtension(e);
					extensions.push(r.ext);
					r.apply(out);
				}
			}
		}
	}
	return {
		kind: 'csr',
		version,
		subject,
		publicKey,
		signatureAlgorithm: parseAlgorithm(root.children[1]),
		extensions,
		san: out.san ?? [],
		der
	};
}

function normDn(d: Dn): string {
	return d.parts
		.map((p) => `${p.oid}=${p.value.trim().replace(/\s+/g, ' ').toLowerCase()}`)
		.join('|');
}

/** Names match byte for byte, or after the RFC 5280 style case and space folding. */
export function dnEqual(a: Dn, b: Dn): boolean {
	if (a.der.length === b.der.length && a.der.every((x, i) => x === b.der[i])) return true;
	return normDn(a) === normDn(b);
}
