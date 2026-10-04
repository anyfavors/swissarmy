import type { ChainOp } from '../types';
import { digest, toHex, type DigestAlgo } from './logic';

const algos: DigestAlgo[] = ['MD5', 'SHA-1', 'SHA-256', 'SHA-512'];

export const ops: ChainOp[] = algos.map((a) => ({
	id: `hash.${a.toLowerCase().replace('-', '')}`,
	label: `${a} hash (hex)`,
	run: async (s: string) => toHex(await digest(a, new TextEncoder().encode(s)))
}));
