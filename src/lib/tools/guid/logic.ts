/**
 * GUIDs / UUIDs and the Active Directory objectGUID byte order.
 *
 * AD stores objectGUID as the 16 bytes of the Windows GUID struct: Data1 (32-bit), Data2 and
 * Data3 (16-bit) little-endian, Data4 as 8 plain bytes. The string form writes all fields
 * big-endian, so the first three groups appear byte-swapped in hex dumps. (Microsoft Learn,
 * "GUID structure" and "Using objectGUID to Bind to an Object"; RFC 9562 for versions/variants.)
 */
import { formatIso, uuidTime } from '../windows-time/logic';
import { bytesToBase64, hexBytes, parseBytes, toHex, toLdapEscaped } from '../sid/logic';

const GUID_RE =
	/^(?:urn:uuid:)?\{?([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})\}?$/i;

/** Swaps between RFC (string) byte order and the Windows/AD in-memory order. Its own inverse. */
export function swapEndian(b: Uint8Array): Uint8Array {
	if (b.length !== 16) throw new Error(`A GUID is 16 bytes, got ${b.length}`);
	const o = new Uint8Array(16);
	o.set([b[3], b[2], b[1], b[0], b[5], b[4], b[7], b[6]]);
	o.set(b.subarray(8), 8);
	return o;
}

export function bytesToGuid(rfc: Uint8Array): string {
	const h = toHex(rfc);
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export type GuidInput = 'string' | 'ad-hex' | 'rfc-hex' | 'escaped' | 'base64';

export interface Parsed {
	/** Bytes in string (RFC 9562, big-endian) order */
	rfc: Uint8Array;
	from: GuidInput;
}

/**
 * Reads a GUID string (dashes, braces, urn:uuid:), 32 hex digits, LDAP escaped bytes or Base64.
 * Plain hex and binary forms are taken as AD byte order unless `plainHex` is 'rfc'.
 */
export function parseGuid(raw: string, plainHex: 'ad' | 'rfc' = 'ad'): Parsed {
	const t = raw.trim();
	if (!t) throw new Error('Enter a GUID');
	const m = GUID_RE.exec(t);
	if (m) return { rfc: hexBytes(m.slice(1).join('').toLowerCase()), from: 'string' };
	if (/^[0-9a-f-]{32,36}$/i.test(t) && t.includes('-'))
		throw new Error('Dashes in the wrong place. A GUID is 8-4-4-4-12 hex digits');
	const h = t.replace(/^0x/i, '').replace(/\s/g, '');
	if (/^[0-9a-f]{32}$/i.test(h)) {
		const b = hexBytes(h);
		return plainHex === 'rfc'
			? { rfc: b, from: 'rfc-hex' }
			: { rfc: swapEndian(b), from: 'ad-hex' };
	}
	const { bytes, format } = parseBytes(t);
	if (bytes.length !== 16) throw new Error(`A GUID is 16 bytes, this decodes to ${bytes.length}`);
	if (format === 'hex')
		return plainHex === 'rfc'
			? { rfc: bytes, from: 'rfc-hex' }
			: { rfc: swapEndian(bytes), from: 'ad-hex' };
	return { rfc: swapEndian(bytes), from: format };
}

export interface Info {
	guid: string;
	upperBraced: string;
	adHex: string;
	base64: string;
	ldapFilter: string;
	bindDn: string;
	urn: string;
	version: number;
	variant: string;
	special?: string;
	time?: string;
}

export function variantName(b8: number): string {
	if ((b8 & 0x80) === 0) return 'NCS (reserved, backward compatibility)';
	if ((b8 & 0xc0) === 0x80) return 'RFC 9562 (formerly RFC 4122)';
	if ((b8 & 0xe0) === 0xc0) return 'Microsoft (reserved, old COM GUIDs)';
	return 'Reserved for future use';
}

export function info(rfc: Uint8Array): Info {
	const guid = bytesToGuid(rfc);
	const ad = swapEndian(rfc);
	const out: Info = {
		guid,
		upperBraced: `{${guid.toUpperCase()}}`,
		adHex: toHex(ad),
		base64: bytesToBase64(ad),
		ldapFilter: `(objectGUID=${toLdapEscaped(ad)})`,
		bindDn: `<GUID=${guid}>`,
		urn: `urn:uuid:${guid}`,
		version: rfc[6] >> 4,
		variant: variantName(rfc[8])
	};
	if (rfc.every((b) => b === 0)) out.special = 'Nil UUID';
	else if (rfc.every((b) => b === 0xff)) out.special = 'Max UUID (RFC 9562)';
	if ((rfc[8] & 0xc0) === 0x80 && [1, 6, 7].includes(out.version)) {
		out.time = formatIso(uuidTime(guid).ns);
	}
	return out;
}

export const versionName: Record<number, string> = {
	1: 'time and node (MAC)',
	2: 'DCE security',
	3: 'name based, MD5',
	4: 'random',
	5: 'name based, SHA-1',
	6: 'reordered time',
	7: 'Unix time and random',
	8: 'custom'
};

type Rand = (n: number) => Uint8Array;
const cryptoRand: Rand = (n) => crypto.getRandomValues(new Uint8Array(n));

export function v4(rand: Rand = cryptoRand): string {
	const b = rand(16);
	b[6] = (b[6] & 0x0f) | 0x40;
	b[8] = (b[8] & 0x3f) | 0x80;
	return bytesToGuid(b);
}

/** RFC 9562 UUIDv7: 48-bit Unix milliseconds, version, then random bits. */
export function v7(ms: number = Date.now(), rand: Rand = cryptoRand): string {
	const b = rand(16);
	let t = BigInt(Math.floor(ms));
	for (let i = 5; i >= 0; i--) {
		b[i] = Number(t & 0xffn);
		t >>= 8n;
	}
	b[6] = (b[6] & 0x0f) | 0x70;
	b[8] = (b[8] & 0x3f) | 0x80;
	return bytesToGuid(b);
}

export function looksLikeGuid(s: string): number {
	const t = s.trim();
	if (/^objectGUID::\s*\S{22}==$/i.test(t)) return 0.95;
	if (GUID_RE.test(t)) return 0.8;
	return 0;
}
