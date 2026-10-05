import type { ToolMeta } from '../types';
import { looksLikeCloudId } from './logic';

export const meta: ToolMeta = {
	id: 'cloud-id',
	chapter: 14,
	section: 2,
	title: 'Cloud resource IDs',
	summary: 'Split and check AWS ARNs, Azure resource IDs and Google Cloud resource names.',
	keywords: [
		'arn',
		'aws',
		'amazon resource name',
		'azure',
		'resource id',
		'subscription',
		'resource group',
		'gcp',
		'google cloud',
		'resource name',
		's3',
		'iam'
	],
	network: false,
	detect: looksLikeCloudId
};
