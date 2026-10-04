import { refs as allRefs, type Names, type Quantity, type Ref, type Region } from './data';

export type { Quantity, Ref, Region, Names };
export type Lang = 'en' | 'da';
export type RegionFilter = 'all' | 'dk' | 'intl';

export const quantities: Quantity[] = [
	'length',
	'area',
	'volume',
	'mass',
	'speed',
	'energy',
	'data',
	'time'
];

export const quantityLabel: Record<Quantity, string> = {
	length: 'Length',
	area: 'Area',
	volume: 'Volume',
	mass: 'Mass',
	speed: 'Speed',
	energy: 'Energy',
	data: 'Data',
	time: 'Time'
};

// ------------------------------------------------------------------ units

export interface Unit {
	/** Canonical symbol, used in the picker and the hash. */
	sym: string;
	q: Quantity;
	/** Multiply by this to get the SI base unit. */
	f: number;
	/** Other spellings accepted when typed. */
	alias?: string[];
	/** Shown in the picker. */
	pick?: boolean;
}

const YEAR = 365.25 * 86400;

export const units: Unit[] = [
	// length
	{
		sym: 'mm',
		q: 'length',
		f: 1e-3,
		alias: ['millimetre', 'millimeter', 'millimetres', 'millimeters']
	},
	{
		sym: 'cm',
		q: 'length',
		f: 1e-2,
		pick: true,
		alias: ['centimetre', 'centimeter', 'centimetres', 'centimeters']
	},
	{ sym: 'm', q: 'length', f: 1, pick: true, alias: ['metre', 'meter', 'metres', 'meters'] },
	{
		sym: 'km',
		q: 'length',
		f: 1e3,
		pick: true,
		alias: ['kilometre', 'kilometer', 'kilometres', 'kilometers']
	},
	{ sym: 'in', q: 'length', f: 0.0254, alias: ['inch', 'inches', '"'] },
	{ sym: 'ft', q: 'length', f: 0.3048, pick: true, alias: ['foot', 'feet', "'"] },
	{ sym: 'yd', q: 'length', f: 0.9144, alias: ['yard', 'yards'] },
	{ sym: 'mi', q: 'length', f: 1609.344, pick: true, alias: ['mile', 'miles'] },
	{ sym: 'nmi', q: 'length', f: 1852, alias: ['nautical mile', 'nautical miles'] },
	{ sym: 'au', q: 'length', f: 149597870700, alias: ['astronomical unit', 'astronomical units'] },
	{
		sym: 'ly',
		q: 'length',
		f: 9460730472580800,
		alias: ['light-year', 'light-years', 'light year', 'light years']
	},
	// area
	{
		sym: 'm²',
		q: 'area',
		f: 1,
		pick: true,
		alias: [
			'm2',
			'm^2',
			'sqm',
			'sq m',
			'square metre',
			'square meter',
			'square metres',
			'square meters'
		]
	},
	{ sym: 'ha', q: 'area', f: 1e4, pick: true, alias: ['hectare', 'hectares'] },
	{
		sym: 'km²',
		q: 'area',
		f: 1e6,
		pick: true,
		alias: [
			'km2',
			'km^2',
			'sq km',
			'square kilometre',
			'square kilometer',
			'square kilometres',
			'square kilometers'
		]
	},
	{
		sym: 'ft²',
		q: 'area',
		f: 0.09290304,
		alias: ['ft2', 'ft^2', 'sq ft', 'square foot', 'square feet']
	},
	{ sym: 'acre', q: 'area', f: 4046.8564224, pick: true, alias: ['acres', 'ac'] },
	{
		sym: 'mi²',
		q: 'area',
		f: 2589988.110336,
		alias: ['mi2', 'mi^2', 'sq mi', 'square mile', 'square miles']
	},
	// volume
	{
		sym: 'mL',
		q: 'volume',
		f: 1e-6,
		alias: ['ml', 'millilitre', 'milliliter', 'millilitres', 'milliliters']
	},
	{
		sym: 'L',
		q: 'volume',
		f: 1e-3,
		pick: true,
		alias: ['l', 'litre', 'liter', 'litres', 'liters']
	},
	{
		sym: 'm³',
		q: 'volume',
		f: 1,
		pick: true,
		alias: ['m3', 'm^3', 'cubic metre', 'cubic meter', 'cubic metres', 'cubic meters']
	},
	{
		sym: 'gal',
		q: 'volume',
		f: 3.785411784e-3,
		pick: true,
		alias: ['gallon', 'gallons', 'us gal', 'gal (us)']
	},
	{
		sym: 'km³',
		q: 'volume',
		f: 1e9,
		alias: [
			'km3',
			'km^3',
			'cubic kilometre',
			'cubic kilometer',
			'cubic kilometres',
			'cubic kilometers'
		]
	},
	// mass
	{ sym: 'g', q: 'mass', f: 1e-3, alias: ['gram', 'grams', 'gramme', 'grammes'] },
	{ sym: 'kg', q: 'mass', f: 1, pick: true, alias: ['kilogram', 'kilograms', 'kilo', 'kilos'] },
	{
		sym: 't',
		q: 'mass',
		f: 1e3,
		pick: true,
		alias: ['tonne', 'tonnes', 'metric ton', 'metric tons']
	},
	{ sym: 'lb', q: 'mass', f: 0.45359237, pick: true, alias: ['lbs', 'pound', 'pounds'] },
	{ sym: 'oz', q: 'mass', f: 0.028349523125, alias: ['ounce', 'ounces'] },
	// speed
	{
		sym: 'm/s',
		q: 'speed',
		f: 1,
		pick: true,
		alias: ['mps', 'metres per second', 'meters per second']
	},
	{
		sym: 'km/h',
		q: 'speed',
		f: 1000 / 3600,
		pick: true,
		alias: ['kmh', 'kph', 'km/t', 'kilometres per hour', 'kilometers per hour']
	},
	{ sym: 'mph', q: 'speed', f: 0.44704, pick: true, alias: ['mi/h', 'miles per hour'] },
	{ sym: 'kn', q: 'speed', f: 1852 / 3600, pick: true, alias: ['knot', 'knots', 'kt', 'kts'] },
	// energy
	{ sym: 'J', q: 'energy', f: 1, pick: true, alias: ['joule', 'joules'] },
	{ sym: 'kJ', q: 'energy', f: 1e3, alias: ['kilojoule', 'kilojoules'] },
	{ sym: 'MJ', q: 'energy', f: 1e6, alias: ['megajoule', 'megajoules'] },
	{ sym: 'GJ', q: 'energy', f: 1e9, alias: ['gigajoule', 'gigajoules'] },
	{ sym: 'TJ', q: 'energy', f: 1e12, alias: ['terajoule', 'terajoules'] },
	{ sym: 'PJ', q: 'energy', f: 1e15, alias: ['petajoule', 'petajoules'] },
	{
		sym: 'Wh',
		q: 'energy',
		f: 3600,
		alias: ['watt-hour', 'watt-hours', 'watt hour', 'watt hours']
	},
	{
		sym: 'kWh',
		q: 'energy',
		f: 3.6e6,
		pick: true,
		alias: ['kilowatt-hour', 'kilowatt-hours', 'kilowatt hour', 'kilowatt hours']
	},
	{ sym: 'MWh', q: 'energy', f: 3.6e9, pick: true },
	{ sym: 'GWh', q: 'energy', f: 3.6e12, pick: true },
	{ sym: 'TWh', q: 'energy', f: 3.6e15 },
	{ sym: 'cal', q: 'energy', f: 4.184, pick: true, alias: ['calorie', 'calories'] },
	{ sym: 'kcal', q: 'energy', f: 4184, pick: true, alias: ['kilocalorie', 'kilocalories', 'Cal'] },
	{
		sym: 't TNT',
		q: 'energy',
		f: 4.184e9,
		pick: true,
		alias: [
			'ton TNT',
			'tonne TNT',
			'tons TNT',
			'tonnes TNT',
			'tTNT',
			't of TNT',
			'tonne of TNT',
			'ton of TNT',
			'tonnes of TNT',
			'tons of TNT'
		]
	},
	{
		sym: 'kt TNT',
		q: 'energy',
		f: 4.184e12,
		alias: ['kiloton', 'kilotons', 'kilotonne', 'kilotonnes', 'kt of TNT', 'ktTNT']
	},
	{
		sym: 'Mt TNT',
		q: 'energy',
		f: 4.184e15,
		alias: ['megaton', 'megatons', 'megatonne', 'megatonnes', 'Mt of TNT', 'MtTNT']
	},
	// data (case matters: B is bytes)
	{ sym: 'B', q: 'data', f: 1, pick: true, alias: ['byte', 'bytes'] },
	{ sym: 'kB', q: 'data', f: 1e3, pick: true, alias: ['KB'] },
	{ sym: 'MB', q: 'data', f: 1e6, pick: true },
	{ sym: 'GB', q: 'data', f: 1e9, pick: true },
	{ sym: 'TB', q: 'data', f: 1e12, pick: true },
	{ sym: 'PB', q: 'data', f: 1e15 },
	{ sym: 'KiB', q: 'data', f: 1024, pick: true, alias: ['kiB'] },
	{ sym: 'MiB', q: 'data', f: 1024 ** 2, pick: true },
	{ sym: 'GiB', q: 'data', f: 1024 ** 3, pick: true },
	{ sym: 'TiB', q: 'data', f: 1024 ** 4, pick: true },
	{ sym: 'PiB', q: 'data', f: 1024 ** 5 },
	// time
	{ sym: 's', q: 'time', f: 1, pick: true, alias: ['sec', 'secs', 'second', 'seconds'] },
	{ sym: 'min', q: 'time', f: 60, pick: true, alias: ['mins', 'minute', 'minutes'] },
	{ sym: 'h', q: 'time', f: 3600, pick: true, alias: ['hr', 'hrs', 'hour', 'hours'] },
	{ sym: 'day', q: 'time', f: 86400, pick: true, alias: ['d', 'days'] },
	{ sym: 'week', q: 'time', f: 7 * 86400, alias: ['wk', 'weeks'] },
	{ sym: 'year', q: 'time', f: YEAR, pick: true, alias: ['y', 'yr', 'yrs', 'years'] }
];

const exact = new Map<string, Unit>();
const folded = new Map<string, Unit>();
for (const u of units) {
	for (const s of [u.sym, ...(u.alias ?? [])]) {
		exact.set(s, u);
		// Data units are case sensitive (b is bits). Everything else matches without case.
		const k = s.toLowerCase();
		if ((u.q !== 'data' || /[a-z]{4,}/.test(s)) && !folded.has(k)) folded.set(k, u);
	}
}

export function findUnit(sym: string): Unit | undefined {
	const s = sym.trim().replace(/\s+/g, ' ');
	return exact.get(s) ?? folded.get(s.toLowerCase());
}

export function unitsFor(q: Quantity): Unit[] {
	return units.filter((u) => u.q === q);
}

export interface Parsed {
	value: number;
	unit: Unit;
	si: number;
	/** True when the unit came from the text rather than the fallback. */
	typed: boolean;
}

function parseNumber(raw: string): number {
	let s = raw.replace(/[\s_]/g, '');
	if (s.includes('.') && s.includes(',')) {
		s = s.replace(/,/g, '');
	} else if (s.includes(',')) {
		// 1,000 or 12,000,000 is grouping. 3,5 is a decimal comma.
		s = /^[+-]?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
	}
	const n = Number(s);
	if (!Number.isFinite(n)) throw new Error(`Cannot read "${raw}" as a number.`);
	return n;
}

/**
 * Reads "3.5 km", "1,474,560 B", "3,5 km", "2e6 kWh" or a bare number with a fallback unit.
 */
export function parseInput(input: string, fallback?: string): Parsed {
	const text = input.trim();
	if (!text) throw new Error('Enter an amount, for example 3.5 km.');
	const m = /^([+-]?(?:\d[\d ,_]*\d|\d)?(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*(.*)$/.exec(text);
	if (!m || !m[1] || !/\d/.test(m[1])) throw new Error('Start with a number, for example 3.5 km.');
	const value = parseNumber(m[1]);
	if (value <= 0) throw new Error('Enter an amount above zero.');
	const sym = m[2].trim();
	let unit: Unit | undefined;
	let typed = false;
	if (sym) {
		unit = findUnit(sym);
		if (!unit) {
			if (/^[kmgtpKMGTP]i?b$/.test(sym) || sym === 'b' || /bits?$/i.test(sym))
				throw new Error('Lowercase b means bits. Use B for bytes, for example 5 MB.');
			throw new Error(`Unknown unit "${sym}".`);
		}
		typed = true;
	} else {
		unit = fallback ? findUnit(fallback) : undefined;
		if (!unit) throw new Error('Add a unit, for example 3.5 km.');
	}
	return { value, unit, si: value * unit.f, typed };
}

// ------------------------------------------------------------------ references

/** Value of a reference at time `now` (ms). Only `since` entries depend on it. */
export function refValue(ref: Ref, now: number): number {
	if (ref.since) return (now - Date.parse(ref.since)) / 1000;
	return ref.value;
}

export function regionMatch(ref: Ref, filter: RegionFilter): boolean {
	if (filter === 'all') return true;
	if (filter === 'dk') return ref.region === 'dk';
	return ref.region !== 'dk';
}

export function refsFor(q: Quantity, filter: RegionFilter = 'all', list: Ref[] = allRefs): Ref[] {
	return list.filter((r) => r.quantity === q && regionMatch(r, filter));
}

export function findRef(id: string, list: Ref[] = allRefs): Ref | undefined {
	return list.find((r) => r.id === id);
}

export interface Row {
	ref: Ref;
	ratio: number;
	readable: boolean;
}

export const READABLE_MIN = 0.5;
export const READABLE_MAX = 10000;

export function isReadable(ratio: number): boolean {
	return ratio >= READABLE_MIN && ratio <= READABLE_MAX;
}

/** Lower is better. Readable ratios score by distance from about 3, the rest by distance from the band. */
export function score(ratio: number): number {
	if (isReadable(ratio)) return Math.abs(Math.log10(ratio) - Math.log10(3));
	const out =
		ratio < READABLE_MIN ? Math.log10(READABLE_MIN / ratio) : Math.log10(ratio / READABLE_MAX);
	return 100 + out;
}

/** All comparisons for an SI value, best first. */
export function compare(si: number, list: Ref[], now: number): Row[] {
	return list
		.map((ref) => {
			const ratio = si / refValue(ref, now);
			return { ref, ratio, readable: isReadable(ratio) };
		})
		.sort((a, b) => score(a.ratio) - score(b.ratio));
}

export function reverse(amount: number, ref: Ref, now: number): number {
	return amount * refValue(ref, now);
}

// ------------------------------------------------------------------ numbers

const SCALE_EN = [
	[1e15, 'quadrillion', 'quadrillion'],
	[1e12, 'trillion', 'trillion'],
	[1e9, 'billion', 'billion'],
	[1e6, 'million', 'million']
] as const;
const SCALE_DA = [
	[1e15, 'billiard', 'billiarder'],
	[1e12, 'billion', 'billioner'],
	[1e9, 'milliard', 'milliarder'],
	[1e6, 'million', 'millioner']
] as const;

function nf(lang: Lang, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
	return new Intl.NumberFormat(lang === 'da' ? 'da-DK' : 'en-US', opts);
}

/**
 * Newspaper style: 0.0042, 0.25, 3.2, 14.3, 12,000, 4.6 million. Danish uses
 * decimal comma, dot grouping and Danish scale words (1 billion = 10^12).
 */
export function fmtNum(n: number, lang: Lang = 'en'): string {
	const a = Math.abs(n);
	if (a >= 1e18) {
		const e = Math.floor(Math.log10(a));
		const m = n / 10 ** e;
		return `${nf(lang, { maximumFractionDigits: 1 }).format(m)} × 10^${e}`;
	}
	if (a >= 1e6) {
		const scales = lang === 'da' ? SCALE_DA : SCALE_EN;
		for (const [f, one, other] of scales) {
			if (a >= f) {
				let m = n / f;
				const digits = m >= 100 ? 0 : 1;
				m = Number(m.toFixed(digits));
				// 999.6 million rounds to 1000 million: print it as 1 billion instead.
				if (Math.abs(m) >= 1000 && f < 1e15) return fmtNum(Math.sign(n) * 1000 * f, lang);
				const word = m === 1 ? one : other;
				return `${nf(lang, { maximumFractionDigits: digits }).format(m)} ${word}`;
			}
		}
	}
	if (a >= 100) return nf(lang, { maximumFractionDigits: 0 }).format(n);
	if (a >= 1) return nf(lang, { maximumFractionDigits: 1 }).format(n);
	return nf(lang, { maximumSignificantDigits: 2 }).format(n);
}

/** True when fmtNum would print exactly one. */
export function isOne(n: number, lang: Lang = 'en'): boolean {
	return fmtNum(n, lang) === '1';
}

// ------------------------------------------------------------------ phrases

export type PhraseMode = 'count' | 'times' | 'frac';

export interface Phrase {
	mode: PhraseMode;
	/** Formatted number, or "1/12,000" for tiny fractions. */
	n: string;
	/** Noun for count mode, already singular or plural. */
	noun: string;
	/** Noun phrase with article. */
	of: string;
}

const COUNT_FROM = 0.995;
const TINY = 0.001;

export function names(ref: Ref, lang: Lang): Names {
	return lang === 'da' ? ref.nameDa : ref.nameEn;
}

export function phrase(ratio: number, ref: Ref, lang: Lang): Phrase {
	const nm = names(ref, lang);
	const timesOnly = ref.quantity === 'speed';
	if (ratio >= COUNT_FROM || (timesOnly && ratio >= TINY)) {
		const n = fmtNum(ratio, lang);
		if (timesOnly || ref.times) return { mode: 'times', n, noun: nm.other, of: nm.of };
		return { mode: 'count', n, noun: n === '1' ? nm.one : nm.other, of: nm.of };
	}
	const n = ratio < TINY ? `1/${fmtNum(1 / ratio, lang)}` : fmtNum(ratio, lang);
	return { mode: 'frac', n, noun: nm.one, of: nm.of };
}

/** Short English text for the list, e.g. "3.2 football pitches", "0.0042 of the way to the Moon". */
export function rowText(ratio: number, ref: Ref): string {
	const p = phrase(ratio, ref, 'en');
	if (ref.quantity === 'speed') {
		return p.mode === 'frac' ? `${p.n} of the speed of ${p.of}` : `${p.n} × the speed of ${p.of}`;
	}
	if (p.mode === 'count') return `${p.n} ${p.noun}`;
	if (p.mode === 'times') return `${p.n} × ${p.of}`;
	return `${p.n} of ${p.of}`;
}

type Templates = Record<PhraseMode, (p: Phrase) => string>;

const EN: Record<Quantity, Templates> = {
	length: {
		count: (p) => `That is as long as ${p.n} ${p.noun}.`,
		times: (p) => `That is ${p.n} times ${p.of}.`,
		frac: (p) => `That is ${p.n} of ${p.of}.`
	},
	area: {
		count: (p) => `That is the area of ${p.n} ${p.noun}.`,
		times: (p) => `That is ${p.n} times the size of ${p.of}.`,
		frac: (p) => `That is ${p.n} of the area of ${p.of}.`
	},
	volume: {
		count: (p) => `That would fill ${p.n} ${p.noun}.`,
		times: (p) => `That is ${p.n} times the volume of ${p.of}.`,
		frac: (p) => `That would fill ${p.n} of ${p.of}.`
	},
	mass: {
		count: (p) => `That weighs as much as ${p.n} ${p.noun}.`,
		times: (p) => `That weighs ${p.n} times as much as ${p.of}.`,
		frac: (p) => `That is ${p.n} of the weight of ${p.of}.`
	},
	speed: {
		count: (p) => `That is ${p.n} times the speed of ${p.of}.`,
		times: (p) => `That is ${p.n} times the speed of ${p.of}.`,
		frac: (p) => `That is ${p.n} of the speed of ${p.of}.`
	},
	energy: {
		count: (p) => `That is as much energy as ${p.n} ${p.noun}.`,
		times: (p) => `That is ${p.n} times the energy of ${p.of}.`,
		frac: (p) => `That is ${p.n} of the energy of ${p.of}.`
	},
	data: {
		count: (p) => `That would fill ${p.n} ${p.noun}.`,
		times: (p) => `That is ${p.n} times ${p.of}.`,
		frac: (p) => `That would fill ${p.n} of ${p.of}.`
	},
	time: {
		count: (p) => `That lasts as long as ${p.n} ${p.noun}.`,
		times: (p) => `That is ${p.n} times ${p.of}.`,
		frac: (p) => `That is ${p.n} of ${p.of}.`
	}
};

const DA: Record<Quantity, Templates> = {
	length: {
		count: (p) => `Det er lige så langt som ${p.n} ${p.noun}.`,
		times: (p) => `Det er ${p.n} gange ${p.of}.`,
		frac: (p) => `Det er ${p.n} af ${p.of}.`
	},
	area: {
		count: (p) => `Det svarer til arealet af ${p.n} ${p.noun}.`,
		times: (p) => `Det er ${p.n} gange så stort som ${p.of}.`,
		frac: (p) => `Det er ${p.n} af arealet af ${p.of}.`
	},
	volume: {
		count: (p) => `Det kan fylde ${p.n} ${p.noun}.`,
		times: (p) => `Det er ${p.n} gange rumfanget af ${p.of}.`,
		frac: (p) => `Det kan fylde ${p.n} af ${p.of}.`
	},
	mass: {
		count: (p) => `Det vejer lige så meget som ${p.n} ${p.noun}.`,
		times: (p) => `Det vejer ${p.n} gange så meget som ${p.of}.`,
		frac: (p) => `Det er ${p.n} af vægten af ${p.of}.`
	},
	speed: {
		count: (p) => `Det er ${p.n} gange så hurtigt som ${p.of}.`,
		times: (p) => `Det er ${p.n} gange så hurtigt som ${p.of}.`,
		frac: (p) => `Det er ${p.n} af hastigheden for ${p.of}.`
	},
	energy: {
		count: (p) => `Det er lige så meget energi som ${p.n} ${p.noun}.`,
		times: (p) => `Det er ${p.n} gange energien i ${p.of}.`,
		frac: (p) => `Det er ${p.n} af energien i ${p.of}.`
	},
	data: {
		count: (p) => `Det kan fylde ${p.n} ${p.noun}.`,
		times: (p) => `Det er ${p.n} gange ${p.of}.`,
		frac: (p) => `Det kan fylde ${p.n} af ${p.of}.`
	},
	time: {
		count: (p) => `Det varer lige så længe som ${p.n} ${p.noun}.`,
		times: (p) => `Det er ${p.n} gange ${p.of}.`,
		frac: (p) => `Det er ${p.n} af ${p.of}.`
	}
};

/** One plain sentence for a comparison. */
export function headline(ratio: number, ref: Ref, lang: Lang): string {
	const p = phrase(ratio, ref, lang);
	return (lang === 'da' ? DA : EN)[ref.quantity][p.mode](p);
}

/** Headlines for the best `count` rows. */
export function headlines(rows: Row[], lang: Lang, count = 3): string[] {
	return rows.slice(0, count).map((r) => headline(r.ratio, r.ref, lang));
}

// ------------------------------------------------------------------ stacking

/** How many whole items are needed to hold `si` of the item's quantity. */
export function stackCount(si: number, item: Ref, now: number): number {
	const v = refValue(item, now);
	// Guard against float noise: 2.0000000001 items is 2.
	return Math.max(1, Math.ceil(si / v - 1e-9));
}

export function stackHeight(count: number, thickness: number): number {
	return count * thickness;
}

export interface Stack {
	count: number;
	height: number;
	rows: Row[];
}

export function stack(si: number, item: Ref, lengths: Ref[], now: number): Stack {
	if (!item.thickness) throw new Error(`${item.name} has no thickness to stack.`);
	const count = stackCount(si, item, now);
	const height = stackHeight(count, item.thickness);
	return { count, height, rows: compare(height, lengths, now) };
}

/** "N floppy disks stacked reach X Round Towers high." */
export function stackSentence(s: Stack, item: Ref, lang: Lang): string {
	const top = s.rows[0];
	const nm = names(item, lang);
	const count = fmtNum(s.count, lang);
	const things = count === '1' ? nm.one : nm.other;
	if (!top) {
		return lang === 'da' ? `Det kræver ${count} ${things}.` : `That takes ${count} ${things}.`;
	}
	const p = phrase(top.ratio, top.ref, lang);
	let reach: string;
	if (p.mode === 'count') reach = `${p.n} ${p.noun}`;
	else if (p.mode === 'times')
		reach = lang === 'da' ? `${p.n} gange ${p.of}` : `${p.n} times ${p.of}`;
	else reach = lang === 'da' ? `${p.n} af ${p.of}` : `${p.n} of ${p.of}`;
	return lang === 'da'
		? `Det kræver ${count} ${things}. Stablet når de lige så højt som ${reach}.`
		: `That takes ${count} ${things}. Stacked, they reach as high as ${reach}.`;
}

// ------------------------------------------------------------------ display

interface Display {
	sym: string;
	f: number;
	/** Use from this SI value upwards. */
	from: number;
}

const display: Record<Quantity, Display[]> = {
	length: [
		{ sym: 'mm', f: 1e-3, from: 0 },
		{ sym: 'm', f: 1, from: 1 },
		{ sym: 'km', f: 1e3, from: 1e3 },
		{ sym: 'au', f: 149597870700, from: 1.5e10 },
		{ sym: 'ly', f: 9460730472580800, from: 9.46e14 }
	],
	area: [
		{ sym: 'm²', f: 1, from: 0 },
		{ sym: 'ha', f: 1e4, from: 1e4 },
		{ sym: 'km²', f: 1e6, from: 1e6 }
	],
	volume: [
		{ sym: 'mL', f: 1e-6, from: 0 },
		{ sym: 'L', f: 1e-3, from: 1e-3 },
		{ sym: 'm³', f: 1, from: 1 },
		{ sym: 'km³', f: 1e9, from: 1e9 }
	],
	mass: [
		{ sym: 'g', f: 1e-3, from: 0 },
		{ sym: 'kg', f: 1, from: 1 },
		{ sym: 't', f: 1e3, from: 1e3 }
	],
	speed: [
		{ sym: 'km/h', f: 1000 / 3600, from: 0 },
		{ sym: 'km/s', f: 1e3, from: 1e4 }
	],
	energy: [
		{ sym: 'J', f: 1, from: 0 },
		{ sym: 'kJ', f: 1e3, from: 1e3 },
		{ sym: 'MJ', f: 1e6, from: 1e6 },
		{ sym: 'GJ', f: 1e9, from: 1e9 },
		{ sym: 'TJ', f: 1e12, from: 1e12 },
		{ sym: 'PJ', f: 1e15, from: 1e15 }
	],
	data: [
		{ sym: 'B', f: 1, from: 0 },
		{ sym: 'kB', f: 1e3, from: 1e3 },
		{ sym: 'MB', f: 1e6, from: 1e6 },
		{ sym: 'GB', f: 1e9, from: 1e9 },
		{ sym: 'TB', f: 1e12, from: 1e12 },
		{ sym: 'PB', f: 1e15, from: 1e15 }
	],
	time: [
		{ sym: 's', f: 1, from: 0 },
		{ sym: 'min', f: 60, from: 60 },
		{ sym: 'h', f: 3600, from: 3600 },
		{ sym: 'days', f: 86400, from: 86400 },
		{ sym: 'years', f: YEAR, from: YEAR }
	]
};

/** Plain number for unit readouts: up to 4 significant digits, grouped. */
export function fmtPlain(n: number): string {
	const a = Math.abs(n);
	if (a !== 0 && (a >= 1e15 || a < 1e-4)) return n.toPrecision(4).replace('e+', 'e');
	if (a >= 1000) return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
	return new Intl.NumberFormat('en-US', { maximumSignificantDigits: 4 }).format(n);
}

/** SI value in the most readable unit of its quantity, e.g. "3,500 m" or "4.2 km". */
export function formatSI(si: number, q: Quantity): string {
	const list = display[q];
	let d = list[0];
	for (const x of list) if (si >= x.from) d = x;
	return `${fmtPlain(si / d.f)} ${d.sym}`;
}

/** The value in every picker unit of its quantity. */
export function conversions(si: number, q: Quantity): { sym: string; value: number }[] {
	return unitsFor(q)
		.filter((u) => u.pick)
		.map((u) => ({ sym: u.sym, value: si / u.f }));
}
