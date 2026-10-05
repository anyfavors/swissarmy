/**
 * SDDL (Security Descriptor Definition Language) decoder.
 *
 * Sources (Microsoft Learn, Win32 security documentation):
 * - "Security Descriptor String Format": O:, G:, D:, S: components and ACL flags P, AI, AR,
 *   NO_ACCESS_CONTROL.
 * - "ACE Strings": ace_type;ace_flags;rights;object_guid;inherit_object_guid;account_sid;
 *   (resource_attribute), the ACE type, ACE flag and access right tokens and their values.
 * - "SID Strings": the two-letter SID aliases (SDDL_* constants in sddl.h).
 * - "ACCESS_MASK", "File Security and Access Rights", "Registry Key Security and Access Rights",
 *   ADS_RIGHTS_ENUM (iads.h) for the bit meanings; FileSystemRights enum (.NET) for the
 *   composite file values.
 * - "Control Access Rights" and [MS-ADTS] 5.1.3.2.1 for the extended right GUIDs; [MS-ADA1],
 *   [MS-ADA2], [MS-ADA3] and [MS-ADSC] for the schemaIDGUIDs of the attributes and classes listed.
 */
import { explain, parseSidString } from '../sid/logic';

export type Severity = 'high' | 'medium' | 'info';

export interface Risk {
	severity: Severity;
	text: string;
}

// ---------- tables ----------

export const ACE_TYPES: Record<
	string,
	{ name: string; allow?: boolean; deny?: boolean; object?: boolean; audit?: boolean }
> = {
	A: { name: 'Allow', allow: true },
	D: { name: 'Deny', deny: true },
	OA: { name: 'Allow (object)', allow: true, object: true },
	OD: { name: 'Deny (object)', deny: true, object: true },
	AU: { name: 'Audit', audit: true },
	AL: { name: 'Alarm', audit: true },
	OU: { name: 'Audit (object)', audit: true, object: true },
	OL: { name: 'Alarm (object)', audit: true, object: true },
	ML: { name: 'Mandatory label' },
	XA: { name: 'Allow (conditional)', allow: true },
	XD: { name: 'Deny (conditional)', deny: true },
	ZA: { name: 'Allow (conditional, object)', allow: true, object: true },
	XU: { name: 'Audit (conditional)', audit: true },
	RA: { name: 'Resource attribute' },
	SP: { name: 'Central access policy' },
	TL: { name: 'Process trust label' }
};

export const ACE_FLAGS: Record<string, { bit: number; name: string }> = {
	OI: { bit: 0x1, name: 'Object inherit (files)' },
	CI: { bit: 0x2, name: 'Container inherit (folders, containers)' },
	NP: { bit: 0x4, name: 'No propagate (one level only)' },
	IO: { bit: 0x8, name: 'Inherit only (not on this object)' },
	ID: { bit: 0x10, name: 'Inherited' },
	SA: { bit: 0x40, name: 'Audit success' },
	FA: { bit: 0x80, name: 'Audit failure' }
};

export const ACL_FLAGS: Record<string, string> = {
	P: 'Protected: does not inherit from the parent',
	AI: 'Auto-inherited: inheritance has been applied',
	AR: 'Auto-inherit requested',
	NO_ACCESS_CONTROL: 'Null ACL: no access control at all'
};

/** Access right tokens and their masks. */
export const RIGHTS: Record<string, { mask: number; name: string }> = {
	GA: { mask: 0x10000000, name: 'GenericAll' },
	GR: { mask: 0x80000000, name: 'GenericRead' },
	GW: { mask: 0x40000000, name: 'GenericWrite' },
	GX: { mask: 0x20000000, name: 'GenericExecute' },
	RC: { mask: 0x00020000, name: 'ReadControl' },
	SD: { mask: 0x00010000, name: 'Delete' },
	WD: { mask: 0x00040000, name: 'WriteDACL' },
	WO: { mask: 0x00080000, name: 'WriteOwner' },
	RP: { mask: 0x10, name: 'ReadProperty' },
	WP: { mask: 0x20, name: 'WriteProperty' },
	CC: { mask: 0x1, name: 'CreateChild' },
	DC: { mask: 0x2, name: 'DeleteChild' },
	LC: { mask: 0x4, name: 'ListChildren' },
	SW: { mask: 0x8, name: 'Self (validated write)' },
	LO: { mask: 0x80, name: 'ListObject' },
	DT: { mask: 0x40, name: 'DeleteTree' },
	CR: { mask: 0x100, name: 'ControlAccess (extended rights)' },
	FA: { mask: 0x1f01ff, name: 'FileAllAccess' },
	FR: { mask: 0x120089, name: 'FileGenericRead' },
	FW: { mask: 0x120116, name: 'FileGenericWrite' },
	FX: { mask: 0x1200a0, name: 'FileGenericExecute' },
	KA: { mask: 0xf003f, name: 'KeyAllAccess' },
	KR: { mask: 0x20019, name: 'KeyRead' },
	KW: { mask: 0x20006, name: 'KeyWrite' },
	KX: { mask: 0x20019, name: 'KeyExecute' },
	NR: { mask: 0x2, name: 'NoReadUp' },
	NW: { mask: 0x1, name: 'NoWriteUp' },
	NX: { mask: 0x4, name: 'NoExecuteUp' }
};

export interface Alias {
	name: string;
	/** Full SID, or a RID under the domain */
	sid?: string;
	rid?: number;
}

/** Two-letter SID aliases from the "SID Strings" page. */
export const ALIASES: Record<string, Alias> = {
	AA: { name: 'Access Control Assistance Operators', sid: 'S-1-5-32-579' },
	AC: { name: 'All Application Packages', sid: 'S-1-15-2-1' },
	AN: { name: 'Anonymous Logon', sid: 'S-1-5-7' },
	AO: { name: 'Account Operators', sid: 'S-1-5-32-548' },
	AP: { name: 'Protected Users', rid: 525 },
	AS: { name: 'Authentication authority asserted identity', sid: 'S-1-18-1' },
	AU: { name: 'Authenticated Users', sid: 'S-1-5-11' },
	BA: { name: 'BUILTIN\\Administrators', sid: 'S-1-5-32-544' },
	BG: { name: 'BUILTIN\\Guests', sid: 'S-1-5-32-546' },
	BO: { name: 'Backup Operators', sid: 'S-1-5-32-551' },
	BU: { name: 'BUILTIN\\Users', sid: 'S-1-5-32-545' },
	CA: { name: 'Cert Publishers', rid: 517 },
	CD: { name: 'Certificate Service DCOM Access', sid: 'S-1-5-32-574' },
	CG: { name: 'Creator Group', sid: 'S-1-3-1' },
	CN: { name: 'Cloneable Domain Controllers', rid: 522 },
	CO: { name: 'Creator Owner', sid: 'S-1-3-0' },
	CY: { name: 'Cryptographic Operators', sid: 'S-1-5-32-569' },
	DA: { name: 'Domain Admins', rid: 512 },
	DC: { name: 'Domain Computers', rid: 515 },
	DD: { name: 'Domain Controllers', rid: 516 },
	DG: { name: 'Domain Guests', rid: 514 },
	DU: { name: 'Domain Users', rid: 513 },
	EA: { name: 'Enterprise Admins', rid: 519 },
	ED: { name: 'Enterprise Domain Controllers', sid: 'S-1-5-9' },
	EK: { name: 'Enterprise Key Admins', rid: 527 },
	ER: { name: 'Event Log Readers', sid: 'S-1-5-32-573' },
	ES: { name: 'RDS Endpoint Servers', sid: 'S-1-5-32-576' },
	HA: { name: 'Hyper-V Administrators', sid: 'S-1-5-32-578' },
	HI: { name: 'High integrity level', sid: 'S-1-16-12288' },
	IS: { name: 'IIS_IUSRS', sid: 'S-1-5-32-568' },
	IU: { name: 'Interactive', sid: 'S-1-5-4' },
	KA: { name: 'Key Admins', rid: 526 },
	LA: { name: 'Local Administrator account', rid: 500 },
	LG: { name: 'Local Guest account', rid: 501 },
	LS: { name: 'Local Service', sid: 'S-1-5-19' },
	LU: { name: 'Performance Log Users', sid: 'S-1-5-32-559' },
	LW: { name: 'Low integrity level', sid: 'S-1-16-4096' },
	ME: { name: 'Medium integrity level', sid: 'S-1-16-8192' },
	MP: { name: 'Medium Plus integrity level', sid: 'S-1-16-8448' },
	MS: { name: 'RDS Management Servers', sid: 'S-1-5-32-577' },
	MU: { name: 'Performance Monitor Users', sid: 'S-1-5-32-558' },
	NO: { name: 'Network Configuration Operators', sid: 'S-1-5-32-556' },
	NS: { name: 'Network Service', sid: 'S-1-5-20' },
	NU: { name: 'Network', sid: 'S-1-5-2' },
	OW: { name: 'Owner Rights', sid: 'S-1-3-4' },
	PA: { name: 'Group Policy Creator Owners', rid: 520 },
	PO: { name: 'Print Operators', sid: 'S-1-5-32-550' },
	PS: { name: 'Principal Self', sid: 'S-1-5-10' },
	PU: { name: 'Power Users', sid: 'S-1-5-32-547' },
	RA: { name: 'RDS Remote Access Servers', sid: 'S-1-5-32-575' },
	RC: { name: 'Restricted Code', sid: 'S-1-5-12' },
	RD: { name: 'Remote Desktop Users', sid: 'S-1-5-32-555' },
	RE: { name: 'Replicator', sid: 'S-1-5-32-552' },
	RM: { name: 'Remote Management Users', sid: 'S-1-5-32-580' },
	RO: { name: 'Enterprise Read-only Domain Controllers', rid: 498 },
	RS: { name: 'RAS and IAS Servers', rid: 553 },
	RU: { name: 'Pre-Windows 2000 Compatible Access', sid: 'S-1-5-32-554' },
	SA: { name: 'Schema Admins', rid: 518 },
	SI: { name: 'System integrity level', sid: 'S-1-16-16384' },
	SO: { name: 'Server Operators', sid: 'S-1-5-32-549' },
	SS: { name: 'Service asserted identity', sid: 'S-1-18-2' },
	SU: { name: 'Service', sid: 'S-1-5-6' },
	SY: { name: 'Local System', sid: 'S-1-5-18' },
	WD: { name: 'Everyone', sid: 'S-1-1-0' }
};

/** Object GUIDs. Only well-established values; per-forest schema GUIDs (LAPS) are not listed. */
export const GUIDS: Record<
	string,
	{
		name: string;
		kind: 'extended right' | 'property' | 'property set' | 'class' | 'validated write';
	}
> = {
	'1131f6aa-9c07-11d1-f79f-00c04fc2dcd2': {
		name: 'DS-Replication-Get-Changes',
		kind: 'extended right'
	},
	'1131f6ad-9c07-11d1-f79f-00c04fc2dcd2': {
		name: 'DS-Replication-Get-Changes-All',
		kind: 'extended right'
	},
	'89e95b76-444d-4c62-991a-0facbeda640c': {
		name: 'DS-Replication-Get-Changes-In-Filtered-Set',
		kind: 'extended right'
	},
	'1131f6ab-9c07-11d1-f79f-00c04fc2dcd2': {
		name: 'DS-Replication-Synchronize',
		kind: 'extended right'
	},
	'1131f6ac-9c07-11d1-f79f-00c04fc2dcd2': {
		name: 'DS-Replication-Manage-Topology',
		kind: 'extended right'
	},
	'00299570-246d-11d0-a768-00aa006e0529': {
		name: 'User-Force-Change-Password',
		kind: 'extended right'
	},
	'ab721a53-1e2f-11d0-9819-00aa0040529b': { name: 'User-Change-Password', kind: 'extended right' },
	'0e10c968-78fb-11d2-90d4-00c04f79dc55': {
		name: 'Certificate-Enrollment',
		kind: 'extended right'
	},
	'a05b8cc2-17bc-4802-a710-e7c15ab866a2': {
		name: 'Certificate-AutoEnrollment',
		kind: 'extended right'
	},
	'f3a64788-5306-11d1-a9c5-0000f80367c1': { name: 'Validated-SPN', kind: 'validated write' },
	'72e39547-7b18-11d1-adef-00c04fd8d5cd': {
		name: 'Validated-DNS-Host-Name',
		kind: 'validated write'
	},
	'bf9679c0-0de6-11d0-a285-00aa003049e2': {
		name: 'member (and Self-Membership)',
		kind: 'property'
	},
	'5b47d60f-6090-40b2-9f37-2a4de88f3063': { name: 'msDS-KeyCredentialLink', kind: 'property' },
	'3f78c3e5-f79a-46bd-a0b8-9d18116ddc79': {
		name: 'msDS-AllowedToActOnBehalfOfOtherIdentity',
		kind: 'property'
	},
	'4c164200-20c0-11d0-a768-00aa006e0529': {
		name: 'User-Account-Restrictions',
		kind: 'property set'
	},
	'5f202010-79a5-11d0-9020-00c04fc2d4cf': { name: 'User-Logon', kind: 'property set' },
	'bc0ac240-79a9-11d0-9020-00c04fc2d4cf': { name: 'Membership', kind: 'property set' },
	'77b5b886-944a-11d1-aebd-0000f80367c1': { name: 'Personal-Information', kind: 'property set' },
	'bf967aba-0de6-11d0-a285-00aa003049e2': { name: 'user', kind: 'class' },
	'bf967a86-0de6-11d0-a285-00aa003049e2': { name: 'computer', kind: 'class' },
	'bf967a9c-0de6-11d0-a285-00aa003049e2': { name: 'group', kind: 'class' }
};

const G = {
	getChanges: '1131f6aa-9c07-11d1-f79f-00c04fc2dcd2',
	getChangesAll: '1131f6ad-9c07-11d1-f79f-00c04fc2dcd2',
	forceChange: '00299570-246d-11d0-a768-00aa006e0529',
	member: 'bf9679c0-0de6-11d0-a285-00aa003049e2',
	keyCred: '5b47d60f-6090-40b2-9f37-2a4de88f3063',
	rbcd: '3f78c3e5-f79a-46bd-a0b8-9d18116ddc79',
	spn: 'f3a64788-5306-11d1-a9c5-0000f80367c1'
};

// ---------- bit meanings per object type ----------

export type Context = 'ds' | 'file' | 'reg' | 'svc' | 'generic';
export const CONTEXTS: Record<Context, string> = {
	ds: 'Active Directory',
	file: 'File or folder',
	reg: 'Registry key',
	svc: 'Service',
	generic: 'Other'
};

const COMMON_BITS: [number, string][] = [
	[0x80000000, 'GenericRead'],
	[0x40000000, 'GenericWrite'],
	[0x20000000, 'GenericExecute'],
	[0x10000000, 'GenericAll'],
	[0x02000000, 'MaximumAllowed'],
	[0x01000000, 'AccessSystemSecurity'],
	[0x00100000, 'Synchronize'],
	[0x00080000, 'WriteOwner'],
	[0x00040000, 'WriteDACL'],
	[0x00020000, 'ReadControl'],
	[0x00010000, 'Delete']
];

const SPECIFIC: Record<Context, [number, string][]> = {
	ds: [
		[0x1, 'CreateChild'],
		[0x2, 'DeleteChild'],
		[0x4, 'ListChildren'],
		[0x8, 'Self'],
		[0x10, 'ReadProperty'],
		[0x20, 'WriteProperty'],
		[0x40, 'DeleteTree'],
		[0x80, 'ListObject'],
		[0x100, 'ControlAccess']
	],
	file: [
		[0x1, 'ReadData/ListDirectory'],
		[0x2, 'WriteData/AddFile'],
		[0x4, 'AppendData/AddSubdirectory'],
		[0x8, 'ReadExtendedAttributes'],
		[0x10, 'WriteExtendedAttributes'],
		[0x20, 'Execute/Traverse'],
		[0x40, 'DeleteChild'],
		[0x80, 'ReadAttributes'],
		[0x100, 'WriteAttributes']
	],
	reg: [
		[0x1, 'QueryValue'],
		[0x2, 'SetValue'],
		[0x4, 'CreateSubKey'],
		[0x8, 'EnumerateSubKeys'],
		[0x10, 'Notify'],
		[0x20, 'CreateLink']
	],
	// winsvc.h service access rights; sc sdshow writes them with the DS letters (CC = QueryConfig)
	svc: [
		[0x1, 'QueryConfig'],
		[0x2, 'ChangeConfig'],
		[0x4, 'QueryStatus'],
		[0x8, 'EnumerateDependents'],
		[0x10, 'Start'],
		[0x20, 'Stop'],
		[0x40, 'PauseContinue'],
		[0x80, 'Interrogate'],
		[0x100, 'UserDefinedControl']
	],
	generic: []
};

const COMPOSITES: Record<Context, [number, string][]> = {
	ds: [
		[0xf01ff, 'Full control'],
		[0x20094, 'Generic read'],
		[0x20028, 'Generic write'],
		[0x20004, 'Generic execute']
	],
	file: [
		[0x1f01ff, 'Full control'],
		[0x1301bf, 'Modify'],
		[0x301bf, 'Modify'],
		[0x1201bf, 'Read and write'],
		[0x1200a9, 'Read and execute'],
		[0x200a9, 'Read and execute'],
		[0x120089, 'Read'],
		[0x20089, 'Read'],
		[0x120116, 'Write'],
		[0x116, 'Write']
	],
	reg: [
		[0xf003f, 'Full control'],
		[0x20019, 'Read'],
		[0x20006, 'Write']
	],
	svc: [[0xf01ff, 'Full control']],
	generic: []
};

/** Names for each bit set in a mask, in the given context. */
export function maskNames(mask: number, ctx: Context): string[] {
	const m = mask >>> 0;
	const out: string[] = [];
	for (const [b, n] of COMMON_BITS) if (m & b) out.push(n);
	let known = COMMON_BITS.reduce((a, [b]) => a | b, 0);
	for (const [b, n] of SPECIFIC[ctx]) {
		known |= b;
		if (m & b) out.push(n);
	}
	const rest = (m & ~known) >>> 0;
	for (let b = 0; b < 32; b++) {
		const bit = (1 << b) >>> 0;
		if (rest & bit) out.push(`0x${bit.toString(16)}`);
	}
	return out;
}

/** "Full control" and the like when the mask is a well-known combination. */
export function maskSummary(mask: number, ctx: Context): string | undefined {
	return COMPOSITES[ctx].find(([v]) => v === mask >>> 0)?.[1];
}

// ---------- parsing ----------

export interface Trustee {
	raw: string;
	name: string;
	sid?: string;
	alias?: string;
	/** Domain relative alias such as DA, shown without the domain SID */
	relative?: boolean;
}

export interface Ace {
	raw: string;
	type: string;
	typeName: string;
	flags: string[];
	unknownFlags: string[];
	rightsRaw: string;
	mask: number;
	objectGuid?: string;
	objectName?: string;
	inheritGuid?: string;
	inheritName?: string;
	trustee: Trustee;
	extra?: string;
	risks: Risk[];
}

export interface Acl {
	flags: string[];
	aces: Ace[];
	nullAcl: boolean;
}

export interface Sddl {
	owner?: Trustee;
	group?: Trustee;
	dacl?: Acl;
	sacl?: Acl;
	ctx: Context;
	risks: Risk[];
}

export function trustee(raw: string): Trustee {
	const t = raw.trim();
	if (!t) throw new Error('Empty account SID in an ACE');
	const a = ALIASES[t.toUpperCase()];
	if (a && t.length === 2)
		return {
			raw: t,
			name: a.name,
			sid: a.sid,
			alias: t.toUpperCase(),
			relative: a.rid !== undefined
		};
	if (/^S-1-/i.test(t)) {
		const e = explain(parseSidString(t));
		return {
			raw: t,
			name: e.name ?? (e.rid !== undefined ? `RID ${e.rid}` : 'Unknown SID'),
			sid: e.string
		};
	}
	throw new Error(`"${t}" is neither a SID alias nor a SID string`);
}

function rid(t: Trustee): number | undefined {
	if (t.alias && ALIASES[t.alias].rid !== undefined) return ALIASES[t.alias].rid;
	const m = t.sid && /^S-1-5-21-\d+-\d+-\d+-(\d+)$/.exec(t.sid);
	return m ? Number(m[1]) : undefined;
}

/** Everyone, Authenticated Users, Anonymous, Users, Domain Users, Domain Computers, Guests. */
export function isBroad(t: Trustee): boolean {
	const broadSids = ['S-1-1-0', 'S-1-5-11', 'S-1-5-7', 'S-1-5-32-545', 'S-1-5-32-546', 'S-1-5-2'];
	if (t.sid && broadSids.includes(t.sid)) return true;
	const r = rid(t);
	return r === 513 || r === 514 || r === 515;
}

/** Accounts that hold replication rights by default. */
function isReplicator(t: Trustee): boolean {
	if (t.sid && ['S-1-5-9', 'S-1-5-18', 'S-1-5-32-544'].includes(t.sid)) return true;
	const r = rid(t);
	return r !== undefined && [498, 512, 516, 519, 521].includes(r);
}

function parseRights(raw: string): number {
	const t = raw.trim();
	if (!t) return 0;
	if (/^0x[0-9a-f]+$/i.test(t)) {
		const v = parseInt(t.slice(2), 16);
		if (v > 0xffffffff) throw new Error(`Access mask ${t} is larger than 32 bits`);
		return v >>> 0;
	}
	if (/^\d+$/.test(t)) return Number(t) >>> 0;
	if (t.length % 2) throw new Error(`Cannot read the rights "${t}"`);
	let m = 0;
	for (let i = 0; i < t.length; i += 2) {
		const k = t.slice(i, i + 2).toUpperCase();
		const r = RIGHTS[k];
		if (!r) throw new Error(`Unknown access right "${k}" in "${t}"`);
		m = (m | r.mask) >>> 0;
	}
	return m;
}

function splitAces(s: string): string[] {
	const out: string[] = [];
	let depth = 0;
	let start = -1;
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (c === '"') {
			const j = s.indexOf('"', i + 1);
			if (j < 0) throw new Error('Unclosed quote in a conditional ACE');
			i = j;
			continue;
		}
		if (c === '(') {
			if (depth === 0) start = i + 1;
			depth++;
		} else if (c === ')') {
			depth--;
			if (depth < 0) throw new Error('Unbalanced parentheses');
			if (depth === 0) out.push(s.slice(start, i));
		} else if (depth === 0 && !/\s/.test(c)) {
			throw new Error(`Unexpected "${c}" between ACEs`);
		}
	}
	if (depth !== 0) throw new Error('Unbalanced parentheses: an ACE is not closed');
	return out;
}

const normGuid = (g: string) =>
	g
		.trim()
		.toLowerCase()
		.replace(/^\{|\}$/g, '');

function parseAce(raw: string): Ace {
	const parts: string[] = [];
	let rest = raw;
	for (let i = 0; i < 5; i++) {
		const j = rest.indexOf(';');
		if (j < 0) throw new Error(`ACE "(${raw})" needs six fields separated by ;`);
		parts.push(rest.slice(0, j));
		rest = rest.slice(j + 1);
	}
	const k = rest.indexOf(';');
	parts.push(k < 0 ? rest : rest.slice(0, k));
	const extra = k < 0 ? undefined : rest.slice(k + 1);
	const [type, flagStr, rightsRaw, og, iog, sid] = parts.map((p) => p.trim());
	const at = ACE_TYPES[type.toUpperCase()];
	if (!at) throw new Error(`Unknown ACE type "${type}" in (${raw})`);
	const flags: string[] = [];
	const unknownFlags: string[] = [];
	if (flagStr.length % 2) unknownFlags.push(flagStr);
	else
		for (let i = 0; i < flagStr.length; i += 2) {
			const f = flagStr.slice(i, i + 2).toUpperCase();
			(ACE_FLAGS[f] ? flags : unknownFlags).push(f);
		}
	const ace: Ace = {
		raw,
		type: type.toUpperCase(),
		typeName: at.name,
		flags,
		unknownFlags,
		rightsRaw,
		mask: parseRights(rightsRaw),
		trustee: trustee(sid),
		extra: extra?.trim() || undefined,
		risks: []
	};
	if (og) {
		ace.objectGuid = normGuid(og);
		ace.objectName = GUIDS[ace.objectGuid]?.name;
	}
	if (iog) {
		ace.inheritGuid = normGuid(iog);
		ace.inheritName = GUIDS[ace.inheritGuid]?.name;
	}
	return ace;
}

function parseAcl(s: string): Acl {
	const i = s.indexOf('(');
	let fl = (i < 0 ? s : s.slice(0, i)).trim().toUpperCase();
	const flags: string[] = [];
	while (fl) {
		const tok = ['NO_ACCESS_CONTROL', 'AI', 'AR', 'P'].find((t) => fl.startsWith(t));
		if (!tok) throw new Error(`Unknown ACL flag in "${fl}"`);
		flags.push(tok);
		fl = fl.slice(tok.length);
	}
	const aces = i < 0 ? [] : splitAces(s.slice(i)).map(parseAce);
	return { flags, aces, nullAcl: flags.includes('NO_ACCESS_CONTROL') };
}

/**
 * Picks the object type from the rights used, when not given. Service descriptors (sc sdshow)
 * use the DS letters but have no owner, no group and no object ACEs.
 */
export function guessContext(aces: Ace[], hasOwner = false): Context {
	const toks = aces.flatMap((a) =>
		(a.rightsRaw.match(/[A-Z]{2}/gi) ?? []).map((t) => t.toUpperCase())
	);
	if (aces.some((a) => ACE_TYPES[a.type].object)) return 'ds';
	if (toks.some((t) => ['RP', 'WP', 'CC', 'DC', 'LC', 'SW', 'LO', 'DT', 'CR'].includes(t)))
		return hasOwner ? 'ds' : 'svc';
	if (toks.some((t) => ['FA', 'FR', 'FW', 'FX'].includes(t))) return 'file';
	if (toks.some((t) => ['KA', 'KR', 'KW', 'KX'].includes(t))) return 'reg';
	return 'generic';
}

/**
 * Parses an SDDL string. Accepts a full descriptor ("O:BAG:SYD:PAI(A;;FA;;;SY)") or a bare
 * list of ACEs ("(A;;FA;;;SY)(A;;FR;;;BU)"), which is read as a DACL.
 */
export function parseSddl(input: string, ctx?: Context): Sddl {
	const s = input.replace(/[\r\n]+/g, '').trim();
	if (!s) throw new Error('Paste an SDDL string, for example O:BAG:SYD:(A;;FA;;;SY)');
	const parts: Record<string, string> = {};
	if (s.startsWith('(')) parts.D = s;
	else {
		let depth = 0;
		let cur: string | undefined;
		let start = 0;
		for (let i = 0; i < s.length; i++) {
			const c = s[i];
			if (c === '"') {
				const j = s.indexOf('"', i + 1);
				i = j < 0 ? s.length : j;
				continue;
			}
			if (c === '(') depth++;
			else if (c === ')') depth--;
			else if (depth === 0 && 'OGDS'.includes(c) && s[i + 1] === ':') {
				if (cur) parts[cur] = s.slice(start, i);
				else if (s.slice(0, i).trim())
					throw new Error(`Unexpected "${s.slice(0, i).trim()}" before the first component`);
				if (parts[c] !== undefined) throw new Error(`${c}: appears twice`);
				cur = c;
				start = i + 2;
				i++;
			}
		}
		if (!cur) throw new Error('No O:, G:, D: or S: component found');
		parts[cur] = s.slice(start);
	}
	const out: Sddl = { ctx: 'generic', risks: [] };
	if (parts.O !== undefined) out.owner = trustee(parts.O);
	if (parts.G !== undefined) out.group = trustee(parts.G);
	if (parts.D !== undefined) out.dacl = parseAcl(parts.D);
	if (parts.S !== undefined) out.sacl = parseAcl(parts.S);
	out.ctx =
		ctx ??
		guessContext(
			[...(out.dacl?.aces ?? []), ...(out.sacl?.aces ?? [])],
			!!(out.owner || out.group)
		);
	assess(out);
	return out;
}

// ---------- risk assessment ----------

function aceRisks(a: Ace, ctx: Context): Risk[] {
	const r: Risk[] = [];
	const t = ACE_TYPES[a.type];
	if (!t.allow) return r;
	const who = a.trustee.name;
	const broad = isBroad(a.trustee);
	const m = a.mask;
	const inheritOnly = a.flags.includes('IO') ? ' (inherited by child objects)' : '';

	// Replication rights, whoever holds them
	if (ctx === 'ds' && a.objectGuid === G.getChangesAll && !isReplicator(a.trustee))
		r.push({
			severity: 'high',
			text: `${who} has DS-Replication-Get-Changes-All: with Get-Changes this is DCSync, reading every password hash.`
		});
	if (ctx === 'ds' && a.objectGuid === G.getChanges && !isReplicator(a.trustee))
		r.push({
			severity: 'medium',
			text: `${who} has DS-Replication-Get-Changes, half of the DCSync pair (normal for some sync accounts, such as Entra Connect).`
		});
	if (ctx === 'ds' && m & 0x100 && !a.objectGuid && !isReplicator(a.trustee) && broad)
		r.push({
			severity: 'high',
			text: `${who} has all extended rights${inheritOnly}: includes force password reset, and DCSync on the domain object.`
		});

	if (!broad) return r;

	if (m & 0x10000000) r.push({ severity: 'high', text: `${who} has GenericAll${inheritOnly}.` });
	else if (ctx === 'ds' && (m & 0xf01ff) === 0xf01ff)
		r.push({ severity: 'high', text: `${who} has full control${inheritOnly}.` });
	else if (ctx === 'file' && (m & 0x1f01ff) === 0x1f01ff)
		r.push({ severity: 'high', text: `${who} has full control${inheritOnly}.` });
	else if (ctx === 'svc' && (m & 0xf01ff) === 0xf01ff)
		r.push({ severity: 'high', text: `${who} has full control of the service.` });
	else if (ctx === 'reg' && (m & 0xf003f) === 0xf003f)
		r.push({ severity: 'high', text: `${who} has full control of the key${inheritOnly}.` });
	else {
		if (m & 0x40000)
			r.push({
				severity: 'high',
				text: `${who} can change permissions (WriteDACL)${inheritOnly}.`
			});
		if (m & 0x80000)
			r.push({ severity: 'high', text: `${who} can take ownership (WriteOwner)${inheritOnly}.` });
		if (m & 0x40000000)
			r.push({ severity: 'medium', text: `${who} has GenericWrite${inheritOnly}.` });
		if (ctx === 'ds') {
			if (m & 0x20) {
				const what = a.objectName ?? (a.objectGuid ? `property ${a.objectGuid}` : 'all properties');
				const hi = !a.objectGuid || [G.member, G.keyCred, G.rbcd].includes(a.objectGuid);
				r.push({
					severity: hi ? 'high' : 'medium',
					text: `${who} can write ${what}${inheritOnly}.${a.objectGuid === G.member ? ' Anyone in it can add members to the group.' : a.objectGuid === G.keyCred ? ' Shadow credentials: take over the account.' : a.objectGuid === G.rbcd ? ' Resource-based constrained delegation takeover.' : ''}`
				});
			}
			if (m & 0x100 && a.objectGuid === G.forceChange)
				r.push({
					severity: 'high',
					text: `${who} can reset the password without knowing it${inheritOnly}.`
				});
			if (m & 0x8 && a.objectGuid === G.spn)
				r.push({
					severity: 'medium',
					text: `${who} can set SPNs (targeted Kerberoasting)${inheritOnly}.`
				});
			if (m & 0x1 && !a.objectGuid)
				r.push({ severity: 'medium', text: `${who} can create any child object${inheritOnly}.` });
			if (m & 0x10040)
				r.push({
					severity: 'medium',
					text: `${who} can delete the object or its tree${inheritOnly}.`
				});
		} else if (ctx === 'file') {
			if (m & 0x10000) r.push({ severity: 'medium', text: `${who} can delete${inheritOnly}.` });
			if (m & 0x2) r.push({ severity: 'medium', text: `${who} can write data${inheritOnly}.` });
		} else if (ctx === 'reg') {
			if (m & 0x2) r.push({ severity: 'medium', text: `${who} can set values${inheritOnly}.` });
		} else if (ctx === 'svc') {
			if (m & 0x2)
				r.push({
					severity: 'high',
					text: `${who} can change the service configuration, including the program it runs as SYSTEM.`
				});
			else if (m & 0x30)
				r.push({ severity: 'info', text: `${who} can start or stop the service.` });
		}
	}
	return r;
}

function assess(d: Sddl) {
	const risks: Risk[] = [];
	if (d.owner && isBroad(d.owner))
		risks.push({
			severity: 'high',
			text: `Owner is ${d.owner.name}: the owner can always rewrite the DACL.`
		});
	if (d.dacl) {
		if (d.dacl.nullAcl)
			risks.push({
				severity: 'high',
				text: 'NO_ACCESS_CONTROL: null DACL, everyone has full access.'
			});
		else if (!d.dacl.aces.length)
			risks.push({
				severity: 'info',
				text: 'Empty DACL: nobody gets access, only the owner can still change the DACL.'
			});
		for (const a of d.dacl.aces) {
			a.risks = aceRisks(a, d.ctx);
			risks.push(...a.risks);
		}
	}
	d.risks = risks;
}

// ---------- text output ----------

export function inheritText(a: Ace): string {
	const f = a.flags;
	if (!f.some((x) => ['OI', 'CI', 'IO', 'NP'].includes(x))) return 'This object only';
	const parts: string[] = [];
	parts.push(f.includes('IO') ? 'Children only' : 'This object');
	if (f.includes('CI')) parts.push('containers');
	if (f.includes('OI')) parts.push('objects');
	let s = parts.join(', ');
	if (f.includes('NP')) s += ', one level';
	return s;
}

export function rightsText(a: Ace, ctx: Context): string {
	if (a.type === 'ML') {
		const n = ['NW', 'NR', 'NX'].filter((k) => a.mask & RIGHTS[k].mask).map((k) => RIGHTS[k].name);
		return n.join(', ') || 'none';
	}
	const sum = maskSummary(a.mask, ctx);
	const names = maskNames(a.mask, ctx);
	return sum ? `${sum} (${names.join(', ')})` : names.join(', ') || 'none';
}

/** One line per ACE, for the chain view and copying. */
export function explainText(d: Sddl): string {
	const lines: string[] = [];
	if (d.owner) lines.push(`Owner: ${d.owner.name}`);
	if (d.group) lines.push(`Group: ${d.group.name}`);
	const acl = (label: string, a?: Acl) => {
		if (!a) return;
		lines.push(`${label}${a.flags.length ? ` [${a.flags.join(' ')}]` : ''}:`);
		for (const e of a.aces) {
			const obj = e.objectGuid ? ` on ${e.objectName ?? e.objectGuid}` : '';
			lines.push(
				`  ${e.typeName}  ${e.trustee.name}  ${rightsText(e, d.ctx)}${obj}  [${inheritText(e)}${e.flags.includes('ID') ? ', inherited' : ''}]`
			);
		}
	};
	acl('DACL', d.dacl);
	acl('SACL', d.sacl);
	for (const r of d.risks) lines.push(`${r.severity.toUpperCase()}: ${r.text}`);
	return lines.join('\n');
}

/** Paste recognition: a descriptor with an ACE, or a run of ACEs. */
export function looksLikeSddl(s: string): number {
	const t = s.trim();
	if (t.length > 20000) return 0;
	const ace = /\((A|D|OA|OD|AU|OU|ML|XA|XD|ZA);[A-Z]*;[^;()]*;[^;()]*;[^;()]*;[^;()]+\)/i;
	if (/^(O:|G:|D:|S:)/.test(t) && ace.test(t)) return 0.95;
	if (/^O:[A-Z]{2}G:[A-Z]{2}/.test(t) || /^O:S-1-[\d-]+G:/.test(t)) return 0.9;
	if (/^\(/.test(t) && ace.test(t) && /\)$/.test(t)) return 0.85;
	return 0;
}
