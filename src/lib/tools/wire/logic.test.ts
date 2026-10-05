import { describe, expect, it } from 'vitest';
import {
	areaFromDiameter,
	awgDiameter,
	awgFromDiameter,
	awgName,
	awgTable,
	drop,
	minArea,
	ohmsPerKm,
	parseAwg,
	resistivity,
	size
} from './logic';

const near = (a: number, b: number, rel = 1e-3) =>
	expect(Math.abs(a - b) / Math.abs(b)).toBeLessThan(rel);

describe('AWG', () => {
	it('matches the ASTM B258 table', () => {
		near(awgDiameter(36), 0.127, 1e-9);
		near(awgDiameter(10), 2.588);
		near(awgDiameter(12), 2.053);
		near(awgDiameter(24), 0.511);
		near(awgDiameter(-3), 11.684);
		near(areaFromDiameter(awgDiameter(10)), 5.261);
		near(areaFromDiameter(awgDiameter(-3)), 107.2);
	});
	it('parses gauge names', () => {
		expect(parseAwg('12')).toBe(12);
		expect(parseAwg('AWG 14')).toBe(14);
		expect(parseAwg('1/0')).toBe(0);
		expect(parseAwg('4/0')).toBe(-3);
		expect(parseAwg('00')).toBe(-1);
		expect(parseAwg('0000')).toBe(-3);
		expect(() => parseAwg('50')).toThrow(/4\/0 to 40/);
		expect(() => parseAwg('abc')).toThrow(/not a gauge/);
		expect(() => parseAwg('')).toThrow(/Enter a gauge/);
	});
	it('names gauges', () => {
		expect(awgName(-3)).toBe('4/0');
		expect(awgName(0)).toBe('1/0');
		expect(awgName(18)).toBe('18');
	});
	it('inverts', () => {
		for (const n of [-3, 0, 10, 22, 40])
			expect(Math.abs(awgFromDiameter(awgDiameter(n)) - n)).toBeLessThan(1e-9);
	});
});

describe('sizes', () => {
	it('maps mm² to AWG and IEC sizes', () => {
		const s = size(2.5);
		near(s.diameter, 1.784);
		expect(s.awgNearest).toBe(13);
		expect(s.awgUp).toBe(13);
		expect(s.metricNearest).toBe(2.5);
		expect(s.metricUp).toBe(2.5);
		const t = size(3.31);
		expect(t.awgNearest).toBe(12);
		expect(t.metricUp).toBe(4);
		expect(() => size(0)).toThrow(/above zero/);
	});
});

describe('resistance', () => {
	it('uses IEC 60028 copper and IEC 60889 aluminium', () => {
		near(resistivity('cu'), 0.017241);
		near(resistivity('al'), 0.028264);
		near(ohmsPerKm(1.5, 'cu'), 11.494);
		near(ohmsPerKm(areaFromDiameter(awgDiameter(10)), 'cu'), 3.277);
		near(ohmsPerKm(16, 'al'), 1.7665);
	});
	it('rises with temperature', () => {
		near(resistivity('cu', 70), 0.017241 * (1 + 0.00393 * 50));
	});
});

describe('voltage drop', () => {
	it('single-phase uses 2 × length', () => {
		const d = drop('ac1', 20, 16, 2.5, 230);
		near(d.volts, 4.414);
		near(d.pct, 1.919);
		expect(d.verdict).toBe('ok');
		near(d.vLoad, 230 - 4.414, 1e-4);
	});
	it('three-phase uses √3', () => {
		const d = drop('ac3', 100, 32, 6, 400);
		near(d.volts, ((Math.sqrt(3) * (0.017241 * 100)) / 6) * 32);
		expect(d.verdict).toBe('lighting-high');
	});
	it('DC flags a large drop', () => {
		const d = drop('dc', 10, 10, 1.5, 12);
		near(d.volts, ((2 * 0.017241 * 10) / 1.5) * 10);
		expect(d.verdict).toBe('high');
		near(d.watts, 2 * 100 * ((0.017241 * 10) / 1.5));
	});
	it('validates input', () => {
		expect(() => drop('dc', 0, 1, 1, 12)).toThrow(/Length/);
		expect(() => drop('dc', 1, 0, 1, 12)).toThrow(/Current/);
		expect(() => drop('dc', 1, 1, 0, 12)).toThrow(/Cross-section/);
		expect(() => drop('dc', 1, 1, 1, 0)).toThrow(/Supply/);
	});
	it('finds a minimum size', () => {
		const m = minArea('ac1', 20, 16, 230, 3);
		near(m.exact, (2 * 0.017241 * 20 * 16) / (0.03 * 230));
		expect(m.standard).toBe(2.5);
	});
	it('builds a table', () => {
		const t = awgTable(-3, 30);
		expect(t).toHaveLength(34);
		expect(t[0].name).toBe('4/0');
	});
});
