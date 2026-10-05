import type { ChainOp } from '../types';
import {
	bytesToText,
	formatBinary,
	formatDecimal,
	formatHex,
	hexdump,
	parseBinary,
	parseDecimal,
	parseHex,
	utf8
} from './logic';

function text(bytes: Uint8Array): string {
	const d = bytesToText(bytes);
	if (!d.utf8) throw new Error('The bytes are not UTF-8 text (binary data)');
	return d.text;
}

export const ops: ChainOp[] = [
	{ id: 'hex.encode', label: 'Text to hex', run: (s) => formatHex(utf8(s), 'spaced') },
	{ id: 'hex.decode', label: 'Hex to text', run: (s) => text(parseHex(s)) },
	{ id: 'hex.c-array', label: 'Text to C byte array', run: (s) => formatHex(utf8(s), 'c') },
	{ id: 'hex.binary-encode', label: 'Text to binary', run: (s) => formatBinary(utf8(s)) },
	{ id: 'hex.binary-decode', label: 'Binary to text', run: (s) => text(parseBinary(s)) },
	{ id: 'hex.decimal-encode', label: 'Text to decimal bytes', run: (s) => formatDecimal(utf8(s)) },
	{ id: 'hex.decimal-decode', label: 'Decimal bytes to text', run: (s) => text(parseDecimal(s)) },
	{ id: 'hex.dump', label: 'Hexdump', run: (s) => hexdump(utf8(s)) }
];
