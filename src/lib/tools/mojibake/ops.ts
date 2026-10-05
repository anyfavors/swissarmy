import type { ChainOp } from '../types';
import { breakText, fix } from './logic';

export const ops: ChainOp[] = [
	{ id: 'mojibake.fix', label: 'Fix mojibake', run: (s) => fix(s) },
	{
		id: 'mojibake.break',
		label: 'Make mojibake (UTF-8 read as Windows-1252)',
		run: (s) => breakText(s)
	}
];
