import { describe, expect, it } from 'vitest';
import { formatDay, formatGB, parseDay, plan, storage, weekdayOf, type Gfs } from './logic';

const today = parseDay('2026-10-05'); // a Monday
const gfs: Gfs = { daily: 7, weekly: 4, monthly: 12, yearly: 1, weekday: 0 };

describe('dates', () => {
	it('parses and formats', () => {
		expect(formatDay(parseDay('2024-02-29'))).toBe('2024-02-29');
		expect(weekdayOf(today)).toBe(1);
		expect(() => parseDay('2025-02-29')).toThrow(/not a calendar date/);
		expect(() => parseDay('5/10/2026')).toThrow(/YYYY-MM-DD/);
	});
});

describe('GFS plan', () => {
	it('counts distinct restore points', () => {
		const p = plan(gfs, today);
		// 7 dailies (Sep 29 to Oct 5), Sundays Sep 13, 20, 27 (Oct 4 is already a daily),
		// 1st of Nov 2025 to Sep 2026 (Oct 1 is a daily), Jan 1 2026 is already a monthly.
		expect(p.points.length).toBe(21);
		expect(formatDay(p.oldest!)).toBe('2025-11-01');
		expect(p.counts).toEqual({ daily: 7, weekly: 4, monthly: 12, yearly: 1 });
	});

	it('reaches back for yearlies', () => {
		const p = plan({ daily: 14, weekly: 0, monthly: 0, yearly: 3, weekday: 0 }, today);
		expect(p.points.length).toBe(17);
		expect(formatDay(p.oldest!)).toBe('2024-01-01');
	});

	it('validates counts', () => {
		expect(() => plan({ ...gfs, daily: -1 }, today)).toThrow(/whole number/);
		expect(() => plan({ daily: 0, weekly: 0, monthly: 0, yearly: 0, weekday: 0 }, today)).toThrow(
			/at least one/
		);
		expect(() => plan({ ...gfs, yearly: 500 }, today)).toThrow(/too large/);
	});
});

describe('storage', () => {
	const p = plan(gfs, today);
	it('forever incremental chain plus GFS fulls', () => {
		const s = storage(p, gfs, { full: 1000, change: 5, reduction: 2, chain: 'forever' });
		expect(s.fulls).toBe(15);
		expect(s.incrementals).toBe(6);
		expect(s.logical).toBe(15_300);
		expect(s.stored).toBe(7650);
		expect(s.allFulls).toBe(10_500);
	});
	it('weekly fulls inside the chain', () => {
		// chain Sep 29 to Oct 5 contains one Sunday (Oct 4) and the oldest day is not a Sunday
		const s = storage(p, gfs, { full: 1000, change: 5, reduction: 1, chain: 'weekly' });
		expect(s.fulls).toBe(16);
		expect(s.incrementals).toBe(5);
	});
	it('validates', () => {
		expect(() => storage(p, gfs, { full: 0, change: 5, reduction: 1, chain: 'forever' })).toThrow();
		expect(() => storage(p, gfs, { full: 1, change: 101, reduction: 1, chain: 'forever' })).toThrow(
			/0 to 100/
		);
		expect(() => storage(p, gfs, { full: 1, change: 1, reduction: 0.5, chain: 'forever' })).toThrow(
			/1 or more/
		);
	});
	it('formats sizes', () => {
		expect(formatGB(7650)).toBe('7.65 TB');
		expect(formatGB(512.25)).toBe('512.3 GB');
	});
});
