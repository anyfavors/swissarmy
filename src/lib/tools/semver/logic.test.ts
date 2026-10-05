import { describe, expect, it } from 'vitest';
import {
	checkList,
	compare,
	explainRange,
	increments,
	looksLikeSemver,
	maxSatisfying,
	parse,
	parseRange,
	prereleaseNote,
	satisfies,
	sort
} from './logic';

const ok = (v: string, r: string) => satisfies(parse(v), parseRange(r));

describe('parse (SemVer 2.0.0)', () => {
	it('splits all parts', () => {
		const v = parse('1.0.0-alpha.1+build.5.sha-1f2e');
		expect(v).toMatchObject({
			major: 1,
			minor: 0,
			patch: 0,
			prerelease: ['alpha', 1],
			build: ['build', '5', 'sha-1f2e'],
			version: '1.0.0-alpha.1'
		});
	});

	it('accepts a leading v like npm', () => {
		expect(parse('v2.3.4').version).toBe('2.3.4');
	});

	it.each([
		['1.2', /three parts/],
		['01.2.3', /leading zeros/],
		['1.2.3-01', /leading zeros/],
		['1.2.3-', /empty pre-release/],
		['1.2.3-a..b', /empty pre-release/],
		['1.2.3_x', /only 0-9/],
		['banana', /does not start/],
		['1.2.99999999999999999', /too large/]
	])('rejects %s', (input, msg) => {
		expect(() => parse(input)).toThrow(msg);
	});
});

describe('precedence (SemVer 2.0.0 §11)', () => {
	it('orders the spec example', () => {
		const spec = [
			'1.0.0-alpha',
			'1.0.0-alpha.1',
			'1.0.0-alpha.beta',
			'1.0.0-beta',
			'1.0.0-beta.2',
			'1.0.0-beta.11',
			'1.0.0-rc.1',
			'1.0.0'
		];
		const shuffled = [...spec].reverse().map(parse);
		expect(sort(shuffled).map((v) => v.version)).toEqual(spec);
	});

	it('orders the core example 1.0.0 < 2.0.0 < 2.1.0 < 2.1.1', () => {
		const l = ['2.1.1', '1.0.0', '2.1.0', '2.0.0'].map(parse);
		expect(sort(l).map((v) => v.version)).toEqual(['1.0.0', '2.0.0', '2.1.0', '2.1.1']);
	});

	it('ignores build metadata', () => {
		expect(compare(parse('1.0.0+a'), parse('1.0.0+b'))).toBe(0);
	});

	it('compares numerically, not as text', () => {
		expect(compare(parse('1.10.0'), parse('1.9.0'))).toBe(1);
	});
});

describe('ranges, node-semver README', () => {
	it.each([
		['^1.2.3', '>=1.2.3 <2.0.0-0'],
		['^0.2.3', '>=0.2.3 <0.3.0-0'],
		['^0.0.3', '>=0.0.3 <0.0.4-0'],
		['^1.2.3-beta.2', '>=1.2.3-beta.2 <2.0.0-0'],
		['^0.0.3-beta', '>=0.0.3-beta <0.0.4-0'],
		['^1.2.x', '>=1.2.0 <2.0.0-0'],
		['^0.0.x', '>=0.0.0 <0.1.0-0'],
		['^0.0', '>=0.0.0 <0.1.0-0'],
		['^1.x', '>=1.0.0 <2.0.0-0'],
		['^0.x', '>=0.0.0 <1.0.0-0'],
		['~1.2.3', '>=1.2.3 <1.3.0-0'],
		['~1.2', '>=1.2.0 <1.3.0-0'],
		['~1', '>=1.0.0 <2.0.0-0'],
		['~0.2.3', '>=0.2.3 <0.3.0-0'],
		['~0.2', '>=0.2.0 <0.3.0-0'],
		['~0', '>=0.0.0 <1.0.0-0'],
		['~1.2.3-beta.2', '>=1.2.3-beta.2 <1.3.0-0'],
		['1.2.3 - 2.3.4', '>=1.2.3 <=2.3.4'],
		['1.2 - 2.3.4', '>=1.2.0 <=2.3.4'],
		['1.2.3 - 2.3', '>=1.2.3 <2.4.0-0'],
		['1.2.3 - 2', '>=1.2.3 <3.0.0-0'],
		['*', '>=0.0.0'],
		['', '>=0.0.0'],
		['1.x', '>=1.0.0 <2.0.0-0'],
		['1.2.x', '>=1.2.0 <1.3.0-0'],
		['1', '>=1.0.0 <2.0.0-0'],
		['1.2', '>=1.2.0 <1.3.0-0'],
		['>=1.2.7 <1.3.0', '>=1.2.7 <1.3.0'],
		['1.2.7 || >=1.2.9 <2.0.0', '1.2.7 || >=1.2.9 <2.0.0'],
		['>= 1.2.3', '>=1.2.3'],
		['>1', '>=2.0.0'],
		['<=1.2', '<1.3.0-0'],
		['<1.2', '<1.2.0-0']
	])('%s := %s', (range, expected) => {
		expect(parseRange(range).text).toBe(expected);
	});

	it('matches the README examples', () => {
		// >=1.2.7 <1.3.0
		expect(ok('1.2.7', '>=1.2.7 <1.3.0')).toBe(true);
		expect(ok('1.2.8', '>=1.2.7 <1.3.0')).toBe(true);
		expect(ok('1.2.99', '>=1.2.7 <1.3.0')).toBe(true);
		expect(ok('1.2.6', '>=1.2.7 <1.3.0')).toBe(false);
		expect(ok('1.3.0', '>=1.2.7 <1.3.0')).toBe(false);
		expect(ok('1.1.0', '>=1.2.7 <1.3.0')).toBe(false);
		// 1.2.7 || >=1.2.9 <2.0.0
		const r = '1.2.7 || >=1.2.9 <2.0.0';
		expect(['1.2.7', '1.2.9', '1.4.6'].every((v) => ok(v, r))).toBe(true);
		expect(['1.2.8', '2.0.0'].some((v) => ok(v, r))).toBe(false);
	});

	it('applies the pre-release rule', () => {
		// README: >1.2.3-alpha.3 allows 1.2.3-alpha.7 but not 3.4.5-alpha.9
		expect(ok('1.2.3-alpha.7', '>1.2.3-alpha.3')).toBe(true);
		expect(ok('3.4.5-alpha.9', '>1.2.3-alpha.3')).toBe(false);
		expect(ok('3.4.5', '>1.2.3-alpha.3')).toBe(true);
		expect(ok('1.2.4-beta', '^1.2.3')).toBe(false);
		expect(ok('1.2.3-beta.4', '^1.2.3-beta.2')).toBe(true);
		expect(ok('1.2.4-beta.2', '^1.2.3-beta.2')).toBe(false);
		expect(ok('2.0.0-rc.1', '^1.2.3')).toBe(false);
		expect(satisfies(parse('1.2.4-beta'), parseRange('^1.2.3'), true)).toBe(true);
	});

	it('handles caret on 0.x as the task example says', () => {
		expect(ok('0.2.3', '^0.2.3')).toBe(true);
		expect(ok('0.2.9', '^0.2.3')).toBe(true);
		expect(ok('0.3.0', '^0.2.3')).toBe(false);
		expect(explainRange(parseRange('^0.2.3'))).toEqual([
			'At least 0.2.3 and below 0.3.0, no 0.3.0 pre-releases'
		]);
	});

	it('rejects broken ranges', () => {
		expect(() => parseRange('>=a.b')).toThrow(/not a version/);
		expect(() => parseRange('1.2.3 ||')).toThrow(/Empty side/);
		expect(() => parseRange('>=>1.2.3')).toThrow(/two operators/);
	});

	it('notes pre-release behaviour', () => {
		expect(prereleaseNote(parseRange('^1.2.3'))).toMatch(/never match/);
		expect(prereleaseNote(parseRange('^1.2.3-beta.2'))).toBe('Pre-releases match only on 1.2.3.');
	});
});

describe('lists', () => {
	it('sorts, checks and finds the best match', () => {
		const l = checkList('1.3.0, 1.2.10\n1.2.9 nope 2.0.0 1.2.3-rc.1', parseRange('~1.2'));
		expect(l.map((c) => c.input)).toEqual([
			'1.2.3-rc.1',
			'1.2.9',
			'1.2.10',
			'1.3.0',
			'2.0.0',
			'nope'
		]);
		expect(l.map((c) => c.ok)).toEqual([false, true, true, false, false, undefined]);
		expect(l[5].error).toMatch(/does not start/);
		expect(maxSatisfying(l)?.version).toBe('1.2.10');
	});

	it('computes increments', () => {
		expect(increments(parse('1.2.3'))).toEqual({ major: '2.0.0', minor: '1.3.0', patch: '1.2.4' });
		expect(increments(parse('2.0.0-rc.1'))).toEqual({
			major: '2.0.0',
			minor: '2.0.0',
			patch: '2.0.0'
		});
	});

	it('detects versions and ranges', () => {
		expect(looksLikeSemver('^1.2.3')).toBeGreaterThan(0.7);
		expect(looksLikeSemver('1.0.0-beta.1')).toBeGreaterThan(0.6);
		expect(looksLikeSemver('1.2.3')).toBe(0.5);
		expect(looksLikeSemver('2026.10.05')).toBeLessThan(0.3);
		expect(looksLikeSemver('192.168.1.1')).toBe(0);
		expect(looksLikeSemver('hello')).toBe(0);
	});
});
