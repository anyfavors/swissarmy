import type { ToolMeta } from '../types';

export const meta: ToolMeta = {
	id: 'ports',
	chapter: 18,
	section: 3,
	title: 'Port reference',
	summary:
		'Well-known and common TCP/UDP ports with IANA service names and notes on services that should never be exposed.',
	keywords: [
		'port',
		'tcp',
		'udp',
		'iana',
		'service name',
		'firewall',
		'well-known ports',
		'rdp 3389',
		'smb 445',
		'ssh 22',
		'winrm',
		'kubernetes',
		'exposed services',
		'attack surface'
	],
	network: false
};
