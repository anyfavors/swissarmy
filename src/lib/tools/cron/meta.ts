import type { ToolMeta } from '../types';
import { looksLikeCron } from './logic';

export const meta: ToolMeta = {
	id: 'cron',
	chapter: 3,
	section: 4,
	title: 'Cron expression',
	summary:
		'Cron schedule in plain English, field by field, with the next 10 runs in any time zone.',
	keywords: [
		'cron',
		'crontab',
		'schedule',
		'quartz',
		'vixie',
		'job',
		'timer',
		'@daily',
		'next run',
		'dst'
	],
	network: false,
	detect: looksLikeCron
};
