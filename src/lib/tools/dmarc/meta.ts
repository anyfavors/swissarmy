import type { ToolMeta } from '../types';
import { looksLikeDmarc } from './logic';

export const meta: ToolMeta = {
	id: 'dmarc',
	chapter: 8,
	section: 3,
	title: 'DMARC record',
	summary: 'Explain and build v=DMARC1 policy records, with an optional DNS over HTTPS lookup.',
	keywords: [
		'dmarc',
		'_dmarc',
		'rua',
		'ruf',
		'policy',
		'quarantine',
		'reject',
		'alignment',
		'rfc7489',
		'dmarcbis',
		'email authentication'
	],
	network: {
		hosts: ['cloudflare-dns.com', 'dns.google'],
		purpose: 'the _dmarc name you look up, only when you press Look up'
	},
	detect: looksLikeDmarc
};
