import type { ToolMeta } from '../types';

export const meta: ToolMeta = {
	id: 'dmarc-report',
	chapter: 8,
	section: 4,
	title: 'DMARC report viewer',
	summary:
		'Open a DMARC aggregate report (XML, gzip or zip) and see which servers send as your domain and whether they pass.',
	keywords: [
		'dmarc',
		'rua',
		'aggregate report',
		'xml',
		'gzip',
		'zip',
		'source ip',
		'alignment',
		'dkim',
		'spf',
		'deliverability'
	],
	network: false
};
