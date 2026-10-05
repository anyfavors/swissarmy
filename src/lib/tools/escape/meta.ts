import type { ToolMeta } from '../types';

export const meta: ToolMeta = {
	id: 'escape',
	chapter: 1,
	section: 7,
	title: 'String escaping',
	summary:
		'Escape and unescape a string for JSON, JavaScript, C and Java, Python, SQL, shell, PowerShell, CSV, regex, HTML and XML.',
	keywords: [
		'escape',
		'unescape',
		'string literal',
		'quote',
		'json',
		'javascript',
		'java',
		'python',
		'sql',
		'bash',
		'shell',
		'powershell',
		'csv',
		'regex',
		'html attribute',
		'xml',
		'backslash'
	],
	network: false,
	chain: { in: 'text', out: 'text' }
};
