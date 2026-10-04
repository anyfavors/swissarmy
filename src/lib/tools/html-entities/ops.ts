import type { ChainOp } from '../types';
import { decodeEntities, encodeEntities } from './logic';

export const ops: ChainOp[] = [
	{ id: 'html.encode', label: 'HTML entities encode', run: (s) => encodeEntities(s) },
	{ id: 'html.decode', label: 'HTML entities decode', run: (s) => decodeEntities(s).text }
];
