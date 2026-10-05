import type { ToolMeta } from '../types';

export const meta: ToolMeta = {
	id: 'http-status',
	chapter: 9,
	section: 1,
	title: 'HTTP status codes',
	summary:
		'Every registered HTTP status code with meaning, typical cause and cacheability, plus common nginx and Cloudflare codes.',
	keywords: [
		'http',
		'status',
		'response code',
		'404',
		'500',
		'502',
		'503',
		'redirect',
		'rfc9110',
		'iana',
		'nginx',
		'cloudflare',
		'499',
		'444',
		'52x'
	],
	network: false
};
