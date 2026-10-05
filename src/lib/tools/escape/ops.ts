import type { ChainOp } from '../types';
import { flavours } from './logic';

export const ops: ChainOp[] = flavours.flatMap((f) => [
	{ id: `escape.${f.id}`, label: `Escape for ${f.label}`, run: (s: string) => f.escape(s) },
	{ id: `escape.un-${f.id}`, label: `Unescape ${f.label}`, run: (s: string) => f.unescape(s) }
]);
