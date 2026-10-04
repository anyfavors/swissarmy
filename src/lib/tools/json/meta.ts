import type { ToolMeta } from '../types';
import { looksLikeJson } from './logic';

export const meta: ToolMeta = {
	id: 'json',
	chapter: 5,
	section: 1,
	title: 'JSON formatter',
	summary: 'Validate, pretty-print, minify and sort JSON, with line and column for errors.',
	keywords: [
		'json',
		'pretty print',
		'beautify',
		'minify',
		'validate',
		'lint',
		'sort keys',
		'rfc8259'
	],
	network: false,
	detect: looksLikeJson,
	chain: { in: 'text', out: 'text' }
};
