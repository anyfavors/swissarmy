import type { ChainOp } from '../types';
import { decodeText, encodeText } from './logic';

export const ops: ChainOp[] = [
	{ id: 'base64.encode', label: 'Base64 encode', run: (s) => encodeText(s) },
	{
		id: 'base64.encode-url',
		label: 'Base64 encode, URL-safe',
		run: (s) => encodeText(s, 'url', false)
	},
	{
		id: 'base64.decode',
		label: 'Base64 decode',
		run: (s) => {
			const d = decodeText(s);
			if (!d.utf8) throw new Error('Decoded bytes are not UTF-8 text (binary data)');
			return d.text;
		}
	}
];
