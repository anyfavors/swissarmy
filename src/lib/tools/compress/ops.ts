import type { ChainOp } from '../types';
import { bytesToBase64, base64ToBytes } from '../base64/logic';
import { compress, decompress, formats, textBytes, utf8OrNull, type Format } from './logic';

const verb: Record<Format, [string, string]> = {
	gzip: ['gzip', 'gunzip'],
	deflate: ['deflate', 'inflate'],
	'deflate-raw': ['deflate-raw', 'inflate-raw']
};

export const ops: ChainOp[] = formats.flatMap(({ id, label }) => [
	{
		id: `compress.${verb[id][0]}`,
		label: `Compress, ${label} to Base64`,
		run: async (s: string) => bytesToBase64(await compress(textBytes(s), id))
	},
	{
		id: `compress.${verb[id][1]}`,
		label: `Decompress ${label} from Base64`,
		run: async (s: string) => {
			const out = utf8OrNull((await decompress(base64ToBytes(s), id)).bytes);
			if (out === null) throw new Error('Decompressed data is not UTF-8 text (binary data)');
			return out;
		}
	}
]);
