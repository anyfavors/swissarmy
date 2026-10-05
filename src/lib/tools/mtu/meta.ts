import type { ToolMeta } from '../types';

export const meta: ToolMeta = {
	id: 'mtu',
	chapter: 2,
	section: 6,
	title: 'MTU and MSS',
	summary:
		'Stack encapsulations on a link MTU and get the inner MTU and the TCP MSS to clamp, with each overhead explained.',
	keywords: [
		'mtu',
		'mss',
		'clamp',
		'overhead',
		'encapsulation',
		'pppoe',
		'vlan',
		'qinq',
		'mpls',
		'gre',
		'ipsec',
		'esp',
		'vxlan',
		'geneve',
		'wireguard',
		'openvpn',
		'fragmentation',
		'pmtud'
	],
	network: false
};
