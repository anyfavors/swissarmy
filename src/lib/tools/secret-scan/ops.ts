import type { ChainOp } from '../types';
import { redact } from './logic';

export const ops: ChainOp[] = [
	{
		id: 'secret-scan.redact',
		label: 'Redact likely secrets',
		run: (s) => redact(s)
	}
];
