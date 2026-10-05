/**
 * Kerberos ticket flags and encryption types.
 *
 * Sources:
 * - RFC 4120 section 5.3 (TicketFlags) and 5.4.1 (KDCOptions): a KerberosFlags BIT STRING,
 *   bit 0 is the most significant bit, so bit n has mask 0x80000000 >>> n.
 *   Bits 0 to 13 come from RFC 4120. Bit 14 anonymous is RFC 8062 (was RFC 6112),
 *   bit 15 name-canonicalize is RFC 6806 section 5.
 * - Windows klist prints "Ticket Flags 0x40e10000 -> forwardable renewable initial pre_authent
 *   name_canonicalize" (Microsoft Learn, klist command reference).
 * - MIT klist -f letters: MIT Kerberos documentation, klist(1).
 * - Encryption type numbers: IANA "Kerberos Parameters" registry, RFC 3961 (DES, 3DES),
 *   RFC 3962 (AES SHA-1), RFC 4757 (RC4-HMAC), RFC 6803 (Camellia), RFC 8009 (AES SHA-2).
 *   Deprecations: RFC 6649 (DES), RFC 8429 (3DES and RC4). Negative numbers are Microsoft
 *   private values from ntsecapi.h (KERB_ETYPE_RC4_*).
 */

export interface TicketFlag {
	bit: number;
	/** RFC name */
	name: string;
	/** Windows klist spelling */
	klist: string;
	/** MIT klist -f letter */
	mit?: string;
	desc: string;
	note?: string;
}

export const TICKET_FLAGS: TicketFlag[] = [
	{ bit: 0, name: 'reserved', klist: 'reserved', desc: 'Reserved for future expansion' },
	{
		bit: 1,
		name: 'forwardable',
		klist: 'forwardable',
		mit: 'F',
		desc: 'A new TGT with different addresses may be issued from this one'
	},
	{
		bit: 2,
		name: 'forwarded',
		klist: 'forwarded',
		mit: 'f',
		desc: 'This ticket was forwarded or issued from a forwarded TGT'
	},
	{
		bit: 3,
		name: 'proxiable',
		klist: 'proxiable',
		mit: 'P',
		desc: 'Service tickets with different addresses may be issued from this one'
	},
	{ bit: 4, name: 'proxy', klist: 'proxy', mit: 'p', desc: 'This ticket is a proxy' },
	{
		bit: 5,
		name: 'may-postdate',
		klist: 'may_postdate',
		mit: 'D',
		desc: 'Postdated tickets may be issued from this TGT'
	},
	{
		bit: 6,
		name: 'postdated',
		klist: 'postdated',
		mit: 'd',
		desc: 'This ticket has been postdated'
	},
	{
		bit: 7,
		name: 'invalid',
		klist: 'invalid',
		mit: 'i',
		desc: 'Not valid yet, must be validated by the KDC before use'
	},
	{
		bit: 8,
		name: 'renewable',
		klist: 'renewable',
		mit: 'R',
		desc: 'Can be renewed up to its renew-till time'
	},
	{
		bit: 9,
		name: 'initial',
		klist: 'initial',
		mit: 'I',
		desc: 'Issued by the AS exchange, not from a TGT'
	},
	{
		bit: 10,
		name: 'pre-authent',
		klist: 'pre_authent',
		mit: 'A',
		desc: 'The client was pre-authenticated'
	},
	{
		bit: 11,
		name: 'hw-authent',
		klist: 'hw_authent',
		mit: 'H',
		desc: 'Pre-authentication used hardware held by the client'
	},
	{
		bit: 12,
		name: 'transited-policy-checked',
		klist: 'transited_policy_checked',
		mit: 'T',
		desc: 'The KDC checked the transited realms'
	},
	{
		bit: 13,
		name: 'ok-as-delegate',
		klist: 'ok_as_delegate',
		mit: 'O',
		desc: 'Realm policy trusts the server for delegation',
		note: 'The client may forward its TGT to this service (unconstrained delegation target).'
	},
	{
		bit: 14,
		name: 'anonymous',
		klist: 'anonymous',
		mit: 'a',
		desc: 'Anonymous ticket (RFC 8062)'
	},
	{
		bit: 15,
		name: 'name-canonicalize',
		klist: 'name_canonicalize',
		desc: 'The KDC canonicalised the principal name (RFC 6806)'
	}
];

export const maskOf = (bit: number) => (0x80000000 >>> bit) >>> 0;

/** Reads "0x40e10000", "40e10000", "1088487424" and a klist line containing "0x...". */
export function parseFlags(s: string): number {
	const t = s.trim();
	if (!t) throw new Error('Enter ticket flags');
	const inLine = /0x([0-9a-f]{1,8})\b/i.exec(t);
	let v: number;
	if (inLine) v = parseInt(inLine[1], 16);
	else if (/^[0-9a-f]{8}$/i.test(t)) v = parseInt(t, 16);
	else if (/^\d+$/.test(t)) {
		v = Number(t);
		if (v > 0xffffffff) throw new Error('Ticket flags are 32 bits');
	} else if (/^[0-9a-f]+$/i.test(t) && /[a-f]/i.test(t)) v = parseInt(t, 16);
	else throw new Error(`"${t}" is not a flags value. Example: 0x40e10000`);
	if (v > 0xffffffff) throw new Error('Ticket flags are 32 bits');
	return v >>> 0;
}

export interface DecodedFlags {
	value: number;
	hex: string;
	set: TicketFlag[];
	/** Bits set that have no defined meaning */
	unknown: number[];
	klist: string;
	mit: string;
}

export function decodeFlags(value: number): DecodedFlags {
	const v = value >>> 0;
	const set = TICKET_FLAGS.filter((f) => v & maskOf(f.bit));
	const unknown: number[] = [];
	for (let b = 16; b < 32; b++) if (v & maskOf(b)) unknown.push(b);
	const hex = '0x' + v.toString(16).padStart(8, '0');
	return {
		value: v,
		hex,
		set,
		unknown,
		klist: `Ticket Flags ${hex} -> ${set.map((f) => f.klist).join(' ')}`.trimEnd(),
		mit: set.map((f) => f.mit ?? '').join('')
	};
}

export function encodeFlags(bits: number[]): number {
	return bits.reduce((v, b) => (v | maskOf(b)) >>> 0, 0);
}

// ---------- encryption types ----------

export type Strength = 'broken' | 'weak' | 'legacy' | 'good';

export interface Etype {
	id: number;
	name: string;
	/** Windows event log / klist spelling where it differs */
	windows?: string;
	ref: string;
	strength: Strength;
	note: string;
}

export const ETYPES: Etype[] = [
	{
		id: 1,
		name: 'des-cbc-crc',
		windows: 'DES-CBC-CRC',
		ref: 'RFC 3961, deprecated by RFC 6649',
		strength: 'broken',
		note: '56-bit DES, brute-forceable. Off by default since Windows 7 and Server 2008 R2.'
	},
	{
		id: 2,
		name: 'des-cbc-md4',
		ref: 'RFC 3961, deprecated by RFC 6649',
		strength: 'broken',
		note: '56-bit DES.'
	},
	{
		id: 3,
		name: 'des-cbc-md5',
		windows: 'DES-CBC-MD5',
		ref: 'RFC 3961, deprecated by RFC 6649',
		strength: 'broken',
		note: '56-bit DES. Off by default since Windows 7 and Server 2008 R2.'
	},
	{
		id: 16,
		name: 'des3-cbc-sha1-kd',
		ref: 'RFC 3961, deprecated by RFC 8429',
		strength: 'legacy',
		note: 'Triple DES. Not supported by Windows.'
	},
	{
		id: 17,
		name: 'aes128-cts-hmac-sha1-96',
		windows: 'AES128-CTS-HMAC-SHA1-96',
		ref: 'RFC 3962',
		strength: 'good',
		note: 'AES with a salted PBKDF2 key. Fine.'
	},
	{
		id: 18,
		name: 'aes256-cts-hmac-sha1-96',
		windows: 'AES256-CTS-HMAC-SHA1-96',
		ref: 'RFC 3962',
		strength: 'good',
		note: 'The normal choice in Active Directory today.'
	},
	{
		id: 19,
		name: 'aes128-cts-hmac-sha256-128',
		ref: 'RFC 8009',
		strength: 'good',
		note: 'AES with SHA-2. MIT and Heimdal; not used by Windows.'
	},
	{
		id: 20,
		name: 'aes256-cts-hmac-sha384-192',
		ref: 'RFC 8009',
		strength: 'good',
		note: 'AES with SHA-2. MIT and Heimdal; not used by Windows.'
	},
	{
		id: 23,
		name: 'rc4-hmac',
		windows: 'RC4-HMAC (arcfour-hmac-md5)',
		ref: 'RFC 4757, deprecated by RFC 8429',
		strength: 'weak',
		note: 'The key is the NT hash, unsalted. RC4 service tickets are what Kerberoasting cracks fastest; RC4 TGT requests where AES is expected are a downgrade sign.'
	},
	{
		id: 24,
		name: 'rc4-hmac-exp',
		ref: 'RFC 4757',
		strength: 'broken',
		note: '40-bit export variant of RC4-HMAC.'
	},
	{
		id: 25,
		name: 'camellia128-cts-cmac',
		ref: 'RFC 6803',
		strength: 'good',
		note: 'Camellia. MIT Kerberos; not used by Windows.'
	},
	{
		id: 26,
		name: 'camellia256-cts-cmac',
		ref: 'RFC 6803',
		strength: 'good',
		note: 'Camellia. MIT Kerberos; not used by Windows.'
	},
	{
		id: -128,
		name: 'KERB_ETYPE_RC4_MD4',
		ref: 'Microsoft ntsecapi.h',
		strength: 'broken',
		note: 'Old Microsoft private RC4 type.'
	},
	{
		id: -133,
		name: 'KERB_ETYPE_RC4_HMAC_OLD',
		ref: 'Microsoft ntsecapi.h',
		strength: 'broken',
		note: 'Pre-standard Microsoft RC4-HMAC from Windows 2000 betas.'
	},
	{
		id: -135,
		name: 'KERB_ETYPE_RC4_HMAC_OLD_EXP',
		ref: 'Microsoft ntsecapi.h',
		strength: 'broken',
		note: 'Export (40-bit) variant of the old RC4-HMAC.'
	}
];

export interface EtypeLookup {
	etype?: Etype;
	id: number;
	/** The event log value 0xffffffff means no ticket was issued */
	failure?: boolean;
}

/**
 * Reads an encryption type number: "23", "0x17", "-135", "0xffffff79", or a name such as
 * "rc4-hmac" or "AES256-CTS-HMAC-SHA1-96".
 */
export function lookupEtype(s: string): EtypeLookup {
	const t = s.trim();
	if (!t) throw new Error('Enter an encryption type');
	let id: number;
	if (/^0x[0-9a-f]{1,8}$/i.test(t)) {
		id = parseInt(t.slice(2), 16) | 0;
		if (t.toLowerCase() === '0xffffffff') return { id: -1, failure: true };
	} else if (/^-?\d+$/.test(t)) id = Number(t);
	else {
		const k = t.toLowerCase().replace(/_/g, '-');
		const e = ETYPES.find(
			(x) => x.name.toLowerCase() === k || (x.windows ?? '').toLowerCase().startsWith(k)
		);
		if (!e) throw new Error(`Unknown encryption type "${t}"`);
		return { etype: e, id: e.id };
	}
	if (id === -1) return { id, failure: true };
	return { etype: ETYPES.find((e) => e.id === id), id };
}

export const STRENGTH_TEXT: Record<Strength, string> = {
	broken: 'Broken',
	weak: 'Weak',
	legacy: 'Legacy',
	good: 'Strong'
};

/** Paste recognition: a klist "Ticket Flags 0x..." line. A bare hex number is left to other tools. */
export function looksLikeKlist(s: string): number {
	return /Ticket Flags\s+0x[0-9a-f]{1,8}/i.test(s) && s.length < 4000 ? 0.9 : 0;
}
