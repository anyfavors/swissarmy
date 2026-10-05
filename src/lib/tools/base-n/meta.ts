import type { ToolMeta } from '../types';

export const meta: ToolMeta = {
	id: 'base-n',
	chapter: 1,
	section: 6,
	title: 'Base32, Base58, Base85 and more',
	summary:
		'Encode and decode Base32, base32hex, Crockford, Base58 and Base58Check, Ascii85, Z85, Base45 and Base36.',
	keywords: [
		'base32',
		'base32hex',
		'crockford',
		'base58',
		'base58check',
		'bitcoin',
		'base85',
		'ascii85',
		'z85',
		'zeromq',
		'base45',
		'eu dcc',
		'base36',
		'rfc4648',
		'rfc9285'
	],
	network: false,
	chain: { in: 'text', out: 'text' }
};
