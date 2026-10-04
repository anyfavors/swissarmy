import { describe, expect, it } from 'vitest';
import { refs } from './data';
import {
	compare,
	conversions,
	findRef,
	findUnit,
	fmtNum,
	formatSI,
	headline,
	headlines,
	isReadable,
	parseInput,
	phrase,
	quantities,
	refValue,
	refsFor,
	regionMatch,
	reverse,
	rowText,
	stack,
	stackCount,
	stackHeight,
	stackSentence,
	units,
	type Quantity,
	type Ref
} from './logic';

const NOW = Date.UTC(2026, 9, 4, 12);
const ref = (id: string): Ref => {
	const r = findRef(id);
	if (!r) throw new Error(`missing ${id}`);
	return r;
};
const si = (s: string, fb?: string) => parseInput(s, fb).si;

describe('journalistic: unit parsing', () => {
	it('reads length units', () => {
		expect(si('3.5 km')).toBe(3500);
		expect(si('1 mi')).toBeCloseTo(1609.344, 9);
		expect(si('10 ft')).toBeCloseTo(3.048, 9);
		expect(si('250 cm')).toBe(2.5);
		expect(si('2 miles')).toBeCloseTo(3218.688, 9);
		expect(si('1 ly')).toBe(9460730472580800);
		expect(parseInput('3 KM').unit.sym).toBe('km');
	});

	it('reads area units', () => {
		expect(si('2 km²')).toBe(2e6);
		expect(si('2 km2')).toBe(2e6);
		expect(si('3 ha')).toBe(30000);
		expect(si('1 acre')).toBeCloseTo(4046.8564224, 9);
		expect(si('100 m2')).toBe(100);
	});

	it('reads volume units', () => {
		expect(si('150 L')).toBeCloseTo(0.15, 12);
		expect(si('150 l')).toBeCloseTo(0.15, 12);
		expect(si('1 gal')).toBeCloseTo(3.785411784e-3, 15);
		expect(si('5 m³')).toBe(5);
		expect(si('48 km3')).toBe(48e9);
	});

	it('reads mass units', () => {
		expect(si('6 t')).toBe(6000);
		expect(si('1 lb')).toBeCloseTo(0.45359237, 12);
		expect(si('75 kg')).toBe(75);
		expect(si('9.3 g')).toBeCloseTo(0.0093, 12);
	});

	it('reads speed units', () => {
		expect(si('36 km/h')).toBeCloseTo(10, 12);
		expect(si('1 mph')).toBeCloseTo(0.44704, 12);
		expect(si('1 knot')).toBeCloseTo(1852 / 3600, 12);
		expect(si('10 kn')).toBeCloseTo(18520 / 3600, 12);
		expect(si('3 m/s')).toBe(3);
	});

	it('reads energy units', () => {
		expect(si('1 kWh')).toBe(3.6e6);
		expect(si('1 t TNT')).toBe(4.184e9);
		expect(si('1 tonne of TNT')).toBe(4.184e9);
		expect(si('15 kt TNT')).toBeCloseTo(6.276e13, 0);
		expect(si('1 kcal')).toBe(4184);
		expect(si('1 cal')).toBe(4.184);
		expect(si('2 GWh')).toBe(7.2e12);
		expect(si('5 MJ')).toBe(5e6);
	});

	it('reads data units, case sensitive', () => {
		expect(si('1.44 MB')).toBe(1.44e6);
		expect(si('1 KiB')).toBe(1024);
		expect(si('1 GiB')).toBe(1024 ** 3);
		expect(si('4.7 GB')).toBe(4.7e9);
		expect(si('1 TB')).toBe(1e12);
		expect(si('1 kB')).toBe(1000);
		expect(si('1 KB')).toBe(1000);
		expect(si('1474560 bytes')).toBe(1474560);
		expect(() => parseInput('5 Mb')).toThrow(/bits/);
		expect(() => parseInput('5 kb')).toThrow(/bits/);
	});

	it('reads time units', () => {
		expect(si('90 min')).toBe(5400);
		expect(si('2 h')).toBe(7200);
		expect(si('1 day')).toBe(86400);
		expect(si('1 year')).toBe(365.25 * 86400);
		expect(si('30 s')).toBe(30);
	});

	it('reads number formats', () => {
		expect(si('1,474,560 B')).toBe(1474560);
		expect(si('3,5 km')).toBe(3500);
		expect(si('12 000 m')).toBe(12000);
		expect(si('2e3 m')).toBe(2000);
		expect(si('.5 km')).toBe(500);
		expect(si('3.5km')).toBe(3500);
	});

	it('uses the fallback unit for a bare number', () => {
		const p = parseInput('42', 'kg');
		expect(p.si).toBe(42);
		expect(p.typed).toBe(false);
		expect(parseInput('42 m', 'kg').unit.q).toBe('length');
		expect(parseInput('42 m', 'kg').typed).toBe(true);
	});

	it('rejects bad input with clear messages', () => {
		expect(() => parseInput('')).toThrow(/Enter an amount/);
		expect(() => parseInput('km')).toThrow(/Start with a number/);
		expect(() => parseInput('0 km')).toThrow(/above zero/);
		expect(() => parseInput('-3 km')).toThrow(/above zero/);
		expect(() => parseInput('3 parsecs')).toThrow(/Unknown unit "parsecs"/);
		expect(() => parseInput('3')).toThrow(/Add a unit/);
	});

	it('has unique unit spellings per quantity', () => {
		for (const u of units) expect(findUnit(u.sym)).toBe(u);
	});
});

describe('journalistic: conversions', () => {
	it('converts back out of SI', () => {
		const c = conversions(1609.344, 'length');
		expect(c.find((x) => x.sym === 'mi')?.value).toBeCloseTo(1, 12);
		expect(c.find((x) => x.sym === 'km')?.value).toBeCloseTo(1.609344, 12);
	});

	it('formats SI values in a readable unit', () => {
		expect(formatSI(3500, 'length')).toBe('3.5 km');
		expect(formatSI(0.5, 'length')).toBe('500 mm');
		expect(formatSI(7140, 'area')).toBe('7,140 m²');
		expect(formatSI(42956e6, 'area')).toBe('42,956 km²');
		expect(formatSI(1474560, 'data')).toBe('1.475 MB');
		expect(formatSI(5400, 'time')).toBe('1.5 h');
		expect(formatSI(10, 'speed')).toBe('36 km/h');
	});

	it('reverse mode multiplies the reference', () => {
		expect(reverse(100, ref('football-pitch-length'), NOW)).toBe(10500);
		expect(formatSI(reverse(100, ref('football-pitch-length'), NOW), 'length')).toBe('10.5 km');
		expect(reverse(2, ref('tonne-tnt'), NOW)).toBe(8.368e9);
	});

	it('computes time since the Moon landing live', () => {
		const r = ref('since-moon-landing');
		const at = Date.UTC(1969, 6, 21, 20, 17, 40);
		expect(refValue(r, at)).toBe(86400);
		expect(refValue(r, NOW)).toBeGreaterThan(57 * 365 * 86400);
	});
});

describe('journalistic: ranking', () => {
	it('puts readable ratios first', () => {
		const rows = compare(3500, refsFor('length'), NOW);
		const firstUnreadable = rows.findIndex((r) => !r.readable);
		expect(rows.slice(0, firstUnreadable).every((r) => r.readable)).toBe(true);
		expect(rows.slice(firstUnreadable).every((r) => !r.readable)).toBe(true);
		expect(isReadable(0.5)).toBe(true);
		expect(isReadable(10000)).toBe(true);
		expect(isReadable(0.49)).toBe(false);
		expect(isReadable(10001)).toBe(false);
	});

	it('prefers ratios near a handful', () => {
		const rows = compare(105 * 3, refsFor('length'), NOW);
		expect(rows[0].ref.id).toBe('football-pitch-length');
		expect(rows[0].ratio).toBeCloseTo(3, 12);
	});

	it('sorts unreadable ratios by distance from the band', () => {
		const rows = compare(1, refsFor('length'), NOW);
		const tail = rows.filter((r) => !r.readable);
		// The light-year is the most remote comparison for one metre.
		expect(tail[tail.length - 1].ref.id).toBe('light-year');
	});

	it('filters by region', () => {
		const dk = refsFor('length', 'dk');
		const intl = refsFor('length', 'intl');
		expect(dk.every((r) => r.region === 'dk')).toBe(true);
		expect(intl.some((r) => r.region === 'uk')).toBe(true);
		expect(intl.some((r) => r.region === 'us')).toBe(true);
		expect(intl.every((r) => r.region !== 'dk')).toBe(true);
		expect(dk.length + intl.length).toBe(refsFor('length', 'all').length);
		expect(regionMatch(ref('titanic'), 'intl')).toBe(true);
	});
});

describe('journalistic: number formatting', () => {
	it('formats like a newspaper', () => {
		expect(fmtNum(3.24)).toBe('3.2');
		expect(fmtNum(14.29)).toBe('14.3');
		expect(fmtNum(12000.4)).toBe('12,000');
		expect(fmtNum(0.25)).toBe('0.25');
		expect(fmtNum(0.004213)).toBe('0.0042');
		expect(fmtNum(4.6e6)).toBe('4.6 million');
		expect(fmtNum(1e6)).toBe('1 million');
		expect(fmtNum(2.5e9)).toBe('2.5 billion');
		expect(fmtNum(999.96e6)).toBe('1 billion');
		expect(fmtNum(3e18)).toBe('3 × 10^18');
	});

	it('formats Danish numbers', () => {
		expect(fmtNum(3.24, 'da')).toBe('3,2');
		expect(fmtNum(12000, 'da')).toBe('12.000');
		expect(fmtNum(4.6e6, 'da')).toBe('4,6 millioner');
		expect(fmtNum(1e6, 'da')).toBe('1 million');
		expect(fmtNum(2e9, 'da')).toBe('2 milliarder');
		expect(fmtNum(2e12, 'da')).toBe('2 billioner');
	});
});

describe('journalistic: phrases and pluralisation', () => {
	const pitch = ref('football-pitch-length');
	const moon = ref('moon-distance');

	it('pluralises English counts', () => {
		expect(rowText(3.2, pitch)).toBe('3.2 football pitches');
		expect(rowText(1, pitch)).toBe('1 football pitch');
		expect(rowText(1.02, pitch)).toBe('1 football pitch');
		expect(rowText(1.06, pitch)).toBe('1.1 football pitches');
		expect(rowText(2, ref('light-year'))).toBe('2 light-years');
	});

	it('uses fractions below one and "1/N" for tiny ratios', () => {
		expect(rowText(0.004, moon)).toBe('0.004 of the way to the Moon');
		expect(rowText(0.25, pitch)).toBe('0.25 of a football pitch');
		expect(rowText(1 / 12000, pitch)).toBe('1/12,000 of a football pitch');
	});

	it('uses "times" for uncountable references', () => {
		expect(rowText(3, ref('everest'))).toBe('3 × the height of Mount Everest');
		expect(rowText(0.5, ref('everest'))).toBe('0.5 of the height of Mount Everest');
		expect(phrase(0.5, ref('cheetah'), 'en').mode).toBe('times');
		expect(rowText(3.2, ref('cheetah'))).toBe('3.2 × the speed of a cheetah at full sprint');
		expect(rowText(1 / 3.6e6, ref('light'))).toBe('1/3.6 million of the speed of light');
		expect(headline(1 / 3.6e6, ref('light'), 'da')).toBe(
			'Det er 1/3,6 millioner af hastigheden for lyset.'
		);
	});

	it('pluralises Danish counts', () => {
		expect(headline(3.2, pitch, 'da')).toBe('Det er lige så langt som 3,2 fodboldbaner.');
		expect(headline(1, pitch, 'da')).toBe('Det er lige så langt som 1 fodboldbane.');
		expect(headline(4.6, ref('rundetaarn'), 'da')).toBe('Det er lige så langt som 4,6 Rundetårne.');
		expect(headline(14, ref('elephant'), 'da')).toBe('Det vejer lige så meget som 14 elefanter.');
		expect(headline(1, ref('elephant'), 'da')).toBe('Det vejer lige så meget som 1 elefant.');
		expect(headline(3, ref('olympic-pool-volume'), 'da')).toBe(
			'Det kan fylde 3 olympiske bassiner.'
		);
		expect(headline(2, ref('bathtub'), 'da')).toBe('Det kan fylde 2 badekar.');
		expect(headline(2, ref('dairy-cow'), 'da')).toBe('Det vejer lige så meget som 2 malkekøer.');
		expect(headline(0.004, moon, 'da')).toBe('Det er 0,004 af vejen til Månen.');
		expect(headline(4.6e6, ref('floppy'), 'da')).toBe('Det kan fylde 4,6 millioner disketter.');
	});

	it('writes English headlines', () => {
		expect(headline(3.2, pitch, 'en')).toBe('That is as long as 3.2 football pitches.');
		expect(headline(14, ref('elephant'), 'en')).toBe('That weighs as much as 14 elephants.');
		expect(headline(2, ref('wales'), 'en')).toBe('That is 2 times the size of Wales.');
		expect(headline(0.5, ref('wales'), 'en')).toBe('That is 0.5 of the area of Wales.');
		expect(headline(3, ref('cheetah'), 'en')).toBe(
			'That is 3 times the speed of a cheetah at full sprint.'
		);
		expect(headline(3, ref('cheetah'), 'da')).toBe(
			'Det er 3 gange så hurtigt som en gepard i fuld fart.'
		);
		expect(headline(2, ref('wales'), 'da')).toBe('Det er 2 gange så stort som Wales.');
	});

	it('produces one headline per top row', () => {
		const rows = compare(3500, refsFor('length'), NOW);
		const h = headlines(rows, 'en', 3);
		expect(h).toHaveLength(3);
		for (const s of h) expect(s).toMatch(/^That .+\.$/);
	});
});

describe('journalistic: stacking', () => {
	const floppy = ref('floppy');

	it('counts whole items', () => {
		expect(stackCount(1474560, floppy, NOW)).toBe(1);
		expect(stackCount(1474561, floppy, NOW)).toBe(2);
		expect(stackCount(1, floppy, NOW)).toBe(1);
		expect(stackCount(1474560 * 1000, floppy, NOW)).toBe(1000);
	});

	it('multiplies by thickness', () => {
		expect(stackHeight(1000, 0.0033)).toBeCloseTo(3.3, 12);
	});

	it('compares the stack with lengths', () => {
		// 1 GB on floppies: 679 disks, 2.24 m high.
		const s = stack(1e9, floppy, refsFor('length'), NOW);
		expect(s.count).toBe(679);
		expect(s.height).toBeCloseTo(2.2407, 4);
		expect(s.rows[0].readable).toBe(true);
		// 1 TB: 678,168 disks, 2,238 m, about 64 Round Towers.
		const t = stack(1e12, floppy, [ref('rundetaarn')], NOW);
		expect(t.count).toBe(678169);
		expect(t.rows[0].ratio).toBeCloseTo((678169 * 0.0033) / 34.8, 9);
		expect(stackSentence(t, floppy, 'en')).toBe(
			'That takes 678,169 floppy disks. Stacked, they reach as high as 64.3 Round Towers.'
		);
		expect(stackSentence(t, floppy, 'da')).toBe(
			'Det kræver 678.169 disketter. Stablet når de lige så højt som 64,3 Rundetårne.'
		);
	});

	it('refuses items without thickness', () => {
		expect(() => stack(1, ref('dvd'), [], NOW)).not.toThrow();
		expect(() => stack(1, ref('wikipedia'), [], NOW)).toThrow(/thickness/);
	});
});

describe('journalistic: data integrity', () => {
	it('has unique ids', () => {
		const ids = refs.map((r) => r.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('has an https source, a note, a positive value and a valid quantity on every entry', () => {
		for (const r of refs) {
			expect(r.source, r.id).toMatch(/^https:\/\/\S+$/);
			expect(r.sourceNote.length, r.id).toBeGreaterThan(5);
			expect(r.value, r.id).toBeGreaterThan(0);
			expect(Number.isFinite(r.value), r.id).toBe(true);
			expect(quantities, r.id).toContain(r.quantity);
			expect(['dk', 'intl', 'uk', 'us'], r.id).toContain(r.region);
		}
	});

	it('has English and Danish names on every entry', () => {
		for (const r of refs) {
			for (const n of [r.nameEn, r.nameDa]) {
				expect(n.one, r.id).toBeTruthy();
				expect(n.other, r.id).toBeTruthy();
				expect(n.of, r.id).toBeTruthy();
			}
		}
	});

	it('has enough references per quantity', () => {
		for (const q of quantities as Quantity[]) {
			expect(refsFor(q).length, q).toBeGreaterThanOrEqual(8);
		}
	});

	it('has plausible stacking thicknesses', () => {
		const stackable = refs.filter((r) => r.thickness);
		expect(stackable.length).toBeGreaterThan(0);
		for (const r of stackable) {
			expect(r.thickness!, r.id).toBeGreaterThan(0);
			expect(r.thickness!, r.id).toBeLessThan(0.05);
			expect(r.thicknessNote, r.id).toBeTruthy();
		}
	});

	it('keeps defined values exact', () => {
		expect(ref('au').value).toBe(149597870700);
		expect(ref('light-year').value).toBe(299792458 * 365.25 * 86400);
		expect(ref('tonne-tnt').value).toBe(4.184e9);
		expect(ref('light').value).toBe(299792458);
		expect(ref('floppy').value).toBe(80 * 2 * 18 * 512);
		expect(ref('cd-rom').value).toBe(360000 * 2048);
		expect(ref('football-match').value).toBe(5400);
		expect(ref('marathon').value).toBe(42195);
	});
});
