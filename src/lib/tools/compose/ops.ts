import type { ChainOp } from '../types';
import { composeToRun, runToCompose } from './logic';

export const ops: ChainOp[] = [
	{ id: 'compose.from-run', label: 'docker run to Compose', run: (s) => runToCompose(s).yaml },
	{
		id: 'compose.to-run',
		label: 'Compose service to docker run',
		run: (s) => composeToRun(s).command
	}
];
