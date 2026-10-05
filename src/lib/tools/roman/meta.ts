import type { ToolMeta } from '../types';
import { looksLikeRoman } from './logic';

export const meta: ToolMeta = {
	id: 'roman',
	chapter: 6,
	section: 8,
	title: 'Roman numerals',
	summary:
		'Roman numerals to numbers and back, 1 to 3999, with the decomposition and strict checks.',
	keywords: [
		'roman',
		'numerals',
		'mcmxciv',
		'romertal',
		'year',
		'copyright year',
		'clock face',
		'iiii',
		'subtractive'
	],
	network: false,
	detect: looksLikeRoman,
	chain: { in: 'text', out: 'text' }
};
