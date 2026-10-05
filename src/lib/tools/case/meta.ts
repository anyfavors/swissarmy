import type { ToolMeta } from '../types';

export const meta: ToolMeta = {
	id: 'case',
	chapter: 7,
	section: 1,
	title: 'Case converter',
	summary: 'Convert text or identifiers to camelCase, snake_case, kebab-case, Title Case and more.',
	keywords: [
		'camelcase',
		'pascalcase',
		'snake_case',
		'kebab-case',
		'constant',
		'screaming snake',
		'title case',
		'sentence case',
		'uppercase',
		'lowercase',
		'identifier',
		'variable name'
	],
	network: false,
	chain: { in: 'text', out: 'text' }
};
