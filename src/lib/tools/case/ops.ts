import type { ChainOp } from '../types';
import { cases, convertCase } from './logic';

// lower and upper are already offered as text.lower and text.upper.
export const ops: ChainOp[] = cases
	.filter((c) => c.id !== 'lower' && c.id !== 'upper')
	.map((c) => ({
		id: `case.${c.id}`,
		label: `Case: ${c.label}`,
		run: (s: string) => convertCase(s, c.id)
	}));
