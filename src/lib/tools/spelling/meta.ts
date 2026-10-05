import type { ToolMeta } from '../types';

export const meta: ToolMeta = {
	id: 'spelling',
	chapter: 18,
	section: 2,
	title: 'Spelling alphabets',
	summary:
		'Text to NATO/ICAO or Danish spelling alphabet, with case and symbols named, for reading out passwords.',
	keywords: [
		'nato alphabet',
		'icao',
		'phonetic alphabet',
		'alfa bravo charlie',
		'radio alphabet',
		'stavealfabet',
		'anna bernhard cecilie',
		'spell',
		'read aloud',
		'password',
		'phone support',
		'niner'
	],
	network: false,
	chain: { in: 'text', out: 'text' }
};
