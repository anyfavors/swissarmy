import type { ToolMeta } from '../types';

export const meta: ToolMeta = {
	id: 'slug',
	chapter: 7,
	section: 5,
	title: 'Slug and filename',
	summary:
		'Turn a title into a URL slug, or any text into a filename that is safe on Windows, macOS and Linux.',
	keywords: [
		'slugify',
		'permalink',
		'url',
		'filename',
		'sanitize',
		'reserved names',
		'con',
		'transliterate',
		'accents',
		'æøå'
	],
	network: false,
	chain: { in: 'text', out: 'text' }
};
