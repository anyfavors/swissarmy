import type { ChainOp } from '../types';
import { aggregateText, parseList, summarise, formatRange } from './logic';

export const ops: ChainOp[] = [
	{
		id: 'cidr-sets.aggregate',
		label: 'Aggregate to minimal CIDR list',
		run: (s) => aggregateText(s)
	},
	{
		id: 'cidr-sets.ranges',
		label: 'CIDR list to address ranges',
		run: (s) => {
			const { entries, errors } = parseList(s);
			if (errors.length) throw new Error(errors[0]);
			if (!entries.length) throw new Error('No addresses or prefixes found');
			return summarise(entries.map((e) => e.range))
				.ranges.map(formatRange)
				.join('\n');
		}
	}
];
