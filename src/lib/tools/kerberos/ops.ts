import type { ChainOp } from '../types';
import { decodeFlags, parseFlags } from './logic';

export const ops: ChainOp[] = [
	{
		id: 'kerberos.flags',
		label: 'Kerberos ticket flags to names',
		run: (s) => decodeFlags(parseFlags(s)).klist
	}
];
