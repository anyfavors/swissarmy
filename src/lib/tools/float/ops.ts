import type { ChainOp } from '../types';
import { exactValue, hexPattern, parseInput, shortest } from './logic';

export const ops: ChainOp[] = [
	{
		id: 'float.to-bits64',
		label: 'Number to float64 bits (hex)',
		run: (s) => hexPattern(parseInput(s, 'f64').bits, 'f64')
	},
	{
		id: 'float.to-bits32',
		label: 'Number to float32 bits (hex)',
		run: (s) => hexPattern(parseInput(s, 'f32').bits, 'f32')
	},
	{
		id: 'float.exact64',
		label: 'Exact decimal value as float64',
		run: (s) => exactValue(parseInput(s, 'f64').bits, 'f64')
	},
	{
		id: 'float.from-bits64',
		label: 'Float64 bits (hex) to number',
		run: (s) => {
			const p = parseInput(s, 'f64');
			if (p.as !== 'bits') throw new Error('Expected a float64 pattern: 0x and 16 hex digits');
			return shortest(p.bits, 'f64');
		}
	}
];
