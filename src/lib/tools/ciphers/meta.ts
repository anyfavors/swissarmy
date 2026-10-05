import type { ToolMeta } from '../types';

export const meta: ToolMeta = {
	id: 'ciphers',
	chapter: 1,
	section: 10,
	title: 'Classical ciphers and Morse',
	summary: 'ROT13, ROT47, Caesar with brute force, Atbash, Vigenère, and Morse code both ways.',
	keywords: [
		'rot13',
		'rot47',
		'caesar',
		'shift cipher',
		'atbash',
		'vigenere',
		'vigenère',
		'morse',
		'morse code',
		'prosign',
		'sos',
		'puzzle',
		'ctf'
	],
	network: false,
	chain: { in: 'text', out: 'text' }
};
