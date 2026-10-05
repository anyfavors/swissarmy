import type { ToolMeta } from '../types';

export const meta: ToolMeta = {
	id: 'csv',
	chapter: 5,
	section: 4,
	title: 'CSV and JSON',
	summary: 'View CSV as a sortable table and convert between CSV, JSON and Markdown.',
	keywords: [
		'csv',
		'tsv',
		'rfc4180',
		'semicolon',
		'excel',
		'spreadsheet',
		'json to csv',
		'csv to json',
		'markdown table',
		'flatten'
	],
	network: false,
	chain: { in: 'text', out: 'text' }
};
