import type { ToolMeta } from '../types';

export const meta: ToolMeta = {
	id: 'url-encoding',
	chapter: 1,
	section: 2,
	title: 'URL encoding',
	summary:
		'Percent-encode and decode text as URI component, full URI or form data, and split URLs.',
	keywords: [
		'percent',
		'urlencode',
		'urldecode',
		'encodeURIComponent',
		'query string',
		'x-www-form-urlencoded',
		'rfc3986'
	],
	network: false,
	chain: { in: 'text', out: 'text' }
};
