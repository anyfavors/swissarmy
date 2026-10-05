import type { ChainOp } from '../types';
import { FORMAT_NAMES, parseLog, toJson } from './logic';

export const ops: ChainOp[] = [
	{
		id: 'log-parser.to-json',
		label: 'Log lines to JSON',
		run: (s) => {
			const r = parseLog(s, 'auto');
			if (!r.format) throw new Error('Log format not recognised');
			if (!r.records.length) throw new Error(`No line could be read as ${FORMAT_NAMES[r.format]}`);
			return toJson(r);
		}
	}
];
