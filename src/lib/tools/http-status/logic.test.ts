import { describe, expect, it } from 'vitest';
import { classes, statuses } from './data';
import { heuristicallyCacheable, search } from './logic';

const all = { query: '', cls: 0, nonStandard: true } as const;

describe('http status data', () => {
	it('has unique code + vendor pairs and valid classes', () => {
		const keys = statuses.map((s) => `${s.code}/${s.vendor ?? ''}`);
		expect(new Set(keys).size).toBe(keys.length);
		for (const s of statuses) {
			expect(s.code).toBeGreaterThanOrEqual(100);
			expect(s.code).toBeLessThanOrEqual(599);
			expect(classes[Math.floor(s.code / 100)]).toBeDefined();
			expect(s.meaning.length).toBeGreaterThan(5);
			expect(s.ref.length).toBeGreaterThan(2);
		}
	});

	it('contains the full IANA registry', () => {
		// IANA HTTP Status Code Registry, as of 2026
		const iana = [
			100, 101, 102, 103, 104, 200, 201, 202, 203, 204, 205, 206, 207, 208, 226, 300, 301, 302, 303,
			304, 305, 306, 307, 308, 400, 401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411, 412, 413,
			414, 415, 416, 417, 418, 421, 422, 423, 424, 425, 426, 428, 429, 431, 451, 500, 501, 502, 503,
			504, 505, 506, 507, 508, 510, 511
		];
		const std = statuses.filter((s) => !s.vendor).map((s) => s.code);
		expect(std.sort((a, b) => a - b)).toEqual(iana);
	});

	it('marks exactly the RFC 9110 §15.1 codes as heuristically cacheable', () => {
		const c = statuses.filter((s) => s.cacheable).map((s) => s.code);
		expect(c.sort((a, b) => a - b)).toEqual(heuristicallyCacheable);
	});

	it('uses current RFC 9110 names', () => {
		const name = (n: number) => statuses.find((s) => s.code === n && !s.vendor)?.name;
		expect(name(413)).toBe('Content Too Large');
		expect(name(422)).toBe('Unprocessable Content');
		expect(name(416)).toBe('Range Not Satisfiable');
	});

	it('labels non-standard codes', () => {
		const ns = statuses.filter((s) => s.vendor).map((s) => s.code);
		expect(ns).toEqual(expect.arrayContaining([444, 499, 520, 521, 522, 523, 524, 525, 526]));
	});
});

describe('search', () => {
	it('matches code prefixes', () => {
		expect(search(statuses, { ...all, query: '404' }).map((s) => s.code)).toEqual([404]);
		expect(search(statuses, { ...all, query: '50' }).map((s) => s.code)).toEqual([
			500, 501, 502, 503, 504, 505, 506, 507, 508
		]);
	});

	it('matches a class like 3xx', () => {
		const r = search(statuses, { ...all, query: '3xx' });
		expect(r.every((s) => s.code >= 300 && s.code < 400)).toBe(true);
		expect(r).toHaveLength(9);
	});

	it('matches words in any order', () => {
		expect(search(statuses, { ...all, query: 'rate limit' }).map((s) => s.code)).toEqual([429]);
		expect(search(statuses, { ...all, query: 'captive' }).map((s) => s.code)).toEqual([511]);
	});

	it('hides non-standard codes unless asked', () => {
		expect(search(statuses, { ...all, nonStandard: false, query: '499' })).toEqual([]);
		expect(search(statuses, { ...all, query: '499' })[0].vendor).toBe('nginx');
	});

	it('filters by class', () => {
		const r = search(statuses, { query: '', cls: 1, nonStandard: false });
		expect(r.map((s) => s.code)).toEqual([100, 101, 102, 103, 104]);
	});
});
