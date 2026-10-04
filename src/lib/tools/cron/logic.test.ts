import { describe as group, expect, it } from 'vitest';
import {
	checkZone,
	compact,
	describe,
	instantsFor,
	looksLikeCron,
	nextRuns,
	ordinal,
	parseCron,
	type Schedule
} from './logic';

const S = (s: string) => parseCron(s) as Schedule;
const iso = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z');
const runs = (expr: string, zone: string, from: string, n = 5) =>
	nextRuns(S(expr), zone, Date.parse(from), n).runs.map((r) => iso(r.instant));

group('parseCron', () => {
	it('expands fields', () => {
		const p = S('*/15 0-6/2 1,15 JAN-MAR mon-fri');
		expect(p.minute.values).toEqual([0, 15, 30, 45]);
		expect(p.hour.values).toEqual([0, 2, 4, 6]);
		expect(p.dom.values).toEqual([1, 15]);
		expect(p.month.values).toEqual([1, 2, 3]);
		expect(p.dow.values).toEqual([1, 2, 3, 4, 5]);
		expect(p.hasSeconds).toBe(false);
	});

	it('folds 7 into Sunday and reads start/step', () => {
		expect(S('0 0 * * 7').dow.values).toEqual([0]);
		expect(S('0 0 * * 5-7').dow.values).toEqual([0, 5, 6]);
		expect(S('5/20 * * * *').minute.values).toEqual([5, 25, 45]);
		expect(S('1-30/5 * * * *').minute.values).toEqual([1, 6, 11, 16, 21, 26]);
	});

	it('expands macros', () => {
		const p = S('@weekly');
		expect(p.macro).toBe('@weekly');
		expect([p.minute.values, p.hour.values, p.dow.values]).toEqual([[0], [0], [0]]);
		expect(S('@annually').month.values).toEqual([1]);
		expect(parseCron('@reboot')).toEqual({ kind: 'reboot', command: undefined });
		expect(() => parseCron('@fortnightly')).toThrow('Unknown macro');
	});

	it('reads 6 fields as seconds first', () => {
		const p = S('30 */5 * * * *');
		expect(p.hasSeconds).toBe(true);
		expect(p.second.values).toEqual([30]);
		expect(p.minute.values[1]).toBe(5);
	});

	it('splits off a crontab command', () => {
		const p = S('0 5 * * 1 /usr/local/bin/backup --full');
		expect(p.command).toBe('/usr/local/bin/backup --full');
		expect(S('0 5 * * * backup.sh').command).toBe('backup.sh');
	});

	it('accepts Quartz ? in day fields', () => {
		const p = S('0 0 12 ? * MON');
		expect(p.dom.starLike).toBe(true);
		expect(p.dow.values).toEqual([1]);
	});

	it('gives clear errors', () => {
		expect(() => parseCron('')).toThrow('Enter a cron expression');
		expect(() => parseCron('* * *')).toThrow('Expected 5 fields');
		expect(() => parseCron('60 * * * *')).toThrow('Minute: 60 is out of range 0-59');
		expect(() => parseCron('* 24 * * *')).toThrow('Hour: 24 is out of range 0-23');
		expect(() => parseCron('* * 0 * *')).toThrow('Day of month: 0 is out of range 1-31');
		expect(() => parseCron('* * * 13 *')).toThrow('Month: 13 is out of range 1-12');
		expect(() => parseCron('* * * * 8')).toThrow('Day of week: 8 is out of range 0-7');
		expect(() => parseCron('*/0 * * * *')).toThrow('step must be 1 or more');
		expect(() => parseCron('30-10 * * * *')).toThrow('runs backwards');
		expect(() => parseCron('* * * FOO *')).toThrow('not a number or a name');
		expect(() => parseCron('1,,2 * * * *')).toThrow('empty element');
		expect(() => parseCron('0 0 L * ?')).toThrow('Quartz L');
		expect(() => parseCron('0 0 15W * ?')).toThrow('Quartz L');
		expect(() => parseCron('0 0 ? * 6#3')).toThrow('Quartz #');
		expect(() => parseCron('0 0 ? * 5L')).toThrow('Quartz L');
		expect(() => parseCron('H * * * *')).toThrow('Jenkins');
		expect(() => parseCron('? * * * *')).toThrow('only allowed in the day');
		expect(() => parseCron('0 0 12 * * ? 2026')).toThrow('Quartz with a year');
	});
});

group('describe', () => {
	it.each([
		['* * * * *', 'At every minute.'],
		['*/15 * * * *', 'At every 15th minute.'],
		[
			'0 8-18/2 * * 1-5',
			'At minute 0 past every 2nd hour from 8 through 18 on Monday through Friday.'
		],
		['30 8 * * *', 'At 08:30.'],
		['0 9,17 * * MON-FRI', 'At 09:00 and 17:00 on Monday through Friday.'],
		['0 0 1 * *', 'At 00:00 on day-of-month 1.'],
		['0 0 1,15 * 1', 'At 00:00 on day-of-month 1 and 15 or on Monday.'],
		['0 0 */2 * 1', 'At 00:00 on every 2nd day-of-month on Monday.'],
		['5 4 * * 0', 'At 04:05 on Sunday.'],
		['0 0 1 1 *', 'At 00:00 on day-of-month 1 in January.'],
		['0 12 * 1-6/2 *', 'At 12:00 in every 2nd month from January through June.'],
		['1-30/5 3 * * *', 'At every 5th minute from 1 through 30 past hour 3.'],
		['* 5 * * *', 'At every minute past hour 5.'],
		['0 */3 * * 1,3,5', 'At minute 0 past every 3rd hour on Monday, Wednesday, and Friday.'],
		['15 10 * * * *', 'At second 15 past minute 10.'],
		['*/10 * * * * *', 'At every 10th second.'],
		['0 30 8 * * *', 'At 08:30.'],
		['5 30 8 * * *', 'At 08:30:05.']
	])('%s', (expr, text) => {
		expect(describe(parseCron(expr))).toBe(text);
	});

	it('explains @reboot', () => {
		expect(describe(parseCron('@reboot'))).toMatch(/daemon starts/);
	});

	it('writes ordinals and compact lists', () => {
		expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal).join(' ')).toBe(
			'1st 2nd 3rd 4th 11th 12th 13th 21st 22nd 101st'
		);
		expect(compact(S('0,1,2,5,10-12 * * * *').minute)).toBe('0-2, 5, 10-12');
		expect(compact(S('* * * * 1-5').dow)).toBe('Mon-Fri');
		expect(compact(S('* * * * *').minute)).toBe('every value');
	});
});

group('nextRuns in UTC', () => {
	it('lists the next runs', () => {
		expect(runs('*/15 * * * *', 'UTC', '2026-10-04T12:07:00Z', 3)).toEqual([
			'2026-10-04T12:15:00Z',
			'2026-10-04T12:30:00Z',
			'2026-10-04T12:45:00Z'
		]);
		expect(runs('0 9 * * 1-5', 'UTC', '2026-10-02T10:00:00Z', 2)).toEqual([
			'2026-10-05T09:00:00Z',
			'2026-10-06T09:00:00Z'
		]);
	});

	it('is strictly after the start', () => {
		expect(runs('0 12 * * *', 'UTC', '2026-10-04T12:00:00Z', 1)).toEqual(['2026-10-05T12:00:00Z']);
	});

	it('finds leap days', () => {
		expect(runs('0 0 29 2 *', 'UTC', '2026-10-04T00:00:00Z', 2)).toEqual([
			'2028-02-29T00:00:00Z',
			'2032-02-29T00:00:00Z'
		]);
	});

	it('reports a schedule that never runs', () => {
		const r = nextRuns(S('0 0 30 2 *'), 'UTC', Date.parse('2026-01-01T00:00:00Z'));
		expect(r.runs).toEqual([]);
		expect(r.exhausted).toBe(true);
	});

	it('ORs day-of-month and day-of-week when both are restricted', () => {
		// 1st of the month OR any Friday, October 2026 (1 Oct is a Thursday).
		expect(runs('0 0 1 * 5', 'UTC', '2026-09-30T12:00:00Z', 4)).toEqual([
			'2026-10-01T00:00:00Z',
			'2026-10-02T00:00:00Z',
			'2026-10-09T00:00:00Z',
			'2026-10-16T00:00:00Z'
		]);
	});

	it('ANDs them when one starts with *, like Vixie cron', () => {
		// Odd days that are also Fridays.
		expect(runs('0 0 */2 * 5', 'UTC', '2026-10-01T00:00:00Z', 3)).toEqual([
			'2026-10-09T00:00:00Z',
			'2026-10-23T00:00:00Z',
			'2026-11-13T00:00:00Z'
		]);
	});

	it('handles seconds', () => {
		expect(runs('*/20 * * * * *', 'UTC', '2026-10-04T12:00:05Z', 3)).toEqual([
			'2026-10-04T12:00:20Z',
			'2026-10-04T12:00:40Z',
			'2026-10-04T12:01:00Z'
		]);
	});
});

group('nextRuns across DST in Europe/Copenhagen', () => {
	const cph = 'Europe/Copenhagen';

	it('finds zero, one or two instants for a wall time', () => {
		expect(instantsFor(Date.UTC(2026, 2, 29, 2, 30), cph)).toEqual([]);
		expect(instantsFor(Date.UTC(2026, 9, 25, 2, 30), cph).map(iso)).toEqual([
			'2026-10-25T00:30:00Z',
			'2026-10-25T01:30:00Z'
		]);
		expect(instantsFor(Date.UTC(2026, 5, 1, 12, 0), cph).map(iso)).toEqual([
			'2026-06-01T10:00:00Z'
		]);
	});

	it('moves a run in the spring gap to 03:00 (29 March 2026)', () => {
		const r = nextRuns(S('30 2 * * *'), cph, Date.parse('2026-03-27T12:00:00Z'), 3).runs;
		expect(r.map((x) => iso(x.instant))).toEqual([
			'2026-03-28T01:30:00Z', // 02:30 CET
			'2026-03-29T01:00:00Z', // 02:30 does not exist, runs 03:00 CEST
			'2026-03-30T00:30:00Z' // 02:30 CEST
		]);
		expect(r[1].wall).toBe('2026-03-29 03:00:00');
		expect(r[1].offset).toBe('+02:00');
		expect(r[1].dst).toEqual({ kind: 'gap', scheduled: '2026-03-29 02:30:00' });
		expect(r[0].offset).toBe('+01:00');
	});

	it('merges gap runs that land on the same instant', () => {
		expect(runs('*/30 * * * *', cph, '2026-03-29T00:15:00Z', 4)).toEqual([
			'2026-03-29T00:30:00Z', // 01:30 CET
			'2026-03-29T01:00:00Z', // 02:00, 02:30 and 03:00 all map to 03:00 CEST
			'2026-03-29T01:30:00Z',
			'2026-03-29T02:00:00Z'
		]);
	});

	it('runs a repeated time once, at the first occurrence (25 October 2026)', () => {
		const r = nextRuns(S('30 2 * * *'), cph, Date.parse('2026-10-24T12:00:00Z'), 2).runs;
		expect(r.map((x) => iso(x.instant))).toEqual([
			'2026-10-25T00:30:00Z', // 02:30 CEST, the first 02:30
			'2026-10-26T01:30:00Z' // 02:30 CET
		]);
		expect(r[0].dst?.kind).toBe('overlap');
		expect(r[0].offset).toBe('+02:00');
		expect(runs('0 * * * *', cph, '2026-10-24T23:30:00Z', 4)).toEqual([
			'2026-10-25T00:00:00Z', // 02:00 CEST
			'2026-10-25T02:00:00Z', // 03:00 CET; the second 02:00 is skipped
			'2026-10-25T03:00:00Z',
			'2026-10-25T04:00:00Z'
		]);
	});
});

group('zones and intake', () => {
	it('validates zones', () => {
		expect(checkZone('Europe/Copenhagen')).toBe('Europe/Copenhagen');
		expect(() => checkZone('Mars/Olympus')).toThrow('Unknown time zone');
	});

	it('detects cron lines conservatively', () => {
		expect(looksLikeCron('*/15 * * * *')).toBe(0.9);
		expect(looksLikeCron('0 30 8 * * MON-FRI')).toBe(0.9);
		expect(looksLikeCron('@daily')).toBe(0.9);
		expect(looksLikeCron('1 2 3 4 5')).toBeLessThan(0.5);
		expect(looksLikeCron('hello there my old friend')).toBe(0);
		expect(looksLikeCron('1700000000')).toBe(0);
		expect(looksLikeCron('192.168.0.0/16')).toBe(0);
	});
});
