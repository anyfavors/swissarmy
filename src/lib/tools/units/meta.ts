import type { ToolMeta } from '../types';
import { looksLikeQuantity } from './logic';

export const meta: ToolMeta = {
	id: 'units',
	chapter: 6,
	section: 5,
	title: 'Unit converter',
	summary:
		'Length, area, volume, mass, temperature, speed, pressure, energy, power, data rate, angle and time, from free text like 5 ft 11 in.',
	keywords: [
		'unit',
		'convert',
		'conversion',
		'metric',
		'imperial',
		'feet',
		'inches',
		'miles',
		'pounds',
		'kg',
		'celsius',
		'fahrenheit',
		'kelvin',
		'psi',
		'bar',
		'kwh',
		'btu',
		'horsepower',
		'hestekraft',
		'gallon',
		'mph',
		'knots',
		'mbps'
	],
	network: false,
	detect: looksLikeQuantity
};
