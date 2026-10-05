/**
 * Unit definitions. Every factor converts one unit to the SI unit of its quantity.
 *
 * Sources:
 *  [SI]   BIPM, The International System of Units (SI Brochure), 9th edition, 2019. Table 8 lists
 *         non-SI units accepted for use with the SI (litre, tonne, hectare, minute, hour, day,
 *         degree, electronvolt). The electronvolt is e × 1 J with e = 1.602176634e-19 C exactly.
 *  [1959] International yard and pound agreement, 1959 (US Federal Register 24 FR 5348):
 *         1 yard = 0.9144 m, so 1 inch = 25.4 mm; 1 pound = 0.45359237 kg.
 *  [H44]  NIST Handbook 44 (2024), Appendix C, General tables of units of measurement:
 *         US gallon = 231 in³, US customary cup, pint, quart, fluid ounce, grain, troy ounce,
 *         stone, short and long ton, acre = 43 560 ft².
 *  [WMA]  UK Weights and Measures Act 1985, Schedule 1: imperial gallon = 4.54609 dm³.
 *  [811]  NIST Special Publication 811 (2008), Appendix B: thermochemical calorie = 4.184 J,
 *         British thermal unit (IT) = 1.055 056 E+03 J, horsepower (550 ft·lbf/s), metric
 *         horsepower, conventional millimetre and inch of mercury, torr = 101 325/760 Pa,
 *         standard atmosphere = 101 325 Pa, psi, knot = 1852/3600 m/s.
 *  [CGPM] 3rd CGPM (1901): standard acceleration of gravity gₙ = 9.80665 m/s².
 *         10th CGPM (1954) Resolution 4: standard atmosphere = 101 325 Pa.
 *  [IEC]  IEC 80000-13: binary prefixes Ki, Mi, Gi (powers of 1024); SI prefixes stay powers of 1000.
 */

export interface Unit {
	id: string;
	name: string;
	symbol: string;
	/** Multiply by this to get the SI unit of the quantity. Unused when `to` is set. */
	factor: number;
	/** Affine conversions (temperature). */
	to?: (x: number) => number;
	from?: (x: number) => number;
	/** Exact spellings, matched with case first. The symbol is always included. */
	aliases?: string[];
	/** Short definition shown next to the unit. */
	def?: string;
}

export interface Quantity {
	id: string;
	name: string;
	/** Unit shown as the reference in a fresh table. */
	defaultUnit: string;
	/** Several terms such as 5 ft 11 in may be added up. Not for temperatures. */
	compound: boolean;
	units: Unit[];
}

const inch = 0.0254; // [1959]
const foot = 12 * inch;
const yard = 3 * foot;
const mile = 1760 * yard;
const lb = 0.45359237; // [1959]
const gn = 9.80665; // [CGPM] 1901
const lbf = lb * gn; // pound-force, [811]
const usGal = 231 * inch ** 3; // [H44] 231 cubic inches = 3.785411784 L
const impGal = 4.54609e-3; // [WMA]
const calTh = 4.184; // thermochemical calorie, [811]
// BTU (International Table) = 1055.05585262 J: the IT calorie 4.1868 J/(g·K) times
// 453.59237 g/lb times 5/9 K/°F, [811] lists 1.055 056 E+03 J.
const btuIT = 1055.05585262;
const mmHg = 13595.1 * gn * 0.001; // conventional, 133.322387415 Pa, [811] 1.333 224 E+02
const eV = 1.602176634e-19; // [SI] exact since 2019

export const quantities: Quantity[] = [
	{
		id: 'length',
		name: 'Length',
		defaultUnit: 'm',
		compound: true,
		units: [
			{ id: 'nm', name: 'nanometre', symbol: 'nm', factor: 1e-9 },
			{ id: 'um', name: 'micrometre', symbol: 'µm', factor: 1e-6, aliases: ['μm', 'um', 'micron'] },
			{
				id: 'mm',
				name: 'millimetre',
				symbol: 'mm',
				factor: 1e-3,
				aliases: ['millimeter', 'millimetre', 'millimeters', 'millimetres']
			},
			{
				id: 'cm',
				name: 'centimetre',
				symbol: 'cm',
				factor: 1e-2,
				aliases: ['centimeter', 'centimetre', 'centimeters', 'centimetres']
			},
			{
				id: 'm',
				name: 'metre',
				symbol: 'm',
				factor: 1,
				aliases: ['meter', 'metre', 'meters', 'metres']
			},
			{
				id: 'km',
				name: 'kilometre',
				symbol: 'km',
				factor: 1e3,
				aliases: ['kilometer', 'kilometre', 'kilometers', 'kilometres']
			},
			{ id: 'thou', name: 'thou (mil)', symbol: 'thou', factor: inch / 1000, def: '1/1000 in' },
			{
				id: 'in',
				name: 'inch',
				symbol: 'in',
				factor: inch,
				aliases: ['"', '″', 'inch', 'inches'],
				def: '25.4 mm'
			},
			{
				id: 'ft',
				name: 'foot',
				symbol: 'ft',
				factor: foot,
				aliases: ["'", '′', 'foot', 'feet'],
				def: '12 in'
			},
			{
				id: 'yd',
				name: 'yard',
				symbol: 'yd',
				factor: yard,
				aliases: ['yard', 'yards'],
				def: '0.9144 m'
			},
			{
				id: 'mi',
				name: 'mile',
				symbol: 'mi',
				factor: mile,
				aliases: ['mile', 'miles'],
				def: '1760 yd'
			},
			// [SI] Table 8 note: nautical mile = 1852 m (International Hydrographic Conference 1929).
			{
				id: 'nmi',
				name: 'nautical mile',
				symbol: 'nmi',
				factor: 1852,
				aliases: ['NM', 'nautical mile', 'nautical miles', 'sømil'],
				def: '1852 m'
			}
		]
	},
	{
		id: 'area',
		name: 'Area',
		defaultUnit: 'm²',
		compound: false,
		units: [
			{
				id: 'mm2',
				name: 'square millimetre',
				symbol: 'mm²',
				factor: 1e-6,
				aliases: ['mm2', 'mm^2', 'sq mm']
			},
			{
				id: 'cm2',
				name: 'square centimetre',
				symbol: 'cm²',
				factor: 1e-4,
				aliases: ['cm2', 'cm^2', 'sq cm']
			},
			{
				id: 'm2',
				name: 'square metre',
				symbol: 'm²',
				factor: 1,
				aliases: ['m2', 'm^2', 'sq m', 'kvm']
			},
			{
				id: 'ha',
				name: 'hectare',
				symbol: 'ha',
				factor: 1e4,
				aliases: ['hectare', 'hectares', 'hektar']
			},
			{
				id: 'km2',
				name: 'square kilometre',
				symbol: 'km²',
				factor: 1e6,
				aliases: ['km2', 'km^2', 'sq km']
			},
			{
				id: 'in2',
				name: 'square inch',
				symbol: 'in²',
				factor: inch ** 2,
				aliases: ['in2', 'in^2', 'sq in']
			},
			{
				id: 'ft2',
				name: 'square foot',
				symbol: 'ft²',
				factor: foot ** 2,
				aliases: ['ft2', 'ft^2', 'sq ft', 'sqft']
			},
			{
				id: 'yd2',
				name: 'square yard',
				symbol: 'yd²',
				factor: yard ** 2,
				aliases: ['yd2', 'yd^2', 'sq yd']
			},
			{
				id: 'acre',
				name: 'acre (international)',
				symbol: 'ac',
				factor: 43560 * foot ** 2,
				aliases: ['acre', 'acres'],
				def: '43 560 ft²'
			},
			{
				id: 'mi2',
				name: 'square mile',
				symbol: 'mi²',
				factor: mile ** 2,
				aliases: ['mi2', 'mi^2', 'sq mi']
			}
		]
	},
	{
		id: 'volume',
		name: 'Volume',
		defaultUnit: 'L',
		compound: false,
		units: [
			{
				id: 'ml',
				name: 'millilitre',
				symbol: 'mL',
				factor: 1e-6,
				aliases: ['ml', 'cm³', 'cm3', 'cc']
			},
			{ id: 'cl', name: 'centilitre', symbol: 'cL', factor: 1e-5, aliases: ['cl'] },
			{ id: 'dl', name: 'decilitre', symbol: 'dL', factor: 1e-4, aliases: ['dl'] },
			{
				id: 'l',
				name: 'litre',
				symbol: 'L',
				factor: 1e-3,
				aliases: ['l', 'ℓ', 'litre', 'liter', 'litres', 'liters', 'dm³', 'dm3']
			},
			{ id: 'm3', name: 'cubic metre', symbol: 'm³', factor: 1, aliases: ['m3', 'm^3'] },
			{
				id: 'in3',
				name: 'cubic inch',
				symbol: 'in³',
				factor: inch ** 3,
				aliases: ['in3', 'in^3', 'cu in']
			},
			{
				id: 'ft3',
				name: 'cubic foot',
				symbol: 'ft³',
				factor: foot ** 3,
				aliases: ['ft3', 'ft^3', 'cu ft']
			},
			{
				id: 'tsp',
				name: 'US teaspoon',
				symbol: 'tsp',
				factor: usGal / 768,
				aliases: ['teaspoon', 'teaspoons'],
				def: '1/6 US fl oz'
			},
			{
				id: 'tbsp',
				name: 'US tablespoon',
				symbol: 'tbsp',
				factor: usGal / 256,
				aliases: ['tablespoon', 'tablespoons'],
				def: '1/2 US fl oz'
			},
			{
				id: 'floz',
				name: 'US fluid ounce',
				symbol: 'US fl oz',
				factor: usGal / 128,
				aliases: ['fl oz', 'floz', 'fl. oz.', 'fl.oz'],
				def: '1/128 US gal'
			},
			{
				id: 'cup',
				name: 'US cup (customary)',
				symbol: 'cup',
				factor: usGal / 16,
				aliases: ['cups', 'US cup'],
				def: '8 US fl oz'
			},
			{
				id: 'pt',
				name: 'US pint',
				symbol: 'US pt',
				factor: usGal / 8,
				aliases: ['pt', 'pint', 'pints', 'US pint']
			},
			{
				id: 'qt',
				name: 'US quart',
				symbol: 'US qt',
				factor: usGal / 4,
				aliases: ['qt', 'quart', 'quarts']
			},
			{
				id: 'gal',
				name: 'US gallon',
				symbol: 'US gal',
				factor: usGal,
				aliases: ['gal', 'gallon', 'gallons', 'US gallon'],
				def: '231 in³'
			},
			{
				id: 'impfloz',
				name: 'imperial fluid ounce',
				symbol: 'imp fl oz',
				factor: impGal / 160,
				aliases: ['UK fl oz'],
				def: '1/160 imp gal'
			},
			{
				id: 'imppt',
				name: 'imperial pint',
				symbol: 'imp pt',
				factor: impGal / 8,
				aliases: ['UK pt', 'imperial pint', 'UK pint']
			},
			{
				id: 'impgal',
				name: 'imperial gallon',
				symbol: 'imp gal',
				factor: impGal,
				aliases: ['UK gal', 'imperial gallon', 'imperial gallons', 'UK gallon'],
				def: '4.54609 L'
			}
		]
	},
	{
		id: 'mass',
		name: 'Mass',
		defaultUnit: 'kg',
		compound: true,
		units: [
			{
				id: 'mg',
				name: 'milligram',
				symbol: 'mg',
				factor: 1e-6,
				aliases: ['milligram', 'milligrams']
			},
			{ id: 'g', name: 'gram', symbol: 'g', factor: 1e-3, aliases: ['gram', 'grams', 'gramme'] },
			{
				id: 'kg',
				name: 'kilogram',
				symbol: 'kg',
				factor: 1,
				aliases: ['kilo', 'kilos', 'kilogram', 'kilograms']
			},
			{
				id: 't',
				name: 'tonne',
				symbol: 't',
				factor: 1000,
				aliases: ['tonne', 'tonnes', 'metric ton']
			},
			{
				id: 'gr',
				name: 'grain',
				symbol: 'gr',
				factor: lb / 7000,
				aliases: ['grain', 'grains'],
				def: '1/7000 lb'
			},
			{
				id: 'oz',
				name: 'ounce (avoirdupois)',
				symbol: 'oz',
				factor: lb / 16,
				aliases: ['ounce', 'ounces'],
				def: '1/16 lb'
			},
			{
				id: 'ozt',
				name: 'troy ounce',
				symbol: 'oz t',
				factor: (lb / 7000) * 480,
				aliases: ['ozt', 'troy oz', 'troy ounce'],
				def: '480 gr'
			},
			{
				id: 'lb',
				name: 'pound',
				symbol: 'lb',
				factor: lb,
				aliases: ['lbs', 'pound', 'pounds'],
				def: '0.45359237 kg'
			},
			{
				id: 'st',
				name: 'stone',
				symbol: 'st',
				factor: 14 * lb,
				aliases: ['stone', 'stones'],
				def: '14 lb'
			},
			{
				id: 'ston',
				name: 'short ton (US)',
				symbol: 'short ton',
				factor: 2000 * lb,
				aliases: ['short tons', 'US ton'],
				def: '2000 lb'
			},
			{
				id: 'lton',
				name: 'long ton (UK)',
				symbol: 'long ton',
				factor: 2240 * lb,
				aliases: ['long tons', 'UK ton'],
				def: '2240 lb'
			}
		]
	},
	{
		id: 'temperature',
		name: 'Temperature',
		defaultUnit: '°C',
		compound: false,
		units: [
			{
				id: 'k',
				name: 'kelvin',
				symbol: 'K',
				factor: 1,
				to: (x) => x,
				from: (x) => x,
				aliases: ['kelvin', '°K']
			},
			{
				id: 'c',
				name: 'degree Celsius',
				symbol: '°C',
				factor: 1,
				to: (x) => x + 273.15,
				from: (x) => x - 273.15,
				aliases: ['C', 'degC', 'celsius', '℃'],
				def: 'K − 273.15'
			},
			{
				id: 'f',
				name: 'degree Fahrenheit',
				symbol: '°F',
				factor: 1,
				to: (x) => ((x + 459.67) * 5) / 9,
				from: (x) => (x * 9) / 5 - 459.67,
				aliases: ['F', 'degF', 'fahrenheit', '℉'],
				def: '°C × 9/5 + 32'
			},
			{
				id: 'r',
				name: 'degree Rankine',
				symbol: '°R',
				factor: 1,
				to: (x) => (x * 5) / 9,
				from: (x) => (x * 9) / 5,
				aliases: ['degR', 'rankine', '°Ra'],
				def: 'K × 9/5'
			}
		]
	},
	{
		id: 'speed',
		name: 'Speed',
		defaultUnit: 'km/h',
		compound: false,
		units: [
			{ id: 'mps', name: 'metre per second', symbol: 'm/s', factor: 1, aliases: ['mps'] },
			{
				id: 'kmh',
				name: 'kilometre per hour',
				symbol: 'km/h',
				factor: 1 / 3.6,
				aliases: ['kmh', 'kph', 'km/t', 'kmt']
			},
			{ id: 'mph', name: 'mile per hour', symbol: 'mph', factor: mile / 3600, aliases: ['mi/h'] },
			{ id: 'fps', name: 'foot per second', symbol: 'ft/s', factor: foot, aliases: ['fps'] },
			{
				id: 'kn',
				name: 'knot',
				symbol: 'kn',
				factor: 1852 / 3600,
				aliases: ['kt', 'kts', 'knot', 'knots', 'knob'],
				def: '1 nmi/h'
			}
		]
	},
	{
		id: 'pressure',
		name: 'Pressure',
		defaultUnit: 'bar',
		compound: false,
		units: [
			{ id: 'pa', name: 'pascal', symbol: 'Pa', factor: 1, aliases: ['pascal', 'pascals'] },
			{ id: 'hpa', name: 'hectopascal', symbol: 'hPa', factor: 100 },
			{ id: 'kpa', name: 'kilopascal', symbol: 'kPa', factor: 1e3 },
			{ id: 'mpa', name: 'megapascal', symbol: 'MPa', factor: 1e6 },
			{ id: 'mbar', name: 'millibar', symbol: 'mbar', factor: 100, def: '1 hPa' },
			{ id: 'bar', name: 'bar', symbol: 'bar', factor: 1e5, def: '100 000 Pa' },
			{ id: 'atm', name: 'standard atmosphere', symbol: 'atm', factor: 101325, def: '101 325 Pa' },
			{
				id: 'at',
				name: 'technical atmosphere',
				symbol: 'at',
				factor: gn * 1e4,
				aliases: ['kgf/cm²', 'kgf/cm2'],
				def: '1 kgf/cm²'
			},
			{
				id: 'psi',
				name: 'pound per square inch',
				symbol: 'psi',
				factor: lbf / inch ** 2,
				aliases: ['lbf/in²', 'lbf/in2']
			},
			{
				id: 'torr',
				name: 'torr',
				symbol: 'Torr',
				factor: 101325 / 760,
				aliases: ['torr'],
				def: '1/760 atm'
			},
			{
				id: 'mmhg',
				name: 'millimetre of mercury',
				symbol: 'mmHg',
				factor: mmHg,
				aliases: ['mm Hg'],
				def: 'conventional'
			},
			{
				id: 'inhg',
				name: 'inch of mercury',
				symbol: 'inHg',
				factor: mmHg * 25.4,
				aliases: ['in Hg'],
				def: 'conventional'
			}
		]
	},
	{
		id: 'energy',
		name: 'Energy',
		defaultUnit: 'kJ',
		compound: false,
		units: [
			{
				id: 'ev',
				name: 'electronvolt',
				symbol: 'eV',
				factor: eV,
				aliases: ['electronvolt', 'electronvolts']
			},
			{ id: 'kev', name: 'kiloelectronvolt', symbol: 'keV', factor: eV * 1e3 },
			{ id: 'mev', name: 'megaelectronvolt', symbol: 'MeV', factor: eV * 1e6 },
			{ id: 'erg', name: 'erg', symbol: 'erg', factor: 1e-7 },
			{ id: 'j', name: 'joule', symbol: 'J', factor: 1, aliases: ['joule', 'joules'] },
			{ id: 'kj', name: 'kilojoule', symbol: 'kJ', factor: 1e3 },
			{ id: 'mj', name: 'megajoule', symbol: 'MJ', factor: 1e6 },
			{
				id: 'ftlbf',
				name: 'foot-pound force',
				symbol: 'ft·lbf',
				factor: foot * lbf,
				aliases: ['ft lbf', 'ft-lbf', 'ftlbf', 'ft·lb']
			},
			{
				id: 'cal',
				name: 'calorie (thermochemical)',
				symbol: 'cal',
				factor: calTh,
				aliases: ['calorie', 'calories'],
				def: '4.184 J'
			},
			{
				id: 'kcal',
				name: 'kilocalorie (thermochemical)',
				symbol: 'kcal',
				factor: calTh * 1000,
				aliases: ['Cal', 'kilocalorie', 'kilocalories'],
				def: '4184 J, food Calorie'
			},
			{
				id: 'btu',
				name: 'British thermal unit (IT)',
				symbol: 'BTU',
				factor: btuIT,
				aliases: ['Btu', 'btu'],
				def: '1055.05585262 J'
			},
			{ id: 'wh', name: 'watt hour', symbol: 'Wh', factor: 3600 },
			{ id: 'kwh', name: 'kilowatt hour', symbol: 'kWh', factor: 3.6e6, aliases: ['kwh', 'KWh'] },
			{ id: 'mwh', name: 'megawatt hour', symbol: 'MWh', factor: 3.6e9 }
		]
	},
	{
		id: 'power',
		name: 'Power',
		defaultUnit: 'kW',
		compound: false,
		units: [
			{ id: 'mw-milli', name: 'milliwatt', symbol: 'mW', factor: 1e-3 },
			{ id: 'w', name: 'watt', symbol: 'W', factor: 1, aliases: ['watt', 'watts'] },
			{ id: 'kw', name: 'kilowatt', symbol: 'kW', factor: 1e3, aliases: ['kilowatt', 'kilowatts'] },
			{ id: 'mw', name: 'megawatt', symbol: 'MW', factor: 1e6, aliases: ['megawatt', 'megawatts'] },
			{
				id: 'btuh',
				name: 'BTU per hour (IT)',
				symbol: 'BTU/h',
				factor: btuIT / 3600,
				aliases: ['Btu/h', 'BTU/hr', 'btu/h', 'BTUh']
			},
			// Metric horsepower: 75 kgf·m/s, [811]. Also PS, hk (Danish hestekraft), CV, ch.
			{
				id: 'ps',
				name: 'horsepower, metric',
				symbol: 'PS',
				factor: 75 * gn,
				aliases: ['hk', 'CV', 'ch', 'metric hp'],
				def: '75 kgf·m/s'
			},
			// Mechanical (imperial) horsepower: 550 ft·lbf/s, [811].
			{
				id: 'hp',
				name: 'horsepower, mechanical',
				symbol: 'hp',
				factor: 550 * foot * lbf,
				aliases: ['bhp', 'horsepower'],
				def: '550 ft·lbf/s'
			}
		]
	},
	{
		id: 'datarate',
		name: 'Data rate',
		defaultUnit: 'Mbit/s',
		compound: false,
		units: [
			{ id: 'bps', name: 'bit per second', symbol: 'bit/s', factor: 1, aliases: ['bps', 'b/s'] },
			{
				id: 'kbps',
				name: 'kilobit per second',
				symbol: 'kbit/s',
				factor: 1e3,
				aliases: ['kbps', 'Kbps', 'kb/s', 'Kbit/s']
			},
			{
				id: 'mbps',
				name: 'megabit per second',
				symbol: 'Mbit/s',
				factor: 1e6,
				aliases: ['Mbps', 'Mb/s', 'mbps']
			},
			{
				id: 'gbps',
				name: 'gigabit per second',
				symbol: 'Gbit/s',
				factor: 1e9,
				aliases: ['Gbps', 'Gb/s', 'gbps']
			},
			{
				id: 'tbps',
				name: 'terabit per second',
				symbol: 'Tbit/s',
				factor: 1e12,
				aliases: ['Tbps', 'Tb/s', 'tbps']
			},
			{ id: 'Bps', name: 'byte per second', symbol: 'B/s', factor: 8, aliases: ['Bps'] },
			{
				id: 'kBps',
				name: 'kilobyte per second',
				symbol: 'kB/s',
				factor: 8e3,
				aliases: ['KB/s', 'kBps', 'KBps']
			},
			{ id: 'MBps', name: 'megabyte per second', symbol: 'MB/s', factor: 8e6, aliases: ['MBps'] },
			{ id: 'GBps', name: 'gigabyte per second', symbol: 'GB/s', factor: 8e9, aliases: ['GBps'] },
			{ id: 'KiBps', name: 'kibibyte per second', symbol: 'KiB/s', factor: 8 * 1024 },
			{ id: 'MiBps', name: 'mebibyte per second', symbol: 'MiB/s', factor: 8 * 1024 ** 2 },
			{ id: 'GiBps', name: 'gibibyte per second', symbol: 'GiB/s', factor: 8 * 1024 ** 3 }
		]
	},
	{
		id: 'angle',
		name: 'Angle',
		defaultUnit: '°',
		compound: true,
		units: [
			{ id: 'rad', name: 'radian', symbol: 'rad', factor: 1, aliases: ['radian', 'radians'] },
			{ id: 'mrad', name: 'milliradian', symbol: 'mrad', factor: 1e-3 },
			{
				id: 'deg',
				name: 'degree',
				symbol: '°',
				factor: Math.PI / 180,
				aliases: ['deg', 'degree', 'degrees']
			},
			{
				id: 'arcmin',
				name: 'arcminute',
				symbol: '′',
				factor: Math.PI / 10800,
				aliases: ['arcmin', "'"]
			},
			{
				id: 'arcsec',
				name: 'arcsecond',
				symbol: '″',
				factor: Math.PI / 648000,
				aliases: ['arcsec', '"']
			},
			{
				id: 'gon',
				name: 'gon (grad)',
				symbol: 'gon',
				factor: Math.PI / 200,
				aliases: ['grad', 'grads', 'gons'],
				def: '1/400 turn'
			},
			{
				id: 'turn',
				name: 'turn',
				symbol: 'turn',
				factor: 2 * Math.PI,
				aliases: ['turns', 'rev', 'revolution', 'revolutions']
			}
		]
	},
	{
		id: 'time',
		name: 'Time',
		defaultUnit: 'h',
		compound: true,
		units: [
			{ id: 'ns', name: 'nanosecond', symbol: 'ns', factor: 1e-9 },
			{ id: 'us', name: 'microsecond', symbol: 'µs', factor: 1e-6, aliases: ['μs', 'us'] },
			{ id: 'ms', name: 'millisecond', symbol: 'ms', factor: 1e-3 },
			{
				id: 's',
				name: 'second',
				symbol: 's',
				factor: 1,
				aliases: ['sec', 'secs', 'second', 'seconds']
			},
			{
				id: 'min',
				name: 'minute',
				symbol: 'min',
				factor: 60,
				aliases: ['mins', 'minute', 'minutes']
			},
			{
				id: 'h',
				name: 'hour',
				symbol: 'h',
				factor: 3600,
				aliases: ['hr', 'hrs', 'hour', 'hours', 'timer']
			},
			{ id: 'd', name: 'day', symbol: 'd', factor: 86400, aliases: ['day', 'days', 'døgn'] },
			{
				id: 'wk',
				name: 'week',
				symbol: 'wk',
				factor: 604800,
				aliases: ['week', 'weeks', 'uge', 'uger']
			},
			{
				id: 'mo',
				name: 'month (average Gregorian)',
				symbol: 'mo',
				factor: 2629746,
				aliases: ['month', 'months'],
				def: '30.436875 d'
			},
			{
				id: 'yr',
				name: 'year (average Gregorian)',
				symbol: 'yr',
				factor: 31556952,
				aliases: ['year', 'years', 'y'],
				def: '365.2425 d'
			},
			{
				id: 'a',
				name: 'Julian year',
				symbol: 'a',
				factor: 31557600,
				aliases: ['Julian year', 'julian year'],
				def: '365.25 d'
			}
		]
	}
];
