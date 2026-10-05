import type { ToolMeta } from '../types';

export const meta: ToolMeta = {
	id: 'certificate',
	chapter: 4,
	section: 4,
	title: 'Certificate decoder',
	summary:
		'Decode X.509 certificates, chains and CSRs: names, validity, key, extensions, fingerprints.',
	keywords: [
		'x509',
		'x.509',
		'pem',
		'der',
		'tls',
		'ssl',
		'csr',
		'pkcs10',
		'san',
		'chain',
		'fingerprint'
	],
	network: false
};
