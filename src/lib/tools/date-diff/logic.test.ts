import { describe, expect, it } from 'vitest';
import {
	addMonths,
	calendarDiff,
	countWeekdays,
	danishHolidays,
	dateDiff,
	dayNumber,
	easter,
	formatDate,
	isDayOff,
	looksLikeDateRange,
	parseDateTime,
	splitRange,
	weekday,
	type DiffOptions,
	type HolidayOptions
} from './logic';

const D = (s: string) => parseDateTime(s);
const dn = (s: string) => parseDateTime(s).day;
const dk: HolidayOptions = { publicHolidays: true, extra: {} };
const opts = (o: Partial<DiffOptions> = {}): DiffOptions => ({
	inclusive: false,
	publicHolidays: true,
	extra: {},
	...o
});

describe('calendar basics', () => {
	it('round-trips day numbers and weekdays', () => {
		expect(dayNumber(1970, 1, 1)).toBe(0);
		expect(formatDate(dayNumber(2024, 2, 29))).toBe('2024-02-29');
		expect(formatDate(dayNumber(33, 7, 9))).toBe('0033-07-09');
		expect(weekday(dn('2026-10-04'))).toBe(6); // Sunday
		expect(weekday(dn('1969-12-29'))).toBe(0); // Monday, negative day number
	});

	it('clamps month addition to the month end', () => {
		expect(formatDate(addMonths(dn('2026-01-31'), 1))).toBe('2026-02-28');
		expect(formatDate(addMonths(dn('2024-01-31'), 1))).toBe('2024-02-29');
		expect(formatDate(addMonths(dn('2024-02-29'), 12))).toBe('2025-02-28');
		expect(formatDate(addMonths(dn('2026-03-31'), -1))).toBe('2026-02-28');
	});
});

describe('parseDateTime', () => {
	it('reads dates and times', () => {
		expect(D('2026-10-04')).toEqual({ day: dn('2026-10-04'), secs: 0, hasTime: false });
		expect(D('2026-10-04T12:30').secs).toBe(45000);
		expect(D('2026-10-04 12:30:15').secs).toBe(45015);
		expect(D('2026-10-04T12:30:15.250Z').secs).toBe(45015.25);
		expect(parseDateTime('today', 100).day).toBe(100);
	});

	it('rejects bad input with clear messages', () => {
		expect(() => D('')).toThrow(/YYYY-MM-DD/);
		expect(() => D('2026-02-29')).toThrow('2026-02 has 28 days, not 29');
		expect(() => D('2026-13-01')).toThrow('Month 13 does not exist');
		expect(() => D('2026-01-01T24:00')).toThrow(/Hour 24/);
		expect(() => D('2026-01-01T12:00+02:00')).toThrow(/offsets are not used/);
		expect(() => D('04/10/2026')).toThrow(/Could not read/);
	});
});

describe('Easter (Meeus/Jones/Butcher)', () => {
	it.each([
		[1818, 3, 22],
		[1943, 4, 25],
		[1961, 4, 2],
		[2000, 4, 23],
		[2019, 4, 21],
		[2024, 3, 31],
		[2025, 4, 20],
		[2026, 4, 5],
		[2038, 4, 25],
		[2285, 3, 22]
	])('%i', (y, month, day) => {
		expect(easter(y)).toEqual({ month, day });
	});
});

describe('Danish holidays', () => {
	const dates = (y: number, o = dk) => danishHolidays(y, o).map((h) => formatDate(h.day));

	it('lists 2026', () => {
		expect(dates(2026)).toEqual([
			'2026-01-01',
			'2026-04-02',
			'2026-04-03',
			'2026-04-05',
			'2026-04-06',
			'2026-05-14',
			'2026-05-24',
			'2026-05-25',
			'2026-12-25',
			'2026-12-26'
		]);
	});

	it('includes Store Bededag up to 2023 only', () => {
		const names = (y: number) => danishHolidays(y, dk).map((h) => h.name);
		const sb = danishHolidays(2023, dk).find((h) => h.name.startsWith('Store Bededag'));
		expect(sb && formatDate(sb.day)).toBe('2023-05-05');
		expect(names(2024).some((n) => n.startsWith('Store Bededag'))).toBe(false);
		expect(dates(2023)).toHaveLength(11);
	});

	it('adds the optional common days off', () => {
		const all = dates(2026, {
			publicHolidays: true,
			extra: { grundlovsdag: true, juleaften: true, nytaarsaften: true }
		});
		expect(all).toContain('2026-06-05');
		expect(all).toContain('2026-12-24');
		expect(all).toContain('2026-12-31');
		expect(dates(2026, { publicHolidays: false, extra: { juleaften: true } })).toEqual([
			'2026-12-24'
		]);
	});

	it('knows weekends and holidays are days off', () => {
		expect(isDayOff(dn('2026-04-03'), dk)).toBe(true);
		expect(isDayOff(dn('2026-04-07'), dk)).toBe(false);
		expect(isDayOff(dn('2026-10-03'), dk)).toBe(true);
	});
});

describe('calendarDiff', () => {
	it('handles month ends', () => {
		expect(calendarDiff(dn('2026-01-31'), dn('2026-02-28'))).toEqual({
			years: 0,
			months: 1,
			days: 0
		});
		expect(calendarDiff(dn('2026-01-31'), dn('2026-03-01'))).toEqual({
			years: 0,
			months: 1,
			days: 1
		});
		expect(calendarDiff(dn('2026-01-31'), dn('2026-03-31'))).toEqual({
			years: 0,
			months: 2,
			days: 0
		});
		expect(calendarDiff(dn('2024-02-29'), dn('2025-02-28'))).toEqual({
			years: 1,
			months: 0,
			days: 0
		});
		expect(calendarDiff(dn('2000-03-15'), dn('2026-10-04'))).toEqual({
			years: 26,
			months: 6,
			days: 19
		});
	});
});

describe('dateDiff', () => {
	it('counts a full year', () => {
		const r = dateDiff(D('2026-01-01'), D('2027-01-01'), opts());
		expect(r.years).toBe(1);
		expect(r.totalSeconds / 86400).toBe(365);
		expect(r.weekdays).toBe(261);
		expect(r.workingDays).toBe(254);
		expect(r.holidays).toHaveLength(10);
	});

	it('excludes the end date unless told otherwise', () => {
		expect(dateDiff(D('2026-10-05'), D('2026-10-09'), opts()).workingDays).toBe(4);
		const r = dateDiff(D('2026-10-05'), D('2026-10-09'), opts({ inclusive: true }));
		expect(r.workingDays).toBe(5);
		expect(r.totalSeconds).toBe(5 * 86400);
	});

	it('ignores holidays when switched off', () => {
		const r = dateDiff(D('2026-01-01'), D('2027-01-01'), opts({ publicHolidays: false }));
		expect(r.workingDays).toBe(261);
	});

	it('counts the Easter week in Denmark', () => {
		const r = dateDiff(D('2026-03-30'), D('2026-04-13'), opts());
		expect(r.weekdays).toBe(10);
		expect(r.workingDays).toBe(7);
	});

	it('handles times and borrows a day', () => {
		const r = dateDiff(D('2026-01-01T18:00'), D('2026-01-03T06:30'), opts());
		expect([r.days, r.hours, r.minutes]).toEqual([1, 12, 30]);
		expect(r.totalSeconds).toBe(36 * 3600 + 1800);
	});

	it('reports a reversed range as negative', () => {
		const r = dateDiff(D('2026-03-01'), D('2026-01-31'), opts());
		expect(r.negative).toBe(true);
		expect([r.months, r.days]).toEqual([1, 1]);
	});

	it('counts weekdays arithmetically across long spans', () => {
		expect(countWeekdays(dn('2000-01-01'), dn('2100-01-01'))).toBe(26089);
		expect(countWeekdays(5, 5)).toBe(0);
	});
});

describe('intake', () => {
	it('detects date ranges only', () => {
		expect(splitRange('2026-01-01 to 2026-03-01')).toEqual(['2026-01-01', '2026-03-01']);
		expect(splitRange('2026-01-01/2026-03-01T12:00')).toEqual(['2026-01-01', '2026-03-01T12:00']);
		expect(splitRange('2026-01-01 2026-03-01')).toEqual(['2026-01-01', '2026-03-01']);
		expect(looksLikeDateRange('2026-01-01 - 2026-03-01')).toBeGreaterThan(0.5);
		expect(looksLikeDateRange('2026-01-01')).toBe(0);
		expect(looksLikeDateRange('1700000000')).toBe(0);
	});
});
