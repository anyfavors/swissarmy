/*
 * Calendar arithmetic on day numbers (days since 1970-01-01, UTC). Working in whole
 * UTC days means no time zone or DST can shift a date by one.
 */

const DAY_MS = 864e5;

export const weekdayNames = [
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday',
	'Sunday'
];

export function dayNumber(y: number, m: number, d: number): number {
	const t = new Date(0);
	t.setUTCFullYear(y, m - 1, d);
	return Math.round(t.getTime() / DAY_MS);
}

export function civil(day: number): { y: number; m: number; d: number } {
	const t = new Date(day * DAY_MS);
	return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

export function daysInMonth(y: number, m: number): number {
	return civil(dayNumber(y, m + 1, 1) - 1).d;
}

/** Monday = 0 ... Sunday = 6. Day 0 (1970-01-01) was a Thursday. */
export function weekday(day: number): number {
	return (((day + 3) % 7) + 7) % 7;
}

/** Adds calendar months, clamping to the last day of the target month (Jan 31 + 1 = Feb 28/29). */
export function addMonths(day: number, n: number): number {
	const { y, m, d } = civil(day);
	const total = y * 12 + (m - 1) + n;
	const ny = Math.floor(total / 12);
	const nm = total - ny * 12 + 1;
	return dayNumber(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export function formatDate(day: number): string {
	const { y, m, d } = civil(day);
	return `${y < 0 ? '-' : ''}${pad(Math.abs(y), 4)}-${pad(m)}-${pad(d)}`;
}

export function formatTime(secs: number): string {
	const whole = Math.floor(secs);
	const frac = Math.round((secs - whole) * 1000);
	const base = `${pad(Math.floor(whole / 3600))}:${pad(Math.floor(whole / 60) % 60)}:${pad(whole % 60)}`;
	return frac ? `${base}.${pad(frac, 3)}` : base;
}

/** Today in the browser's local calendar, as a day number. */
export function todayDay(): number {
	const n = new Date();
	return dayNumber(n.getFullYear(), n.getMonth() + 1, n.getDate());
}

/** Today in the browser's local calendar, as YYYY-MM-DD. */
export function todayIso(): string {
	return formatDate(todayDay());
}

export interface DateTime {
	day: number;
	/** Seconds since midnight. */
	secs: number;
	hasTime: boolean;
}

/**
 * Reads YYYY-MM-DD with an optional time (T or space, HH:MM or HH:MM:SS, optional
 * fraction and a trailing Z, which is ignored). Also accepts "today".
 */
export function parseDateTime(raw: string, today?: number): DateTime {
	const s = raw.trim();
	if (!s) throw new Error('Enter a date as YYYY-MM-DD');
	if (/^today$/i.test(s)) {
		return { day: today ?? todayDay(), secs: 0, hasTime: false };
	}
	const m =
		/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,3})\d*)?)?Z?)?$/i.exec(
			s
		);
	if (!m) {
		if (/[T ]\d{1,2}:\d{2}.*[+-]\d{2}:?\d{2}$/.test(s))
			throw new Error('Time zone offsets are not used here. Enter the local wall-clock time.');
		throw new Error(`Could not read "${s}". Use YYYY-MM-DD, optionally with HH:MM or HH:MM:SS`);
	}
	const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
	if (y < 1) throw new Error('Year must be 0001 or later');
	if (mo < 1 || mo > 12) throw new Error(`Month ${mo} does not exist`);
	const dim = daysInMonth(y, mo);
	if (d < 1 || d > dim)
		throw new Error(`${formatDate(dayNumber(y, mo, 1)).slice(0, 7)} has ${dim} days, not ${d}`);
	let secs = 0;
	if (m[4] !== undefined) {
		const [h, mi, se] = [Number(m[4]), Number(m[5]), Number(m[6] ?? 0)];
		if (h > 23) throw new Error(`Hour ${h} is out of range 0-23`);
		if (mi > 59) throw new Error(`Minute ${mi} is out of range 0-59`);
		if (se > 59) throw new Error(`Second ${se} is out of range 0-59`);
		secs = h * 3600 + mi * 60 + se + (m[7] ? Number(m[7].padEnd(3, '0')) / 1000 : 0);
	}
	return { day: dayNumber(y, mo, d), secs, hasTime: m[4] !== undefined };
}

/* ---------- Easter and Danish holidays ---------- */

/** Easter Sunday, anonymous Gregorian algorithm (Meeus/Jones/Butcher). */
export function easter(year: number): { month: number; day: number } {
	const a = year % 19;
	const b = Math.floor(year / 100);
	const c = year % 100;
	const d = Math.floor(b / 4);
	const e = b % 4;
	const f = Math.floor((b + 8) / 25);
	const g = Math.floor((b - f + 1) / 3);
	const h = (19 * a + b - d - g + 15) % 30;
	const i = Math.floor(c / 4);
	const k = c % 4;
	const l = (32 + 2 * e + 2 * i - h - k) % 7;
	const m = Math.floor((a + 11 * h + 22 * l) / 451);
	const month = Math.floor((h + l - 7 * m + 114) / 31);
	const day = ((h + l - 7 * m + 114) % 31) + 1;
	return { month, day };
}

export type ExtraDayOff = 'grundlovsdag' | 'juleaften' | 'nytaarsaften';

export interface HolidayOptions {
	/** Official Danish public holidays (helligdage). */
	publicHolidays: boolean;
	/** Common days off that are not public holidays. */
	extra: Partial<Record<ExtraDayOff, boolean>>;
}

export interface Holiday {
	day: number;
	name: string;
	/** Undefined for official public holidays. */
	extra?: ExtraDayOff;
}

const cache = new Map<number, Holiday[]>();

/** All candidate days off in a year, official ones and the optional extras, sorted by date. */
function allHolidays(year: number): Holiday[] {
	const hit = cache.get(year);
	if (hit) return hit;
	const list: Holiday[] = [];
	const fixed = (m: number, d: number, name: string, extra?: ExtraDayOff) =>
		list.push({ day: dayNumber(year, m, d), name, extra });
	fixed(1, 1, 'Nytårsdag (New Year)');
	if (year >= 1583) {
		const e = easter(year);
		const es = dayNumber(year, e.month, e.day);
		const rel = (n: number, name: string) => list.push({ day: es + n, name });
		rel(-3, 'Skærtorsdag (Maundy Thursday)');
		rel(-2, 'Langfredag (Good Friday)');
		rel(0, 'Påskedag (Easter Sunday)');
		rel(1, '2. påskedag (Easter Monday)');
		if (year <= 2023) rel(26, 'Store Bededag (Great Prayer Day)');
		rel(39, 'Kristi himmelfartsdag (Ascension)');
		rel(49, 'Pinsedag (Whit Sunday)');
		rel(50, '2. pinsedag (Whit Monday)');
	}
	fixed(6, 5, 'Grundlovsdag (Constitution Day)', 'grundlovsdag');
	fixed(12, 24, 'Juleaften (Christmas Eve)', 'juleaften');
	fixed(12, 25, 'Juledag (Christmas Day)');
	fixed(12, 26, '2. juledag (Boxing Day)');
	fixed(12, 31, 'Nytårsaftensdag (New Year’s Eve)', 'nytaarsaften');
	list.sort((a, b) => a.day - b.day);
	cache.set(year, list);
	return list;
}

function wanted(h: Holiday, opts: HolidayOptions): boolean {
	return h.extra ? !!opts.extra[h.extra] : opts.publicHolidays;
}

/** Danish holidays (and chosen extra days off) in a year, sorted. */
export function danishHolidays(year: number, opts: HolidayOptions): Holiday[] {
	return allHolidays(year).filter((h) => wanted(h, opts));
}

/** Holidays in [from, toExclusive). Two holidays on one date (2. pinsedag on 5 June) are both listed. */
export function holidaysBetween(
	from: number,
	toExclusive: number,
	opts: HolidayOptions
): Holiday[] {
	if (toExclusive <= from) return [];
	const out: Holiday[] = [];
	const y0 = civil(from).y;
	const y1 = civil(toExclusive - 1).y;
	for (let y = y0; y <= y1; y++) {
		for (const h of danishHolidays(y, opts)) if (h.day >= from && h.day < toExclusive) out.push(h);
	}
	return out;
}

export function isHoliday(day: number, opts: HolidayOptions): boolean {
	return danishHolidays(civil(day).y, opts).some((h) => h.day === day);
}

/** True for Saturdays, Sundays and the selected holidays. */
export function isDayOff(day: number, opts: HolidayOptions): boolean {
	return weekday(day) >= 5 || isHoliday(day, opts);
}

/** Number of Mondays to Fridays in [from, toExclusive). */
export function countWeekdays(from: number, toExclusive: number): number {
	const n = toExclusive - from;
	if (n <= 0) return 0;
	let count = Math.floor(n / 7) * 5;
	for (let d = from + Math.floor(n / 7) * 7; d < toExclusive; d++) if (weekday(d) < 5) count++;
	return count;
}

/* ---------- Difference ---------- */

export interface DiffOptions extends HolidayOptions {
	/** Count the end date as a full day. */
	inclusive: boolean;
}

export interface DiffResult {
	/** End is before start; all figures are magnitudes. */
	negative: boolean;
	years: number;
	months: number;
	days: number;
	hours: number;
	minutes: number;
	seconds: number;
	totalSeconds: number;
	/** Weekdays (Mon to Fri) in the date range. */
	weekdays: number;
	weekendDays: number;
	/** Weekdays that are not holidays. */
	workingDays: number;
	/** Holidays and selected days off in the date range, including those on weekends. */
	holidays: Holiday[];
	/** First and last calendar date counted (inclusive), after ordering. */
	from: number;
	toExclusive: number;
}

/** Whole years, months and days from a to b (a <= b), so that addMonths(a, months) + days = b. */
export function calendarDiff(
	a: number,
	b: number
): { years: number; months: number; days: number } {
	const ca = civil(a);
	const cb = civil(b);
	let months = (cb.y - ca.y) * 12 + (cb.m - ca.m);
	if (addMonths(a, months) > b) months--;
	const days = b - addMonths(a, months);
	return { years: Math.floor(months / 12), months: months % 12, days };
}

export function dateDiff(start: DateTime, end: DateTime, opts: DiffOptions): DiffResult {
	let a = { day: start.day, secs: start.secs };
	let b = { day: end.day + (opts.inclusive ? 1 : 0), secs: end.secs };
	const negative = b.day < a.day || (b.day === a.day && b.secs < a.secs);
	if (negative) [a, b] = [b, a];
	const totalSeconds = (b.day - a.day) * 86400 + (b.secs - a.secs);
	let endDay = b.day;
	let rem = b.secs - a.secs;
	if (rem < 0) {
		endDay -= 1;
		rem += 86400;
	}
	const cal = calendarDiff(a.day, endDay);
	const weekdays = countWeekdays(a.day, b.day);
	const holidays = holidaysBetween(a.day, b.day, opts);
	const offDays = new Set(holidays.filter((h) => weekday(h.day) < 5).map((h) => h.day));
	return {
		negative,
		...cal,
		hours: Math.floor(rem / 3600),
		minutes: Math.floor(rem / 60) % 60,
		seconds: Math.round((rem % 60) * 1000) / 1000,
		totalSeconds,
		weekdays,
		weekendDays: b.day - a.day - weekdays,
		workingDays: weekdays - offDays.size,
		holidays,
		from: a.day,
		toExclusive: b.day
	};
}

/* ---------- Intake ---------- */

const dt = String.raw`\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z?)?`;
const rangeRe = new RegExp(
	String.raw`^(${dt})\s*(?:/|\.\.|--|\s+to\s+|\s+-\s+|\s+)\s*(${dt})$`,
	'i'
);

/** Splits "2026-01-01 to 2026-03-01", "2026-01-01/2026-03-01" and similar into two dates. */
export function splitRange(s: string): [string, string] | null {
	const m = rangeRe.exec(s.trim());
	return m ? [m[1], m[2]] : null;
}

export function looksLikeDateRange(s: string): number {
	return splitRange(s) ? 0.85 : 0;
}
