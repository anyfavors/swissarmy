import { describe, expect, it } from 'vitest';
import {
	courseValue,
	decodeCourses,
	encodeCourses,
	lookup,
	roundHalfUp,
	seven,
	thirteen,
	weightedAverage
} from './logic';

describe('7-point scale and ECTS (UFM)', () => {
	it('maps every grade to its ECTS letter', () => {
		expect(seven.map((g) => `${g.label}=${g.ects}`)).toEqual([
			'12=A',
			'10=B',
			'7=C',
			'4=D',
			'02=E',
			'00=Fx',
			'-3=F'
		]);
	});
	it('looks up from any scale', () => {
		expect(lookup('ects', 'c').seven.label).toBe('7');
		expect(lookup('7', '2').seven.ects).toBe('E');
		expect(lookup('7', '12').from13).toEqual(['13', '11']);
		expect(lookup('13', '03').seven.label).toBe('00');
		expect(() => lookup('7', '11')).toThrow(/not a grade on the 7-point scale/);
		expect(() => lookup('ects', 'G')).toThrow(/ECTS/);
	});
});

describe('13-scale conversion (BEK 262 of 2007)', () => {
	it('matches the official table', () => {
		expect(thirteen.map((t) => `${t.label}>${t.to7}`).join(' ')).toBe(
			'13>12 11>12 10>10 9>7 8>7 7>4 6>02 5>00 03>00 00>-3'
		);
		expect(courseValue('13:8')).toBe(7);
		expect(() => courseValue('13:12')).toThrow(/Unknown 13-scale/);
	});
});

describe('weighted average', () => {
	it('weights by ECTS and rounds to 2 decimals', () => {
		const a = weightedAverage([
			{ name: 'A', ects: 7.5, grade: '12' },
			{ name: 'B', ects: 15, grade: '7' },
			{ name: 'C', ects: 5, grade: '10' }
		]);
		expect(a.exact).toBeCloseTo(245 / 27.5, 12);
		expect(a.rounded).toBe(8.91);
	});
	it('leaves pass/fail courses out of the average', () => {
		const a = weightedAverage([
			{ name: 'Thesis', ects: 30, grade: '10' },
			{ name: 'Internship', ects: 15, grade: 'pass' }
		]);
		expect(a.rounded).toBe(10);
		expect([a.graded, a.passOnly, a.total]).toEqual([30, 15, 45]);
	});
	it('mixes old and new grades through the table', () => {
		const a = weightedAverage([
			{ name: 'Old', ects: 10, grade: '13:11' },
			{ name: 'New', ects: 10, grade: '7' }
		]);
		expect(a.rounded).toBe(9.5);
	});
	it('validates', () => {
		expect(() => weightedAverage([])).toThrow(/graded course/);
		expect(() => weightedAverage([{ name: 'X', ects: 0, grade: '7' }])).toThrow(/ECTS/);
		expect(() => weightedAverage([{ name: 'X', ects: 5, grade: '11' }])).toThrow(/Unknown grade/);
	});
	it('rounds half up', () => {
		expect(roundHalfUp(8.905, 2)).toBe(8.91);
		expect(roundHalfUp(1.005, 2)).toBe(1.01);
		expect(roundHalfUp(-1.005, 2)).toBe(-1.01);
	});
	it('round-trips courses through the URL form', () => {
		const cs = [
			{ name: 'Networks | 1', ects: '7.5', grade: '12' },
			{ name: 'Old', ects: '5', grade: '13:9' }
		];
		expect(decodeCourses(encodeCourses(cs))).toEqual([
			{ name: 'Networks   1', ects: '7.5', grade: '12' },
			{ name: 'Old', ects: '5', grade: '13:9' }
		]);
	});
});
