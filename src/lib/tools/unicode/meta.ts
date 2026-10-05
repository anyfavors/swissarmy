import type { ToolMeta } from '../types';
import { looksSuspicious } from './detect';

export const meta: ToolMeta = {
	id: 'unicode',
	chapter: 1,
	section: 4,
	title: 'Unicode inspector',
	summary:
		'Show each code point with name, UTF-8 and UTF-16, find invisible, bidi and look-alike characters, normalise.',
	keywords: [
		'code point',
		'utf-8',
		'utf-16',
		'zero width',
		'zwsp',
		'bidi',
		'trojan source',
		'cve-2021-42574',
		'homoglyph',
		'confusable',
		'normalization',
		'nfc',
		'nfkc',
		'grapheme',
		'emoji'
	],
	network: false,
	detect: looksSuspicious,
	chain: { in: 'text', out: 'text' }
};
