import type { ToolMeta } from '../types';

export const meta: ToolMeta = {
	id: 'extract',
	chapter: 7,
	section: 3,
	title: 'Extract from text',
	summary: 'Pull IPs, CIDRs, URLs, domains, emails, hashes, CVEs and other indicators out of text.',
	keywords: [
		'ioc',
		'indicators',
		'grep',
		'ip address',
		'ipv6',
		'email',
		'url',
		'domain',
		'mac',
		'md5',
		'sha256',
		'cve',
		'uuid',
		'arn',
		'defang',
		'refang'
	],
	network: false,
	chain: { in: 'text', out: 'text' }
};
