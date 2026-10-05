import type { ToolMeta } from '../types';

export const meta: ToolMeta = {
	id: 'iam-policy',
	chapter: 14,
	section: 4,
	title: 'IAM policy explainer',
	summary:
		'Explain AWS IAM policies and Azure role definitions statement by statement, flag risky grants, test an action.',
	keywords: [
		'aws',
		'iam',
		'policy',
		'statement',
		'effect',
		'principal',
		'action',
		'notaction',
		'resource',
		'condition',
		'passrole',
		'bucket policy',
		'azure',
		'rbac',
		'role definition',
		'least privilege'
	],
	network: false
};
