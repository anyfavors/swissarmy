import type { ChainOp } from '../types';
import { detectHeader, jsonToCsv, parseCsv, rowsToJson, rowsToMarkdown } from './logic';

function rows(s: string) {
	const p = parseCsv(s);
	if (!p.rows.length) throw new Error('No CSV rows in the input');
	return p.rows;
}

export const ops: ChainOp[] = [
	{
		id: 'csv.to-json',
		label: 'CSV to JSON',
		run: (s) => {
			const r = rows(s);
			return rowsToJson(r, { header: detectHeader(r) });
		}
	},
	{ id: 'csv.from-json', label: 'JSON to CSV', run: (s) => jsonToCsv(s) },
	{
		id: 'csv.to-markdown',
		label: 'CSV to Markdown table',
		run: (s) => {
			const r = rows(s);
			return rowsToMarkdown(r, detectHeader(r));
		}
	}
];
