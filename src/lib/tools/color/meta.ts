import type { ToolMeta } from '../types';
import { looksLikeColor } from './detect';

export const meta: ToolMeta = {
	id: 'color',
	chapter: 10,
	section: 1,
	title: 'Colour converter and contrast',
	summary:
		'Convert between HEX, RGB, HSL, HWB, OKLCH and CMYK, and check WCAG contrast between two colours.',
	keywords: [
		'color',
		'colour',
		'hex',
		'rgb',
		'hsl',
		'hwb',
		'oklch',
		'oklab',
		'cmyk',
		'contrast',
		'wcag',
		'accessibility',
		'a11y',
		'picker'
	],
	network: false,
	detect: looksLikeColor,
	chain: { in: 'text', out: 'text' }
};
