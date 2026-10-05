import { describe, expect, it } from 'vitest';
import {
	achieved,
	allowedDowntime,
	composite,
	DAY,
	decodeTiers,
	encodeTiers,
	formatDuration,
	formatPercent,
	fromMtbf,
	nines,
	parallel,
	parseDuration,
	parsePercent,
	serial,
	YEAR
} from './logic';

describe('allowed downtime', () => {
	it('uses a 365.25-day year', () => {
		expect(YEAR).toBe(31_557_600);
		expect(formatDuration(allowedDowntime(99.9, YEAR))).toBe('8h 45m 57.6s');
		expect(formatDuration(allowedDowntime(99.99, YEAR))).toBe('52m 35.8s');
		expect(formatDuration(allowedDowntime(99.999, YEAR))).toBe('5m 15.6s');
		expect(formatDuration(allowedDowntime(99, YEAR))).toBe('3d 15h 39m 36s');
	});

	it('handles months, weeks and days', () => {
		expect(formatDuration(allowedDowntime(99.9, 30 * DAY))).toBe('43m 12s');
		expect(formatDuration(allowedDowntime(99.9, 31 * DAY))).toBe('44m 38.4s');
		expect(formatDuration(allowedDowntime(99.9, YEAR / 12))).toBe('43m 49.8s');
		expect(formatDuration(allowedDowntime(99.9, 7 * DAY))).toBe('10m 4.8s');
		expect(formatDuration(allowedDowntime(99.999, DAY))).toBe('864 ms');
	});

	it('gives zero for 100 %', () => {
		expect(allowedDowntime(100, YEAR)).toBe(0);
		expect(formatDuration(0)).toBe('0 s');
	});
});

describe('achieved availability', () => {
	it('inverts downtime', () => {
		expect(achieved(43.2 * 60, 30 * DAY)).toBeCloseTo(99.9, 10);
		expect(achieved(0, DAY)).toBe(100);
	});
	it('rejects impossible downtime', () => {
		expect(() => achieved(2 * DAY, DAY)).toThrow(/longer than the period/);
		expect(() => achieved(-1, DAY)).toThrow(/negative/);
	});
});

describe('parsing', () => {
	it('reads percentages', () => {
		expect(parsePercent('99.95')).toBe(99.95);
		expect(parsePercent('99,9 %')).toBe(99.9);
		expect(() => parsePercent('101')).toThrow(/above 100/);
		expect(() => parsePercent('abc')).toThrow(/not a percentage/);
		expect(() => parsePercent('')).toThrow(/Enter/);
	});
	it('reads durations', () => {
		expect(parseDuration('8h 45m')).toBe(8 * 3600 + 45 * 60);
		expect(parseDuration('1.5 hours')).toBe(5400);
		expect(parseDuration('90')).toBe(5400);
		expect(parseDuration('01:30:00')).toBe(5400);
		expect(parseDuration('45:30')).toBe(45 * 60 + 30);
		expect(parseDuration('2d 3h')).toBe(2 * DAY + 3 * 3600);
		expect(parseDuration('500 ms')).toBe(0.5);
		expect(() => parseDuration('3 fortnights')).toThrow(/Unknown unit/);
		expect(() => parseDuration('4h and a bit')).toThrow();
		expect(() => parseDuration('1:75')).toThrow(/below 60/);
	});
});

describe('composite availability', () => {
	it('multiplies serial components', () => {
		expect(serial([0.999, 0.999])).toBeCloseTo(0.998001, 12);
	});
	it('computes redundancy', () => {
		expect(parallel(0.99, 2)).toBeCloseTo(0.9999, 12);
		expect(parallel(0.9, 3)).toBeCloseTo(0.999, 12);
		expect(() => parallel(0.9, 0)).toThrow(/whole number/);
	});
	it('chains tiers', () => {
		const r = composite([
			{ name: 'LB', availability: 99.99, count: 1 },
			{ name: 'Web', availability: 99, count: 2 },
			{ name: 'DB', availability: 99.9, count: 1 }
		]);
		expect(r.tiers[1].fraction).toBeCloseTo(0.9999, 12);
		expect(r.fraction).toBeCloseTo(0.9999 * 0.9999 * 0.999, 12);
		expect(() => composite([])).toThrow(/at least one/);
	});
	it('round-trips through the URL form', () => {
		const t = [
			{ name: 'Web: front', availability: 99.9, count: 2 },
			{ name: 'DB', availability: 99.95, count: 1 }
		];
		expect(decodeTiers(encodeTiers(t))).toEqual([
			{ name: 'Web  front', availability: 99.9, count: 2 },
			{ name: 'DB', availability: 99.95, count: 1 }
		]);
		expect(decodeTiers('x:200:1;y:99:0;z:99:1')).toEqual([
			{ name: 'z', availability: 99, count: 1 }
		]);
	});
});

describe('MTBF and MTTR', () => {
	it('gives steady-state availability', () => {
		expect(fromMtbf(999, 1)).toBeCloseTo(0.999, 12);
		expect(() => fromMtbf(0, 1)).toThrow(/MTBF/);
		expect(() => fromMtbf(10, -1)).toThrow(/MTTR/);
	});
});

describe('formatting', () => {
	it('counts nines', () => {
		expect(nines(99.9)).toBeCloseTo(3, 10);
		expect(nines(100)).toBe(Infinity);
	});
	it('formats percentages', () => {
		expect(formatPercent(99.99999)).toBe('99.99999 %');
		expect(formatPercent(100)).toBe('100 %');
	});
});
