/**
 * ECTS workload.
 *  ECTS Users' Guide 2015 (European Commission): 60 credits = one full-time academic year,
 *  1,500 to 1,800 hours, so 25 to 30 hours per credit.
 *  Denmark: 60 ECTS = one year of full-time study (the university education orders,
 *  uddannelsesbekendtgørelsen); 1 ECTS is reckoned as 27.5 hours, 1,650 hours a year, the
 *  figure used by the Ministry of Higher Education and Science and Danish universities.
 */

export const DK_HOURS = 27.5;
export const YEAR_ECTS = 60;
export const SEMESTER_ECTS = 30;

export function parseNum(raw: string, what: string): number {
	const s = raw.trim().replace(',', '.');
	if (!s) throw new Error(`Enter ${what}`);
	const n = Number(s);
	if (!Number.isFinite(n) || n < 0) throw new Error(`${what} must be a number, 0 or more`);
	return n;
}

export function ectsToHours(ects: number, perEcts = DK_HOURS): number {
	return ects * perEcts;
}

export function hoursToEcts(hours: number, perEcts = DK_HOURS): number {
	if (!(perEcts > 0)) throw new Error('Hours per ECTS must be above zero');
	return hours / perEcts;
}

export function weeklyHours(ects: number, weeks: number, perEcts = DK_HOURS): number {
	if (!(weeks > 0)) throw new Error('Weeks must be above zero');
	return ectsToHours(ects, perEcts) / weeks;
}

export interface PlanCourse {
	name: string;
	ects: number;
	weeks: number;
}

export interface PlanResult {
	ects: number;
	hours: number;
	/** Sum of each course's weekly load, as if all ran at the same time. */
	weekly: number;
	/** Share of a full-time semester (30 ECTS). */
	semesterShare: number;
	rows: { course: PlanCourse; hours: number; weekly: number }[];
}

export function plan(courses: PlanCourse[], perEcts = DK_HOURS): PlanResult {
	if (!courses.length) throw new Error('Add at least one course');
	const rows = courses.map((c) => {
		if (!(c.ects > 0)) throw new Error(`${c.name || 'A course'}: ECTS must be above zero`);
		if (!(c.weeks > 0)) throw new Error(`${c.name || 'A course'}: weeks must be above zero`);
		return {
			course: c,
			hours: ectsToHours(c.ects, perEcts),
			weekly: weeklyHours(c.ects, c.weeks, perEcts)
		};
	});
	const ects = rows.reduce((s, r) => s + r.course.ects, 0);
	return {
		ects,
		hours: ectsToHours(ects, perEcts),
		weekly: rows.reduce((s, r) => s + r.weekly, 0),
		semesterShare: ects / SEMESTER_ECTS,
		rows
	};
}

export function fmt(n: number, d = 1): string {
	return Number(n.toFixed(d)).toLocaleString('en-GB', { maximumFractionDigits: d });
}

export function encodePlan(cs: { name: string; ects: string; weeks: string }[]): string {
	return cs.map((c) => [c.name.replace(/[~|]/g, ' '), c.ects, c.weeks].join('~')).join('|');
}

export function decodePlan(s: string): { name: string; ects: string; weeks: string }[] {
	return s
		.split('|')
		.map((p) => p.split('~'))
		.filter((p) => p.length === 3)
		.map(([name, ects, weeks]) => ({ name, ects, weeks }));
}
