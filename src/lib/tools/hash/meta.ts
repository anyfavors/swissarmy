import type { ToolMeta } from '../types';

export const meta: ToolMeta = {
	id: 'hash',
	chapter: 4,
	section: 1,
	title: 'Hash generator',
	summary: 'MD5, SHA-1 and SHA-2 digests and HMAC of text or a local file, with checksum compare.',
	keywords: [
		'md5',
		'sha1',
		'sha256',
		'sha384',
		'sha512',
		'hmac',
		'checksum',
		'digest',
		'sha256sum',
		'verify download'
	],
	network: false,
	chain: { in: 'text', out: 'text' }
};
