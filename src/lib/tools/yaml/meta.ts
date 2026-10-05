import type { ToolMeta } from '../types';

export const meta: ToolMeta = {
	id: 'yaml',
	chapter: 5,
	section: 5,
	title: 'YAML and JSON',
	summary: 'Convert YAML to JSON and back, with anchors, merge keys and YAML 1.1 pitfalls flagged.',
	keywords: [
		'yaml',
		'yml',
		'json to yaml',
		'yaml to json',
		'kubernetes',
		'k8s',
		'docker-compose',
		'github actions',
		'ansible',
		'norway problem',
		'anchors'
	],
	network: false,
	chain: { in: 'text', out: 'text' }
};
