import type { ChainOp } from '../types';
import { formatJson } from './logic';

export const ops: ChainOp[] = [
	{ id: 'json.format', label: 'JSON format', run: (s) => formatJson(s, 2).output },
	{ id: 'json.sort', label: 'JSON format, sorted keys', run: (s) => formatJson(s, 2, true).output },
	{ id: 'json.minify', label: 'JSON minify', run: (s) => formatJson(s, 'min').output }
];
