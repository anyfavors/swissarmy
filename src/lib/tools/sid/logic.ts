/**
 * Windows security identifiers (SIDs).
 *
 * Binary layout, MS-DTYP 2.4.2.2: revision (1 byte), sub-authority count (1 byte),
 * identifier authority (6 bytes, big-endian), then each sub-authority as a 32-bit little-endian
 * integer. String form, MS-DTYP 2.4.2.1: S-1-<authority>-<sub>-<sub>...
 *
 * Names: Microsoft Learn, "Well-known SIDs" (Win32 security, secauthz/well-known-sids) and
 * "Security identifiers" (Windows Server identity, well-known SIDs table), and MS-DTYP 2.4.2.4.
 */
import { base64ToBytes, bytesToBase64 } from '../base64/logic';

// ---------- byte helpers (also used by the guid tool) ----------

export function toHex(bytes: Uint8Array, sep = ''): string {
	return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(sep);
}

/** "\01\05\00..." as used in LDAP filters for binary attributes (RFC 4515). */
export function toLdapEscaped(bytes: Uint8Array): string {
	return Array.from(bytes, (b) => '\\' + b.toString(16).padStart(2, '0')).join('');
}

export { bytesToBase64 };

export type ByteFormat = 'hex' | 'escaped' | 'base64';

/**
 * Reads bytes from hex (spaces, colons, dashes allowed, optional 0x), LDAP escaped
 * (\01\05...) or Base64 (as ldapsearch prints after "attr::").
 */
export function parseBytes(raw: string): { bytes: Uint8Array; format: ByteFormat } {
	let t = raw.trim().replace(/^[A-Za-z-]+::\s*/, '');
	if (!t) throw new Error('Enter a value');
	if (/^(\\[0-9a-f]{2})+$/i.test(t.replace(/\s/g, ''))) {
		const hex = t.replace(/[\s\\]/g, '');
		return { bytes: hexBytes(hex), format: 'escaped' };
	}
	const h = t.replace(/^0x/i, '').replace(/[\s:-]/g, '');
	const marked = /[\s:-]/.test(t) || /^0x/i.test(t);
	const singleCase = h === h.toLowerCase() || h === h.toUpperCase();
	if (/^[0-9a-f]+$/i.test(h) && h.length % 2 === 0 && (marked || singleCase)) {
		return { bytes: hexBytes(h), format: 'hex' };
	}
	t = t.replace(/\s+/g, '');
	try {
		return { bytes: base64ToBytes(t), format: 'base64' };
	} catch (e) {
		throw new Error(`Not hex or Base64: ${(e as Error).message}`);
	}
}

export function hexBytes(hex: string): Uint8Array {
	if (hex.length % 2) throw new Error('Hex needs an even number of digits');
	const out = new Uint8Array(hex.length / 2);
	for (let i = 0; i < out.length; i++) {
		const v = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
		if (Number.isNaN(v)) throw new Error(`Invalid hex "${hex.slice(i * 2, i * 2 + 2)}"`);
		out[i] = v;
	}
	return out;
}

// ---------- SID ----------

export interface Sid {
	revision: number;
	authority: bigint;
	subs: number[];
}

export function parseSidString(s: string): Sid {
	const t = s.trim();
	const m = /^S-(\d+)-(0x[0-9a-f]{12}|\d+)((?:-\d+)*)$/i.exec(t);
	if (!m) throw new Error('A SID string looks like S-1-5-21-…, numbers separated by dashes');
	const revision = Number(m[1]);
	if (revision !== 1) throw new Error(`Revision ${revision}: only revision 1 SIDs exist`);
	const authority = BigInt(m[2]);
	if (authority >= 1n << 48n) throw new Error('Identifier authority is larger than 48 bits');
	const subs = m[3] ? m[3].slice(1).split('-').map(Number) : [];
	if (subs.length > 15) throw new Error(`${subs.length} sub-authorities, at most 15 are allowed`);
	subs.forEach((x, i) => {
		if (x > 0xffffffff) throw new Error(`Sub-authority ${i + 1} (${x}) is larger than 32 bits`);
	});
	return { revision, authority, subs };
}

export function sidToString(sid: Sid): string {
	const a =
		sid.authority < 1n << 32n
			? sid.authority.toString()
			: '0x' + sid.authority.toString(16).toUpperCase().padStart(12, '0');
	return ['S', sid.revision, a, ...sid.subs].join('-');
}

export function sidToBytes(sid: Sid): Uint8Array {
	const out = new Uint8Array(8 + 4 * sid.subs.length);
	out[0] = sid.revision;
	out[1] = sid.subs.length;
	for (let i = 0; i < 6; i++) out[2 + i] = Number((sid.authority >> BigInt(8 * (5 - i))) & 0xffn);
	const dv = new DataView(out.buffer);
	sid.subs.forEach((x, i) => dv.setUint32(8 + 4 * i, x, true));
	return out;
}

export function sidFromBytes(b: Uint8Array): Sid {
	if (b.length < 8) throw new Error(`${b.length} bytes is too short for a SID (at least 8)`);
	const revision = b[0];
	const count = b[1];
	if (revision !== 1) throw new Error(`First byte is ${revision}, a SID starts with revision 1`);
	if (count > 15) throw new Error(`Sub-authority count ${count} is above the maximum of 15`);
	if (b.length !== 8 + 4 * count)
		throw new Error(`${count} sub-authorities need ${8 + 4 * count} bytes, got ${b.length}`);
	let authority = 0n;
	for (let i = 2; i < 8; i++) authority = (authority << 8n) | BigInt(b[i]);
	const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
	const subs: number[] = [];
	for (let i = 0; i < count; i++) subs.push(dv.getUint32(8 + 4 * i, true));
	return { revision, authority, subs };
}

export const AUTHORITIES: Record<string, string> = {
	'0': 'Null authority',
	'1': 'World authority',
	'2': 'Local authority',
	'3': 'Creator authority',
	'4': 'Non-unique authority',
	'5': 'NT authority',
	'9': 'Resource manager authority',
	'11': 'Microsoft account authority',
	'12': 'Microsoft Entra ID (Azure AD) authority',
	'15': 'App package authority',
	'16': 'Mandatory label authority',
	'18': 'Authentication authority',
	'19': 'Process trust authority'
};

export interface WellKnown {
	name: string;
	/** Highly privileged, worth a look in any audit */
	priv?: boolean;
}

/** Fixed well-known SIDs. */
export const WELL_KNOWN: Record<string, WellKnown> = {
	'S-1-0-0': { name: 'Null SID' },
	'S-1-1-0': { name: 'Everyone' },
	'S-1-2-0': { name: 'Local' },
	'S-1-2-1': { name: 'Console Logon' },
	'S-1-3-0': { name: 'Creator Owner' },
	'S-1-3-1': { name: 'Creator Group' },
	'S-1-3-2': { name: 'Creator Owner Server' },
	'S-1-3-3': { name: 'Creator Group Server' },
	'S-1-3-4': { name: 'Owner Rights' },
	'S-1-5': { name: 'NT Authority' },
	'S-1-5-1': { name: 'Dialup' },
	'S-1-5-2': { name: 'Network' },
	'S-1-5-3': { name: 'Batch' },
	'S-1-5-4': { name: 'Interactive' },
	'S-1-5-6': { name: 'Service' },
	'S-1-5-7': { name: 'Anonymous Logon' },
	'S-1-5-8': { name: 'Proxy' },
	'S-1-5-9': { name: 'Enterprise Domain Controllers', priv: true },
	'S-1-5-10': { name: 'Principal Self' },
	'S-1-5-11': { name: 'Authenticated Users' },
	'S-1-5-12': { name: 'Restricted Code' },
	'S-1-5-13': { name: 'Terminal Server Users' },
	'S-1-5-14': { name: 'Remote Interactive Logon' },
	'S-1-5-15': { name: 'This Organization' },
	'S-1-5-17': { name: 'IUSR (IIS anonymous user)' },
	'S-1-5-18': { name: 'Local System (SYSTEM)', priv: true },
	'S-1-5-19': { name: 'Local Service' },
	'S-1-5-20': { name: 'Network Service' },
	'S-1-5-32': { name: 'Builtin domain' },
	'S-1-5-32-544': { name: 'BUILTIN\\Administrators', priv: true },
	'S-1-5-32-545': { name: 'BUILTIN\\Users' },
	'S-1-5-32-546': { name: 'BUILTIN\\Guests' },
	'S-1-5-32-547': { name: 'BUILTIN\\Power Users' },
	'S-1-5-32-548': { name: 'BUILTIN\\Account Operators', priv: true },
	'S-1-5-32-549': { name: 'BUILTIN\\Server Operators', priv: true },
	'S-1-5-32-550': { name: 'BUILTIN\\Print Operators', priv: true },
	'S-1-5-32-551': { name: 'BUILTIN\\Backup Operators', priv: true },
	'S-1-5-32-552': { name: 'BUILTIN\\Replicator' },
	'S-1-5-32-554': { name: 'BUILTIN\\Pre-Windows 2000 Compatible Access' },
	'S-1-5-32-555': { name: 'BUILTIN\\Remote Desktop Users' },
	'S-1-5-32-556': { name: 'BUILTIN\\Network Configuration Operators' },
	'S-1-5-32-557': { name: 'BUILTIN\\Incoming Forest Trust Builders' },
	'S-1-5-32-558': { name: 'BUILTIN\\Performance Monitor Users' },
	'S-1-5-32-559': { name: 'BUILTIN\\Performance Log Users' },
	'S-1-5-32-560': { name: 'BUILTIN\\Windows Authorization Access Group' },
	'S-1-5-32-561': { name: 'BUILTIN\\Terminal Server License Servers' },
	'S-1-5-32-562': { name: 'BUILTIN\\Distributed COM Users' },
	'S-1-5-32-568': { name: 'BUILTIN\\IIS_IUSRS' },
	'S-1-5-32-569': { name: 'BUILTIN\\Cryptographic Operators' },
	'S-1-5-32-573': { name: 'BUILTIN\\Event Log Readers' },
	'S-1-5-32-574': { name: 'BUILTIN\\Certificate Service DCOM Access' },
	'S-1-5-32-575': { name: 'BUILTIN\\RDS Remote Access Servers' },
	'S-1-5-32-576': { name: 'BUILTIN\\RDS Endpoint Servers' },
	'S-1-5-32-577': { name: 'BUILTIN\\RDS Management Servers' },
	'S-1-5-32-578': { name: 'BUILTIN\\Hyper-V Administrators' },
	'S-1-5-32-579': { name: 'BUILTIN\\Access Control Assistance Operators' },
	'S-1-5-32-580': { name: 'BUILTIN\\Remote Management Users' },
	'S-1-5-64-10': { name: 'NTLM Authentication' },
	'S-1-5-64-14': { name: 'SChannel Authentication' },
	'S-1-5-64-21': { name: 'Digest Authentication' },
	'S-1-5-80': { name: 'NT Service' },
	'S-1-5-80-0': { name: 'All Services' },
	'S-1-5-83-0': { name: 'NT VIRTUAL MACHINE\\Virtual Machines' },
	'S-1-5-113': { name: 'Local account' },
	'S-1-5-114': { name: 'Local account and member of Administrators group' },
	'S-1-5-1000': { name: 'Other Organization' },
	'S-1-15-2-1': { name: 'All Application Packages' },
	'S-1-15-2-2': { name: 'All Restricted Application Packages' },
	'S-1-16-0': { name: 'Untrusted Mandatory Level' },
	'S-1-16-4096': { name: 'Low Mandatory Level' },
	'S-1-16-8192': { name: 'Medium Mandatory Level' },
	'S-1-16-8448': { name: 'Medium Plus Mandatory Level' },
	'S-1-16-12288': { name: 'High Mandatory Level' },
	'S-1-16-16384': { name: 'System Mandatory Level' },
	'S-1-16-20480': { name: 'Protected Process Mandatory Level' },
	'S-1-16-28672': { name: 'Secure Process Mandatory Level' },
	'S-1-18-1': { name: 'Authentication authority asserted identity' },
	'S-1-18-2': { name: 'Service asserted identity' },
	'S-1-18-3': { name: 'Fresh public key identity' },
	'S-1-18-4': { name: 'Key trust identity' },
	'S-1-18-5': { name: 'Key property MFA' },
	'S-1-18-6': { name: 'Key property attestation' }
};

/** Relative identifiers under a domain (or machine) SID S-1-5-21-a-b-c. */
export const DOMAIN_RIDS: Record<number, WellKnown & { scope?: string }> = {
	498: { name: 'Enterprise Read-only Domain Controllers', scope: 'forest root domain' },
	500: { name: 'Administrator', priv: true },
	501: { name: 'Guest' },
	502: { name: 'krbtgt (KDC service account)', priv: true },
	503: { name: 'DefaultAccount', scope: 'local machine' },
	504: { name: 'WDAGUtilityAccount', scope: 'local machine' },
	512: { name: 'Domain Admins', priv: true },
	513: { name: 'Domain Users' },
	514: { name: 'Domain Guests' },
	515: { name: 'Domain Computers' },
	516: { name: 'Domain Controllers', priv: true },
	517: { name: 'Cert Publishers' },
	518: { name: 'Schema Admins', priv: true, scope: 'forest root domain' },
	519: { name: 'Enterprise Admins', priv: true, scope: 'forest root domain' },
	520: { name: 'Group Policy Creator Owners', priv: true },
	521: { name: 'Read-only Domain Controllers' },
	522: { name: 'Cloneable Domain Controllers' },
	525: { name: 'Protected Users' },
	526: { name: 'Key Admins', priv: true },
	527: { name: 'Enterprise Key Admins', priv: true, scope: 'forest root domain' },
	553: { name: 'RAS and IAS Servers' },
	571: { name: 'Allowed RODC Password Replication Group' },
	572: { name: 'Denied RODC Password Replication Group' }
};

export interface Explained {
	sid: Sid;
	string: string;
	bytes: Uint8Array;
	authorityName: string;
	name?: string;
	priv: boolean;
	kind: string;
	domain?: string;
	rid?: number;
	notes: string[];
}

export function explain(sid: Sid): Explained {
	const s = sidToString(sid);
	const out: Explained = {
		sid,
		string: s,
		bytes: sidToBytes(sid),
		authorityName: AUTHORITIES[sid.authority.toString()] ?? 'Unknown authority',
		priv: false,
		kind: 'SID',
		notes: []
	};
	const wk = WELL_KNOWN[s];
	if (wk) {
		out.name = wk.name;
		out.priv = !!wk.priv;
		out.kind = 'Well-known SID';
		return out;
	}
	const [a, ...rest] = sid.subs;
	if (sid.authority === 5n && a === 21 && rest.length === 4) {
		out.domain = sidToString({ ...sid, subs: sid.subs.slice(0, 4) });
		out.rid = rest[3];
		const r = DOMAIN_RIDS[out.rid];
		if (r) {
			out.name = r.name;
			out.priv = !!r.priv;
			out.kind = 'Well-known domain RID';
			if (r.scope) out.notes.push(`Only exists in the ${r.scope}.`);
		} else if (out.rid >= 1000) {
			out.kind = 'Domain or machine account';
			out.notes.push(
				'RIDs from 1000 up are handed out to users, groups and computers as they are created.'
			);
		} else {
			out.kind = 'Reserved RID';
		}
	} else if (sid.authority === 5n && a === 21 && rest.length === 3) {
		out.kind = 'Domain or machine identifier';
		out.domain = s;
	} else if (sid.authority === 5n && a === 32 && rest.length === 1) {
		out.kind = 'Builtin alias';
		out.rid = rest[0];
	} else if (sid.authority === 5n && a === 80) {
		out.kind = 'Service SID';
		out.notes.push(
			'NT SERVICE\\<name>: the sub-authorities are a SHA-1 hash of the upper-case service name.'
		);
	} else if (sid.authority === 5n && a === 82) {
		out.kind = 'IIS application pool identity';
	} else if (sid.authority === 5n && a === 5 && rest.length === 2) {
		out.kind = 'Logon session';
	} else if (sid.authority === 15n && a === 3) {
		out.kind = 'App capability SID';
	} else if (sid.authority === 15n && a === 2) {
		out.kind = 'App container (package) SID';
	} else if (sid.authority === 12n && a === 1 && rest.length === 4) {
		out.kind = 'Microsoft Entra ID object';
		out.notes.push(`Object ID ${entraObjectId(rest)}.`);
	}
	return out;
}

/** S-1-12-1-a-b-c-d holds the Entra ID object GUID as four little-endian 32-bit words. */
export function entraObjectId(words: number[]): string {
	const b = new Uint8Array(16);
	const dv = new DataView(b.buffer);
	words.forEach((w, i) => dv.setUint32(i * 4, w, true));
	const h = (i: number, n: number, le: boolean) => {
		const sl = Array.from(b.slice(i, i + n));
		return toHex(new Uint8Array(le ? sl.reverse() : sl));
	};
	return `${h(0, 4, true)}-${h(4, 2, true)}-${h(6, 2, true)}-${h(8, 2, false)}-${h(10, 6, false)}`;
}

export type InputFormat = 'string' | ByteFormat;

export function parseAny(raw: string): { e: Explained; format: InputFormat } {
	const t = raw.trim();
	if (!t) throw new Error('Enter a SID');
	if (/^S-/i.test(t)) return { e: explain(parseSidString(t)), format: 'string' };
	const { bytes, format } = parseBytes(t);
	return { e: explain(sidFromBytes(bytes)), format };
}

export function ldapFilter(e: Explained): string {
	return `(objectSid=${toLdapEscaped(e.bytes)})`;
}

export function looksLikeSid(s: string): number {
	const t = s.trim();
	if (/^S-1-\d+(-\d+)+$/i.test(t)) return 0.95;
	if (/^objectSid::\s*AQ/i.test(t)) return 0.95;
	return 0;
}
