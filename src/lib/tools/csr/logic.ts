/**
 * PKCS#10 certification request (RFC 2986) built in the browser with WebCrypto.
 * The key pair is generated here, the request is signed with it, and both are returned as PEM.
 * Nothing is sent anywhere and nothing is stored.
 */
import {
	bitString,
	concat,
	context,
	ia5String,
	nullValue,
	octetString,
	oid,
	printableString,
	sequence,
	setOf,
	smallInteger,
	utf8String,
	integer
} from './der';

export type KeyAlg = 'rsa-2048' | 'rsa-3072' | 'rsa-4096' | 'p-256' | 'p-384' | 'ed25519';

export interface AlgInfo {
	id: KeyAlg;
	label: string;
	/** WebCrypto key generation parameters. */
	gen: RsaHashedKeyGenParams | EcKeyGenParams | { name: 'Ed25519' };
	/** WebCrypto sign parameters. */
	sign: AlgorithmIdentifier | EcdsaParams;
	/** DER AlgorithmIdentifier for the CSR signature. */
	sigAlgDer: () => Uint8Array;
	sigAlgName: string;
	/** OpenSSL -newkey argument and extra options. */
	openssl: string;
}

const e65537 = Uint8Array.of(1, 0, 1);

function rsa(bits: 2048 | 3072 | 4096): AlgInfo {
	return {
		id: `rsa-${bits}`,
		label: `RSA ${bits}`,
		gen: {
			name: 'RSASSA-PKCS1-v1_5',
			modulusLength: bits,
			publicExponent: e65537,
			hash: 'SHA-256'
		},
		sign: { name: 'RSASSA-PKCS1-v1_5' },
		// RFC 4055 5: sha256WithRSAEncryption, parameters NULL.
		sigAlgDer: () => sequence(oid('1.2.840.113549.1.1.11'), nullValue()),
		sigAlgName: 'sha256WithRSAEncryption',
		openssl: `-newkey rsa:${bits} -sha256`
	};
}

export const algorithms: AlgInfo[] = [
	rsa(2048),
	rsa(3072),
	rsa(4096),
	{
		id: 'p-256',
		label: 'ECDSA P-256',
		gen: { name: 'ECDSA', namedCurve: 'P-256' },
		sign: { name: 'ECDSA', hash: 'SHA-256' },
		// RFC 5758 3.2: ecdsa-with-SHA256, parameters absent.
		sigAlgDer: () => sequence(oid('1.2.840.10045.4.3.2')),
		sigAlgName: 'ecdsa-with-SHA256',
		openssl: '-newkey ec -pkeyopt ec_paramgen_curve:P-256 -sha256'
	},
	{
		id: 'p-384',
		label: 'ECDSA P-384',
		gen: { name: 'ECDSA', namedCurve: 'P-384' },
		sign: { name: 'ECDSA', hash: 'SHA-384' },
		sigAlgDer: () => sequence(oid('1.2.840.10045.4.3.3')),
		sigAlgName: 'ecdsa-with-SHA384',
		openssl: '-newkey ec -pkeyopt ec_paramgen_curve:P-384 -sha384'
	},
	{
		id: 'ed25519',
		label: 'Ed25519',
		gen: { name: 'Ed25519' },
		sign: { name: 'Ed25519' },
		// RFC 8410 3: id-Ed25519, parameters absent.
		sigAlgDer: () => sequence(oid('1.3.101.112')),
		sigAlgName: 'Ed25519',
		openssl: '-newkey ed25519'
	}
];

export function algInfo(id: KeyAlg): AlgInfo {
	const a = algorithms.find((x) => x.id === id);
	if (!a) throw new Error(`Unknown key type ${id}`);
	return a;
}

/** Ed25519 in WebCrypto is recent (Chrome 137, Firefox 129, Safari 17). Probe by generating a key. */
export async function supportsEd25519(): Promise<boolean> {
	try {
		const k = await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify']);
		return 'privateKey' in k;
	} catch {
		return false;
	}
}

// ---------------------------------------------------------------- subject

export interface Subject {
	CN: string;
	O: string;
	OU: string;
	L: string;
	ST: string;
	C: string;
	emailAddress: string;
}

export const emptySubject = (): Subject => ({
	CN: '',
	O: '',
	OU: '',
	L: '',
	ST: '',
	C: '',
	emailAddress: ''
});

interface SubjectField {
	key: keyof Subject;
	oid: string;
	label: string;
	/** Upper bound from RFC 5280 appendix A.1 (ub-* values). */
	max: number;
}

/** Encoding order: the usual most-general-first order that OpenSSL configs use. */
export const subjectFields: SubjectField[] = [
	{ key: 'C', oid: '2.5.4.6', label: 'Country (C)', max: 2 },
	{ key: 'ST', oid: '2.5.4.8', label: 'State or province (ST)', max: 128 },
	{ key: 'L', oid: '2.5.4.7', label: 'Locality (L)', max: 128 },
	{ key: 'O', oid: '2.5.4.10', label: 'Organization (O)', max: 64 },
	{ key: 'OU', oid: '2.5.4.11', label: 'Organizational unit (OU)', max: 64 },
	{ key: 'CN', oid: '2.5.4.3', label: 'Common name (CN)', max: 64 },
	{ key: 'emailAddress', oid: '1.2.840.113549.1.9.1', label: 'Email (emailAddress)', max: 255 }
];

// Reject control characters (C0, DEL, C1): they have no business in a name.
const CONTROL = /[\x00-\x1f\x7f-\x9f]/;

/** Validates and encodes a Name (RFC 5280 4.1.2.4). Empty fields are left out. */
export function encodeSubject(s: Subject): { der: Uint8Array; count: number } {
	const rdns: Uint8Array[] = [];
	for (const f of subjectFields) {
		const v = s[f.key].trim();
		if (!v) continue;
		if (CONTROL.test(v)) throw new Error(`${f.label} contains a control character`);
		if (f.key !== 'C' && [...v].length > f.max)
			throw new Error(`${f.label} is longer than ${f.max} characters`);
		let value: Uint8Array;
		if (f.key === 'C') {
			// X.520: CountryName is a PrintableString of exactly two letters (ISO 3166 alpha-2).
			if (!/^[A-Za-z]{2}$/.test(v)) throw new Error('Country must be a two-letter code like DK');
			value = printableString(v.toUpperCase());
		} else if (f.key === 'emailAddress') {
			// PKCS#9 (RFC 2985): emailAddress is an IA5String.
			if (!/^[^\s@]+@[^\s@]+$/.test(v)) throw new Error('Email does not look like an address');
			if (!/^[\x20-\x7e]+$/.test(v)) throw new Error('Email must be ASCII (IA5String)');
			value = ia5String(v);
		} else {
			// RFC 5280 4.1.2.6: new names should use UTF8String.
			value = utf8String(v);
		}
		rdns.push(setOf(sequence(oid(f.oid), value)));
	}
	return { der: sequence(...rdns), count: rdns.length };
}

// ---------------------------------------------------------------- subjectAltName

export type SanType = 'DNS' | 'IP' | 'email';

export interface San {
	type: SanType;
	/** Value as it goes into the request (punycode for IDNs, canonical IP text). */
	value: string;
	/** What the reader typed, when it differs. */
	input?: string;
	bytes?: Uint8Array;
}

export function parseIPv4(s: string): Uint8Array | null {
	const m = s.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
	if (!m) return null;
	const parts = m.slice(1).map((p) => {
		// Leading zeros are ambiguous (octal in some parsers): refuse them.
		if (p.length > 1 && p[0] === '0') return NaN;
		return Number(p);
	});
	if (parts.some((p) => !(p >= 0 && p <= 255))) return null;
	return Uint8Array.from(parts);
}

export function parseIPv6(input: string): Uint8Array | null {
	let s = input;
	if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1);
	if (!/^[0-9A-Fa-f:.]+$/.test(s) || !s.includes(':')) return null;
	const out = new Uint8Array(16);
	let tail: number[] = [];
	// Embedded IPv4 in the last 32 bits (RFC 4291 2.2 form 3).
	const v4m = s.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
	if (v4m) {
		const v4 = parseIPv4(v4m[2]);
		if (!v4) return null;
		tail = [(v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]];
		s = v4m[1].endsWith('::') ? v4m[1] : v4m[1].slice(0, -1);
	}
	const halves = s.split('::');
	if (halves.length > 2) return null;
	const group = (g: string) => (/^[0-9A-Fa-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN);
	const head = halves[0] ? halves[0].split(':').map(group) : [];
	const rest = halves.length === 2 && halves[1] ? halves[1].split(':').map(group) : [];
	const words = [...head];
	const back = [...rest, ...tail];
	if ([...words, ...back].some((w) => Number.isNaN(w))) return null;
	if (halves.length === 2) {
		const fill = 8 - words.length - back.length;
		// "::" stands for at least one group of zeros.
		if (fill < 1) return null;
		words.push(...new Array(fill).fill(0), ...back);
	} else {
		words.push(...back);
	}
	if (words.length !== 8) return null;
	words.forEach((w, i) => {
		out[2 * i] = w >> 8;
		out[2 * i + 1] = w & 0xff;
	});
	return out;
}

/** RFC 5952 text form, for display. */
export function formatIPv6(b: Uint8Array): string {
	const w = Array.from({ length: 8 }, (_, i) => (b[2 * i] << 8) | b[2 * i + 1]);
	let bestStart = -1;
	let bestLen = 1;
	for (let i = 0; i < 8;) {
		if (w[i] !== 0) {
			i++;
			continue;
		}
		let j = i;
		while (j < 8 && w[j] === 0) j++;
		if (j - i > bestLen) {
			bestStart = i;
			bestLen = j - i;
		}
		i = j;
	}
	const hx = (a: number[]) => a.map((x) => x.toString(16)).join(':');
	if (bestStart < 0) return hx(w);
	return `${hx(w.slice(0, bestStart))}::${hx(w.slice(bestStart + bestLen))}`;
}

/** Converts an internationalised name to its A-label (punycode) form via the URL parser (UTS #46). */
function toAscii(name: string): string {
	try {
		return new URL(`http://${name}/`).hostname;
	} catch {
		throw new Error(`"${name}" is not a valid host name`);
	}
}

function checkDns(name: string, original: string): string {
	let n = name.toLowerCase();
	let wildcard = false;
	if (n.startsWith('*.')) {
		wildcard = true;
		n = n.slice(2);
	}
	if (n.endsWith('.')) n = n.slice(0, -1);
	if (/[^\x00-\x7f]/.test(n)) n = toAscii(n);
	if (!n) throw new Error(`"${original}" is not a DNS name`);
	if (n.length > 253) throw new Error(`"${original}" is longer than 253 characters`);
	for (const label of n.split('.')) {
		if (!label) throw new Error(`"${original}" has an empty label`);
		if (label.length > 63) throw new Error(`"${original}" has a label longer than 63 characters`);
		if (label.includes('*'))
			throw new Error(`"${original}": a wildcard is only allowed as the whole leftmost label`);
		if (label.includes('_'))
			throw new Error(
				`"${original}": underscores are not allowed in certificate DNS names (CA/Browser Forum)`
			);
		if (!/^[a-z0-9-]+$/.test(label))
			throw new Error(`"${original}" contains characters not allowed in a host name`);
		if (label.startsWith('-') || label.endsWith('-'))
			throw new Error(`"${original}": a label cannot start or end with a hyphen`);
	}
	return wildcard ? `*.${n}` : n;
}

/**
 * Parses one entry per line (commas and spaces also separate). Entries may carry an explicit
 * OpenSSL-style prefix (DNS:, IP:, email:); otherwise the type is inferred.
 */
export function parseSans(text: string): San[] {
	const out: San[] = [];
	const seen = new Set<string>();
	for (const raw of text.split(/[\s,]+/)) {
		if (!raw) continue;
		const m = raw.match(/^(dns|ip|email):(.*)$/i);
		const prefix = m?.[1].toLowerCase();
		const v = m ? m[2] : raw;
		if (!v) throw new Error(`"${raw}" has no value`);
		let san: San;
		const v4 = prefix === 'dns' || prefix === 'email' ? null : parseIPv4(v);
		const v6 = v4 || prefix === 'dns' || prefix === 'email' ? null : parseIPv6(v);
		if (v4) san = { type: 'IP', value: v, bytes: v4 };
		else if (v6) san = { type: 'IP', value: formatIPv6(v6), bytes: v6 };
		else if (prefix === 'ip') throw new Error(`"${v}" is not an IPv4 or IPv6 address`);
		else if (prefix === 'email' || (!prefix && v.includes('@'))) {
			const at = v.lastIndexOf('@');
			if (at < 1 || at === v.length - 1) throw new Error(`"${v}" is not an email address`);
			if (!/^[\x21-\x7e]+$/.test(v))
				throw new Error(
					`"${v}": only ASCII addresses fit rfc822Name (internationalised mailboxes need SmtpUTF8Mailbox, not supported here)`
				);
			const domain = checkDns(v.slice(at + 1), v);
			san = { type: 'email', value: `${v.slice(0, at)}@${domain}` };
		} else {
			san = { type: 'DNS', value: checkDns(v, v) };
		}
		if (san.value !== v) san.input = v;
		const key = `${san.type}:${san.value}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(san);
	}
	return out;
}

/** GeneralNames (RFC 5280 4.2.1.6): rfc822Name [1], dNSName [2], iPAddress [7], all IMPLICIT. */
export function encodeSans(sans: San[]): Uint8Array {
	return sequence(
		...sans.map((s) => {
			if (s.type === 'IP') return context(7, s.bytes!, false);
			// IMPLICIT [1] or [2] IA5String: the content octets of the string under a context tag.
			if (!/^[\x00-\x7f]*$/.test(s.value)) throw new Error(`"${s.value}" is not ASCII`);
			return context(s.type === 'email' ? 1 : 2, new TextEncoder().encode(s.value), false);
		})
	);
}

// ---------------------------------------------------------------- request

export interface CsrInput {
	alg: KeyAlg;
	subject: Subject;
	sans: San[];
}

/** CertificationRequestInfo (RFC 2986 4.1) for a given SubjectPublicKeyInfo. */
export function buildRequestInfo(subject: Subject, sans: San[], spki: Uint8Array): Uint8Array {
	const name = encodeSubject(subject);
	if (name.count === 0 && sans.length === 0)
		throw new Error('Give at least a common name or one subject alternative name');
	const attrs: Uint8Array[] = [];
	if (sans.length) {
		// RFC 5280 4.2.1.6: with an empty subject the SAN extension must be critical.
		const critical = name.count === 0;
		const ext = sequence(
			oid('2.5.29.17'),
			...(critical ? [Uint8Array.of(0x01, 0x01, 0xff)] : []),
			octetString(encodeSans(sans))
		);
		// PKCS#9 extensionRequest (RFC 2985 5.4.2): Attribute { type, SET { Extensions } }.
		attrs.push(sequence(oid('1.2.840.113549.1.9.14'), setOf(sequence(ext))));
	}
	return sequence(
		smallInteger(0), // version v1(0)
		name.der,
		spki,
		// attributes [0] IMPLICIT SET OF Attribute: present even when empty.
		context(0, concat(attrs), true)
	);
}

/** WebCrypto ECDSA signatures are r || s (IEEE P1363). X.509 wants SEQUENCE { INTEGER r, INTEGER s }. */
export function ecdsaRawToDer(raw: Uint8Array): Uint8Array {
	if (raw.length % 2) throw new Error('Bad ECDSA signature length');
	const h = raw.length / 2;
	return sequence(integer(raw.subarray(0, h)), integer(raw.subarray(h)));
}

export function toPem(label: string, der: Uint8Array): string {
	let bin = '';
	for (const b of der) bin += String.fromCharCode(b);
	const b64 = btoa(bin);
	return `-----BEGIN ${label}-----\n${b64.match(/.{1,64}/g)!.join('\n')}\n-----END ${label}-----\n`;
}

export interface CsrResult {
	csrPem: string;
	csrDer: Uint8Array;
	keyPem: string;
}

/** Signs a request with an existing key pair. Separate from generation so it can be tested. */
export async function signRequest(
	alg: KeyAlg,
	keys: CryptoKeyPair,
	subject: Subject,
	sans: San[]
): Promise<Uint8Array> {
	const a = algInfo(alg);
	const spki = new Uint8Array(await crypto.subtle.exportKey('spki', keys.publicKey));
	const info = buildRequestInfo(subject, sans, spki);
	let sig: Uint8Array = new Uint8Array(
		await crypto.subtle.sign(a.sign, keys.privateKey, info as BufferSource)
	);
	if (a.gen.name === 'ECDSA') sig = ecdsaRawToDer(sig);
	return sequence(info, a.sigAlgDer(), bitString(sig));
}

export async function generateCsr(input: CsrInput): Promise<CsrResult> {
	const a = algInfo(input.alg);
	// Validate before spending time on key generation.
	buildRequestInfo(input.subject, input.sans, new Uint8Array([0x30, 0x00]));
	// Extractable, because the private key has to be shown once as PKCS#8.
	const keys = (await crypto.subtle.generateKey(a.gen, true, ['sign', 'verify'])) as CryptoKeyPair;
	const csrDer = await signRequest(input.alg, keys, input.subject, input.sans);
	const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', keys.privateKey));
	return {
		csrDer,
		csrPem: toPem('CERTIFICATE REQUEST', csrDer),
		keyPem: toPem('PRIVATE KEY', pkcs8)
	};
}

// ---------------------------------------------------------------- openssl equivalent

/** Quotes for a POSIX shell: single quotes, with embedded ones closed and escaped. */
export function shellQuote(s: string): string {
	return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** OpenSSL -subj syntax: /type=value, with / , + = and backslash escaped by a backslash. */
function subjArg(s: Subject): string {
	let out = '';
	for (const f of subjectFields) {
		let v = s[f.key].trim();
		if (!v) continue;
		if (f.key === 'C') v = v.toUpperCase();
		out += `/${f.key}=${v.replace(/[\\/,+=]/g, (c) => `\\${c}`)}`;
	}
	return out || '/';
}

export function opensslCommand(input: CsrInput): string {
	const a = algInfo(input.alg);
	const parts = [
		'openssl req -new',
		a.openssl,
		'-nodes -keyout key.pem -out request.csr',
		`-subj ${shellQuote(subjArg(input.subject))}`
	];
	if (Object.values(input.subject).some((v) => /[^\x00-\x7f]/.test(v))) parts.push('-utf8');
	if (input.sans.length) {
		const names = input.sans.map((s) => `${s.type}:${s.value}`).join(',');
		const critical = encodeSubject(input.subject).count === 0 ? 'critical,' : '';
		parts.push(`-addext ${shellQuote(`subjectAltName=${critical}${names}`)}`);
	}
	return parts.join(' \\\n  ');
}
