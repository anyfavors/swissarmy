import type { ToolMeta } from '../types';

export const meta: ToolMeta = {
	id: 'mac',
	chapter: 2,
	section: 9,
	title: 'MAC address',
	summary:
		'Format a MAC address, read its multicast and local bits, derive EUI-64 and the IPv6 link-local address.',
	keywords: [
		'mac',
		'mac address',
		'eui-48',
		'eui-64',
		'oui',
		'vendor',
		'slaac',
		'link-local',
		'fe80',
		'randomised mac',
		'private address',
		'locally administered',
		'multicast',
		'cisco format'
	],
	network: false
};
