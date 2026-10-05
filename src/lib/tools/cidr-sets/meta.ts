import type { ToolMeta } from '../types';

export const meta: ToolMeta = {
	id: 'cidr-sets',
	chapter: 2,
	section: 5,
	title: 'CIDR aggregation and exclusion',
	summary:
		'Aggregate address lists to the fewest prefixes, convert ranges, subtract sets and test membership.',
	keywords: [
		'cidr',
		'aggregate',
		'summarise',
		'supernet',
		'merge',
		'range',
		'exclude',
		'subtract',
		'allowedips',
		'wireguard',
		'rfc1918',
		'ipv6',
		'ipv4',
		'contains'
	],
	network: false,
	chain: { in: 'text', out: 'text' }
};
