import type { ChainOp } from '../types';
import { parseAny, toChmodSymbolic, toOctal, toSymbolic } from './logic';

export const ops: ChainOp[] = [
	{ id: 'chmod.octal', label: 'Mode to octal', run: (s) => toOctal(parseAny(s)) },
	{ id: 'chmod.symbolic', label: 'Mode to rwxr-xr-x', run: (s) => toSymbolic(parseAny(s)) },
	{ id: 'chmod.clauses', label: 'Mode to u=,g=,o=', run: (s) => toChmodSymbolic(parseAny(s)) }
];
