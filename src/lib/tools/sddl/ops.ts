import type { ChainOp } from '../types';
import { explainText, parseSddl } from './logic';

export const ops: ChainOp[] = [
	{ id: 'sddl.explain', label: 'SDDL to readable ACL', run: (s) => explainText(parseSddl(s)) }
];
