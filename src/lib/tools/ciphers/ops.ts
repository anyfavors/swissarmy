import type { ChainOp } from '../types';
import { atbash, fromMorse, rot13, rot47, toMorse } from './logic';

export const ops: ChainOp[] = [
	{ id: 'ciphers.rot13', label: 'ROT13', run: (s) => rot13(s) },
	{ id: 'ciphers.rot47', label: 'ROT47', run: (s) => rot47(s) },
	{ id: 'ciphers.atbash', label: 'Atbash', run: (s) => atbash(s) },
	{
		id: 'ciphers.morse-encode',
		label: 'Text to Morse',
		run: (s) => {
			const r = toMorse(s);
			if (r.unknown.length) throw new Error(`No Morse code for "${r.unknown[0]}"`);
			return r.text;
		}
	},
	{
		id: 'ciphers.morse-decode',
		label: 'Morse to text',
		run: (s) => {
			const r = fromMorse(s);
			if (r.unknown.length) throw new Error(`Unknown Morse code "${r.unknown[0]}"`);
			return r.text;
		}
	}
];
