import type { ChainOp } from '../types';
import {
	countLines,
	formatCounts,
	numberLines,
	runPipeline,
	shuffle,
	sortLines,
	splitLines,
	uniqueLines
} from './logic';

// Plain sort, unique and remove-blank are already text.sort-lines, text.unique-lines and text.remove-blank.
const per = (f: (l: string[]) => string[]) => (s: string) => f(splitLines(s)).join('\n');

export const ops: ChainOp[] = [
	{
		id: 'lines.sort-natural',
		label: 'Lines: natural sort (2 before 10)',
		run: per((l) => sortLines(l, 'natural'))
	},
	{
		id: 'lines.sort-length',
		label: 'Lines: sort by length',
		run: per((l) => sortLines(l, 'length'))
	},
	{
		id: 'lines.sort-reverse',
		label: 'Lines: sort Z to A',
		run: per((l) => sortLines(l, 'alpha', 'en', true))
	},
	{ id: 'lines.reverse', label: 'Lines: reverse order', run: per((l) => [...l].reverse()) },
	{
		id: 'lines.unique-ci',
		label: 'Lines: unique, ignore case',
		run: per((l) => uniqueLines(l, true))
	},
	{ id: 'lines.trim', label: 'Lines: trim each line', run: per((l) => l.map((x) => x.trim())) },
	{ id: 'lines.number', label: 'Lines: number', run: per((l) => numberLines(l)) },
	{ id: 'lines.shuffle', label: 'Lines: shuffle', run: per((l) => shuffle(l)) },
	{
		id: 'lines.count',
		label: 'Lines: count duplicates',
		run: per((l) => formatCounts(countLines(l)))
	},
	{
		id: 'lines.wrap',
		label: 'Lines: wrap at 80 columns',
		run: (s) => runPipeline(s, [{ kind: 'wrap', width: 80 }])
	},
	{ id: 'lines.join-comma', label: 'Lines: join with comma', run: per((l) => [l.join(', ')]) },
	{
		id: 'lines.split-comma',
		label: 'Lines: split at commas',
		run: per((l) => l.flatMap((x) => x.split(',').map((p) => p.trim())))
	}
];
