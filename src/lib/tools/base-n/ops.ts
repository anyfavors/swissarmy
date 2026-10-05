import type { ChainOp } from '../types';
import { decode, encode, encodings, utf8Text } from './logic';

export const ops: ChainOp[] = encodings.flatMap(({ id, label }) => [
	{
		id: `base-n.${id}-encode`,
		label: `${label} encode`,
		run: (s: string) => encode(new TextEncoder().encode(s), id)
	},
	{
		id: `base-n.${id}-decode`,
		label: `${label} decode`,
		run: async (s: string) => {
			const text = utf8Text(await decode(s, id));
			if (text === null) throw new Error('Decoded bytes are not UTF-8 text (binary data)');
			return text;
		}
	}
]);
