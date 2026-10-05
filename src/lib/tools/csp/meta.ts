import type { ToolMeta } from '../types';

export const meta: ToolMeta = {
	id: 'csp',
	chapter: 9,
	section: 5,
	title: 'Content-Security-Policy',
	summary:
		'Explain a CSP directive by directive, flag risky sources and missing directives, or build a new policy.',
	keywords: [
		'csp',
		'content security policy',
		'header',
		'xss',
		'script-src',
		'unsafe-inline',
		'nonce',
		'strict-dynamic',
		'frame-ancestors',
		'clickjacking',
		'security headers'
	],
	network: false
};
