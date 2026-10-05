import type { ToolMeta } from '../types';

export const meta: ToolMeta = {
	id: 'kerberos',
	chapter: 13,
	section: 6,
	title: 'Kerberos ticket flags and etypes',
	summary:
		'Decode and build ticket flags like klist, and look up encryption type numbers with strength notes.',
	keywords: [
		'kerberos',
		'klist',
		'ticket flags',
		'0x40e10000',
		'forwardable',
		'renewable',
		'ok_as_delegate',
		'name_canonicalize',
		'etype',
		'encryption type',
		'rc4-hmac',
		'0x17',
		'aes256',
		'kerberoasting',
		'rfc 4120',
		'4769'
	],
	network: false,
	chain: { in: 'text', out: 'text' }
};
