import { describe, expect, it } from 'vitest';
import { decompose, fromRoman, looksLikeRoman, parseInteger, toRoman } from './logic';
import { ops } from './ops';

describe('toRoman', () => {
	it('writes known values', () => {
		const cases: [number, string][] = [
			[1, 'I'],
			[4, 'IV'],
			[9, 'IX'],
			[14, 'XIV'],
			[40, 'XL'],
			[49, 'XLIX'],
			[90, 'XC'],
			[400, 'CD'],
			[444, 'CDXLIV'],
			[900, 'CM'],
			[1666, 'MDCLXVI'],
			[1984, 'MCMLXXXIV'],
			[1994, 'MCMXCIV'],
			[2026, 'MMXXVI'],
			[3888, 'MMMDCCCLXXXVIII'],
			[3999, 'MMMCMXCIX']
		];
		for (const [n, r] of cases) expect(toRoman(n)).toBe(r);
	});

	it('rejects out of range values', () => {
		expect(() => toRoman(0)).toThrow(/no zero/);
		expect(() => toRoman(-5)).toThrow(/no zero/);
		expect(() => toRoman(4000)).toThrow(/3999/);
		expect(() => toRoman(2.5)).toThrow(/whole/);
	});

	it('decomposes by place value', () => {
		expect(decompose(1994)).toEqual([
			{ value: 1000, numeral: 'M', subtractive: false, explain: '1000' },
			{ value: 900, numeral: 'CM', subtractive: true, explain: '1000 − 100' },
			{ value: 90, numeral: 'XC', subtractive: true, explain: '100 − 10' },
			{ value: 4, numeral: 'IV', subtractive: true, explain: '5 − 1' }
		]);
		expect(decompose(7)[0].explain).toBe('5 + 1 + 1');
		expect(decompose(308).map((p) => p.numeral)).toEqual(['CCC', 'VIII']);
	});
});

describe('fromRoman', () => {
	it('round-trips every value 1 to 3999', () => {
		for (let n = 1; n <= 3999; n++) expect(fromRoman(toRoman(n)).value).toBe(n);
	});

	it('accepts lower case', () => {
		expect(fromRoman(' mcmxciv ')).toEqual({ value: 1994, numeral: 'MCMXCIV' });
	});

	it('rejects IIII and mentions clock faces', () => {
		expect(() => fromRoman('IIII')).toThrow(/repeats I more than three times/);
		expect(() => fromRoman('IIII')).toThrow(/write IV/);
		expect(() => fromRoman('IIII')).toThrow(/Clock faces/);
	});

	it('rejects bad subtractions', () => {
		expect(() => fromRoman('VX')).toThrow(/V is never subtracted/);
		expect(() => fromRoman('IL')).toThrow(/I can only be subtracted from V and X.*write XLIX/);
		expect(() => fromRoman('XM')).toThrow(/X can only be subtracted from L and C/);
		expect(() => fromRoman('IIX')).toThrow(/only one I may stand before X/);
		expect(() => fromRoman('LL')).toThrow(/L may appear only once/);
		expect(() => fromRoman('VV')).toThrow(/write X/);
		expect(() => fromRoman('MMMM')).toThrow(/3999/);
		expect(() => fromRoman('IXI')).toThrow(/standard order/);
	});

	it('rejects other letters', () => {
		expect(() => fromRoman('')).toThrow(/Enter/);
		expect(() => fromRoman('MCMZ')).toThrow(/"Z" is not a Roman numeral letter/);
		expect(() => fromRoman('N')).toThrow(/nulla/);
	});
});

describe('parseInteger and detect', () => {
	it('parses integers', () => {
		expect(parseInteger(' 1 994 ')).toBe(1994);
		expect(() => parseInteger('12a')).toThrow(/not a whole number/);
		expect(() => parseInteger('')).toThrow(/Enter/);
	});

	it('detects only standard numerals of four letters or more', () => {
		expect(looksLikeRoman('MCMXCIV')).toBeGreaterThan(0.5);
		expect(looksLikeRoman('MIX')).toBe(0);
		expect(looksLikeRoman('IIII')).toBe(0);
		expect(looksLikeRoman('mcmxciv')).toBe(0);
		expect(looksLikeRoman('1994')).toBe(0);
	});
});

describe('ops', () => {
	const run = (id: string, s: string) => ops.find((o) => o.id === id)!.run(s);
	it('converts both ways', () => {
		expect(run('roman.to-roman', '2026')).toBe('MMXXVI');
		expect(run('roman.from-roman', 'MMXXVI')).toBe('2026');
		expect(() => run('roman.from-roman', 'IIII')).toThrow();
	});
});
