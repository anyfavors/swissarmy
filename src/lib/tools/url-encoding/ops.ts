import type { ChainOp } from '../types';
import { decode, encode } from './logic';

export const ops: ChainOp[] = [
	{ id: 'url.encode', label: 'URL encode (component)', run: (s) => encode(s, 'component') },
	{ id: 'url.decode', label: 'URL decode (component)', run: (s) => decode(s, 'component') },
	{ id: 'url.encode-form', label: 'Form encode (space as +)', run: (s) => encode(s, 'form') },
	{ id: 'url.decode-form', label: 'Form decode (+ as space)', run: (s) => decode(s, 'form') }
];
