import type { ToolMeta } from '../types';

export const meta: ToolMeta = {
	id: 'float',
	chapter: 6,
	section: 4,
	title: 'IEEE 754 inspector',
	summary:
		'Float32 and float64 bits: sign, exponent, mantissa, the exact stored value, neighbours and ULP.',
	keywords: [
		'ieee 754',
		'float',
		'double',
		'float32',
		'float64',
		'single precision',
		'double precision',
		'mantissa',
		'exponent',
		'ulp',
		'nan',
		'subnormal',
		'denormal',
		'0.1',
		'precision',
		'rounding'
	],
	network: false,
	chain: { in: 'text', out: 'text' }
};
