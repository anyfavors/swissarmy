import type { ToolMeta } from '../types';

export const meta: ToolMeta = {
	id: 'compose',
	chapter: 14,
	section: 3,
	title: 'docker run ⇄ compose',
	summary:
		'Turn a docker run command into a Compose service and back, with unsupported flags called out.',
	keywords: [
		'docker',
		'docker run',
		'docker compose',
		'docker-compose',
		'compose.yaml',
		'podman',
		'container',
		'ports',
		'volumes',
		'environment',
		'healthcheck'
	],
	network: false,
	chain: { in: 'text', out: 'text' }
};
