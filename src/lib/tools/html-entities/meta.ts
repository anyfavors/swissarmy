import type { ToolMeta } from '../types';

export const meta: ToolMeta = {
	id: 'html-entities',
	chapter: 1,
	section: 3,
	title: 'HTML entities',
	summary: 'Escape text for HTML and decode named, decimal and hex character references.',
	keywords: ['escape', 'unescape', 'html', 'xml', 'character reference', 'amp', 'nbsp', 'xss'],
	network: false,
	chain: { in: 'text', out: 'text' }
};
