import { hex } from './asn1';
import {
	dnEqual,
	parseCertificate,
	parseCsr,
	type ParsedCertificate,
	type ParsedCsr
} from './x509';

export { dnEqual, formatIPv6, gnText } from './x509';
export type { Dn, Extension, GeneralName, ParsedCertificate, ParsedCsr } from './x509';

export type Parsed = ParsedCertificate | ParsedCsr;

export interface DecodeItem {
	/** Position in the pasted input, 1-based. */
	index: number;
	label: string;
	parsed?: Parsed;
	error?: string;
}

export interface DecodeResult {
	items: DecodeItem[];
	/** Set when the input contains a private key. Nothing is parsed then. */
	privateKey?: string;
}

const PEM_RE = /-----BEGIN ([A-Z0-9 #]+)-----([\s\S]*?)-----END \1-----/g;
const PRIVATE_RE = /-----BEGIN ([A-Z0-9 ]*PRIVATE KEY[A-Z ]*)-----/;

function b64ToBytes(s: string): Uint8Array {
	const clean = s.replace(/\s+/g, '');
	if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) throw new Error('The body is not valid Base64');
	const bin = atob(clean);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

/** Strips RFC 1421 style headers ("Proc-Type: ...") that some tools put inside PEM bodies. */
function pemBody(body: string): string {
	const parts = body.split(/\r?\n\r?\n/);
	return parts.length > 1 && /:/.test(parts[0]) ? parts.slice(1).join('\n') : body;
}

function parseAny(der: Uint8Array, hint?: 'certificate' | 'csr'): Parsed {
	if (hint === 'csr') return parseCsr(der);
	if (hint === 'certificate') return parseCertificate(der);
	try {
		return parseCertificate(der);
	} catch (e) {
		try {
			return parseCsr(der);
		} catch {
			throw e;
		}
	}
}

/**
 * Splits pasted text into PEM blocks (or one bare Base64 DER blob) and decodes each.
 * If any private key is present the whole input is refused without decoding it.
 */
export function decodeInput(input: string): DecodeResult {
	const text = input.trim();
	if (!text) return { items: [] };
	const priv = text.match(PRIVATE_RE) ?? text.match(/-----BEGIN PGP PRIVATE KEY BLOCK-----/);
	if (priv) return { items: [], privateKey: priv[1] ?? 'PGP PRIVATE KEY BLOCK' };

	const items: DecodeItem[] = [];
	const blocks = [...text.matchAll(PEM_RE)];
	if (blocks.length === 0) {
		if (/-----BEGIN /.test(text)) {
			return {
				items: [{ index: 1, label: 'PEM', error: 'PEM block without a matching END line' }]
			};
		}
		try {
			const der = b64ToBytes(text);
			const parsed = parseAny(der);
			items.push({ index: 1, label: 'Base64 DER', parsed });
		} catch (e) {
			items.push({ index: 1, label: 'Base64 DER', error: (e as Error).message });
		}
		return { items };
	}
	blocks.forEach((m, k) => {
		const type = m[1];
		const item: DecodeItem = { index: k + 1, label: type };
		try {
			const der = b64ToBytes(pemBody(m[2]));
			if (type === 'CERTIFICATE' || type === 'X509 CERTIFICATE')
				item.parsed = parseAny(der, 'certificate');
			else if (type === 'TRUSTED CERTIFICATE') {
				// OpenSSL appends trust settings after the certificate; parse just the first element.
				const len = derElementLength(der);
				item.parsed = parseCertificate(der.subarray(0, len));
			} else if (type === 'CERTIFICATE REQUEST' || type === 'NEW CERTIFICATE REQUEST')
				item.parsed = parseAny(der, 'csr');
			else item.error = `${type} is not a certificate or certificate request`;
		} catch (e) {
			item.error = (e as Error).message;
		}
		items.push(item);
	});
	return { items };
}

function derElementLength(b: Uint8Array): number {
	let p = 1;
	let len = b[p++];
	if (len & 0x80) {
		const n = len & 0x7f;
		len = 0;
		for (let i = 0; i < n; i++) len = len * 256 + b[p++];
	}
	return p + len;
}

export interface Validity {
	state: 'valid' | 'expired' | 'notyet';
	text: string;
}

const DAY = 86_400_000;

export function validityStatus(notBefore: number, notAfter: number, now: number): Validity {
	if (now < notBefore) {
		const d = Math.ceil((notBefore - now) / DAY);
		return { state: 'notyet', text: `Not yet valid, starts in ${d} day${d === 1 ? '' : 's'}` };
	}
	if (now > notAfter) {
		const d = Math.floor((now - notAfter) / DAY);
		return {
			state: 'expired',
			text: d === 0 ? 'Expired today' : `Expired ${d} day${d === 1 ? '' : 's'} ago`
		};
	}
	const d = Math.floor((notAfter - now) / DAY);
	return { state: 'valid', text: `Valid for ${d} more day${d === 1 ? '' : 's'}` };
}

export function formatTime(ms: number): string {
	return new Date(ms).toISOString().replace('.000Z', 'Z');
}

export interface ChainLink {
	from: number;
	to: number;
	nameOk: boolean;
	/** undefined when either key identifier is missing. */
	keyIdOk?: boolean;
}

export interface ChainReport {
	ok: boolean;
	links: ChainLink[];
	message: string;
}

function links(certs: ParsedCertificate[], idx: number[]): ChainLink[] {
	const out: ChainLink[] = [];
	for (let k = 0; k + 1 < certs.length; k++) {
		const a = certs[k];
		const b = certs[k + 1];
		const keyIdOk =
			a.authorityKeyId && b.subjectKeyId ? a.authorityKeyId === b.subjectKeyId : undefined;
		out.push({ from: idx[k], to: idx[k + 1], nameOk: dnEqual(a.issuer, b.subject), keyIdOk });
	}
	return out;
}

/**
 * Checks that each certificate was issued by the next one: issuer DN equals the next subject DN,
 * and the Authority Key Identifier equals the next Subject Key Identifier when both are present.
 * Signatures are not verified.
 */
export function checkChain(certs: ParsedCertificate[], positions?: number[]): ChainReport | null {
	if (certs.length < 2) return null;
	const idx = positions ?? certs.map((_, i) => i + 1);
	const l = links(certs, idx);
	const broken = l.filter((x) => !x.nameOk || x.keyIdOk === false);
	if (broken.length === 0) return { ok: true, links: l, message: 'Chain order looks correct' };
	const reversed = links([...certs].reverse(), [...idx].reverse());
	if (reversed.every((x) => x.nameOk && x.keyIdOk !== false)) {
		return {
			ok: false,
			links: l,
			message: 'The chain is in reverse order. Servers should send the leaf first, then each issuer'
		};
	}
	const parts = broken.map((x) => {
		const why = !x.nameOk
			? 'issuer DN does not match the next subject DN'
			: 'AKI does not match the next SKI';
		return `#${x.from} to #${x.to}: ${why}`;
	});
	return { ok: false, links: l, message: `Broken link ${parts.join('; ')}` };
}

export async function fingerprint(der: Uint8Array, alg: 'SHA-1' | 'SHA-256'): Promise<string> {
	const d = new Uint8Array(await crypto.subtle.digest(alg, der as BufferSource));
	return hex(d, ':').toUpperCase();
}

export function serialText(hexSerial: string): string {
	const s = hexSerial.length % 2 ? `0${hexSerial}` : hexSerial;
	return s.match(/../g)!.join(':');
}

export function keyText(p: Parsed['publicKey']): string {
	if (p.algorithm === 'EC') return `EC ${p.curve}${p.bits ? ` (${p.bits} bit)` : ''}`;
	if (p.algorithm === 'RSA' || p.algorithm === 'RSASSA-PSS')
		return `${p.algorithm} ${p.bits} bit, e=${p.exponent}`;
	return p.bits ? `${p.algorithm} (${p.bits} bit)` : p.algorithm;
}

/** Intake detection: PEM certificates and CSRs only. */
export function looksLikeCertificate(s: string): number {
	return /-----BEGIN (?:X509 |TRUSTED )?CERTIFICATE-----|CERTIFICATE REQUEST/.test(s) ? 0.99 : 0;
}
