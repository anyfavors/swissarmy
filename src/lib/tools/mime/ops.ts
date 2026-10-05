import type { ChainOp } from '../types';
import {
	decodeCharset,
	decodeWords,
	domainToAscii,
	domainToUnicode,
	encodeWords,
	qpDecode,
	qpEncode
} from './logic';

export const ops: ChainOp[] = [
	{ id: 'mime.qp-encode', label: 'Quoted-printable encode', run: (s) => qpEncode(s) },
	{
		id: 'mime.qp-decode',
		label: 'Quoted-printable decode (UTF-8)',
		run: (s) => decodeCharset(qpDecode(s).bytes, 'utf-8')
	},
	{ id: 'mime.words-b', label: 'Encoded-word, Base64', run: (s) => encodeWords(s, 'B') },
	{ id: 'mime.words-q', label: 'Encoded-word, Q', run: (s) => encodeWords(s, 'Q') },
	{ id: 'mime.words-decode', label: 'Decode encoded-words', run: (s) => decodeWords(s).text },
	{ id: 'mime.idn-ascii', label: 'Domain to Punycode', run: (s) => domainToAscii(s) },
	{ id: 'mime.idn-unicode', label: 'Punycode to domain', run: (s) => domainToUnicode(s) }
];
