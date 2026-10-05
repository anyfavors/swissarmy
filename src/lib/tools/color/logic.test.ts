import { describe, expect, it } from 'vitest';
import {
	contrast,
	formatRatio,
	formats,
	looksLikeColor,
	luminance,
	nameOf,
	parseColor,
	rgbToOklab,
	rgbToOklch,
	toHex,
	verdicts
} from './logic';
import { named } from './named';

const p = (s: string) => parseColor(s).color;
const fmt = (s: string) => Object.fromEntries(formats(p(s)).map((f) => [f.id, f.value]));

describe('parsing', () => {
	it.each([
		['#f00', '#ff0000'],
		['#FF000080', '#ff000080'],
		['1e90ff', '#1e90ff'],
		['rgb(30, 144, 255)', '#1e90ff'],
		['rgb(30 144 255 / 50%)', '#1e90ff80'],
		['rgba(30,144,255,0.5)', '#1e90ff80'],
		['rgb(100% 0% 0%)', '#ff0000'],
		['hsl(120 100% 25%)', '#008000'],
		['hsl(0.5turn, 100%, 50%)', '#00ffff'],
		['hsla(240, 100%, 50%, 1)', '#0000ff'],
		['hwb(0 0% 0%)', '#ff0000'],
		['hwb(120 50% 50%)', '#808080'],
		['oklch(62.8% 0.2577 29.23)', '#ff0000'],
		['oklab(0.62796 0.22486 0.12585)', '#ff0000'],
		['cmyk(0% 100% 100% 0%)', '#ff0000'],
		['tomato', '#ff6347'],
		['RebeccaPurple', '#663399'],
		['transparent', '#00000000']
	])('%s is %s', (input, hex) => {
		expect(toHex(p(input))).toBe(hex);
	});

	it('flags OKLCH input outside sRGB', () => {
		expect(parseColor('oklch(70% 0.4 150)').outOfGamut).toBe(true);
		expect(parseColor('oklch(70% 0.1 150)').outOfGamut).toBe(false);
	});

	it('explains errors', () => {
		expect(() => parseColor('')).toThrow(/Enter a colour/);
		expect(() => parseColor('rgb(1 2)')).toThrow(/needs 3 values, got 2/);
		expect(() => parseColor('lab(50 20 30)')).toThrow(/lab\(\) is not supported/);
		expect(() => parseColor('hsl(red 1% 1%)')).toThrow(/not a hue/);
		expect(() => parseColor('notacolour')).toThrow(/is not a colour/);
	});

	it('has the 148 CSS named colours', () => {
		expect(Object.keys(named)).toHaveLength(148);
		expect(named.gray).toBe(named.grey);
		expect(nameOf(p('#ff6347'))).toBe('tomato');
	});
});

describe('conversions', () => {
	it('formats red in every notation', () => {
		expect(fmt('#ff0000')).toEqual({
			hex: '#ff0000',
			rgb: 'rgb(255 0 0)',
			hsl: 'hsl(0 100% 50%)',
			hwb: 'hwb(0 0% 0%)',
			oklch: 'oklch(62.8% 0.2577 29.23)',
			cmyk: 'cmyk(0% 100% 100% 0%)'
		});
	});

	it('formats dodgerblue and translucency', () => {
		expect(fmt('#1e90ff').hsl).toBe('hsl(209.6 100% 55.9%)');
		expect(fmt('#1e90ff80').rgb).toBe('rgb(30 144 255 / 50%)');
		expect(fmt('black').cmyk).toBe('cmyk(0% 0% 0% 100%)');
	});

	it('matches the OKLab reference values for white and red', () => {
		const w = rgbToOklab(p('#ffffff'));
		expect(w.L).toBeCloseTo(1, 4);
		expect(w.a).toBeCloseTo(0, 4);
		expect(w.b).toBeCloseTo(0, 4);
		const r = rgbToOklch(p('#ff0000'));
		expect(r.L).toBeCloseTo(0.62796, 4);
		expect(r.C).toBeCloseTo(0.25768, 4);
		expect(r.H).toBeCloseTo(29.2339, 2);
	});

	it('round-trips every 12-bit colour through HSL, HWB and OKLCH', () => {
		for (let i = 0; i < 4096; i++) {
			const hex = '#' + i.toString(16).padStart(3, '0');
			const c = p(hex);
			const f = formats(c);
			for (const id of ['hsl', 'hwb']) {
				const back = toHex(p(f.find((x) => x.id === id)!.value));
				expect(back, `${hex} via ${id}`).toBe(toHex(c));
			}
			// OKLCH is printed with 4 decimals of chroma: allow one step per channel
			const ok = p(f.find((x) => x.id === 'oklch')!.value);
			for (const k of ['r', 'g', 'b'] as const)
				expect(
					Math.abs(Math.round(ok[k] * 255) - Math.round(c[k] * 255)),
					`${hex} oklch`
				).toBeLessThanOrEqual(1);
		}
	});
});

describe('WCAG contrast', () => {
	it('computes the extremes', () => {
		expect(luminance(p('white'))).toBeCloseTo(1, 10);
		expect(luminance(p('black'))).toBe(0);
		expect(contrast(p('black'), p('white'))).toBeCloseTo(21, 10);
		expect(contrast(p('#abc'), p('#abc'))).toBe(1);
	});

	it('gets the well-known grey threshold right', () => {
		const a = contrast(p('#777777'), p('#ffffff'));
		const b = contrast(p('#767676'), p('#ffffff'));
		expect(a).toBeCloseTo(4.478, 3);
		expect(b).toBeCloseTo(4.542, 3);
		expect(verdicts(a).find((v) => v.id === 'aa')!.pass).toBe(false);
		expect(verdicts(b).find((v) => v.id === 'aa')!.pass).toBe(true);
		expect(formatRatio(a)).toBe('4.47:1');
	});

	it('is symmetric and composites alpha', () => {
		expect(contrast(p('white'), p('#0000ff'))).toBeCloseTo(contrast(p('#0000ff'), p('white')), 12);
		// 50% black over white paints #808080 (rounded)
		expect(contrast(p('rgb(0 0 0 / 50%)'), p('white'))).toBeCloseTo(
			contrast(p('#7f7f7f'), p('white')),
			1
		);
	});

	it('never rounds a fail up to a pass', () => {
		expect(formatRatio(4.4999)).toBe('4.49:1');
		expect(verdicts(4.4999)[0].pass).toBe(false);
	});
});

describe('detect', () => {
	it('recognises colour notations', () => {
		expect(looksLikeColor('#1e90ff')).toBe(0.7);
		expect(looksLikeColor('oklch(70% 0.1 150)')).toBe(0.9);
		expect(looksLikeColor('tomato')).toBe(0);
		expect(looksLikeColor('#hello')).toBe(0);
		expect(looksLikeColor('1700000000')).toBe(0);
	});
});
