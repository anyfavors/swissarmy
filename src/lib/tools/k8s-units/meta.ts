import type { ToolMeta } from '../types';
import { looksLikeResources } from './logic';

export const meta: ToolMeta = {
	id: 'k8s-units',
	chapter: 14,
	section: 1,
	title: 'Kubernetes resource units',
	summary:
		'CPU and memory quantities to cores and bytes, Mi versus M, sums of requests and limits, pod QoS class.',
	keywords: [
		'kubernetes',
		'k8s',
		'resources',
		'requests',
		'limits',
		'millicores',
		'mebibyte',
		'mi',
		'gi',
		'quantity',
		'qos',
		'guaranteed',
		'burstable',
		'besteffort'
	],
	network: false,
	detect: looksLikeResources
};
