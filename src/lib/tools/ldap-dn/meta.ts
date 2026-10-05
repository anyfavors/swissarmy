import type { ToolMeta } from '../types';
import { looksLikeDn } from './logic';

export const meta: ToolMeta = {
	id: 'ldap-dn',
	chapter: 8,
	section: 5,
	title: 'LDAP DN',
	summary:
		'Parse distinguished names, convert to canonical name form, and escape values for DNs and search filters.',
	keywords: [
		'ldap',
		'distinguished name',
		'dn',
		'rdn',
		'active directory',
		'canonicalname',
		'filter',
		'escape',
		'rfc4514',
		'rfc4515',
		'ldap injection'
	],
	network: false,
	detect: looksLikeDn,
	chain: { in: 'text', out: 'text' }
};
