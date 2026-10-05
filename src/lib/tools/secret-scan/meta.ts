import type { ToolMeta } from '../types';

export const meta: ToolMeta = {
	id: 'secret-scan',
	chapter: 4,
	section: 9,
	title: 'Secret scanner',
	summary:
		'Find API keys, tokens, private keys and passwords in text before sharing it, and redact them.',
	keywords: [
		'secret',
		'credential',
		'leak',
		'token',
		'api key',
		'aws',
		'github',
		'redact',
		'password',
		'entropy',
		'gitleaks',
		'trufflehog'
	],
	network: false,
	chain: { in: 'text', out: 'text' }
};
