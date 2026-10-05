import type { ToolMeta } from '../types';

export const meta: ToolMeta = {
	id: 'grok',
	chapter: 14,
	section: 8,
	title: 'Grok pattern tester',
	summary:
		'Expand Logstash grok patterns to a regex and test them on sample lines, with extracted fields.',
	keywords: [
		'grok',
		'logstash',
		'elasticsearch',
		'elk',
		'ingest pipeline',
		'pattern',
		'regex',
		'log parsing',
		'combinedapachelog',
		'syslogbase',
		'oniguruma'
	],
	network: false
};
