import type { ToolMeta } from '../types';

export const meta: ToolMeta = {
	id: 'uac-flags',
	chapter: 13,
	section: 2,
	title: 'userAccountControl flags',
	summary:
		'Decode and build AD userAccountControl and msDS-SupportedEncryptionTypes, with risky flags and LDAP filters.',
	keywords: [
		'useraccountcontrol',
		'uac',
		'active directory',
		'accountdisable',
		'dont_req_preauth',
		'as-rep roasting',
		'delegation',
		'msds-supportedencryptiontypes',
		'kerberos',
		'rc4',
		'aes',
		'ldap filter',
		'1.2.840.113556.1.4.803'
	],
	network: false
};
