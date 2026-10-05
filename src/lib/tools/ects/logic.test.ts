import { describe, expect, it } from 'vitest';
import {
	decodePlan,
	DK_HOURS,
	ectsToHours,
	encodePlan,
	fmt,
	hoursToEcts,
	parseNum,
	plan,
	weeklyHours,
	YEAR_ECTS
} from './logic';

describe('ECTS and hours', () => {
	it('uses 27.5 hours per ECTS in Denmark', () => {
		expect(ectsToHours(YEAR_ECTS)).toBe(1650);
		expect(ectsToHours(7.5)).toBe(206.25);
		expect(hoursToEcts(1650)).toBe(60);
		expect(DK_HOURS).toBe(27.5);
	});
	it('supports other rates', () => {
		expect(ectsToHours(60, 25)).toBe(1500);
		expect(ectsToHours(60, 30)).toBe(1800);
		expect(() => hoursToEcts(10, 0)).toThrow(/above zero/);
	});
	it('spreads over weeks', () => {
		expect(weeklyHours(7.5, 15)).toBeCloseTo(13.75, 12);
		expect(() => weeklyHours(5, 0)).toThrow(/Weeks/);
	});
	it('parses numbers', () => {
		expect(parseNum('7,5', 'ECTS')).toBe(7.5);
		expect(() => parseNum('', 'ECTS')).toThrow(/Enter ECTS/);
		expect(() => parseNum('-1', 'ECTS')).toThrow(/0 or more/);
	});
});

describe('semester planner', () => {
	it('sums courses running in parallel', () => {
		const r = plan([
			{ name: 'A', ects: 7.5, weeks: 15 },
			{ name: 'B', ects: 7.5, weeks: 15 },
			{ name: 'C', ects: 15, weeks: 20 }
		]);
		expect(r.ects).toBe(30);
		expect(r.hours).toBe(825);
		expect(r.weekly).toBeCloseTo(13.75 * 2 + 20.625, 12);
		expect(r.semesterShare).toBe(1);
	});
	it('validates', () => {
		expect(() => plan([])).toThrow(/at least one/);
		expect(() => plan([{ name: 'X', ects: 5, weeks: 0 }])).toThrow(/X: weeks/);
	});
	it('formats and round-trips', () => {
		expect(fmt(1650)).toBe('1,650');
		expect(fmt(13.75)).toBe('13.8');
		const p = [{ name: 'Net|works', ects: '7.5', weeks: '15' }];
		expect(decodePlan(encodePlan(p))).toEqual([{ name: 'Net works', ects: '7.5', weeks: '15' }]);
	});
});
