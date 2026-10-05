import type { ToolMeta } from '../types';

export const meta: ToolMeta = {
	id: 'spf',
	chapter: 8,
	section: 2,
	title: 'SPF record',
	summary:
		'Explain an SPF record term by term, or look up a domain and count its DNS lookups against the limit of 10.',
	keywords: [
		'spf',
		'v=spf1',
		'sender policy framework',
		'include',
		'redirect',
		'softfail',
		'lookup limit',
		'permerror',
		'void lookup',
		'rfc7208',
		'email authentication'
	],
	network: {
		hosts: ['cloudflare-dns.com', 'dns.google'],
		purpose: 'the TXT, A and MX names of the domain and its includes, only when you press Look up'
	}
};
