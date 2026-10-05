/**
 * userAccountControl and msDS-SupportedEncryptionTypes.
 *
 * Sources:
 * - Microsoft Learn, "Use the UserAccountControl flags to manipulate user account properties"
 *   (troubleshoot/windows-server/active-directory/useraccountcontrol-manipulate-account-properties)
 * - [MS-ADTS] 2.2.16 userAccountControl Bits (adds NO_AUTH_DATA_REQUIRED, PARTIAL_SECRETS_ACCOUNT,
 *   USE_AES_KEYS)
 * - [MS-KILE] 2.2.7 Supported Encryption Types Bit Flags
 * - LDAP matching rules: Microsoft Learn, "Search Filter Syntax" (LDAP_MATCHING_RULE_BIT_AND
 *   1.2.840.113556.1.4.803, LDAP_MATCHING_RULE_BIT_OR 1.2.840.113556.1.4.804)
 */

export type Risk = 'high' | 'medium' | 'info' | 'good';

export interface Flag {
	name: string;
	value: number;
	desc: string;
	risk?: Risk;
	note?: string;
}

export const UAC_FLAGS: Flag[] = [
	{ name: 'SCRIPT', value: 0x1, desc: 'Logon script runs' },
	{ name: 'ACCOUNTDISABLE', value: 0x2, desc: 'Account is disabled' },
	{ name: 'HOMEDIR_REQUIRED', value: 0x8, desc: 'Home folder required' },
	{
		name: 'LOCKOUT',
		value: 0x10,
		desc: 'Account is locked out',
		note: 'Not kept up to date in AD. Read msDS-User-Account-Control-Computed or lockoutTime instead.'
	},
	{
		name: 'PASSWD_NOTREQD',
		value: 0x20,
		desc: 'No password required',
		risk: 'high',
		note: 'The account may have an empty password, regardless of the password policy.'
	},
	{
		name: 'PASSWD_CANT_CHANGE',
		value: 0x40,
		desc: 'User cannot change password',
		note: 'Not stored in this attribute. It is a deny ACE on the object, so setting the bit does nothing.'
	},
	{
		name: 'ENCRYPTED_TEXT_PWD_ALLOWED',
		value: 0x80,
		desc: 'Store password with reversible encryption',
		risk: 'high',
		note: 'The password is stored in a form that can be decrypted to clear text.'
	},
	{
		name: 'TEMP_DUPLICATE_ACCOUNT',
		value: 0x100,
		desc: 'Local account for a user from another domain'
	},
	{ name: 'NORMAL_ACCOUNT', value: 0x200, desc: 'Normal user account' },
	{ name: 'INTERDOMAIN_TRUST_ACCOUNT', value: 0x800, desc: 'Trust account for a trusting domain' },
	{
		name: 'WORKSTATION_TRUST_ACCOUNT',
		value: 0x1000,
		desc: 'Computer account (workstation or member server)'
	},
	{ name: 'SERVER_TRUST_ACCOUNT', value: 0x2000, desc: 'Domain controller computer account' },
	{
		name: 'DONT_EXPIRE_PASSWORD',
		value: 0x10000,
		desc: 'Password never expires',
		risk: 'medium',
		note: 'Common on service accounts. Long-lived passwords are what Kerberoasting cracks offline.'
	},
	{ name: 'MNS_LOGON_ACCOUNT', value: 0x20000, desc: 'Majority Node Set (cluster) logon account' },
	{
		name: 'SMARTCARD_REQUIRED',
		value: 0x40000,
		desc: 'Smart card required for interactive logon',
		risk: 'good'
	},
	{
		name: 'TRUSTED_FOR_DELEGATION',
		value: 0x80000,
		desc: 'Trusted for unconstrained Kerberos delegation',
		risk: 'high',
		note: 'Users who authenticate to this account leave a forwardable TGT on it. Normal for domain controllers, dangerous anywhere else.'
	},
	{
		name: 'NOT_DELEGATED',
		value: 0x100000,
		desc: 'Account is sensitive and cannot be delegated',
		risk: 'good',
		note: 'Recommended for administrator accounts.'
	},
	{
		name: 'USE_DES_KEY_ONLY',
		value: 0x200000,
		desc: 'Use only DES keys for Kerberos',
		risk: 'high',
		note: 'DES is broken and disabled by default since Windows 7 and Server 2008 R2.'
	},
	{
		name: 'DONT_REQ_PREAUTH',
		value: 0x400000,
		desc: 'Kerberos pre-authentication not required',
		risk: 'high',
		note: 'AS-REP roastable: anyone can request a ticket encrypted with the password hash and crack it offline.'
	},
	{
		name: 'PASSWORD_EXPIRED',
		value: 0x800000,
		desc: 'Password has expired',
		note: 'Computed, read it from msDS-User-Account-Control-Computed.'
	},
	{
		name: 'TRUSTED_TO_AUTH_FOR_DELEGATION',
		value: 0x1000000,
		desc: 'Constrained delegation with protocol transition (S4U2Self)',
		risk: 'high',
		note: 'The account can get tickets for any user to the services in msDS-AllowedToDelegateTo, without that user authenticating.'
	},
	{
		name: 'NO_AUTH_DATA_REQUIRED',
		value: 0x2000000,
		desc: 'No PAC in service tickets for this account (MS-ADTS)'
	},
	{
		name: 'PARTIAL_SECRETS_ACCOUNT',
		value: 0x4000000,
		desc: 'Read-only domain controller computer account'
	},
	{ name: 'USE_AES_KEYS', value: 0x8000000, desc: 'Use AES keys (MS-ADTS, not used by Windows)' }
];

export const ENC_FLAGS: Flag[] = [
	{ name: 'DES-CBC-CRC', value: 0x1, desc: 'DES with CRC', risk: 'high', note: 'DES is broken.' },
	{ name: 'DES-CBC-MD5', value: 0x2, desc: 'DES with MD5', risk: 'high', note: 'DES is broken.' },
	{
		name: 'RC4-HMAC',
		value: 0x4,
		desc: 'RC4 with HMAC-MD5',
		risk: 'medium',
		note: 'The key is the NT hash, so RC4 tickets are the fast ones to crack.'
	},
	{ name: 'AES128-CTS-HMAC-SHA1-96', value: 0x8, desc: 'AES 128', risk: 'good' },
	{ name: 'AES256-CTS-HMAC-SHA1-96', value: 0x10, desc: 'AES 256', risk: 'good' },
	{
		name: 'AES256-CTS-HMAC-SHA1-96-SK',
		value: 0x20,
		desc: 'AES 256 session keys even if the ticket uses RC4'
	},
	{ name: 'FAST-supported', value: 0x10000, desc: 'Kerberos armoring (FAST) supported' },
	{
		name: 'Compound-identity-supported',
		value: 0x20000,
		desc: 'Compound identity (device claims) supported'
	},
	{ name: 'Claims-supported', value: 0x40000, desc: 'Claims supported' },
	{
		name: 'Resource-SID-compression-disabled',
		value: 0x80000,
		desc: 'Resource SID compression disabled'
	}
];

export interface Preset {
	value: number;
	label: string;
}

export const UAC_PRESETS: Preset[] = [
	{ value: 512, label: 'Normal user' },
	{ value: 514, label: 'Disabled user' },
	{ value: 66048, label: 'Password never expires' },
	{ value: 66050, label: 'Disabled, never expires' },
	{ value: 4096, label: 'Computer' },
	{ value: 532480, label: 'Domain controller' },
	{ value: 83890176, label: 'Read-only DC' },
	{ value: 4260352, label: 'No preauth, never expires' }
];

export const ENC_PRESETS: Preset[] = [
	{ value: 0x4, label: 'RC4 only' },
	{ value: 0x18, label: 'AES only' },
	{ value: 0x1c, label: 'RC4 + AES' },
	{ value: 0x24, label: 'RC4 + AES-SK' },
	{ value: 0x27, label: 'DES + RC4 + AES-SK' }
];

/** Parses decimal or 0x hex, 32-bit unsigned. Negative values (signed int32 as some tools show) wrap. */
export function parseFlags(raw: string): number {
	const t = raw.trim().replace(/[_\s]/g, '');
	if (!t) throw new Error('Enter a value');
	let n: number;
	if (/^0x[0-9a-f]+$/i.test(t)) n = parseInt(t.slice(2), 16);
	else if (/^-?\d+$/.test(t)) n = Number(t);
	else throw new Error(`"${raw.trim()}" is not a decimal or 0x hex number`);
	if (n < -0x80000000 || n > 0xffffffff) throw new Error('Out of range for a 32-bit value');
	return n >>> 0;
}

export interface Decoded {
	value: number;
	set: Flag[];
	unknown: number;
}

export function decode(value: number, table: Flag[]): Decoded {
	const set = table.filter((f) => (value & f.value) !== 0);
	const known = table.reduce((a, f) => a | f.value, 0);
	return { value, set, unknown: (value & ~known) >>> 0 };
}

export function compose(names: string[], table: Flag[]): number {
	let v = 0;
	for (const n of names) {
		const f = table.find((x) => x.name === n);
		if (!f) throw new Error(`Unknown flag ${n}`);
		v |= f.value;
	}
	return v >>> 0;
}

export const hex = (n: number) => '0x' + n.toString(16).toUpperCase().padStart(8, '0');

export const BIT_AND = '1.2.840.113556.1.4.803';
export const BIT_OR = '1.2.840.113556.1.4.804';

/** LDAP filter that matches objects with all (or any) of these bits set, or none of them. */
export function ldapFilter(
	attr: string,
	value: number,
	mode: 'all' | 'any' | 'none' = 'all'
): string {
	if (!value) throw new Error('Pick at least one flag for a filter');
	const rule = mode === 'any' ? BIT_OR : BIT_AND;
	const f = `(${attr}:${rule}:=${value >>> 0})`;
	return mode === 'none' ? `(!${f})` : f;
}

export interface Warning {
	level: Risk;
	text: string;
}

export function encWarnings(value: number): Warning[] {
	const w: Warning[] = [];
	const etypes = value & 0x1f;
	if (value === 0) {
		w.push({
			level: 'medium',
			text: 'Not set or 0: the KDC uses its default (DefaultDomainSupportedEncTypes). On older domains that meant RC4.'
		});
		return w;
	}
	if (etypes & 0x3) w.push({ level: 'high', text: 'DES is enabled.' });
	if (etypes & 0x4 && !(etypes & 0x18))
		w.push({
			level: 'high',
			text: 'RC4 only: no AES. Tickets for this account are fast to crack offline.'
		});
	else if (etypes & 0x4) w.push({ level: 'medium', text: 'RC4 still allowed alongside AES.' });
	if (!(etypes & 0x1f) && value & 0x20)
		w.push({
			level: 'medium',
			text: 'Only the AES session key bit is set, no ticket encryption types.'
		});
	if (etypes & 0x18 && !(etypes & 0x7)) w.push({ level: 'good', text: 'AES only.' });
	return w;
}
