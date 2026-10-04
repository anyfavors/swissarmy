import type { ToolMeta } from '../types';
import { looksLikeCidr } from './logic';

export const meta: ToolMeta = {
	id: 'cidr',
	chapter: 2,
	section: 1,
	title: 'CIDR and subnet calculator',
	summary: 'Network, broadcast, host range, wildcard and RFC classification for an IPv4 prefix.',
	keywords: ['subnet', 'netmask', 'ipv4', 'prefix', 'wildcard', 'broadcast', 'rfc1918', 'cgnat'],
	network: false,
	detect: looksLikeCidr
};
