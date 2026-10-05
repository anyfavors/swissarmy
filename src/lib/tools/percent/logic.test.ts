import { describe, expect, it } from 'vitest';
import {
	addVat,
	beforeChange,
	change,
	clean,
	fmt,
	parseNumber,
	percentOf,
	plain,
	removeVat,
	resize,
	simplify,
	vatShareOfGross,
	whatPercent,
	wholeFromPart
} from './logic';

describe('parseNumber', () => {
	it('reads points and commas', () => {
		expect(parseNumber('12.5')).toBe(12.5);
		expect(parseNumber('12,5')).toBe(12.5);
		expect(parseNumber('0,125')).toBe(0.125);
		expect(parseNumber('1.234,56')).toBe(1234.56);
		expect(parseNumber('1,234.56')).toBe(1234.56);
		expect(parseNumber('1,234')).toBe(1234);
		expect(parseNumber('1.234.567')).toBe(1234567);
		expect(parseNumber('1 234 567,8')).toBe(1234567.8);
		expect(parseNumber('−4,5 %')).toBe(-4.5);
		expect(parseNumber('25%')).toBe(25);
		expect(parseNumber('1e3')).toBe(1000);
	});

	it('uses strict Danish reading with the comma flag', () => {
		expect(parseNumber('1,234', true)).toBe(1.234);
		expect(parseNumber('1.234', true)).toBe(1234);
		expect(parseNumber('1.234,5', true)).toBe(1234.5);
		expect(() => parseNumber('1,2,3', true)).toThrow(/more than one decimal comma/);
	});

	it('rejects junk', () => {
		expect(() => parseNumber('')).toThrow(/Enter a number/);
		expect(() => parseNumber('abc')).toThrow(/not a number/);
		expect(() => parseNumber('1.2,3.4')).toThrow(/cannot be read/);
	});
});

describe('formatting', () => {
	it('cleans binary noise', () => {
		expect(clean(0.1 + 0.2)).toBe(0.3);
		expect(fmt(1234567.891)).toBe('1,234,567.891');
		expect(fmt(1234567.891, true)).toBe('1.234.567,891');
		expect(plain(1234.5, true)).toBe('1234,5');
		expect(fmt(1e-9)).toBe('1e-9');
	});
});

describe('percentages', () => {
	it('X % of Y and X is what % of Y', () => {
		expect(percentOf(15, 200)).toBe(30);
		expect(whatPercent(30, 200)).toBe(15);
		expect(() => whatPercent(1, 0)).toThrow(/zero/);
	});

	it('percent change and points', () => {
		expect(change(20, 25)).toEqual({ diff: 5, percent: 25, factor: 1.25 });
		expect(change(80, 60).percent).toBe(-25);
		expect(change(-10, -5).percent).toBe(50);
		expect(change(0, 5)).toEqual({ diff: 5, percent: null, factor: null });
	});

	it('reverse percentages', () => {
		expect(wholeFromPart(30, 15)).toBe(200);
		expect(clean(beforeChange(120, 20))).toBe(100);
		expect(clean(beforeChange(75, -25))).toBe(100);
		expect(() => beforeChange(0, -100)).toThrow();
		expect(() => wholeFromPart(1, 0)).toThrow();
	});
});

describe('VAT (Danish moms 25 %)', () => {
	it('adds and removes', () => {
		expect(addVat(100, 25)).toEqual({ excl: 100, vat: 25, incl: 125 });
		expect(removeVat(125, 25)).toEqual({ excl: 100, vat: 25, incl: 125 });
		expect(clean(removeVat(99.95, 25).vat)).toBe(19.99);
		expect(vatShareOfGross(25)).toBe(20);
	});
});

describe('ratios', () => {
	it('simplifies', () => {
		const r = simplify(1920, 1080);
		expect([r.a, r.b]).toEqual([16n, 9n]);
		expect(r.near).toEqual({ name: '16:9', exact: true });
		expect([simplify(1.5, 1).a, simplify(1.5, 1).b]).toEqual([3n, 2n]);
		const w = simplify(2560, 1080);
		expect([w.a, w.b]).toEqual([64n, 27n]);
		expect(w.near?.exact).toBe(false);
		expect(simplify(1366, 768).near).toEqual({ name: '16:9', exact: false });
		expect(simplify(7, 3).near).toEqual({ name: '21:9', exact: true });
		expect(simplify(7, 5).near).toBe(null);
		expect(() => simplify(0, 1)).toThrow(/above zero/);
	});

	it('resizes keeping the ratio', () => {
		expect(resize(16, 9, 1280)).toBe(720);
		expect(resize(16, 9, 1080, true)).toBe(1920);
		expect(resize(1920, 1080, 800)).toBe(450);
	});
});
