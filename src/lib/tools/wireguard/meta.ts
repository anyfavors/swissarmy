import type { ToolMeta } from '../types';

export const meta: ToolMeta = {
	id: 'wireguard',
	chapter: 2,
	section: 8,
	title: 'WireGuard keys and config',
	summary:
		'Generate X25519 key pairs and matching server and client configs, with QR codes for phones.',
	keywords: [
		'wireguard',
		'wg',
		'vpn',
		'x25519',
		'curve25519',
		'genkey',
		'pubkey',
		'preshared key',
		'wg-quick',
		'wg0.conf',
		'allowedips',
		'peer',
		'qr'
	],
	network: false
};
