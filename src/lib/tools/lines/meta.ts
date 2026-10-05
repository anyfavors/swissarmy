import type { ToolMeta } from '../types';

export const meta: ToolMeta = {
	id: 'lines',
	chapter: 7,
	section: 2,
	title: 'Line tools',
	summary: 'Sort, dedupe, trim, number, wrap, shuffle and count lines, as a pipeline of steps.',
	keywords: [
		'sort',
		'uniq',
		'unique',
		'dedupe',
		'duplicates',
		'natural sort',
		'shuffle',
		'wrap',
		'join',
		'split',
		'prefix',
		'suffix',
		'number lines',
		'frequency'
	],
	network: false,
	chain: { in: 'text', out: 'text' }
};
