import type { ChainOp } from '../types';
import { clean, stripInvisible } from './logic';

export const ops: ChainOp[] = [
	{ id: 'unicode.nfc', label: 'Unicode normalise NFC', run: (s) => s.normalize('NFC') },
	{ id: 'unicode.nfd', label: 'Unicode normalise NFD', run: (s) => s.normalize('NFD') },
	{
		id: 'unicode.nfkc',
		label: 'Unicode normalise NFKC (fold compatibility forms)',
		run: (s) => s.normalize('NFKC')
	},
	{
		id: 'unicode.strip-invisible',
		label: 'Remove invisible and bidi characters',
		run: stripInvisible
	},
	{
		id: 'unicode.clean',
		label: 'Clean: invisible, odd spaces, look-alikes to Latin',
		run: (s) => clean(s)
	}
];
