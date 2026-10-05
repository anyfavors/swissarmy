import type { ToolMeta } from '../types';

export const meta: ToolMeta = {
	id: 'retention',
	chapter: 15,
	section: 3,
	title: 'Backup retention',
	summary:
		'GFS retention to restore points, oldest restore date and storage estimate, plus a 3-2-1-1-0 check.',
	keywords: [
		'backup',
		'gfs',
		'grandfather father son',
		'restore point',
		'incremental',
		'full backup',
		'dedupe',
		'compression',
		'3-2-1',
		'immutable',
		'air gap',
		'veeam'
	],
	network: false
};
