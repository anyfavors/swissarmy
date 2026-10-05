import { describe, expect, it } from 'vitest';
import {
	E12,
	E24,
	E96,
	decodeBands,
	decodeSmd,
	encodeBands,
	encodeSmd,
	formatOhms,
	inSeries,
	nearest,
	parseValue
} from './logic';

describe('E series (IEC 60063)', () => {
	it('has the right sizes', () => {
		expect(E12).toHaveLength(12);
		expect(E24).toHaveLength(24);
		expect(E96).toHaveLength(96);
		expect(E96[0]).toBe(100);
		expect(E96[95]).toBe(976);
		for (let i = 1; i < 96; i++) expect(E96[i]).toBeGreaterThan(E96[i - 1]);
	});

	it('finds nearest values across decades', () => {
		expect(nearest(5000, 'E12')).toEqual({ below: 4700, above: 5600, nearest: 4700, error: -6 });
		expect(nearest(9.5, 'E24').above).toBe(10);
		expect(nearest(9.5, 'E24').below).toBe(9.1);
		expect(nearest(4700, 'E24').nearest).toBe(4700);
		expect(nearest(10050, 'E96').nearest).toBe(10000);
		expect(inSeries(4990, 'E96')).toBe(true);
		expect(inSeries(5000, 'E24')).toBe(false);
		expect(() => nearest(0, 'E12')).toThrow(/above zero/);
	});
});

describe('values', () => {
	it.each([
		['4k7', 4700],
		['4.7k', 4700],
		['4.7 kΩ', 4700],
		['470R', 470],
		['0R1', 0.1],
		['R47', 0.47],
		['2M2', 2.2e6],
		['10 ohm', 10],
		['1e3', 1000],
		['4,7k', 4700],
		['100m', 0.1]
	])('parses %s', (s, v) => {
		expect(parseValue(s)).toBe(v);
	});

	it('rejects nonsense', () => {
		expect(() => parseValue('abc')).toThrow(/Could not read/);
		expect(() => parseValue('')).toThrow(/Enter a value/);
	});

	it('formats', () => {
		expect(formatOhms(4700)).toBe('4.7 kΩ');
		expect(formatOhms(0.47)).toBe('470 mΩ');
		expect(formatOhms(2.2e6)).toBe('2.2 MΩ');
		expect(formatOhms(100)).toBe('100 Ω');
	});
});

describe('colour bands', () => {
	it('decodes 4-band yellow violet red gold as 4.7 kΩ ±5%', () => {
		const d = decodeBands(['yellow', 'violet', 'red', 'gold']);
		expect(d).toEqual({ ohms: 4700, tol: 5, tcr: undefined, min: 4465, max: 4935 });
	});

	it('decodes 5 and 6 band codes', () => {
		expect(decodeBands(['brown', 'black', 'black', 'red', 'brown']).ohms).toBe(10000);
		const d = decodeBands(['orange', 'orange', 'black', 'brown', 'brown', 'red']);
		expect(d.ohms).toBe(3300);
		expect(d.tol).toBe(1);
		expect(d.tcr).toBe(50);
	});

	it('handles gold and silver multipliers and 3 bands', () => {
		expect(decodeBands(['yellow', 'violet', 'gold', 'gold']).ohms).toBe(4.7);
		expect(decodeBands(['brown', 'black', 'silver', 'gold']).ohms).toBe(0.1);
		expect(decodeBands(['brown', 'black', 'red']).tol).toBe(20);
	});

	it('rejects impossible bands', () => {
		expect(() => decodeBands(['gold', 'violet', 'red', 'gold'])).toThrow(/not a digit/);
		expect(() => decodeBands(['red', 'red', 'none', 'gold'])).toThrow(/multiplier/);
		expect(() => decodeBands(['red', 'red'])).toThrow(/3, 4, 5 or 6/);
	});

	it('encodes values into bands', () => {
		expect(encodeBands(4700, 4).bands).toEqual(['yellow', 'violet', 'red', 'gold']);
		expect(encodeBands(10000, 5, 'brown').bands).toEqual([
			'brown',
			'black',
			'black',
			'red',
			'brown'
		]);
		expect(encodeBands(4.7, 4).bands).toEqual(['yellow', 'violet', 'gold', 'gold']);
		expect(encodeBands(0.1, 4).bands).toEqual(['brown', 'black', 'silver', 'gold']);
		expect(encodeBands(3300, 6, 'brown', 'red').bands).toEqual([
			'orange',
			'orange',
			'black',
			'brown',
			'brown',
			'red'
		]);
	});

	it('flags values that need more digits than the code has', () => {
		const e = encodeBands(4990, 4);
		expect(e.exact).toBe(false);
		expect(e.shown).toBe(5000);
		expect(encodeBands(4990, 5).exact).toBe(true);
		expect(encodeBands(999, 4).shown).toBe(1000);
	});

	it('refuses out of range values', () => {
		expect(() => encodeBands(0, 4)).toThrow(/black band/);
		expect(() => encodeBands(1e12, 4)).toThrow(/Too large/);
	});
});

describe('SMD codes', () => {
	it.each([
		['472', 4700],
		['103', 10000],
		['4702', 47000],
		['1002', 10000],
		['4R7', 4.7],
		['R47', 0.47],
		['01C', 10000],
		['68X', 49.9],
		['000', 0]
	])('decodes %s', (code, v) => {
		expect(decodeSmd(code).ohms).toBe(v);
	});

	it('offers both readings for EIA-96 codes ending in R', () => {
		const d = decodeSmd('47R');
		expect(d.ohms).toBe(3.01);
		expect(d.alt?.ohms).toBe(47);
	});

	it('rejects unknown codes', () => {
		expect(() => decodeSmd('ABC')).toThrow(/not a known/);
		expect(() => decodeSmd('99C')).toThrow(/01 to 96/);
	});

	it('encodes markings', () => {
		expect(encodeSmd(4700)).toEqual({ three: '472', four: '4701', eia96: undefined });
		expect(encodeSmd(10000)).toEqual({ three: '103', four: '1002', eia96: '01C' });
		expect(encodeSmd(4.7)).toEqual({ three: '4R7', four: '4R70', eia96: undefined });
		expect(encodeSmd(47).four).toBe('47R0');
		expect(encodeSmd(49.9)).toEqual({ three: undefined, four: '49R9', eia96: '68X' });
		expect(encodeSmd(0)).toEqual({ three: '000', four: '0000' });
	});
});
