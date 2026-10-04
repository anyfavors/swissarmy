import type { ChainOp } from '../types';
import { decodeToken } from './logic';

function jws(s: string) {
	const d = decodeToken(s);
	if (d.kind !== 'jws') throw new Error('This is an encrypted JWE, only its header can be read');
	return d;
}

export const ops: ChainOp[] = [
	{
		id: 'jwt.header',
		label: 'JWT header',
		run: (s) => JSON.stringify(decodeToken(s).header, null, 2)
	},
	{ id: 'jwt.payload', label: 'JWT payload (not verified)', run: (s) => jws(s).payloadText }
];
