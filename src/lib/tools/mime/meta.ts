import type { ToolMeta } from '../types';

export const meta: ToolMeta = {
	id: 'mime',
	chapter: 1,
	section: 8,
	title: 'MIME and email encodings',
	summary:
		'Quoted-printable, RFC 2047 encoded-words in mail headers, and Punycode for international domain names.',
	keywords: [
		'quoted-printable',
		'qp',
		'rfc 2045',
		'rfc 2047',
		'encoded-word',
		'=?utf-8?',
		'mail header',
		'subject',
		'punycode',
		'idn',
		'idna',
		'xn--',
		'rfc 3492',
		'international domain'
	],
	network: false,
	chain: { in: 'text', out: 'text' }
};
