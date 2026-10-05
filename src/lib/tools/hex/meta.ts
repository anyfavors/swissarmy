import type { ToolMeta } from '../types';

export const meta: ToolMeta = {
	id: 'hex',
	chapter: 1,
	section: 5,
	title: 'Hex, binary and text',
	summary:
		'Convert text to hex, binary and decimal bytes and back, with a hexdump view and byte swaps.',
	keywords: [
		'hex',
		'hexadecimal',
		'binary',
		'bytes',
		'hexdump',
		'xxd',
		'c array',
		'0x',
		'\\x escape',
		'endianness',
		'byte swap',
		'utf-8'
	],
	network: false,
	chain: { in: 'text', out: 'text' }
};
