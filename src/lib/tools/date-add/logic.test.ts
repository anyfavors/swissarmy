import { describe, expect, it } from 'vitest';
import { formatDate, parseDateTime, type HolidayOptions } from '../date-diff/logic';
import {
	addDuration,
	addWorkingDays,
	describeDate,
	describeDuration,
	durationSeconds,
	formatIsoDuration,
	looksLikeDuration,
	parseIsoDuration,
	zero
} from './logic';

const D = (s: string) => parseDateTime(s);
const iso = (s: string, dur: string, sign: 1 | -1 = 1) => {
	const p = parseIsoDuration(dur);
	return describeDate(addDuration(D(s), p.duration, (sign * p.sign) as 1 | -1)).iso;
};
const dk: HolidayOptions = { publicHolidays: true, extra: {} };

describe('parseIsoDuration', () => {
	it('reads the full form', () => {
		expect(parseIsoDuration('P1Y2M10DT2H30M')).toEqual({
			duration: { ...zero, years: 1, months: 2, days: 10, hours: 2, minutes: 30 },
			sign: 1
		});
		expect(parseIsoDuration('P3W').duration.weeks).toBe(3);
		expect(parseIsoDuration('PT36H').duration.hours).toBe(36);
		expect(parseIsoDuration('PT0.5S').duration.seconds).toBe(0.5);
		expect(parseIsoDuration('PT1,5H').duration.hours).toBe(1.5);
		expect(parseIsoDuration('-P1D').sign).toBe(-1);
		expect(parseIsoDuration('p1m').duration.months).toBe(1);
		expect(parseIsoDuration('PT1M').duration.minutes).toBe(1);
	});

	it('rejects malformed durations', () => {
		expect(() => parseIsoDuration('P')).toThrow('no values');
		expect(() => parseIsoDuration('PT')).toThrow('A T must be followed');
		expect(() => parseIsoDuration('P1DT')).toThrow('A T must be followed');
		expect(() => parseIsoDuration('P1H')).toThrow('not a valid ISO 8601 duration');
		expect(() => parseIsoDuration('P0.5Y')).toThrow('Years and months cannot be fractional');
		expect(() => parseIsoDuration('PT1.5H30M')).toThrow('Only the smallest unit');
		expect(() => parseIsoDuration('1 day')).toThrow('starts with P');
	});

	it('formats and explains', () => {
		const d = parseIsoDuration('P1Y2M10DT2H30M').duration;
		expect(formatIsoDuration(d)).toBe('P1Y2M10DT2H30M');
		expect(formatIsoDuration(zero)).toBe('PT0S');
		expect(formatIsoDuration({ ...zero, days: 1 }, -1)).toBe('-P1D');
		expect(describeDuration(d)).toBe('1 year, 2 months, 10 days, 2 hours and 30 minutes');
		expect(describeDuration({ ...zero, weeks: 1 })).toBe('1 week');
		expect(durationSeconds(parseIsoDuration('P1DT1H').duration)).toEqual({
			seconds: 90000,
			exact: true
		});
		expect(durationSeconds(parseIsoDuration('P1Y').duration)).toEqual({
			seconds: 31556952,
			exact: false
		});
	});

	it('detects duration strings', () => {
		expect(looksLikeDuration('P1Y2M10DT2H30M')).toBe(0.9);
		expect(looksLikeDuration('PT15M')).toBe(0.9);
		expect(looksLikeDuration('Paris')).toBe(0);
		expect(looksLikeDuration('P')).toBe(0);
	});
});

describe('addDuration', () => {
	it('clamps to month end', () => {
		expect(iso('2026-01-31', 'P1M')).toBe('2026-02-28');
		expect(iso('2024-01-31', 'P1M')).toBe('2024-02-29');
		expect(iso('2024-02-29', 'P1Y')).toBe('2025-02-28');
		expect(iso('2026-03-31', 'P1M', -1)).toBe('2026-02-28');
		// Months first, then days: Jan 31 + 1 month = Feb 28, + 1 day = Mar 1.
		expect(iso('2026-01-31', 'P1M1D')).toBe('2026-03-01');
	});

	it('carries time into days', () => {
		expect(iso('2026-10-04T22:00', 'PT3H')).toBe('2026-10-05T01:00:00');
		expect(iso('2026-10-04T01:00', 'PT2H', -1)).toBe('2026-10-03T23:00:00');
		expect(iso('2026-10-04', 'PT36H')).toBe('2026-10-05T12:00:00');
		expect(iso('2026-10-04', 'P1.5D')).toBe('2026-10-05T12:00:00');
		expect(iso('2026-10-04', 'P2W')).toBe('2026-10-18');
		expect(iso('2026-12-31T23:59:59', 'PT0.5S')).toBe('2026-12-31T23:59:59.500');
	});

	it('handles a negative ISO duration', () => {
		expect(iso('2026-10-04', '-P1D')).toBe('2026-10-03');
		expect(iso('2026-10-04', '-P1D', -1)).toBe('2026-10-05');
	});
});

describe('addWorkingDays', () => {
	const wd = (s: string, n: number, o = dk) => formatDate(addWorkingDays(D(s).day, n, o).day);

	it('skips weekends', () => {
		expect(wd('2026-10-02', 1)).toBe('2026-10-05'); // Fri + 1 = Mon
		expect(wd('2026-10-05', -1)).toBe('2026-10-02');
		expect(wd('2026-10-03', 1)).toBe('2026-10-05'); // Sat + 1 = Mon
		expect(wd('2026-10-05', 0)).toBe('2026-10-05');
		expect(wd('2026-10-05', 10)).toBe('2026-10-19');
	});

	it('skips Danish holidays and reports them', () => {
		const r = addWorkingDays(D('2026-04-01').day, 1, dk);
		expect(formatDate(r.day)).toBe('2026-04-07'); // over Easter
		expect(r.skipped.map((h) => formatDate(h.day))).toEqual([
			'2026-04-02',
			'2026-04-03',
			'2026-04-06'
		]);
		expect(wd('2026-04-01', 1, { publicHolidays: false, extra: {} })).toBe('2026-04-02');
		expect(wd('2026-12-23', 1, { publicHolidays: true, extra: { juleaften: true } })).toBe(
			'2026-12-28'
		);
	});

	it('validates n', () => {
		expect(() => addWorkingDays(0, 1.5, dk)).toThrow('whole number');
		expect(() => addWorkingDays(0, 1e6, dk)).toThrow('100 000');
	});
});

describe('describeDate', () => {
	it('gives weekday, ISO week and day of year', () => {
		expect(describeDate(D('2026-10-04'))).toEqual({
			iso: '2026-10-04',
			weekday: 'Sunday',
			isoWeek: '2026-W40-7',
			dayOfYear: 277
		});
		expect(describeDate(D('2021-01-03')).isoWeek).toBe('2020-W53-7');
		expect(describeDate(D('2024-12-31')).dayOfYear).toBe(366);
	});
});
