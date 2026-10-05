import type { ToolMeta } from '../types';

export const meta: ToolMeta = {
	id: 'table',
	chapter: 5,
	section: 7,
	title: 'Table converter',
	summary:
		'Paste a table from Excel, Google Sheets, Markdown, HTML or CSV and get Markdown, HTML, ASCII, CSV, TSV or JSON.',
	keywords: [
		'table',
		'excel',
		'google sheets',
		'spreadsheet',
		'markdown table',
		'html table',
		'ascii table',
		'tsv',
		'csv',
		'clipboard'
	],
	network: false,
	chain: { in: 'text', out: 'text' }
};
