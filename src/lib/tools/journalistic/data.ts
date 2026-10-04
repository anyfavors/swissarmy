/**
 * Reference objects for journalistic comparisons.
 *
 * Every value is in the SI base unit of its quantity (m, m², m³, kg, m/s, J, bytes, s).
 * `approx: true` marks numbers that are typical or rounded rather than defined or measured;
 * the UI prints them with "≈". Sources were checked in October 2026. The site never fetches them.
 */

export type Quantity = 'length' | 'area' | 'volume' | 'mass' | 'speed' | 'energy' | 'data' | 'time';
export type Region = 'dk' | 'intl' | 'uk' | 'us';

/** Noun forms for headline sentences. `of` is the full noun phrase with article, used after "of"/"af", "as"/"som". */
export interface Names {
	one: string;
	other: string;
	of: string;
}

export interface Ref {
	id: string;
	/** English label for the list. */
	name: string;
	quantity: Quantity;
	/** Value in the SI base unit. For `since` entries this is the value at 2026-01-01T00:00Z. */
	value: number;
	region: Region;
	source: string;
	sourceNote: string;
	year?: number;
	approx: boolean;
	nameEn: Names;
	nameDa: Names;
	/**
	 * Not naturally counted ("3 Mount Everests"). Headlines use "3 times the height of Mount Everest"
	 * and the list prints "3 × ...".
	 */
	times?: boolean;
	/** Thickness in metres for stacking. */
	thickness?: number;
	thicknessNote?: string;
	/** ISO instant: the value is the time elapsed since then, computed live. */
	since?: string;
}

const KM = 1000;
const KM2 = 1e6;
const KMH = 1000 / 3600;
const WH = 3600;
const YEAR = 365.25 * 86400; // Julian year
const T = 1000; // tonne in kg

const MOON_LANDING = '1969-07-20T20:17:40Z';
const REF_DATE = Date.UTC(2026, 0, 1);

export const refs: Ref[] = [
	// ---------------------------------------------------------------- length
	{
		id: 'lego-brick',
		name: 'LEGO brick, stacking height',
		quantity: 'length',
		value: 0.0096,
		region: 'dk',
		source: 'https://www.bartneck.de/2019/04/21/lego-brick-dimensions-and-measurements/',
		sourceNote:
			'Height of one standard brick without the stud, 9.6 mm, so stacked bricks add 9.6 mm each',
		approx: false,
		nameEn: { one: 'LEGO brick', other: 'LEGO bricks', of: 'a LEGO brick' },
		nameDa: { one: 'legoklods', other: 'legoklodser', of: 'en legoklods' }
	},
	{
		id: 'little-mermaid-height',
		name: 'The Little Mermaid statue, height',
		quantity: 'length',
		value: 1.25,
		region: 'dk',
		source: 'https://en.wikipedia.org/wiki/The_Little_Mermaid_(statue)',
		sourceNote: 'Height of the bronze figure, not including the rock',
		approx: false,
		nameEn: {
			one: 'Little Mermaid statue',
			other: 'Little Mermaid statues',
			of: 'the Little Mermaid statue'
		},
		nameDa: { one: 'Lille Havfrue', other: 'Lille Havfruer', of: 'Den Lille Havfrue' }
	},
	{
		id: 'routemaster-length',
		name: 'London double-decker bus (New Routemaster)',
		quantity: 'length',
		value: 11.23,
		region: 'uk',
		source: 'https://en.wikipedia.org/wiki/New_Routemaster',
		sourceNote: 'Overall length of the New Routemaster',
		approx: false,
		nameEn: {
			one: 'London double-decker bus',
			other: 'London double-decker buses',
			of: 'a London double-decker bus'
		},
		nameDa: { one: 'londonbus', other: 'londonbusser', of: 'en londonbus' }
	},
	{
		id: 'blue-whale-length',
		name: 'Blue whale, longest measured',
		quantity: 'length',
		value: 29.9,
		region: 'intl',
		source: 'https://en.wikipedia.org/wiki/Blue_whale',
		sourceNote: 'Maximum confirmed length. Typical adults are shorter, around 24 to 27 m',
		approx: false,
		nameEn: { one: 'blue whale', other: 'blue whales', of: 'a blue whale' },
		nameDa: { one: 'blåhval', other: 'blåhvaler', of: 'en blåhval' }
	},
	{
		id: 'rundetaarn',
		name: 'Rundetårn (Round Tower), Copenhagen',
		quantity: 'length',
		value: 34.8,
		region: 'dk',
		source: 'https://en.wikipedia.org/wiki/Rundetaarn',
		sourceNote: 'Height of the viewing platform above street level',
		approx: false,
		nameEn: { one: 'Round Tower', other: 'Round Towers', of: 'the Round Tower' },
		nameDa: { one: 'Rundetårn', other: 'Rundetårne', of: 'Rundetårn' }
	},
	{
		id: 'olympic-pool-length',
		name: 'Olympic pool, length',
		quantity: 'length',
		value: 50,
		region: 'intl',
		source: 'https://en.wikipedia.org/wiki/Olympic-size_swimming_pool',
		sourceNote: 'Length of a 50 m competition pool (World Aquatics)',
		approx: false,
		nameEn: {
			one: 'Olympic pool length',
			other: 'Olympic pool lengths',
			of: 'an Olympic pool length'
		},
		nameDa: {
			one: 'olympisk bassinlængde',
			other: 'olympiske bassinlængder',
			of: 'en olympisk bassinlængde'
		}
	},
	{
		id: 'ic3-length',
		name: 'IC3 trainset (DSB class MF)',
		quantity: 'length',
		value: 58.8,
		region: 'dk',
		source: 'https://en.wikipedia.org/wiki/DSB_Class_MF',
		sourceNote: 'Length of one three-car IC3 unit',
		approx: false,
		nameEn: { one: 'IC3 trainset', other: 'IC3 trainsets', of: 'an IC3 trainset' },
		nameDa: { one: 'IC3-togsæt', other: 'IC3-togsæt', of: 'et IC3-togsæt' }
	},
	{
		id: 'football-pitch-length',
		name: 'Football pitch, length',
		quantity: 'length',
		value: 105,
		region: 'intl',
		source: 'https://documents.uefa.com/r/PxVtjcYr9Ntgwd0wYgq2xw/snbCQQ1y5eRWxnjVf4WgnQ',
		sourceNote:
			'UEFA category 3 and 4 stadiums: field of play 105 × 68 m. The Laws of the Game allow 100 to 110 m for internationals',
		approx: false,
		nameEn: { one: 'football pitch', other: 'football pitches', of: 'a football pitch' },
		nameDa: { one: 'fodboldbane', other: 'fodboldbaner', of: 'en fodboldbane' }
	},
	{
		id: 'titanic',
		name: 'RMS Titanic',
		quantity: 'length',
		value: 269.1,
		region: 'uk',
		source: 'https://en.wikipedia.org/wiki/Titanic',
		sourceNote: 'Length overall, 882 ft 9 in',
		year: 1912,
		approx: false,
		nameEn: { one: 'Titanic', other: 'Titanics', of: 'the Titanic' },
		nameDa: { one: 'Titanic', other: "Titanic'er", of: 'Titanic' }
	},
	{
		id: 'eiffel-height',
		name: 'Eiffel Tower, height',
		quantity: 'length',
		value: 330,
		region: 'intl',
		source: 'https://en.wikipedia.org/wiki/Eiffel_Tower',
		sourceNote: 'Total height including antennas',
		year: 2022,
		approx: false,
		nameEn: { one: 'Eiffel Tower', other: 'Eiffel Towers', of: 'the Eiffel Tower' },
		nameDa: { one: 'Eiffeltårn', other: 'Eiffeltårne', of: 'Eiffeltårnet' }
	},
	{
		id: 'nimitz-length',
		name: 'Nimitz-class aircraft carrier',
		quantity: 'length',
		value: 332.8,
		region: 'us',
		source: 'https://en.wikipedia.org/wiki/Nimitz-class_aircraft_carrier',
		sourceNote: 'Length overall, 1,092 ft',
		approx: false,
		nameEn: {
			one: 'Nimitz-class aircraft carrier',
			other: 'Nimitz-class aircraft carriers',
			of: 'a Nimitz-class aircraft carrier'
		},
		nameDa: {
			one: 'hangarskib af Nimitz-klassen',
			other: 'hangarskibe af Nimitz-klassen',
			of: 'et hangarskib af Nimitz-klassen'
		}
	},
	{
		id: 'great-belt-east-bridge',
		name: 'Great Belt East Bridge',
		quantity: 'length',
		value: 6790,
		region: 'dk',
		source: 'https://en.wikipedia.org/wiki/Great_Belt_Bridge',
		sourceNote: 'Total length of the East Bridge, the suspension bridge between Zealand and Sprogø',
		year: 1998,
		approx: false,
		nameEn: {
			one: 'Great Belt East Bridge',
			other: 'Great Belt East Bridges',
			of: 'the Great Belt East Bridge'
		},
		nameDa: { one: 'Storebælts Østbro', other: 'Storebælts Østbroer', of: 'Storebælts Østbro' }
	},
	{
		id: 'oresund-bridge',
		name: 'Øresund Bridge',
		quantity: 'length',
		value: 7845,
		region: 'dk',
		source: 'https://simple.wikipedia.org/wiki/Oresund_Bridge',
		sourceNote: 'The cable-stayed bridge only, without the Peberholm island and Drogden tunnel',
		year: 2000,
		approx: false,
		nameEn: { one: 'Øresund Bridge', other: 'Øresund Bridges', of: 'the Øresund Bridge' },
		nameDa: { one: 'Øresundsbro', other: 'Øresundsbroer', of: 'Øresundsbroen' }
	},
	{
		id: 'great-belt-link',
		name: 'Great Belt Fixed Link, whole crossing',
		quantity: 'length',
		value: 18 * KM,
		region: 'dk',
		source: 'https://en.wikipedia.org/wiki/Great_Belt_Bridge',
		sourceNote: 'Total length Zealand to Funen, rounded to whole kilometres',
		year: 1998,
		approx: true,
		nameEn: {
			one: 'Great Belt Fixed Link',
			other: 'Great Belt Fixed Links',
			of: 'the Great Belt Fixed Link'
		},
		nameDa: {
			one: 'Storebæltsforbindelse',
			other: 'Storebæltsforbindelser',
			of: 'Storebæltsforbindelsen'
		}
	},
	{
		id: 'everest',
		name: 'Mount Everest, height',
		quantity: 'length',
		value: 8848.86,
		region: 'intl',
		source:
			'https://thehimalayantimes.com/nepal/everest-2-0-worlds-tallest-peaks-revised-height-revealed-stands-at-8848-86m/',
		sourceNote: 'Snow height above sea level, joint Nepal and China survey announced December 2020',
		year: 2020,
		approx: false,
		times: true,
		nameEn: { one: 'Mount Everest', other: 'Mount Everests', of: 'the height of Mount Everest' },
		nameDa: { one: 'Mount Everest', other: 'Mount Everest', of: 'højden af Mount Everest' }
	},
	{
		id: 'marathon',
		name: 'Marathon',
		quantity: 'length',
		value: 42195,
		region: 'intl',
		source: 'https://www.boston.com/sports/boston-marathon/2017/04/13/why-is-a-marathon-26-2-miles',
		sourceNote: 'Official distance 42.195 km, fixed in 1921',
		approx: false,
		nameEn: { one: 'marathon', other: 'marathons', of: 'a marathon' },
		nameDa: { one: 'maratonløb', other: 'maratonløb', of: 'et maratonløb' }
	},
	{
		id: 'denmark-length',
		name: 'Length of Denmark, Grenen to Gedser Odde',
		quantity: 'length',
		value: 363 * KM,
		region: 'dk',
		source: 'https://en.wikipedia.org/wiki/List_of_extreme_points_of_Denmark',
		sourceNote:
			'Straight line between the northern tip (Grenen, Skagen) and southern tip (Gedser Odde), computed from coordinates',
		approx: true,
		times: true,
		nameEn: {
			one: 'length of Denmark',
			other: 'lengths of Denmark',
			of: 'the length of Denmark'
		},
		nameDa: { one: 'Danmarkslængde', other: 'Danmarkslængder', of: 'Danmarks længde' }
	},
	{
		id: 'earth-circumference',
		name: 'Earth, equatorial circumference',
		quantity: 'length',
		value: 40075.017 * KM,
		region: 'intl',
		source: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html',
		sourceNote: '2π × equatorial radius 6,378.137 km (NASA Earth fact sheet)',
		approx: false,
		nameEn: {
			one: 'trip around the Equator',
			other: 'trips around the Equator',
			of: 'a trip around the Equator'
		},
		nameDa: {
			one: 'tur rundt om Jorden',
			other: 'ture rundt om Jorden',
			of: 'en tur rundt om Jorden'
		}
	},
	{
		id: 'moon-distance',
		name: 'Earth to Moon, average distance',
		quantity: 'length',
		value: 384400 * KM,
		region: 'intl',
		source: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html',
		sourceNote: 'Semi-major axis of the Moon orbit, centre to centre. Varies 363,000 to 406,000 km',
		approx: false,
		nameEn: { one: 'trip to the Moon', other: 'trips to the Moon', of: 'the way to the Moon' },
		nameDa: { one: 'tur til Månen', other: 'ture til Månen', of: 'vejen til Månen' }
	},
	{
		id: 'au',
		name: 'Earth to Sun (astronomical unit)',
		quantity: 'length',
		value: 149597870700,
		region: 'intl',
		source: 'https://iauarchive.eso.org/static/resolutions/IAU2012_English.pdf',
		sourceNote: 'Exact by definition, IAU 2012 resolution B2',
		approx: false,
		nameEn: { one: 'trip to the Sun', other: 'trips to the Sun', of: 'the way to the Sun' },
		nameDa: { one: 'tur til Solen', other: 'ture til Solen', of: 'vejen til Solen' }
	},
	{
		id: 'light-year',
		name: 'Light-year',
		quantity: 'length',
		value: 9460730472580800,
		region: 'intl',
		source: 'https://en.wikipedia.org/wiki/Light-year',
		sourceNote: 'Exact by IAU convention: speed of light × Julian year',
		approx: false,
		nameEn: { one: 'light-year', other: 'light-years', of: 'a light-year' },
		nameDa: { one: 'lysår', other: 'lysår', of: 'et lysår' }
	},

	// ---------------------------------------------------------------- area
	{
		id: 'tennis-court',
		name: 'Tennis court, doubles',
		quantity: 'area',
		value: 23.77 * 10.97,
		region: 'intl',
		source: 'https://dlgsc.wa.gov.au/sport-and-recreation/sports-dimensions-guide/tennis',
		sourceNote: 'Lined playing area 23.77 × 10.97 m (ITF rules), without run-off',
		approx: false,
		nameEn: { one: 'tennis court', other: 'tennis courts', of: 'a tennis court' },
		nameDa: { one: 'tennisbane', other: 'tennisbaner', of: 'en tennisbane' }
	},
	{
		id: 'olympic-pool-area',
		name: 'Olympic pool, water surface',
		quantity: 'area',
		value: 50 * 25,
		region: 'intl',
		source: 'https://en.wikipedia.org/wiki/Olympic-size_swimming_pool',
		sourceNote: '50 × 25 m',
		approx: false,
		nameEn: { one: 'Olympic pool', other: 'Olympic pools', of: 'an Olympic pool' },
		nameDa: { one: 'olympisk bassin', other: 'olympiske bassiner', of: 'et olympisk bassin' }
	},
	{
		id: 'football-pitch-area',
		name: 'Football pitch, area',
		quantity: 'area',
		value: 105 * 68,
		region: 'intl',
		source: 'https://documents.uefa.com/r/PxVtjcYr9Ntgwd0wYgq2xw/snbCQQ1y5eRWxnjVf4WgnQ',
		sourceNote: 'Field of play 105 × 68 m (UEFA category 3 and 4), without run-off',
		approx: false,
		nameEn: { one: 'football pitch', other: 'football pitches', of: 'a football pitch' },
		nameDa: { one: 'fodboldbane', other: 'fodboldbaner', of: 'en fodboldbane' }
	},
	{
		id: 'radhuspladsen',
		name: 'Rådhuspladsen (City Hall Square), Copenhagen',
		quantity: 'area',
		value: 9800,
		region: 'dk',
		source: 'https://en.wikipedia.org/wiki/City_Hall_Square,_Copenhagen',
		sourceNote: 'Central part of the square. Other sources count surrounding areas and give more',
		approx: true,
		nameEn: { one: 'City Hall Square', other: 'City Hall Squares', of: 'City Hall Square' },
		nameDa: { one: 'Rådhusplads', other: 'Rådhuspladser', of: 'Rådhuspladsen' }
	},
	{
		id: 'manhattan',
		name: 'Manhattan',
		quantity: 'area',
		value: 22.83 * 2.589988110336 * KM2,
		region: 'us',
		source: 'https://en.wikipedia.org/wiki/Manhattan',
		sourceNote: 'Land area 22.83 sq mi (2020 census), water excluded',
		year: 2020,
		approx: false,
		times: true,
		nameEn: { one: 'Manhattan', other: 'Manhattans', of: 'Manhattan' },
		nameDa: { one: 'Manhattan', other: 'Manhattan', of: 'Manhattan' }
	},
	{
		id: 'bornholm',
		name: 'Bornholm',
		quantity: 'area',
		value: 588 * KM2,
		region: 'dk',
		source: 'https://lex.dk/Bornholm',
		sourceNote: 'Area of the island',
		approx: false,
		times: true,
		nameEn: { one: 'Bornholm', other: 'Bornholms', of: 'Bornholm' },
		nameDa: { one: 'Bornholm', other: 'Bornholm', of: 'Bornholm' }
	},
	{
		id: 'funen',
		name: 'Funen (Fyn)',
		quantity: 'area',
		value: 2985 * KM2,
		region: 'dk',
		source: 'https://en.wikipedia.org/wiki/List_of_islands_of_Denmark',
		sourceNote: 'Area of the island of Funen alone, without the surrounding islands',
		approx: false,
		times: true,
		nameEn: { one: 'Funen', other: 'Funens', of: 'Funen' },
		nameDa: { one: 'Fyn', other: 'Fyn', of: 'Fyn' }
	},
	{
		id: 'zealand',
		name: 'Zealand (Sjælland)',
		quantity: 'area',
		value: 7031 * KM2,
		region: 'dk',
		source: 'https://en.wikipedia.org/wiki/List_of_islands_of_Denmark',
		sourceNote: 'Area of the island of Zealand alone',
		approx: false,
		times: true,
		nameEn: { one: 'Zealand', other: 'Zealands', of: 'Zealand' },
		nameDa: { one: 'Sjælland', other: 'Sjælland', of: 'Sjælland' }
	},
	{
		id: 'wales',
		name: 'Wales',
		quantity: 'area',
		value: 20779 * KM2,
		region: 'uk',
		source: 'https://en.wikipedia.org/wiki/Wales',
		sourceNote: 'Total area',
		approx: false,
		times: true,
		nameEn: { one: 'Wales', other: 'Wales', of: 'Wales' },
		nameDa: { one: 'Wales', other: 'Wales', of: 'Wales' }
	},
	{
		id: 'belgium',
		name: 'Belgium',
		quantity: 'area',
		value: 30688 * KM2,
		region: 'intl',
		source: 'https://statbel.fgov.be/en/news/new-data-land-use',
		sourceNote: 'Total surface area incl. the coast to the low-water line (Statbel)',
		approx: false,
		times: true,
		nameEn: { one: 'Belgium', other: 'Belgiums', of: 'Belgium' },
		nameDa: { one: 'Belgien', other: 'Belgien', of: 'Belgien' }
	},
	{
		id: 'denmark-area',
		name: 'Denmark',
		quantity: 'area',
		value: 42956 * KM2,
		region: 'dk',
		source: 'https://www.dst.dk/pubfile/17953/dkinfigures',
		sourceNote:
			'Land and inland water, without Greenland and the Faroe Islands (Statistics Denmark). Published figures vary by a few km²',
		year: 2024,
		approx: true,
		times: true,
		nameEn: { one: 'Denmark', other: 'Denmarks', of: 'Denmark' },
		nameDa: { one: 'Danmark', other: 'Danmark', of: 'Danmark' }
	},
	{
		id: 'greenland',
		name: 'Greenland',
		quantity: 'area',
		value: 2166086 * KM2,
		region: 'dk',
		source: 'https://en.wikipedia.org/wiki/Geography_of_Greenland',
		sourceNote: 'Total area, about 80 % ice-covered',
		approx: false,
		times: true,
		nameEn: { one: 'Greenland', other: 'Greenlands', of: 'Greenland' },
		nameDa: { one: 'Grønland', other: 'Grønland', of: 'Grønland' }
	},

	// ---------------------------------------------------------------- volume
	{
		id: 'wine-bottle',
		name: 'Wine bottle',
		quantity: 'volume',
		value: 0.00075,
		region: 'intl',
		source: 'https://eumonitor.eu/9353000/1/j4nvk6yhcbpeywk_j9vvik7m1c3gyxp/vitgbgimlvyj',
		sourceNote: 'Standard 75 cl nominal quantity for still wine (EU directive 2007/45/EC)',
		approx: false,
		nameEn: { one: 'wine bottle', other: 'wine bottles', of: 'a wine bottle' },
		nameDa: { one: 'vinflaske', other: 'vinflasker', of: 'en vinflaske' }
	},
	{
		id: 'bathtub',
		name: 'Bathtub, filled',
		quantity: 'volume',
		value: 0.15,
		region: 'intl',
		source:
			'https://ronalbathrooms.com/en_GB/magazine/bath-capacity-how-many-liters-does-each-bathtub-size-hold',
		sourceNote:
			'Assumption: 150 L, a typical filled standard 170 × 70 cm tub. Real tubs hold 150 to 300 L',
		approx: true,
		nameEn: { one: 'bathtub', other: 'bathtubs', of: 'a bathtub' },
		nameDa: { one: 'badekar', other: 'badekar', of: 'et badekar' }
	},
	{
		id: 'concrete-mixer',
		name: 'Concrete mixer truck',
		quantity: 'volume',
		value: 8,
		region: 'intl',
		source:
			'https://www.liebherr.com/en/gbr/products/construction-machines/concrete-technology/truck-mixers/truck-mixers-htm/details/98777.html',
		sourceNote:
			'Nominal load of a common 8 m³ drum (Liebherr HTM 805). Sizes range about 6 to 12 m³',
		approx: true,
		nameEn: {
			one: 'concrete mixer truck',
			other: 'concrete mixer trucks',
			of: 'a concrete mixer truck'
		},
		nameDa: { one: 'betonbil', other: 'betonbiler', of: 'en betonbil' }
	},
	{
		id: 'container-20ft',
		name: 'Shipping container, 20 ft',
		quantity: 'volume',
		value: 33.2,
		region: 'intl',
		source:
			'https://www.freightamigo.com/en/blog/international-relocation/shipping-container-dimensions-complete-iso-standards-and-specifications-guide-for-2026/',
		sourceNote: 'Internal volume of a standard dry container, 33.0 to 33.2 m³ depending on maker',
		approx: true,
		nameEn: {
			one: 'shipping container (20 ft)',
			other: 'shipping containers (20 ft)',
			of: 'a 20 ft shipping container'
		},
		nameDa: {
			one: 'container på 20 fod',
			other: 'containere på 20 fod',
			of: 'en container på 20 fod'
		}
	},
	{
		id: 'olympic-pool-volume',
		name: 'Olympic pool, volume',
		quantity: 'volume',
		value: 50 * 25 * 2,
		region: 'intl',
		source: 'https://en.wikipedia.org/wiki/Olympic-size_swimming_pool',
		sourceNote:
			'Assumption: 50 × 25 × 2 m, the minimum depth. Olympic Games pools are at least 2.5 m deep (3,125 m³)',
		approx: true,
		nameEn: { one: 'Olympic pool', other: 'Olympic pools', of: 'an Olympic pool' },
		nameDa: { one: 'olympisk bassin', other: 'olympiske bassiner', of: 'et olympisk bassin' }
	},
	{
		id: 'pyramid-volume',
		name: 'Great Pyramid of Giza, volume',
		quantity: 'volume',
		value: 2.5e6,
		region: 'intl',
		source: 'https://www.newworldencyclopedia.org/entry/Great_Pyramid_of_Giza',
		sourceNote: 'Estimated volume including an internal hillock',
		approx: true,
		nameEn: {
			one: 'Great Pyramid of Giza',
			other: 'Great Pyramids of Giza',
			of: 'the Great Pyramid of Giza'
		},
		nameDa: { one: 'Keopspyramide', other: 'Keopspyramider', of: 'Keopspyramiden' }
	},
	{
		id: 'esrum-so',
		name: 'Esrum Sø (Lake Esrum)',
		quantity: 'volume',
		value: 233e6,
		region: 'dk',
		source: 'https://lex.dk/Esrum_S%C3%B8',
		sourceNote: 'Water volume. The Danish lake holding the most water',
		approx: false,
		times: true,
		nameEn: { one: 'Lake Esrum', other: 'Lake Esrums', of: 'Lake Esrum' },
		nameDa: { one: 'Esrum Sø', other: 'Esrum Sø', of: 'Esrum Sø' }
	},
	{
		id: 'lake-constance',
		name: 'Lake Constance (Bodensee)',
		quantity: 'volume',
		value: 48e9,
		region: 'intl',
		source: 'https://en.wikipedia.org/wiki/Lake_Constance',
		sourceNote: 'Water volume 48 km³ (IGKB)',
		approx: false,
		times: true,
		nameEn: { one: 'Lake Constance', other: 'Lake Constances', of: 'Lake Constance' },
		nameDa: { one: 'Bodensøen', other: 'Bodensøen', of: 'Bodensøen' }
	},

	// ---------------------------------------------------------------- mass
	{
		id: 'coin-20kr',
		name: 'Danish 20-krone coin',
		quantity: 'mass',
		value: 0.0093,
		region: 'dk',
		source: 'https://en.wikipedia.org/wiki/Krone_(Danish_coin)',
		sourceNote: 'Aluminium bronze, 9.3 g',
		approx: false,
		nameEn: { one: '20-krone coin', other: '20-krone coins', of: 'a 20-krone coin' },
		nameDa: { one: '20-kronestykke', other: '20-kronestykker', of: 'et 20-kronestykke' }
	},
	{
		id: 'little-mermaid-mass',
		name: 'The Little Mermaid statue, mass',
		quantity: 'mass',
		value: 175,
		region: 'dk',
		source: 'https://en.wikipedia.org/wiki/The_Little_Mermaid_(statue)',
		sourceNote: 'Bronze figure, stated as about 175 kg',
		approx: true,
		nameEn: {
			one: 'Little Mermaid statue',
			other: 'Little Mermaid statues',
			of: 'the Little Mermaid statue'
		},
		nameDa: { one: 'Lille Havfrue', other: 'Lille Havfruer', of: 'Den Lille Havfrue' }
	},
	{
		id: 'dairy-cow',
		name: 'Holstein dairy cow',
		quantity: 'mass',
		value: 680,
		region: 'dk',
		source: 'https://en.wikipedia.org/wiki/Holstein_Friesian',
		sourceNote: 'Lower end of the 680 to 770 kg range for a mature cow',
		approx: true,
		nameEn: { one: 'dairy cow', other: 'dairy cows', of: 'a dairy cow' },
		nameDa: { one: 'malkeko', other: 'malkekøer', of: 'en malkeko' }
	},
	{
		id: 'car',
		name: 'New car, EU average',
		quantity: 'mass',
		value: 1540,
		region: 'intl',
		source: 'https://theicct.org/wp-content/uploads/2024/12/241206_Pocketbook_2024_25_Web.pdf',
		sourceNote: 'Average mass of new passenger cars registered in the EU in 2023 (ICCT)',
		year: 2023,
		approx: false,
		nameEn: { one: 'car', other: 'cars', of: 'a car' },
		nameDa: { one: 'bil', other: 'biler', of: 'en bil' }
	},
	{
		id: 'elephant',
		name: 'African elephant, adult bull',
		quantity: 'mass',
		value: 6000,
		region: 'intl',
		source: 'https://www.britannica.com/science/How-Much-Does-an-Elephant-Weigh',
		sourceNote:
			'Typical upper weight of an adult male African savanna elephant. Females weigh about half',
		approx: true,
		nameEn: { one: 'elephant', other: 'elephants', of: 'an elephant' },
		nameDa: { one: 'elefant', other: 'elefanter', of: 'en elefant' }
	},
	{
		id: 'routemaster-mass',
		name: 'London double-decker bus (New Routemaster), mass',
		quantity: 'mass',
		value: 12.65 * T,
		region: 'uk',
		source: 'https://en.wikipedia.org/wiki/New_Routemaster',
		sourceNote: 'Kerb weight, empty',
		approx: false,
		nameEn: {
			one: 'London double-decker bus',
			other: 'London double-decker buses',
			of: 'a London double-decker bus'
		},
		nameDa: { one: 'londonbus', other: 'londonbusser', of: 'en londonbus' }
	},
	{
		id: 'ic3-mass',
		name: 'IC3 trainset (DSB class MF), mass',
		quantity: 'mass',
		value: 97 * T,
		region: 'dk',
		source: 'https://en.wikipedia.org/wiki/DSB_Class_MF',
		sourceNote: 'Empty weight of one three-car unit',
		approx: false,
		nameEn: { one: 'IC3 trainset', other: 'IC3 trainsets', of: 'an IC3 trainset' },
		nameDa: { one: 'IC3-togsæt', other: 'IC3-togsæt', of: 'et IC3-togsæt' }
	},
	{
		id: 'blue-whale-mass',
		name: 'Blue whale, heaviest measured',
		quantity: 'mass',
		value: 199 * T,
		region: 'intl',
		source: 'https://en.wikipedia.org/wiki/Blue_whale',
		sourceNote: 'Maximum recorded weight. Most adults weigh far less',
		approx: false,
		nameEn: { one: 'blue whale', other: 'blue whales', of: 'a blue whale' },
		nameDa: { one: 'blåhval', other: 'blåhvaler', of: 'en blåhval' }
	},
	{
		id: 'boeing-747',
		name: 'Boeing 747-400, empty',
		quantity: 'mass',
		value: 394100 * 0.45359237,
		region: 'us',
		source:
			'https://www.boeing.com/content/dam/boeing/boeingdotcom/commercial/airports/acaps/747-400_Rev_F.pdf',
		sourceNote: 'Operating empty weight 394,100 lb. Varies with engines and cabin layout',
		approx: true,
		nameEn: {
			one: 'empty Boeing 747-400',
			other: 'empty Boeing 747-400s',
			of: 'an empty Boeing 747-400'
		},
		nameDa: {
			one: 'tom Boeing 747-400',
			other: 'tomme Boeing 747-400',
			of: 'en tom Boeing 747-400'
		}
	},
	{
		id: 'eiffel-iron',
		name: 'Eiffel Tower, iron structure only',
		quantity: 'mass',
		value: 7300 * T,
		region: 'intl',
		source: 'https://structurae.net/en/structures/eiffel-tower',
		sourceNote: 'Puddle iron structure only',
		approx: false,
		times: true,
		nameEn: {
			one: 'Eiffel Tower iron structure',
			other: 'Eiffel Tower iron structures',
			of: 'the iron structure of the Eiffel Tower'
		},
		nameDa: {
			one: 'Eiffeltårnets jernkonstruktion',
			other: 'Eiffeltårnets jernkonstruktion',
			of: 'Eiffeltårnets jernkonstruktion'
		}
	},
	{
		id: 'eiffel-total',
		name: 'Eiffel Tower, total',
		quantity: 'mass',
		value: 10100 * T,
		region: 'intl',
		source: 'https://structurae.net/en/structures/eiffel-tower',
		sourceNote: 'Total mass including non-metal parts, fittings and lifts',
		approx: false,
		nameEn: { one: 'Eiffel Tower', other: 'Eiffel Towers', of: 'the Eiffel Tower' },
		nameDa: { one: 'Eiffeltårn', other: 'Eiffeltårne', of: 'Eiffeltårnet' }
	},
	{
		id: 'nimitz-mass',
		name: 'Nimitz-class aircraft carrier, full load',
		quantity: 'mass',
		value: 101600 * T,
		region: 'us',
		source: 'https://en.wikipedia.org/wiki/Nimitz-class_aircraft_carrier',
		sourceNote: 'Full-load displacement, lower end of 100,000 to 104,600 long tons',
		approx: true,
		nameEn: {
			one: 'Nimitz-class aircraft carrier',
			other: 'Nimitz-class aircraft carriers',
			of: 'a Nimitz-class aircraft carrier'
		},
		nameDa: {
			one: 'hangarskib af Nimitz-klassen',
			other: 'hangarskibe af Nimitz-klassen',
			of: 'et hangarskib af Nimitz-klassen'
		}
	},
	{
		id: 'pyramid-mass',
		name: 'Great Pyramid of Giza, mass',
		quantity: 'mass',
		value: 5.9e6 * T,
		region: 'intl',
		source: 'https://www.newworldencyclopedia.org/entry/Great_Pyramid_of_Giza',
		sourceNote: 'Estimated total mass',
		approx: true,
		nameEn: {
			one: 'Great Pyramid of Giza',
			other: 'Great Pyramids of Giza',
			of: 'the Great Pyramid of Giza'
		},
		nameDa: { one: 'Keopspyramide', other: 'Keopspyramider', of: 'Keopspyramiden' }
	},

	// ---------------------------------------------------------------- speed
	{
		id: 'walking',
		name: 'Walking pace',
		quantity: 'speed',
		value: 1.34,
		region: 'intl',
		source:
			'https://www.pedbikeinfo.org/cms/downloads/Free%20Speed%20Distributions%20for%20Pedestrian%20Traffic.pdf',
		sourceNote: 'Mean free walking speed of pedestrians, 1.34 m/s (4.8 km/h)',
		approx: true,
		nameEn: { one: 'pedestrian', other: 'pedestrians', of: 'a pedestrian' },
		nameDa: { one: 'fodgænger', other: 'fodgængere', of: 'en fodgænger' }
	},
	{
		id: 'cph-cyclist',
		name: 'Copenhagen cyclist, average',
		quantity: 'speed',
		value: 16.4 * KMH,
		region: 'dk',
		source: 'https://www.mobilize.org.br/midias/pesquisas/copenhagen-bicycle-account-2014.pdf',
		sourceNote:
			'Average cycling speed, City of Copenhagen Bicycle Account 2014 (copy of the city report)',
		year: 2014,
		approx: true,
		nameEn: { one: 'Copenhagen cyclist', other: 'Copenhagen cyclists', of: 'a Copenhagen cyclist' },
		nameDa: {
			one: 'københavnsk cyklist',
			other: 'københavnske cyklister',
			of: 'en københavnsk cyklist'
		}
	},
	{
		id: 'bolt',
		name: 'Usain Bolt, 100 m world record average',
		quantity: 'speed',
		value: 100 / 9.58,
		region: 'intl',
		source: 'https://worldathletics.org/news/news/bolt-again-958-world-record-in-berlin-updat',
		sourceNote: '100 m in 9.58 s (Berlin 2009), averaged over the whole race',
		year: 2009,
		approx: false,
		nameEn: { one: 'Usain Bolt', other: 'Usain Bolts', of: 'Usain Bolt' },
		nameDa: { one: 'Usain Bolt', other: 'Usain Bolt', of: 'Usain Bolt' }
	},
	{
		id: 'cheetah',
		name: 'Cheetah, top speed measured',
		quantity: 'speed',
		value: 25.9,
		region: 'intl',
		source: 'https://doi.org/10.1038/nature12295',
		sourceNote:
			'Highest speed recorded by GPS collars on wild cheetahs (Wilson et al., Nature 2013)',
		year: 2013,
		approx: false,
		nameEn: { one: 'cheetah', other: 'cheetahs', of: 'a cheetah at full sprint' },
		nameDa: { one: 'gepard', other: 'geparder', of: 'en gepard i fuld fart' }
	},
	{
		id: 'ic3-speed',
		name: 'IC3 train, top speed',
		quantity: 'speed',
		value: 180 * KMH,
		region: 'dk',
		source: 'https://en.wikipedia.org/wiki/DSB_Class_MF',
		sourceNote: 'Maximum service speed 180 km/h',
		approx: false,
		nameEn: { one: 'IC3 train', other: 'IC3 trains', of: 'an IC3 train at top speed' },
		nameDa: { one: 'IC3-tog', other: 'IC3-tog', of: 'et IC3-tog ved topfart' }
	},
	{
		id: 'speed-of-sound',
		name: 'Speed of sound, sea level, 15 °C',
		quantity: 'speed',
		value: 340.3,
		region: 'intl',
		source: 'https://aerospaceweb.org/question/atmosphere/q0160.shtml',
		sourceNote: 'Standard atmosphere at sea level, 15 °C, dry air',
		approx: false,
		nameEn: { one: 'speed of sound', other: 'speeds of sound', of: 'sound' },
		nameDa: { one: 'lydens hastighed', other: 'lydens hastighed', of: 'lyden' }
	},
	{
		id: 'concorde',
		name: 'Concorde, cruise',
		quantity: 'speed',
		value: 2179 * KMH,
		region: 'intl',
		source: 'https://www.britannica.com/technology/How-Fast-Was-the-Concorde-Jet',
		sourceNote: 'Cruise at Mach 2.04, about 2,179 km/h at 18,300 m',
		approx: true,
		nameEn: { one: 'Concorde', other: 'Concordes', of: 'Concorde' },
		nameDa: { one: 'Concorde', other: 'Concorde', of: 'Concorde' }
	},
	{
		id: 'iss-speed',
		name: 'International Space Station, orbit',
		quantity: 'speed',
		value: 17500 * 0.44704,
		region: 'intl',
		source:
			'https://nextgov.com/emerging-tech/2016/05/iss-has-made-its-100000th-orbit-earth/128419',
		sourceNote: 'NASA round figure of 17,500 mph (about 28,000 km/h)',
		approx: true,
		nameEn: {
			one: 'space station',
			other: 'space stations',
			of: 'the International Space Station'
		},
		nameDa: { one: 'rumstation', other: 'rumstationer', of: 'Den Internationale Rumstation' }
	},
	{
		id: 'voyager-1',
		name: 'Voyager 1, leaving the Solar System',
		quantity: 'speed',
		value: 17000,
		region: 'us',
		source: 'https://science.nasa.gov/image-article/apod-2011-may-6-farther-along/',
		sourceNote: 'About 17 km/s relative to the Sun',
		approx: true,
		nameEn: { one: 'Voyager 1', other: 'Voyager 1s', of: 'Voyager 1' },
		nameDa: { one: 'Voyager 1', other: 'Voyager 1', of: 'Voyager 1' }
	},
	{
		id: 'earth-orbit',
		name: 'Earth around the Sun',
		quantity: 'speed',
		value: 29780,
		region: 'intl',
		source: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html',
		sourceNote: 'Mean orbital velocity 29.78 km/s',
		approx: false,
		nameEn: { one: 'Earth', other: 'Earths', of: 'the Earth around the Sun' },
		nameDa: { one: 'Jorden', other: 'Jorden', of: 'Jorden rundt om Solen' }
	},
	{
		id: 'light',
		name: 'Speed of light',
		quantity: 'speed',
		value: 299792458,
		region: 'intl',
		source: 'https://physics.nist.gov/cgi-bin/cuu/Value?c',
		sourceNote: 'Exact by definition of the metre, in vacuum',
		approx: false,
		nameEn: { one: 'speed of light', other: 'speeds of light', of: 'light' },
		nameDa: { one: 'lysets hastighed', other: 'lysets hastighed', of: 'lyset' }
	},

	// ---------------------------------------------------------------- energy
	{
		id: 'phone-charge',
		name: 'Smartphone battery, full charge',
		quantity: 'energy',
		value: 12.98 * WH,
		region: 'intl',
		source:
			'https://www.macworld.com/article/678413/iphone-battery-capacities-compared-all-iphones-battery-life-in-mah-and-wh.html',
		sourceNote:
			'Assumption: an iPhone 15 battery, 12.98 Wh rated. Phones range roughly 10 to 20 Wh',
		year: 2023,
		approx: true,
		nameEn: {
			one: 'full smartphone charge',
			other: 'full smartphone charges',
			of: 'a full smartphone charge'
		},
		nameDa: {
			one: 'fuld opladning af en mobil',
			other: 'fulde opladninger af en mobil',
			of: 'en fuld opladning af en mobil'
		}
	},
	{
		id: 'daily-food',
		name: 'Daily food energy, adult reference intake',
		quantity: 'energy',
		value: 8.4e6,
		region: 'intl',
		source: 'https://en.wikipedia.org/wiki/Reference_Intake',
		sourceNote: 'EU reference intake 8,400 kJ (2,000 kcal) used on food labels',
		approx: false,
		nameEn: { one: "day's food", other: "days' food", of: "a day's food for an adult" },
		nameDa: { one: 'dags kost', other: 'dages kost', of: 'en voksens kost for en dag' }
	},
	{
		id: 'petrol-litre',
		name: 'Litre of petrol',
		quantity: 'energy',
		value: 32e6,
		region: 'intl',
		source: 'https://content.ces.ncsu.edu/publication/conversion-factors-for-bioenergy',
		sourceNote: 'Lower heating value, about 32 MJ per litre',
		approx: true,
		nameEn: { one: 'litre of petrol', other: 'litres of petrol', of: 'a litre of petrol' },
		nameDa: { one: 'liter benzin', other: 'liter benzin', of: 'en liter benzin' }
	},
	{
		id: 'dk-house-year',
		name: 'Danish house, a year of electricity',
		quantity: 'energy',
		value: 4570 * 1000 * WH,
		region: 'dk',
		source: 'https://fdm.dk/vaerd-at-vide/stroem/beregn-dit-elforbrug-indsend-din-elregning',
		sourceNote:
			'Danish Energy Agency typical figure for a 150 m² house with 4 people, 4,570 kWh a year, as cited by FDM',
		approx: true,
		nameEn: {
			one: 'year of electricity for a Danish house',
			other: 'years of electricity for a Danish house',
			of: "a Danish house's yearly electricity"
		},
		nameDa: {
			one: 'års elforbrug i et dansk parcelhus',
			other: 'års elforbrug i et dansk parcelhus',
			of: 'et dansk parcelhus’ årlige elforbrug'
		}
	},
	{
		id: 'turbine-hour',
		name: 'Offshore wind turbine, one hour at rated power',
		quantity: 'energy',
		value: 15e6 * 3600,
		region: 'dk',
		source: 'https://www.vestas.com/en/products/offshore/V236-15MW',
		sourceNote: 'Vestas V236-15.0 MW running one hour at its 15 MW rated output',
		approx: false,
		nameEn: {
			one: 'hour of a 15 MW wind turbine',
			other: 'hours of a 15 MW wind turbine',
			of: 'an hour of a 15 MW wind turbine'
		},
		nameDa: {
			one: 'times produktion fra en 15 MW-vindmølle',
			other: 'timers produktion fra en 15 MW-vindmølle',
			of: 'en times produktion fra en 15 MW-vindmølle'
		}
	},
	{
		id: 'tonne-tnt',
		name: 'Tonne of TNT',
		quantity: 'energy',
		value: 4.184e9,
		region: 'intl',
		source: 'https://en.wikipedia.org/wiki/TNT_equivalent',
		sourceNote: '4.184 GJ by convention',
		approx: false,
		nameEn: { one: 'tonne of TNT', other: 'tonnes of TNT', of: 'a tonne of TNT' },
		nameDa: { one: 'ton TNT', other: 'ton TNT', of: 'et ton TNT' }
	},
	{
		id: 'turbine-year',
		name: 'Offshore wind turbine, one year',
		quantity: 'energy',
		value: 80e9 * WH,
		region: 'dk',
		source: 'https://www.vestas.com/en/products/offshore/V236-15MW',
		sourceNote: 'Vestas claim for a V236-15.0 MW: up to 80 GWh a year, depending on the site',
		approx: true,
		nameEn: {
			one: "year's output of a 15 MW wind turbine",
			other: "years' output of a 15 MW wind turbine",
			of: "a year's output of a 15 MW wind turbine"
		},
		nameDa: {
			one: 'års produktion fra en 15 MW-vindmølle',
			other: 'års produktion fra en 15 MW-vindmølle',
			of: 'et års produktion fra en 15 MW-vindmølle'
		}
	},
	{
		id: 'hiroshima',
		name: 'Hiroshima bomb',
		quantity: 'energy',
		value: 15e3 * 4.184e9,
		region: 'intl',
		source: 'https://apps.dtic.mil/sti/html/tr/AD0627857/index.html',
		sourceNote: 'About 15 kt of TNT (63 TJ). Estimates range up to about 16 kt',
		year: 1945,
		approx: true,
		nameEn: { one: 'Hiroshima bomb', other: 'Hiroshima bombs', of: 'the Hiroshima bomb' },
		nameDa: { one: 'Hiroshima-bombe', other: 'Hiroshima-bomber', of: 'Hiroshima-bomben' }
	},

	// ---------------------------------------------------------------- data
	{
		id: 'punched-card',
		name: 'Punched card, 80 columns',
		quantity: 'data',
		value: 80,
		region: 'us',
		source: 'https://www.ibm.com/history/punched-card',
		sourceNote: 'IBM 80-column card, one character per column, counted as one byte each',
		approx: false,
		nameEn: { one: 'punched card', other: 'punched cards', of: 'a punched card' },
		nameDa: { one: 'hulkort', other: 'hulkort', of: 'et hulkort' }
	},
	{
		id: 'c64',
		name: 'Commodore 64, RAM',
		quantity: 'data',
		value: 65536,
		region: 'intl',
		source: 'https://www.mi.sanu.ac.rs/novi_sajt/muzej/docs/COMMODORE%2064.pdf',
		sourceNote: '64 KiB of RAM',
		year: 1982,
		approx: false,
		times: true,
		nameEn: { one: 'Commodore 64', other: 'Commodore 64s', of: 'the memory of a Commodore 64' },
		nameDa: { one: 'Commodore 64', other: 'Commodore 64', of: 'hukommelsen i en Commodore 64' }
	},
	{
		id: 'agc',
		name: 'Apollo Guidance Computer, fixed memory',
		quantity: 'data',
		value: 36864 * 2,
		region: 'us',
		source: 'https://www.nasa.gov/wp-content/uploads/static/history/computers/Ch2-5.html',
		sourceNote: '36,864 words of read-only rope memory, each 16-bit word counted as 2 bytes',
		year: 1969,
		approx: true,
		times: true,
		nameEn: {
			one: 'Apollo Guidance Computer',
			other: 'Apollo Guidance Computers',
			of: 'the fixed memory of the Apollo Guidance Computer'
		},
		nameDa: {
			one: 'Apollo-computer',
			other: 'Apollo-computere',
			of: 'den faste hukommelse i Apollo-computeren'
		}
	},
	{
		id: 'floppy',
		name: '3.5" floppy disk, 1.44 MB',
		quantity: 'data',
		value: 1474560,
		region: 'intl',
		source: 'https://ecma-international.org/publications-and-standards/standards/ecma-147/',
		sourceNote:
			'Formatted capacity 1,474,560 bytes (80 tracks × 2 sides × 18 sectors × 512 B). The "1.44 MB" label mixes 1000 and 1024',
		approx: false,
		thickness: 0.0033,
		thicknessNote: 'Cartridge thickness 3.3 mm, as commonly cited',
		nameEn: { one: 'floppy disk', other: 'floppy disks', of: 'a floppy disk' },
		nameDa: { one: 'diskette', other: 'disketter', of: 'en diskette' }
	},
	{
		id: 'cd-rom',
		name: 'CD-ROM, 80 min',
		quantity: 'data',
		value: 737280000,
		region: 'intl',
		source: 'https://en.wikipedia.org/wiki/CD-ROM',
		sourceNote: '360,000 sectors × 2,048 bytes, sold as "700 MB" (700 MiB)',
		approx: false,
		thickness: 0.0012,
		thicknessNote: 'Bare disc 1.2 mm (Red Book). In a standard jewel case it is 10.4 mm',
		nameEn: { one: 'CD-ROM', other: 'CD-ROMs', of: 'a CD-ROM' },
		nameDa: { one: 'cd-rom', other: "cd-rom'er", of: 'en cd-rom' }
	},
	{
		id: 'genome',
		name: 'Human genome, 2 bits per base',
		quantity: 'data',
		value: 750e6,
		region: 'intl',
		source: 'https://www.technologyreview.com/2012/04/25/186381/bases-to-bytes/amp/',
		sourceNote: 'About 3 billion base pairs at 2 bits each, one copy, uncompressed',
		approx: true,
		times: true,
		nameEn: { one: 'human genome', other: 'human genomes', of: 'the human genome' },
		nameDa: { one: 'menneskegenom', other: 'menneskegenomer', of: 'menneskets genom' }
	},
	{
		id: 'dvd',
		name: 'DVD, single layer',
		quantity: 'data',
		value: 4700372992,
		region: 'intl',
		source: 'https://forum.videohelp.com/showthread.php?p=1458656',
		sourceNote: 'DVD±R single layer, 4,700,372,992 bytes, sold as "4.7 GB" (decimal)',
		approx: false,
		thickness: 0.0012,
		thicknessNote: 'Bare disc 1.2 mm',
		nameEn: { one: 'DVD', other: 'DVDs', of: 'a DVD' },
		nameDa: { one: 'dvd', other: "dvd'er", of: 'en dvd' }
	},
	{
		id: 'bluray',
		name: 'Blu-ray disc, single layer',
		quantity: 'data',
		value: 25e9,
		region: 'intl',
		source: 'https://en.wikipedia.org/wiki/Blu-ray',
		sourceNote: 'Nominal 25 GB (decimal). Formatted capacity is slightly higher',
		approx: true,
		thickness: 0.0012,
		thicknessNote: 'Bare disc 1.2 mm',
		nameEn: { one: 'Blu-ray disc', other: 'Blu-ray discs', of: 'a Blu-ray disc' },
		nameDa: { one: 'Blu-ray-disk', other: 'Blu-ray-diske', of: 'en Blu-ray-disk' }
	},
	{
		id: 'wikipedia',
		name: 'English Wikipedia, compressed text dump',
		quantity: 'data',
		value: 26.44e9,
		region: 'intl',
		source: 'https://meta.wikimedia.org/wiki/Data_dump_torrents',
		sourceNote:
			'enwiki pages-articles-multistream.xml.bz2 of 2026-06-01: current article text only, bzip2, no images or history',
		year: 2026,
		approx: true,
		nameEn: {
			one: 'English Wikipedia',
			other: 'English Wikipedias',
			of: 'English Wikipedia'
		},
		nameDa: {
			one: 'engelsk Wikipedia',
			other: 'engelske Wikipediaer',
			of: 'engelsk Wikipedia'
		}
	},
	{
		id: 'library-of-congress',
		name: '"Library of Congress" (folklore unit)',
		quantity: 'data',
		value: 10e12,
		region: 'us',
		source:
			'https://blogs.loc.gov/thesignal/2012/04/a-library-of-congress-worth-of-data-its-all-in-how-you-define-it/',
		sourceNote:
			'Folklore: a 2000 Berkeley estimate of the print collection as plain text. Not a measurement; the Library itself says so',
		approx: true,
		nameEn: {
			one: 'Library of Congress',
			other: 'Libraries of Congress',
			of: 'a Library of Congress'
		},
		nameDa: {
			one: 'Library of Congress',
			other: 'Library of Congress',
			of: 'et Library of Congress'
		}
	},

	// ---------------------------------------------------------------- time
	{
		id: 'bolt-100m',
		name: 'Usain Bolt, 100 m world record',
		quantity: 'time',
		value: 9.58,
		region: 'intl',
		source: 'https://worldathletics.org/news/news/bolt-again-958-world-record-in-berlin-updat',
		sourceNote: 'Berlin, 16 August 2009',
		year: 2009,
		approx: false,
		nameEn: {
			one: 'Usain Bolt 100 m record run',
			other: 'Usain Bolt 100 m record runs',
			of: "Usain Bolt's 100 m record"
		},
		nameDa: {
			one: '100 m-rekordløb af Usain Bolt',
			other: '100 m-rekordløb af Usain Bolt',
			of: 'Usain Bolts 100 m-rekord'
		}
	},
	{
		id: 'sunlight',
		name: 'Sunlight, Sun to Earth',
		quantity: 'time',
		value: 149597870700 / 299792458,
		region: 'intl',
		source: 'https://iauarchive.eso.org/static/resolutions/IAU2012_English.pdf',
		sourceNote: 'One astronomical unit divided by the speed of light, about 8 min 19 s',
		approx: false,
		times: true,
		nameEn: {
			one: 'trip of sunlight to Earth',
			other: 'trips of sunlight to Earth',
			of: 'the time sunlight takes to reach Earth'
		},
		nameDa: {
			one: 'tur for sollyset til Jorden',
			other: 'ture for sollyset til Jorden',
			of: 'den tid sollyset er om at nå Jorden'
		}
	},
	{
		id: 'football-match',
		name: 'Football match',
		quantity: 'time',
		value: 90 * 60,
		region: 'intl',
		source: 'https://theifab.com/laws/latest/the-duration-of-the-match',
		sourceNote: 'Two halves of 45 minutes, without stoppage time and half-time break',
		approx: false,
		nameEn: { one: 'football match', other: 'football matches', of: 'a football match' },
		nameDa: { one: 'fodboldkamp', other: 'fodboldkampe', of: 'en fodboldkamp' }
	},
	{
		id: 'iss-orbit',
		name: 'International Space Station, one orbit',
		quantity: 'time',
		value: 90 * 60,
		region: 'intl',
		source:
			'https://nextgov.com/emerging-tech/2016/05/iss-has-made-its-100000th-orbit-earth/128419',
		sourceNote: 'NASA round figure of about 90 minutes per orbit. Varies with altitude',
		approx: true,
		nameEn: { one: 'ISS orbit', other: 'ISS orbits', of: 'an ISS orbit' },
		nameDa: { one: 'ISS-omløb', other: 'ISS-omløb', of: 'et ISS-omløb' }
	},
	{
		id: 'marathon-record',
		name: 'Marathon world record',
		quantity: 'time',
		value: 2 * 3600 + 35,
		region: 'intl',
		source:
			'https://www.kenyans.co.ke/news/97287-world-athletics-ratifies-kelvin-kiptums-20035-chicago-world-record',
		sourceNote: 'Kelvin Kiptum, 2:00:35, Chicago 2023, ratified by World Athletics',
		year: 2023,
		approx: false,
		nameEn: {
			one: 'marathon world record run',
			other: 'marathon world record runs',
			of: 'the marathon world record'
		},
		nameDa: {
			one: 'maratonrekordløb',
			other: 'maratonrekordløb',
			of: 'verdensrekorden i maraton'
		}
	},
	{
		id: 'dk-lifetime',
		name: 'Life expectancy at birth, Denmark',
		quantity: 'time',
		value: 82.1 * YEAR,
		region: 'dk',
		source: 'https://www.dst.dk/nyt/52702',
		sourceNote:
			'Statistics Denmark 2024/2025: men 80.3 years, women 83.9 years. 82.1 is the simple mean of the two',
		year: 2025,
		approx: true,
		nameEn: { one: 'Danish lifetime', other: 'Danish lifetimes', of: 'an average Danish lifetime' },
		nameDa: {
			one: 'dansk menneskeliv',
			other: 'danske menneskeliv',
			of: 'et gennemsnitligt dansk menneskeliv'
		}
	},
	{
		id: 'since-moon-landing',
		name: 'Time since the Moon landing',
		quantity: 'time',
		value: (REF_DATE - Date.parse(MOON_LANDING)) / 1000,
		since: MOON_LANDING,
		region: 'us',
		source: 'https://www.lroc.asu.edu/featured_sites/view_site/51',
		sourceNote: 'Counted live from Apollo 11 touchdown, 20 July 1969 20:17:40 UTC',
		approx: false,
		times: true,
		nameEn: {
			one: 'time since the Moon landing',
			other: 'times since the Moon landing',
			of: 'the time since the Moon landing'
		},
		nameDa: {
			one: 'tiden siden månelandingen',
			other: 'tiden siden månelandingen',
			of: 'tiden siden månelandingen'
		}
	},
	{
		id: 'carbon-14',
		name: 'Half-life of carbon-14',
		quantity: 'time',
		value: 5700 * YEAR,
		region: 'intl',
		source: 'https://en.wikipedia.org/wiki/Carbon-14',
		sourceNote: '5,700 ± 30 years. Radiocarbon dating conventionally still uses 5,568 years',
		approx: false,
		times: true,
		nameEn: {
			one: 'carbon-14 half-life',
			other: 'carbon-14 half-lives',
			of: 'the half-life of carbon-14'
		},
		nameDa: {
			one: 'halveringstid for kulstof-14',
			other: 'halveringstider for kulstof-14',
			of: 'halveringstiden for kulstof-14'
		}
	},
	{
		id: 'universe-age',
		name: 'Age of the universe',
		quantity: 'time',
		value: 13.787e9 * YEAR,
		region: 'intl',
		source: 'https://arxiv.org/abs/1807.06209',
		sourceNote: '13.787 ± 0.020 billion years (Planck 2018 results VI)',
		year: 2018,
		approx: false,
		times: true,
		nameEn: {
			one: 'age of the universe',
			other: 'ages of the universe',
			of: 'the age of the universe'
		},
		nameDa: { one: 'universets alder', other: 'universets alder', of: 'universets alder' }
	}
];
