import type { ToolMeta } from '../types';
import { looksLikeSid } from './logic';

export const meta: ToolMeta = {
	id: 'sid',
	chapter: 13,
	section: 1,
	title: 'Windows SID',
	summary:
		'Security identifiers between string, hex and Base64 objectSid, with well-known SIDs and RIDs named.',
	keywords: [
		'security identifier',
		'objectsid',
		'rid',
		'well-known sid',
		'domain admins',
		'krbtgt',
		'builtin',
		'ldap',
		'ldapsearch',
		'active directory',
		'entra id'
	],
	network: false,
	detect: looksLikeSid,
	chain: { in: 'text', out: 'text' }
};
