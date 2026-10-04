import { describe, expect, it } from 'vitest';
import { guessUnit, isoWeek, looksLikeTimestamp, parseInput, relative, toUnit } from './logic';

describe('timestamp', () => {
	it('reads seconds, ms, µs and ns', () => {
		const iso = '2023-11-14T22:13:20.000Z';
		for (const v of ['1700000000', '1700000000000', '1700000000000000', '1700000000000000000']) {
			expect(new Date(parseInput(v).ms).toISOString()).toBe(iso);
		}
		expect(guessUnit('1700000000000')).toBe('ms');
	});

	it('respects a forced unit', () => {
		expect(parseInput('1700000000', 'ms').ms).toBe(1700000000);
	});

	it('handles the epoch and negative values', () => {
		expect(new Date(parseInput('0').ms).toISOString()).toBe('1970-01-01T00:00:00.000Z');
		expect(new Date(parseInput('-86400').ms).toISOString()).toBe('1969-12-31T00:00:00.000Z');
	});

	it('parses ISO dates', () => {
		const p = parseInput('2026-10-04T12:00:00Z');
		expect(p.source.kind).toBe('date');
		expect(toUnit(p.ms, 's')).toBe('1791115200');
		expect(toUnit(p.ms, 'ns')).toBe('1791115200000000000');
	});

	it('floors negative seconds correctly', () => {
		expect(toUnit(-1500, 's')).toBe('-2');
	});

	it('computes ISO week numbers including year boundaries', () => {
		expect(isoWeek(Date.UTC(2026, 9, 4))).toEqual({ year: 2026, week: 40 });
		expect(isoWeek(Date.UTC(2021, 0, 3))).toEqual({ year: 2020, week: 53 });
		expect(isoWeek(Date.UTC(2024, 11, 30))).toEqual({ year: 2025, week: 1 });
		expect(isoWeek(Date.UTC(2026, 0, 1))).toEqual({ year: 2026, week: 1 });
	});

	it('formats relative time', () => {
		const now = Date.UTC(2026, 0, 1);
		expect(relative(now - 3 * 864e5, now)).toBe('3 days ago');
		expect(relative(now + 2 * 36e5, now)).toBe('in 2 hours');
	});

	it('rejects garbage', () => {
		expect(() => parseInput('next tuesday-ish')).toThrow(/Could not read/);
	});

	it('detects timestamps', () => {
		expect(looksLikeTimestamp('1700000000')).toBeGreaterThan(0.8);
		expect(looksLikeTimestamp('2026-10-04')).toBeGreaterThan(0.5);
		expect(looksLikeTimestamp('hello')).toBe(0);
	});
});
