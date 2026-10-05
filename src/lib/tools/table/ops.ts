import type { ChainOp } from '../types';
import { convertTable, readTable, type OutputFormat } from './logic';

const op = (to: OutputFormat, label: string): ChainOp => ({
	id: `table.to-${to}`,
	label,
	run: (s) => {
		if (!s.trim()) throw new Error('No table in the input');
		return convertTable(readTable(s), to);
	}
});

export const ops: ChainOp[] = [
	op('markdown', 'Table to Markdown'),
	op('html', 'Table to HTML'),
	op('ascii', 'Table to ASCII'),
	op('unicode', 'Table to box drawing'),
	op('csv', 'Table to CSV'),
	op('tsv', 'Table to TSV'),
	op('json', 'Table to JSON')
];
