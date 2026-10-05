import type { ToolMeta } from '../types';

export const meta: ToolMeta = {
	id: 'mojibake',
	chapter: 1,
	section: 9,
	title: 'Mojibake fixer',
	summary:
		'Repair double-encoded UTF-8 such as Ã¦Ã¸Ã¥ or â€™, and explain text that cannot be repaired.',
	keywords: [
		'mojibake',
		'garbled text',
		'double encoding',
		'utf-8',
		'latin-1',
		'windows-1252',
		'cp1252',
		'iso-8859-1',
		'encoding',
		'replacement character',
		'Ã'
	],
	network: false,
	chain: { in: 'text', out: 'text' }
};
