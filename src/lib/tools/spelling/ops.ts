import type { ChainOp } from '../types';
import { spellLine } from './logic';

export const ops: ChainOp[] = [
	{
		id: 'spelling.nato',
		label: 'Spell out, NATO / ICAO',
		run: (s) => spellLine(s, { alphabet: 'nato', caseMode: 'upper' })
	},
	{
		id: 'spelling.danish',
		label: 'Spell out, Danish alphabet',
		run: (s) => spellLine(s, { alphabet: 'danish', caseMode: 'upper' })
	}
];
