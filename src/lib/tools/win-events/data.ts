/**
 * Windows Security log reference data. Loaded on demand by the tool.
 *
 * Sources (Microsoft Learn, "Advanced security audit policies", one page per event, at
 * learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-10/security/threat-protection/auditing/event-<id>):
 * event titles, the 4624 logon type table, the 4625 and 4776 status codes, the 4768 / 4771
 * result codes and pre-authentication types, 4688 token elevation types.
 * Error codes: [MS-ERREF] "Windows Error Codes" (Microsoft Open Specifications): 2.1 HRESULT,
 * 2.2 Win32 error codes, 2.3 NTSTATUS. Kerberos error numbers: RFC 4120 section 7.5.9.
 * Event 7045 is written by the Service Control Manager to the System log; it has no page in
 * the audit series above.
 */

export interface WinEvent {
	id: number;
	log: 'Security' | 'System';
	title: string;
	category: string;
	/** What it is good for, short */
	why: string;
	/** Fields worth reading */
	fields?: string[];
	/** Related event IDs */
	see?: number[];
}

export const events: WinEvent[] = [
	{
		id: 4624,
		log: 'Security',
		title: 'An account was successfully logged on.',
		category: 'Logon',
		why: 'Every successful logon. Logon Type says how; Logon ID ties it to later events and to 4634.',
		fields: [
			'Logon Type',
			'New Logon: Account Name, Logon ID',
			'Network Information: Workstation Name, Source Network Address',
			'Authentication Package (Kerberos, NTLM, Negotiate)',
			'Elevated Token'
		],
		see: [4625, 4634, 4672]
	},
	{
		id: 4625,
		log: 'Security',
		title: 'An account failed to log on.',
		category: 'Logon',
		why: 'Failed logons. Status and Sub Status give the reason; many from one source address point to password guessing.',
		fields: [
			'Logon Type',
			'Account For Which Logon Failed',
			'Status, Sub Status',
			'Source Network Address'
		],
		see: [4624, 4740, 4771, 4776]
	},
	{
		id: 4634,
		log: 'Security',
		title: 'An account was logged off.',
		category: 'Logon',
		why: 'Logon session ended. Match the Logon ID with 4624 for session length. Not always logged for network logons.',
		see: [4624, 4647]
	},
	{
		id: 4647,
		log: 'Security',
		title: 'User initiated logoff.',
		category: 'Logon',
		why: 'The user chose to log off (interactive and remote interactive sessions). 4634 follows.',
		see: [4634]
	},
	{
		id: 4648,
		log: 'Security',
		title: 'A logon was attempted using explicit credentials.',
		category: 'Logon',
		why: 'A process used other credentials than its own: runas, mapped drives with a password, some lateral movement tools.',
		fields: [
			'Subject (who ran it)',
			'Account Whose Credentials Were Used',
			'Target Server Name',
			'Process Name'
		]
	},
	{
		id: 4662,
		log: 'Security',
		title: 'An operation was performed on an object.',
		category: 'Directory service access',
		why: 'AD object access with a SACL. Properties with 1131f6aa-… or 1131f6ad-… (replication rights) by an account that is not a domain controller is DCSync.',
		fields: ['Subject', 'Object Type', 'Accesses', 'Properties']
	},
	{
		id: 4672,
		log: 'Security',
		title: 'Special privileges assigned to new logon.',
		category: 'Logon',
		why: 'The new logon holds admin-level privileges (SeDebugPrivilege, SeTcbPrivilege, SeBackupPrivilege and others). Follows 4624 for admins and SYSTEM.',
		see: [4624]
	},
	{
		id: 4688,
		log: 'Security',
		title: 'A new process has been created.',
		category: 'Detailed tracking',
		why: 'Process start. Command line is only included when the policy "Include command line in process creation events" is on.',
		fields: [
			'New Process Name, Process Command Line',
			'Creator Process Name',
			'Token Elevation Type: %%1936 type 1 (full token, UAC off or built-in admin), %%1937 type 2 (elevated), %%1938 type 3 (limited)'
		]
	},
	{
		id: 4697,
		log: 'Security',
		title: 'A service was installed in the system.',
		category: 'System',
		why: 'New service. Needs "Audit Security System Extension". Attack tools often install a service with a random name; check Service File Name.',
		fields: ['Service Name', 'Service File Name', 'Service Account'],
		see: [7045]
	},
	{
		id: 4698,
		log: 'Security',
		title: 'A scheduled task was created.',
		category: 'Object access',
		why: 'New scheduled task, a common persistence method. Task Content holds the XML with the command.',
		see: [4699, 4702]
	},
	{
		id: 4699,
		log: 'Security',
		title: 'A scheduled task was deleted.',
		category: 'Object access',
		why: 'Task removed, sometimes right after it ran.',
		see: [4698]
	},
	{
		id: 4702,
		log: 'Security',
		title: 'A scheduled task was updated.',
		category: 'Object access',
		why: 'Task changed. Compare Task New Content with what it was.',
		see: [4698]
	},
	{
		id: 4719,
		log: 'Security',
		title: 'System audit policy was changed.',
		category: 'Policy change',
		why: 'Auditing turned on or off. Turning success or failure auditing off is a classic cover-your-tracks step.'
	},
	{
		id: 4720,
		log: 'Security',
		title: 'A user account was created.',
		category: 'Account management',
		why: 'New user (domain on a DC, local on a member). Check who created it and whether it lands in a privileged group.',
		see: [4722, 4728, 4732, 4756]
	},
	{
		id: 4722,
		log: 'Security',
		title: 'A user account was enabled.',
		category: 'Account management',
		why: 'A disabled account was enabled. Usually follows 4720.'
	},
	{
		id: 4723,
		log: 'Security',
		title: "An attempt was made to change an account's password.",
		category: 'Account management',
		why: 'The user changed their own password (knew the old one).',
		see: [4724]
	},
	{
		id: 4724,
		log: 'Security',
		title: "An attempt was made to reset an account's password.",
		category: 'Account management',
		why: 'Someone else reset the password (needs the Reset Password right). Watch for resets of admin and service accounts.',
		see: [4723]
	},
	{
		id: 4725,
		log: 'Security',
		title: 'A user account was disabled.',
		category: 'Account management',
		why: 'Account disabled.'
	},
	{
		id: 4726,
		log: 'Security',
		title: 'A user account was deleted.',
		category: 'Account management',
		why: 'Account deleted.'
	},
	{
		id: 4728,
		log: 'Security',
		title: 'A member was added to a security-enabled global group.',
		category: 'Account management',
		why: 'Group add. Domain Admins is a global group: an add here deserves a look.',
		fields: ['Member: Security ID', 'Group: Group Name', 'Subject (who did it)'],
		see: [4729]
	},
	{
		id: 4729,
		log: 'Security',
		title: 'A member was removed from a security-enabled global group.',
		category: 'Account management',
		why: 'Group removal.'
	},
	{
		id: 4732,
		log: 'Security',
		title: 'A member was added to a security-enabled local group.',
		category: 'Account management',
		why: 'Add to a local or domain local group, including BUILTIN\\Administrators and Remote Desktop Users.',
		see: [4733]
	},
	{
		id: 4733,
		log: 'Security',
		title: 'A member was removed from a security-enabled local group.',
		category: 'Account management',
		why: 'Local group removal.'
	},
	{
		id: 4738,
		log: 'Security',
		title: 'A user account was changed.',
		category: 'Account management',
		why: 'Attributes changed. Watch User Account Control changes such as "Don\'t Require Preauth" or "Trusted For Delegation".'
	},
	{
		id: 4740,
		log: 'Security',
		title: 'A user account was locked out.',
		category: 'Account management',
		why: 'Lockout, logged on the domain controller (the PDC emulator has them all). Caller Computer Name is where the bad attempts came from.',
		see: [4625, 4767, 4771]
	},
	{
		id: 4756,
		log: 'Security',
		title: 'A member was added to a security-enabled universal group.',
		category: 'Account management',
		why: 'Universal group add. Enterprise Admins and Schema Admins are universal groups.',
		see: [4757]
	},
	{
		id: 4757,
		log: 'Security',
		title: 'A member was removed from a security-enabled universal group.',
		category: 'Account management',
		why: 'Universal group removal.'
	},
	{
		id: 4767,
		log: 'Security',
		title: 'A user account was unlocked.',
		category: 'Account management',
		why: 'Someone unlocked a locked-out account.',
		see: [4740]
	},
	{
		id: 4768,
		log: 'Security',
		title: 'A Kerberos authentication ticket (TGT) was requested.',
		category: 'Account logon (DC)',
		why: 'TGT request on a domain controller, success or failure. Pre-Authentication Type 0 means no pre-auth (AS-REP roastable account).',
		fields: [
			'Result Code (Kerberos error, 0x0 is success)',
			'Ticket Encryption Type (0x12 AES256, 0x17 RC4)',
			'Pre-Authentication Type: 0 none, 2 password (encrypted timestamp), 15, 16, 17 certificate (PKINIT), 138 encrypted challenge (FAST)',
			'Client Address'
		],
		see: [4769, 4771]
	},
	{
		id: 4769,
		log: 'Security',
		title: 'A Kerberos service ticket was requested.',
		category: 'Account logon (DC)',
		why: 'Service ticket request. Many requests with Ticket Encryption Type 0x17 (RC4) for user service accounts from one client suggests Kerberoasting.',
		fields: [
			'Service Name',
			'Ticket Encryption Type',
			'Ticket Options',
			'Failure Code',
			'Client Address'
		],
		see: [4768]
	},
	{
		id: 4771,
		log: 'Security',
		title: 'Kerberos pre-authentication failed.',
		category: 'Account logon (DC)',
		why: 'Bad password over Kerberos (Failure Code 0x18). Spread over many accounts it is password spraying.',
		fields: ['Failure Code', 'Client Address', 'Pre-Authentication Type'],
		see: [4768, 4625]
	},
	{
		id: 4776,
		log: 'Security',
		title: 'The computer attempted to validate the credentials for an account.',
		category: 'Account logon',
		why: 'NTLM credential validation, on the DC for domain accounts or locally for local accounts. Error Code uses the same NTSTATUS values as 4625.',
		fields: ['Logon Account', 'Source Workstation', 'Error Code']
	},
	{
		id: 5136,
		log: 'Security',
		title: 'A directory service object was modified.',
		category: 'Directory service changes',
		why: 'AD attribute change with old and new values, if the object has a SACL. Operation Type %%14674 is value added, %%14675 value deleted.',
		fields: ['Object DN', 'Attribute LDAP Display Name', 'Attribute Value', 'Operation Type']
	},
	{
		id: 5140,
		log: 'Security',
		title: 'A network share object was accessed.',
		category: 'Object access',
		why: 'First access to a share in a session. Access to ADMIN$ or C$ from a workstation is worth a look.',
		fields: ['Share Name', 'Source Address', 'Accesses'],
		see: [5145]
	},
	{
		id: 5145,
		log: 'Security',
		title:
			'A network share object was checked to see whether client can be granted desired access.',
		category: 'Object access',
		why: 'Per-file share access check ("Detailed File Share"). Very noisy; useful for named pipes and files touched by remote tools.',
		see: [5140]
	},
	{
		id: 1102,
		log: 'Security',
		title: 'The audit log was cleared.',
		category: 'Log',
		why: 'The Security log was cleared. Subject shows who. Rarely legitimate on servers.'
	},
	{
		id: 4616,
		log: 'Security',
		title: 'The system time was changed.',
		category: 'System',
		why: 'Clock changed. Normal for the time service; by a user process it can be an attempt to confuse timelines.'
	},
	{
		id: 7045,
		log: 'System',
		title: 'A service was installed in the system.',
		category: 'Service Control Manager',
		why: 'New service, always logged in the System log (source Service Control Manager), no audit policy needed. PsExec and many attack tools show up here.',
		fields: [
			'Service Name',
			'Service File Name',
			'Service Type',
			'Service Start Type',
			'Service Account'
		],
		see: [4697]
	}
];

export interface LogonType {
	type: number;
	name: string;
	text: string;
}

export const logonTypes: LogonType[] = [
	{
		type: 2,
		name: 'Interactive',
		text: 'At the keyboard or console, including runas without /netonly.'
	},
	{
		type: 3,
		name: 'Network',
		text: 'From the network: file shares, most remote management, IIS with Windows auth. No reusable credentials left on the target.'
	},
	{ type: 4, name: 'Batch', text: 'Scheduled tasks and other batch servers acting for a user.' },
	{ type: 5, name: 'Service', text: 'A service started by the Service Control Manager.' },
	{ type: 7, name: 'Unlock', text: 'Workstation unlocked.' },
	{
		type: 8,
		name: 'NetworkCleartext',
		text: 'Network logon where the password reached the authentication package unhashed, for example IIS basic authentication.'
	},
	{
		type: 9,
		name: 'NewCredentials',
		text: 'runas /netonly: same local identity, other credentials for outbound connections.'
	},
	{
		type: 10,
		name: 'RemoteInteractive',
		text: 'Remote Desktop, Terminal Services or Remote Assistance.'
	},
	{
		type: 11,
		name: 'CachedInteractive',
		text: 'Interactive logon with cached domain credentials, no domain controller contacted.'
	}
];

export type CodeKind = 'NTSTATUS' | 'Win32' | 'HRESULT' | 'Kerberos';

export interface ErrorCode {
	/** Unsigned 32-bit value */
	code: number;
	kind: CodeKind;
	name: string;
	text: string;
	/** Where it shows up in the logs */
	seen?: string;
}

const nt = (code: number, name: string, text: string, seen?: string): ErrorCode => ({
	code,
	kind: 'NTSTATUS',
	name,
	text,
	seen
});
const w32 = (code: number, name: string, text: string): ErrorCode => ({
	code,
	kind: 'Win32',
	name,
	text
});
const hr = (code: number, name: string, text: string): ErrorCode => ({
	code,
	kind: 'HRESULT',
	name,
	text
});
const krb = (code: number, name: string, text: string): ErrorCode => ({
	code,
	kind: 'Kerberos',
	name,
	text,
	seen: '4768, 4769, 4771 Result / Failure Code'
});

const LOGON = '4625 Status / Sub Status, 4776 Error Code';

export const codes: ErrorCode[] = [
	// NTSTATUS, [MS-ERREF] 2.3.1; meanings in logon events from the 4625 page
	nt(0x00000000, 'STATUS_SUCCESS', 'Success.', '4625 Sub Status 0x0 when Status says it all'),
	nt(0xc0000005, 'STATUS_ACCESS_VIOLATION', 'Invalid memory access (a crash).'),
	nt(0xc000000d, 'STATUS_INVALID_PARAMETER', 'An invalid parameter was passed.'),
	nt(0xc0000022, 'STATUS_ACCESS_DENIED', 'Access denied.'),
	nt(0xc0000034, 'STATUS_OBJECT_NAME_NOT_FOUND', 'Object name not found.'),
	nt(
		0xc000005e,
		'STATUS_NO_LOGON_SERVERS',
		'No logon servers (domain controllers) available.',
		LOGON
	),
	nt(0xc0000064, 'STATUS_NO_SUCH_USER', 'User name does not exist.', LOGON),
	nt(0xc000006a, 'STATUS_WRONG_PASSWORD', 'User name is correct but the password is wrong.', LOGON),
	nt(
		0xc000006d,
		'STATUS_LOGON_FAILURE',
		'Bad user name or authentication information. Generic: the Sub Status says which.',
		LOGON
	),
	nt(
		0xc000006e,
		'STATUS_ACCOUNT_RESTRICTION',
		'Account restriction (logon hours, workstation, blank password). Sub Status says which.',
		LOGON
	),
	nt(0xc000006f, 'STATUS_INVALID_LOGON_HOURS', 'Logon outside the allowed hours.', LOGON),
	nt(
		0xc0000070,
		'STATUS_INVALID_WORKSTATION',
		'Logon from a workstation the account may not use.',
		LOGON
	),
	nt(0xc0000071, 'STATUS_PASSWORD_EXPIRED', 'Password has expired.', LOGON),
	nt(0xc0000072, 'STATUS_ACCOUNT_DISABLED', 'Account is disabled.', LOGON),
	nt(0xc00000dc, 'STATUS_INVALID_SERVER_STATE', 'The SAM server was in the wrong state.', LOGON),
	nt(
		0xc0000133,
		'STATUS_TIME_DIFFERENCE_AT_DC',
		'Clock of the DC and this computer too far apart.',
		LOGON
	),
	nt(
		0xc000015b,
		'STATUS_LOGON_TYPE_NOT_GRANTED',
		'The user lacks the right for this logon type (for example "Allow log on through Remote Desktop Services").',
		LOGON
	),
	nt(0xc000018c, 'STATUS_TRUSTED_DOMAIN_FAILURE', 'Trust between the domains failed.', LOGON),
	nt(0xc0000192, 'STATUS_NETLOGON_NOT_STARTED', 'The Netlogon service is not running.', LOGON),
	nt(0xc0000193, 'STATUS_ACCOUNT_EXPIRED', 'Account has expired.', LOGON),
	nt(
		0xc0000224,
		'STATUS_PASSWORD_MUST_CHANGE',
		'User must change the password at next logon.',
		LOGON
	),
	nt(
		0xc0000225,
		'STATUS_NOT_FOUND',
		'Object not found. In 4625 a known Windows quirk, not a risk.',
		LOGON
	),
	nt(0xc0000234, 'STATUS_ACCOUNT_LOCKED_OUT', 'Account is locked out.', LOGON),
	nt(0xc00002ee, 'STATUS_UNFINISHED_CONTEXT_DELETED', 'An error occurred during logon.', LOGON),
	nt(
		0xc0000371,
		'STATUS_NO_SECRETS',
		'The local account store has no secret material for the account.',
		LOGON
	),
	nt(
		0xc0000413,
		'STATUS_AUTHENTICATION_FIREWALL_FAILED',
		'Selective authentication on a trust: the machine may not be used by this account.',
		LOGON
	),

	// Win32, [MS-ERREF] 2.2
	w32(0, 'ERROR_SUCCESS', 'The operation completed successfully.'),
	w32(1, 'ERROR_INVALID_FUNCTION', 'Incorrect function.'),
	w32(2, 'ERROR_FILE_NOT_FOUND', 'The system cannot find the file specified.'),
	w32(3, 'ERROR_PATH_NOT_FOUND', 'The system cannot find the path specified.'),
	w32(5, 'ERROR_ACCESS_DENIED', 'Access is denied.'),
	w32(32, 'ERROR_SHARING_VIOLATION', 'The file is in use by another process.'),
	w32(53, 'ERROR_BAD_NETPATH', 'The network path was not found.'),
	w32(64, 'ERROR_NETNAME_DELETED', 'The specified network name is no longer available.'),
	w32(67, 'ERROR_BAD_NET_NAME', 'The network name cannot be found.'),
	w32(86, 'ERROR_INVALID_PASSWORD', 'The specified network password is not correct.'),
	w32(87, 'ERROR_INVALID_PARAMETER', 'The parameter is incorrect.'),
	w32(183, 'ERROR_ALREADY_EXISTS', 'Cannot create a file when that file already exists.'),
	w32(
		1219,
		'ERROR_SESSION_CREDENTIAL_CONFLICT',
		'Multiple connections to a server by the same user with different credentials are not allowed.'
	),
	w32(1223, 'ERROR_CANCELLED', 'The operation was cancelled by the user.'),
	w32(1311, 'ERROR_NO_LOGON_SERVERS', 'No logon servers are available.'),
	w32(1314, 'ERROR_PRIVILEGE_NOT_HELD', 'A required privilege is not held by the client.'),
	w32(1317, 'ERROR_NO_SUCH_USER', 'The specified account does not exist.'),
	w32(
		1323,
		'ERROR_WRONG_PASSWORD',
		'Unable to update the password: the current password is wrong.'
	),
	w32(1326, 'ERROR_LOGON_FAILURE', 'The user name or password is incorrect.'),
	w32(1327, 'ERROR_ACCOUNT_RESTRICTION', 'Account restrictions prevent this user from signing in.'),
	w32(1328, 'ERROR_INVALID_LOGON_HOURS', 'Logon outside the allowed hours.'),
	w32(1329, 'ERROR_INVALID_WORKSTATION', 'The user may not sign in to this computer.'),
	w32(1330, 'ERROR_PASSWORD_EXPIRED', 'The password has expired.'),
	w32(1331, 'ERROR_ACCOUNT_DISABLED', 'The account is disabled.'),
	w32(1332, 'ERROR_NONE_MAPPED', 'No mapping between account names and security IDs was done.'),
	w32(1355, 'ERROR_NO_SUCH_DOMAIN', 'The domain does not exist or could not be contacted.'),
	w32(1385, 'ERROR_LOGON_TYPE_NOT_GRANTED', 'The user has not been granted this logon type.'),
	w32(1396, 'ERROR_WRONG_TARGET_NAME', 'The target account name is incorrect (SPN problem).'),
	w32(1460, 'ERROR_TIMEOUT', 'The operation returned because the timeout period expired.'),
	w32(1603, 'ERROR_INSTALL_FAILURE', 'Fatal error during installation (Windows Installer).'),
	w32(1618, 'ERROR_INSTALL_ALREADY_RUNNING', 'Another installation is already in progress.'),
	w32(1722, 'RPC_S_SERVER_UNAVAILABLE', 'The RPC server is unavailable.'),
	w32(
		1789,
		'ERROR_TRUSTED_RELATIONSHIP_FAILURE',
		'The trust relationship between this workstation and the primary domain failed.'
	),
	w32(1793, 'ERROR_ACCOUNT_EXPIRED', 'The user account has expired.'),
	w32(1907, 'ERROR_PASSWORD_MUST_CHANGE', 'The password must be changed before signing in.'),
	w32(1909, 'ERROR_ACCOUNT_LOCKED_OUT', 'The account is locked out.'),
	w32(8453, 'ERROR_DS_DRA_ACCESS_DENIED', 'Replication access was denied.'),

	// HRESULT, [MS-ERREF] 2.1
	hr(0x00000000, 'S_OK', 'Success.'),
	hr(0x00000001, 'S_FALSE', 'Success, with a false or partial result.'),
	hr(0x80004001, 'E_NOTIMPL', 'Not implemented.'),
	hr(0x80004002, 'E_NOINTERFACE', 'No such interface supported.'),
	hr(0x80004003, 'E_POINTER', 'Invalid pointer.'),
	hr(0x80004004, 'E_ABORT', 'Operation aborted.'),
	hr(0x80004005, 'E_FAIL', 'Unspecified failure.'),
	hr(0x8000ffff, 'E_UNEXPECTED', 'Catastrophic failure.'),
	hr(0x80070005, 'E_ACCESSDENIED', 'General access denied error (Win32 5 as an HRESULT).'),
	hr(0x80070006, 'E_HANDLE', 'Invalid handle (Win32 6 as an HRESULT).'),
	hr(0x8007000e, 'E_OUTOFMEMORY', 'Out of memory (Win32 14 as an HRESULT).'),
	hr(0x80070057, 'E_INVALIDARG', 'One or more arguments are invalid (Win32 87 as an HRESULT).'),
	hr(0x80090308, 'SEC_E_INVALID_TOKEN', 'The token supplied to the security function is invalid.'),
	hr(0x8009030c, 'SEC_E_LOGON_DENIED', 'The logon attempt failed.'),

	// Kerberos, RFC 4120 7.5.9; Windows meanings from the 4768 and 4771 pages
	krb(0x0, 'KDC_ERR_NONE', 'No error, ticket issued.'),
	krb(
		0x6,
		'KDC_ERR_C_PRINCIPAL_UNKNOWN',
		'Client not found in the database: bad user name, or new account not replicated yet.'
	),
	krb(0x7, 'KDC_ERR_S_PRINCIPAL_UNKNOWN', 'Server not found: no account has that SPN.'),
	krb(
		0xc,
		'KDC_ERR_POLICY',
		'KDC policy rejects the request, for example logon hours or workstation restriction.'
	),
	krb(
		0xd,
		'KDC_ERR_BADOPTION',
		'KDC cannot accommodate the requested option, often a delegation setting.'
	),
	krb(
		0xe,
		'KDC_ERR_ETYPE_NOSUPP',
		'No encryption type in common between client, KDC and account keys.'
	),
	krb(
		0x12,
		'KDC_ERR_CLIENT_REVOKED',
		'Client credentials revoked: account disabled, expired or locked out.'
	),
	krb(0x17, 'KDC_ERR_KEY_EXPIRED', 'Password has expired.'),
	krb(0x18, 'KDC_ERR_PREAUTH_FAILED', 'Pre-authentication failed: wrong password.'),
	krb(
		0x19,
		'KDC_ERR_PREAUTH_REQUIRED',
		'Pre-authentication required. Normal first round trip of a logon.'
	),
	krb(0x1f, 'KRB_AP_ERR_BAD_INTEGRITY', 'Integrity check on decrypted field failed.'),
	krb(0x20, 'KRB_AP_ERR_TKT_EXPIRED', 'Ticket expired.'),
	krb(0x25, 'KRB_AP_ERR_SKEW', 'Clock skew too great (default limit 5 minutes).'),
	krb(
		0x29,
		'KRB_AP_ERR_MODIFIED',
		'Message stream modified: often a wrong or duplicate SPN, or a stale password on the service.'
	),
	krb(0x3c, 'KRB_ERR_GENERIC', 'Generic error.')
];
