import type { ToolMeta } from '../types';

export const meta: ToolMeta = {
	id: 'log-parser',
	chapter: 14,
	section: 7,
	title: 'Log line parser',
	summary:
		'Parse access logs, custom nginx log_format, syslog, JSON lines and logfmt into fields, with top values and time range.',
	keywords: [
		'log',
		'nginx',
		'apache',
		'access log',
		'combined',
		'log_format',
		'logformat',
		'syslog',
		'rfc 5424',
		'rfc 3164',
		'json lines',
		'ndjson',
		'logfmt',
		'top ips',
		'status codes'
	],
	network: false,
	chain: { in: 'text', out: 'text' }
};
