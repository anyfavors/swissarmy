import type { ToolMeta } from '../types';

export const meta: ToolMeta = {
	id: 'xml',
	chapter: 5,
	section: 6,
	title: 'XML formatter',
	summary: 'Pretty-print, minify and check XML for well-formedness, with an XPath tester.',
	keywords: [
		'xml',
		'pretty print',
		'beautify',
		'minify',
		'validate',
		'well-formed',
		'xpath',
		'namespace',
		'cdata',
		'svg',
		'soap',
		'rss'
	],
	network: false,
	chain: { in: 'text', out: 'text' }
};
