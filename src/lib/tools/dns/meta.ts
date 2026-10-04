import type { ToolMeta } from '../types';
import { looksLikeDomain } from './logic';

export const meta: ToolMeta = {
	id: 'dns',
	chapter: 2,
	section: 3,
	title: 'DNS lookup',
	summary:
		'Query A, AAAA, MX, TXT, CAA and other records over DNS over HTTPS, with DNSSEC flag and TTLs.',
	keywords: [
		'dig',
		'nslookup',
		'doh',
		'dns over https',
		'resolver',
		'mx',
		'txt',
		'spf',
		'dmarc',
		'dkim',
		'caa',
		'ptr',
		'reverse',
		'dnssec',
		'nxdomain'
	],
	network: {
		hosts: ['cloudflare-dns.com', 'dns.google'],
		purpose: 'the name and record type you look up, to the one resolver you pick'
	},
	detect: looksLikeDomain
};
