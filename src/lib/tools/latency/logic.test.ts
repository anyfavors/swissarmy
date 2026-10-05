import { describe, expect, it } from 'vitest';
import {
	bdpBytes,
	cities,
	cityById,
	formatBytes,
	formatMs,
	formatRate,
	greatCircleKm,
	mathisBps,
	minRttMs,
	oneWayMs,
	pairs,
	parseBytes,
	parseLoss,
	parseRate,
	parseTime,
	sig,
	windowLimitedBps,
	windowScale
} from './logic';

const km = (a: string, b: string) => greatCircleKm(cityById(a)!, cityById(b)!);

describe('distance', () => {
	it('computes great-circle distances', () => {
		// Copenhagen to London is about 955 km, London to New York about 5,570 km
		expect(km('cph', 'lon')).toBeGreaterThan(945);
		expect(km('cph', 'lon')).toBeLessThan(965);
		expect(km('lon', 'nyc')).toBeGreaterThan(5540);
		expect(km('lon', 'nyc')).toBeLessThan(5600);
		expect(km('cph', 'cph')).toBe(0);
	});
	it('gives a quarter circumference from the pole to the equator', () => {
		expect(greatCircleKm({ lat: 90, lon: 0 }, { lat: 0, lon: 0 })).toBeCloseTo(
			(Math.PI * 6371.0088) / 2,
			6
		);
		expect(greatCircleKm({ lat: 0, lon: 0 }, { lat: 0, lon: 180 })).toBeCloseTo(
			Math.PI * 6371.0088,
			6
		);
	});
	it('has valid presets', () => {
		for (const [a, b] of pairs) expect(cityById(a) && cityById(b)).toBeTruthy();
		expect(new Set(cities.map((c) => c.id)).size).toBe(cities.length);
	});
});

describe('propagation', () => {
	it('uses 2/3 c in fibre', () => {
		// 1000 km at 199,861.6 km/s
		expect(oneWayMs(1000)).toBeCloseTo(5.0035, 4);
		expect(minRttMs(1000)).toBeCloseTo(10.007, 3);
		expect(oneWayMs(299792.458, 1)).toBeCloseTo(1000, 9);
	});
	it('rejects bad input', () => {
		expect(() => oneWayMs(-1)).toThrow('zero or more');
		expect(() => oneWayMs(1, 0)).toThrow('Speed factor');
	});
});

describe('parsing', () => {
	it('reads rates', () => {
		expect(parseRate('100 Mbit/s')).toBe(1e8);
		expect(parseRate('1 Gbps')).toBe(1e9);
		expect(parseRate('2.5G')).toBe(2.5e9);
		expect(parseRate('800k')).toBe(8e5);
		expect(parseRate('64000')).toBe(64000);
		expect(() => parseRate('fast')).toThrow('Could not read');
		expect(() => parseRate('0')).toThrow('above zero');
	});
	it('reads sizes', () => {
		expect(parseBytes('65535')).toBe(65535);
		expect(parseBytes('64 KiB')).toBe(65536);
		expect(parseBytes('4 MB')).toBe(4e6);
		expect(parseBytes('1.5 MiB')).toBe(1572864);
		expect(() => parseBytes('lots')).toThrow('Could not read');
	});
	it('reads times and loss', () => {
		expect(parseTime('30 ms')).toBe(30);
		expect(parseTime('0.3 s')).toBe(300);
		expect(parseTime('250us')).toBe(0.25);
		expect(parseTime('12')).toBe(12);
		expect(() => parseTime('0')).toThrow('above zero');
		expect(parseLoss('1%')).toBe(0.01);
		expect(parseLoss('1e-4')).toBe(1e-4);
		expect(() => parseLoss('0')).toThrow('above 0');
		expect(() => parseLoss('x')).toThrow('Could not read');
	});
});

describe('TCP', () => {
	it('computes the bandwidth-delay product', () => {
		// 1 Gbit/s × 100 ms = 100 Mbit = 12.5 MB
		expect(bdpBytes(1e9, 100)).toBe(12.5e6);
	});
	it('limits a 64 KiB window', () => {
		// 65,535 bytes per 100 ms is about 5.24 Mbit/s
		expect(windowLimitedBps(65535, 100)).toBeCloseTo(5242800, 0);
	});
	it('finds the window scale shift (RFC 7323)', () => {
		expect(windowScale(65535)).toEqual({ shift: 0, fits: true });
		expect(windowScale(65536)).toEqual({ shift: 1, fits: true });
		expect(windowScale(12.5e6).shift).toBe(8);
		expect(windowScale(2 ** 31)).toEqual({ shift: 14, fits: false });
	});
	it('applies the Mathis formula', () => {
		// 1460 B, 100 ms, 1% loss: 116,800 bit/s × 1.2247 / 0.1 = 1.43 Mbit/s
		expect(mathisBps(1460, 100, 0.01)).toBeCloseTo(1430500, -2);
		expect(mathisBps(1460, 100, 0.0001) / mathisBps(1460, 100, 0.01)).toBeCloseTo(10, 9);
		expect(() => mathisBps(0, 1, 0.1)).toThrow('MSS');
	});
});

describe('formatting', () => {
	it('uses three significant digits', () => {
		expect(sig(9.5567)).toBe('9.56');
		expect(sig(955.4)).toBe('955');
		expect(sig(12345)).toBe('12,345');
		expect(formatRate(1430500)).toBe('1.43 Mbit/s');
		expect(formatRate(999)).toBe('999 bit/s');
		expect(formatBytes(12.5e6)).toBe('11.9 MiB (12,500,000 bytes)');
		expect(formatBytes(500)).toBe('500 bytes');
		expect(formatMs(0.25)).toBe('250 µs');
		expect(formatMs(9.556)).toBe('9.56 ms');
	});
});
