import type { ToolMeta } from '../types';
import { looksLikeSshKey } from './logic';

export const meta: ToolMeta = {
	id: 'ssh-key',
	chapter: 4,
	section: 6,
	title: 'SSH public key',
	summary:
		'Fingerprints, type and size of OpenSSH public keys, authorized_keys and known_hosts lines.',
	keywords: [
		'ssh',
		'openssh',
		'fingerprint',
		'authorized_keys',
		'known_hosts',
		'ssh-keygen',
		'ed25519',
		'rsa',
		'ecdsa',
		'fido',
		'certificate',
		'md5'
	],
	network: false,
	detect: looksLikeSshKey
};
