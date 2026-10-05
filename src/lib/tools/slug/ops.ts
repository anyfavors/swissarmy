import type { ChainOp } from '../types';
import { safeFilename, slugify } from './logic';

export const ops: ChainOp[] = [
	{
		id: 'slug.slugify',
		label: 'Slugify',
		run: (s) => {
			const out = slugify(s);
			if (!out) throw new Error('Nothing left to make a slug from (no Latin letters or digits)');
			return out;
		}
	},
	{
		id: 'slug.slugify-da',
		label: 'Slugify, Danish æ ae, ø oe, å aa',
		run: (s) => slugify(s, { danish: true })
	},
	{
		id: 'slug.filename',
		label: 'Safe filename (all systems)',
		run: (s) => {
			if (s.includes('\n')) throw new Error('A filename cannot span several lines');
			return safeFilename(s, 'portable').name;
		}
	}
];
