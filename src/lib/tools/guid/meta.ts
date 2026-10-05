import type { ToolMeta } from '../types';

export const meta: ToolMeta = {
	id: 'guid',
	chapter: 13,
	section: 3,
	title: 'GUID and AD objectGUID',
	summary:
		'GUID strings to AD byte order, Base64 objectGUID and LDAP filters, UUID version info, new v4 and v7.',
	keywords: [
		'uuid',
		'objectguid',
		'active directory',
		'ldap filter',
		'ldapsearch',
		'endian',
		'byte order',
		'uuidv4',
		'uuidv7',
		'rfc 9562',
		'generate'
	],
	network: false,
	chain: { in: 'text', out: 'text' }
};
