/**
 * Danish grading scales.
 *
 * 7-point scale and its descriptions: Bekendtgørelse om karakterskala og anden bedømmelse
 * (karakterbekendtgørelsen), BEK nr 114 af 03/02/2015, bilag 1. English names and the ECTS
 * equivalents as published by the Ministry of Higher Education and Science (ufm.dk,
 * "Karakterskalaen / The 7-point grading scale").
 *
 * 13-scale to 7-point conversion: the official table from the 2007 reform,
 * Bekendtgørelse om karakterskala og anden bedømmelse, BEK nr 262 af 20/03/2007, bilag 2
 * ("Omregning af karakterer"). It is the table used when averaging grades from both scales.
 */

export interface SevenGrade {
	/** Numeric value used in averages. */
	value: number;
	/** As written: 12, 10, 7, 4, 02, 00, -3. */
	label: string;
	ects: string;
	da: string;
	en: string;
	pass: boolean;
}

export const seven: SevenGrade[] = [
	{ value: 12, label: '12', ects: 'A', da: 'Fremragende', en: 'Excellent', pass: true },
	{ value: 10, label: '10', ects: 'B', da: 'Fortrinlig', en: 'Very good', pass: true },
	{ value: 7, label: '7', ects: 'C', da: 'God', en: 'Good', pass: true },
	{ value: 4, label: '4', ects: 'D', da: 'Jævn', en: 'Fair', pass: true },
	{ value: 2, label: '02', ects: 'E', da: 'Tilstrækkelig', en: 'Adequate', pass: true },
	{ value: 0, label: '00', ects: 'Fx', da: 'Utilstrækkelig', en: 'Inadequate', pass: false },
	{ value: -3, label: '-3', ects: 'F', da: 'Ringe', en: 'Unacceptable', pass: false }
];

/** 13-scale grade as written, and its official 7-point equivalent (label). */
export const thirteen: { label: string; value: number; to7: string }[] = [
	{ label: '13', value: 13, to7: '12' },
	{ label: '11', value: 11, to7: '12' },
	{ label: '10', value: 10, to7: '10' },
	{ label: '9', value: 9, to7: '7' },
	{ label: '8', value: 8, to7: '7' },
	{ label: '7', value: 7, to7: '4' },
	{ label: '6', value: 6, to7: '02' },
	{ label: '5', value: 5, to7: '00' },
	{ label: '03', value: 3, to7: '00' },
	{ label: '00', value: 0, to7: '-3' }
];

export const ectsLetters = ['A', 'B', 'C', 'D', 'E', 'Fx', 'F'];

export function findSeven(label: string): SevenGrade | undefined {
	const l = label.trim();
	return seven.find(
		(g) => g.label === l || (l === '2' && g.value === 2) || (l === '0' && g.value === 0)
	);
}

export type Scale = '7' | '13' | 'ects';

export interface Equivalent {
	seven: SevenGrade;
	/** 13-scale grades that convert to this 7-point grade. */
	from13: string[];
}

/** Looks a grade up on any scale and returns the 7-point grade it corresponds to. */
export function lookup(scale: Scale, label: string): Equivalent {
	const l = label.trim();
	let g: SevenGrade | undefined;
	if (scale === '7') g = findSeven(l);
	else if (scale === 'ects') g = seven.find((x) => x.ects.toLowerCase() === l.toLowerCase());
	else {
		const t = thirteen.find((x) => x.label === l || String(x.value) === l);
		if (t) g = findSeven(t.to7);
	}
	if (!g)
		throw new Error(
			`${label} is not a grade on the ${scale === 'ects' ? 'ECTS' : `${scale}-point`} scale`
		);
	return { seven: g, from13: thirteen.filter((t) => t.to7 === g.label).map((t) => t.label) };
}

export interface Course {
	name: string;
	ects: number;
	/** '12'..'-3' on the 7-point scale, '13:<grade>' for an old grade, 'pass' for bestået. */
	grade: string;
}

export interface Average {
	/** Unrounded weighted average on the 7-point scale. */
	exact: number;
	rounded: number;
	graded: number;
	passOnly: number;
	total: number;
}

/** 7-point value of a course grade, null for pass/fail courses. */
export function courseValue(grade: string): number | null {
	if (grade === 'pass') return null;
	if (grade.startsWith('13:')) {
		const t = thirteen.find((x) => x.label === grade.slice(3));
		if (!t) throw new Error(`Unknown 13-scale grade ${grade.slice(3)}`);
		return findSeven(t.to7)!.value;
	}
	const g = findSeven(grade);
	if (!g) throw new Error(`Unknown grade ${grade}`);
	return g.value;
}

/** Rounds half away from zero, avoiding binary artefacts like 8.905 -> 8.90. */
export function roundHalfUp(x: number, digits: number): number {
	const f = 10 ** digits;
	const r = Math.round(Math.abs(x) * f + 1e-9) / f;
	return x < 0 ? -r : r;
}

/**
 * ECTS-weighted average: sum(grade x ECTS) / sum(ECTS) over graded courses. Pass/fail courses
 * add to the credit total but not to the average.
 */
export function weightedAverage(courses: Course[]): Average {
	let sum = 0;
	let graded = 0;
	let passOnly = 0;
	for (const c of courses) {
		if (!(c.ects > 0)) throw new Error(`${c.name || 'A course'}: ECTS must be above zero`);
		const v = courseValue(c.grade);
		if (v === null) passOnly += c.ects;
		else {
			sum += v * c.ects;
			graded += c.ects;
		}
	}
	if (!graded) throw new Error('Add at least one graded course');
	const exact = sum / graded;
	return { exact, rounded: roundHalfUp(exact, 2), graded, passOnly, total: graded + passOnly };
}

export function encodeCourses(cs: { name: string; ects: string; grade: string }[]): string {
	return cs.map((c) => [c.name.replace(/[~|]/g, ' '), c.ects, c.grade].join('~')).join('|');
}

export function decodeCourses(s: string): { name: string; ects: string; grade: string }[] {
	return s
		.split('|')
		.map((p) => p.split('~'))
		.filter((p) => p.length === 3)
		.map(([name, ects, grade]) => ({ name, ects, grade }));
}
