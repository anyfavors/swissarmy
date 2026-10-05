import type { ChainOp } from '../types';
import { checkList, parseRange } from './logic';

function sorted(s: string, desc: boolean): string {
	const l = checkList(s, null);
	const bad = l.find((c) => c.error);
	if (bad) throw new Error(bad.error);
	if (!l.length) throw new Error('No versions in the input');
	const out = l.map((c) => c.input);
	return (desc ? out.reverse() : out).join('\n');
}

export const ops: ChainOp[] = [
	{ id: 'semver.sort', label: 'Sort versions, oldest first', run: (s) => sorted(s, false) },
	{ id: 'semver.sort-desc', label: 'Sort versions, newest first', run: (s) => sorted(s, true) },
	{ id: 'semver.range', label: 'Normalise npm range', run: (s) => parseRange(s).text }
];
