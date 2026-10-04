import {
	addMonths,
	formatDate,
	formatTime,
	isDayOff,
	isHoliday,
	weekday,
	weekdayNames,
	type DateTime,
	type Holiday,
	type HolidayOptions,
	danishHolidays,
	civil,
	dayNumber
} from '../date-diff/logic';
import { isoWeek } from '../timestamp/logic';

export interface Duration {
	years: number;
	months: number;
	weeks: number;
	days: number;
	hours: number;
	minutes: number;
	seconds: number;
}

export const units = ['years', 'months', 'weeks', 'days', 'hours', 'minutes', 'seconds'] as const;
export type Unit = (typeof units)[number];

export const zero: Duration = {
	years: 0,
	months: 0,
	weeks: 0,
	days: 0,
	hours: 0,
	minutes: 0,
	seconds: 0
};

export interface ParsedDuration {
	duration: Duration;
	/** -1 for a leading minus sign (ISO 8601-2 extension). */
	sign: 1 | -1;
}

const durRe =
	/^([+-])?P(?:(\d+(?:[.,]\d+)?)Y)?(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)W)?(?:(\d+(?:[.,]\d+)?)D)?(?:T(?:(\d+(?:[.,]\d+)?)H)?(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)S)?)?$/i;

/**
 * Parses an ISO 8601 duration: PnYnMnWnDTnHnMnS. Weeks may be mixed with other units
 * (ISO 8601-2 allows it, ISO 8601-1 does not). A decimal fraction is allowed on the
 * smallest unit given, except years and months, which have no fixed length.
 */
export function parseIsoDuration(raw: string): ParsedDuration {
	const s = raw.trim();
	const m = durRe.exec(s);
	if (!m) {
		if (/^[+-]?P/i.test(s))
			throw new Error(
				`"${s}" is not a valid ISO 8601 duration. Expected the form P1Y2M3DT4H5M6S, P2W or PT90M`
			);
		throw new Error('An ISO 8601 duration starts with P, for example P1Y2M10DT2H30M');
	}
	if (/T$/i.test(s)) throw new Error('A T must be followed by hours, minutes or seconds');
	const vals = m.slice(2, 9);
	if (vals.every((v) => v === undefined)) throw new Error('The duration has no values after P');
	const last = vals.reduce((acc, v, i) => (v !== undefined ? i : acc), -1);
	const duration = { ...zero };
	vals.forEach((v, i) => {
		if (v === undefined) return;
		const frac = /[.,]/.test(v);
		if (frac && i !== last) throw new Error('Only the smallest unit may have a decimal fraction');
		if (frac && i < 2)
			throw new Error('Years and months cannot be fractional, they have no fixed length');
		duration[units[i]] = Number(v.replace(',', '.'));
	});
	return { duration, sign: m[1] === '-' ? -1 : 1 };
}

const fmtNum = (v: number) => String(Math.round(v * 1e6) / 1e6);

/** Canonical ISO 8601 form, PT0S for an empty duration. */
export function formatIsoDuration(d: Duration, sign: 1 | -1 = 1): string {
	const date = (['years', 'months', 'weeks', 'days'] as const)
		.filter((u) => d[u])
		.map((u) => fmtNum(d[u]) + { years: 'Y', months: 'M', weeks: 'W', days: 'D' }[u])
		.join('');
	const time = (['hours', 'minutes', 'seconds'] as const)
		.filter((u) => d[u])
		.map((u) => fmtNum(d[u]) + { hours: 'H', minutes: 'M', seconds: 'S' }[u])
		.join('');
	if (!date && !time) return 'PT0S';
	return `${sign < 0 ? '-' : ''}P${date}${time ? `T${time}` : ''}`;
}

/** "1 year, 2 months, 10 days, 2 hours and 30 minutes". */
export function describeDuration(d: Duration): string {
	const parts = units
		.filter((u) => d[u])
		.map((u) => `${fmtNum(d[u])} ${d[u] === 1 ? u.slice(0, -1) : u}`);
	if (!parts.length) return 'zero';
	return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

/**
 * Length in seconds. Exact when there are no years or months. Otherwise an average,
 * using the Gregorian year of 365.2425 days and a month of a twelfth of that.
 */
export function durationSeconds(d: Duration): { seconds: number; exact: boolean } {
	const fixed = (d.weeks * 7 + d.days) * 86400 + d.hours * 3600 + d.minutes * 60 + d.seconds;
	const avg = (d.years * 12 + d.months) * (365.2425 / 12) * 86400;
	return { seconds: fixed + avg, exact: !d.years && !d.months };
}

/**
 * Adds (sign 1) or subtracts (sign -1) a duration. Years and months first, clamped to the
 * month end, then weeks and days, then the time of day, carrying into days. This is the
 * order used by ISO 8601, java.time and Temporal.
 */
export function addDuration(start: DateTime, d: Duration, sign: 1 | -1 = 1): DateTime {
	let day = addMonths(start.day, sign * (d.years * 12 + d.months));
	const totalDays = d.weeks * 7 + d.days;
	const wholeDays = Math.trunc(totalDays);
	day += sign * wholeDays;
	const timeSecs = (totalDays - wholeDays) * 86400 + d.hours * 3600 + d.minutes * 60 + d.seconds;
	let secs = Math.round((start.secs + sign * timeSecs) * 1000) / 1000;
	const carry = Math.floor(secs / 86400);
	day += carry;
	secs -= carry * 86400;
	const hasTime = start.hasTime || !!(d.hours || d.minutes || d.seconds || totalDays !== wholeDays);
	return { day, secs, hasTime };
}

/**
 * Moves n working days (Mon to Fri, minus selected holidays) forward or back. The start
 * date itself is not counted, so 1 working day after a Friday is the Monday.
 */
export function addWorkingDays(
	start: number,
	n: number,
	opts: HolidayOptions
): { day: number; skipped: Holiday[] } {
	if (!Number.isInteger(n)) throw new Error('Working days must be a whole number');
	if (Math.abs(n) > 100000) throw new Error('Keep it within 100 000 working days');
	const dir = n < 0 ? -1 : 1;
	let day = start;
	let left = Math.abs(n);
	const skipped: Holiday[] = [];
	while (left > 0) {
		day += dir;
		if (!isDayOff(day, opts)) left--;
		else if (weekday(day) < 5 && isHoliday(day, opts))
			skipped.push(...danishHolidays(civil(day).y, opts).filter((h) => h.day === day));
	}
	return { day, skipped: dir < 0 ? skipped.reverse() : skipped };
}

export interface Described {
	iso: string;
	weekday: string;
	isoWeek: string;
	dayOfYear: number;
}

export function describeDate(dt: DateTime): Described {
	const w = isoWeek(dt.day * 864e5);
	const wd = weekday(dt.day);
	return {
		iso: dt.hasTime ? `${formatDate(dt.day)}T${formatTime(dt.secs)}` : formatDate(dt.day),
		weekday: weekdayNames[wd],
		isoWeek: `${w.year}-W${String(w.week).padStart(2, '0')}-${wd + 1}`,
		dayOfYear: dt.day - dayNumber(civil(dt.day).y, 1, 1) + 1
	};
}

export function looksLikeDuration(s: string): number {
	const t = s.trim();
	if (!/^[+-]?P/i.test(t) || t.length < 3) return 0;
	try {
		parseIsoDuration(t);
		return 0.9;
	} catch {
		return 0;
	}
}
