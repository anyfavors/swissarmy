import type { ToolMeta } from '../types';

export const meta: ToolMeta = {
	id: 'compress',
	chapter: 1,
	section: 11,
	title: 'Compression',
	summary:
		'Gzip, deflate and raw deflate, compress and decompress in the browser, with sizes and ratio.',
	keywords: [
		'gzip',
		'gunzip',
		'deflate',
		'inflate',
		'zlib',
		'deflate-raw',
		'compress',
		'decompress',
		'h4si',
		'compressionstream'
	],
	network: false,
	chain: { in: 'text', out: 'text' }
};
