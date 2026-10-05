import type { ChainOp } from '../types';
import { fromRoman, parseInteger, toRoman } from './logic';

export const ops: ChainOp[] = [
	{ id: 'roman.to-roman', label: 'Number to Roman numeral', run: (s) => toRoman(parseInteger(s)) },
	{
		id: 'roman.from-roman',
		label: 'Roman numeral to number',
		run: (s) => String(fromRoman(s).value)
	}
];
