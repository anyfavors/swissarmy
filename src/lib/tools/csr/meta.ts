import type { ToolMeta } from '../types';

export const meta: ToolMeta = {
	id: 'csr',
	chapter: 4,
	section: 5,
	title: 'CSR and key generator',
	summary:
		'Generate a key pair and a signed PKCS#10 request with subject and SANs, in the browser.',
	keywords: [
		'csr',
		'pkcs10',
		'pkcs8',
		'certificate request',
		'private key',
		'rsa',
		'ecdsa',
		'ed25519',
		'san',
		'subjectaltname',
		'openssl req',
		'tls'
	],
	network: false
};
