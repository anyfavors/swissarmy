/**
 * Availability arithmetic. A year is 365.25 days (the Julian year, average including leap
 * years), so a quarter is 91.3125 days and an average month 30.4375 days.
 */

export const DAY = 86_400;
export const YEAR = 365.25 * DAY;

export interface Period {
	id: string;
	label: string;
	seconds: number;
}

export const periods: Period[] = [
	{ id: 'year', label: 'Year (365.25 d)', seconds: YEAR },
	{ id: 'quarter', label: 'Quarter (91.31 d)', seconds: YEAR / 4 },
	{ id: 'month', label: 'Month, average (30.44 d)', seconds: YEAR / 12 },
	{ id: 'week', label: 'Week', seconds: 7 * DAY },
	{ id: 'day', label: 'Day', seconds: DAY }
];

export const calendarMonths: Period[] = [
	{ id: 'm28', label: '28-day month', seconds: 28 * DAY },
	{ id: 'm29', label: '29-day month', seconds: 29 * DAY },
	{ id: 'm30', label: '30-day month', seconds: 30 * DAY },
	{ id: 'm31', label: '31-day month', seconds: 31 * DAY }
];

export const allPeriods = [...periods, ...calendarMonths];

export function findPeriod(id: string): Period | undefined {
	return allPeriods.find((p) => p.id === id);
}

/** Parses "99.95", "99.95 %", "99,95". Returns a percentage between 0 and 100. */
export function parsePercent(raw: string): number {
	const s = raw.trim().replace(/\s*%$/, '').replace(',', '.');
	if (!s) throw new Error('Enter an availability, for example 99.9');
	if (!/^\d+(\.\d+)?$|^\.\d+$/.test(s)) throw new Error(`"${raw.trim()}" is not a percentage`);
	const n = Number(s);
	if (n > 100) throw new Error('Availability cannot be above 100 %');
	return n;
}

const unitSeconds: Record<string, number> = {
	ms: 0.001,
	s: 1,
	sec: 1,
	secs: 1,
	second: 1,
	seconds: 1,
	m: 60,
	min: 60,
	mins: 60,
	minute: 60,
	minutes: 60,
	h: 3600,
	hr: 3600,
	hrs: 3600,
	hour: 3600,
	hours: 3600,
	d: DAY,
	day: DAY,
	days: DAY,
	w: 7 * DAY,
	week: 7 * DAY,
	weeks: 7 * DAY
};

/**
 * Parses a duration: "8h 45m", "52 min 36 s", "1.5h", "90" (minutes when no unit),
 * or a clock value "01:30:00" / "45:00" (h:mm:ss / mm:ss).
 */
export function parseDuration(raw: string): number {
	const s = raw.trim().toLowerCase().replace(/,/g, '.');
	if (!s) throw new Error('Enter a duration, for example 4h 30m');
	if (/^\d+(:\d{1,2}){1,2}(\.\d+)?$/.test(s)) {
		const parts = s.split(':').map(Number);
		if (parts.slice(1).some((p) => p >= 60))
			throw new Error('Minutes and seconds must be below 60');
		return parts.length === 3
			? parts[0] * 3600 + parts[1] * 60 + parts[2]
			: parts[0] * 60 + parts[1];
	}
	if (/^\d+(\.\d+)?$/.test(s)) return Number(s) * 60;
	const re = /(\d+(?:\.\d+)?)\s*([a-z]+)/g;
	let total = 0;
	let consumed = '';
	for (const m of s.matchAll(re)) {
		const f = unitSeconds[m[2]];
		if (f === undefined) throw new Error(`Unknown unit "${m[2]}". Use d, h, min, s or ms`);
		total += Number(m[1]) * f;
		consumed += m[0];
	}
	if (consumed.replace(/\s/g, '') !== s.replace(/\s/g, ''))
		throw new Error(`Cannot read "${raw.trim()}" as a duration. Try 4h 30m or 01:30:00`);
	return total;
}

/** Allowed downtime in seconds for an availability percentage over a period. */
export function allowedDowntime(percent: number, periodSeconds: number): number {
	return ((100 - percent) / 100) * periodSeconds;
}

/** Achieved availability percentage for a downtime within a period. */
export function achieved(downtimeSeconds: number, periodSeconds: number): number {
	if (downtimeSeconds < 0) throw new Error('Downtime cannot be negative');
	if (downtimeSeconds > periodSeconds) throw new Error('Downtime is longer than the period');
	return (1 - downtimeSeconds / periodSeconds) * 100;
}

/** Number of nines, -log10(unavailability). 99.9 % gives 3. */
export function nines(percent: number): number {
	const u = 1 - percent / 100;
	if (u <= 0) return Infinity;
	return -Math.log10(u);
}

/** Human duration: "8h 45m 57.6s", "4m 23s", "864 ms". */
export function formatDuration(seconds: number): string {
	if (!Number.isFinite(seconds)) return 'n/a';
	if (seconds === 0) return '0 s';
	if (seconds < 1) return `${trim(seconds * 1000, 1)} ms`;
	const parts: string[] = [];
	let rest = Math.round(seconds * 10) / 10;
	const d = Math.floor(rest / DAY);
	rest -= d * DAY;
	const h = Math.floor(rest / 3600);
	rest -= h * 3600;
	const m = Math.floor(rest / 60);
	rest -= m * 60;
	if (d) parts.push(`${d}d`);
	if (h) parts.push(`${h}h`);
	if (m) parts.push(`${m}m`);
	const sec = Math.round(rest * 10) / 10;
	if (sec || !parts.length) parts.push(`${trim(sec, 1)}s`);
	return parts.join(' ');
}

function trim(n: number, digits: number): string {
	return String(Number(n.toFixed(digits)));
}

/** Formats a percentage without losing the meaningful digits: 99.99999 stays 99.99999. */
export function formatPercent(p: number, maxDigits = 6): string {
	if (p === 100) return '100 %';
	return `${Number(p.toFixed(maxDigits))} %`;
}

export interface Tier {
	name: string;
	/** Availability of one instance, percent. */
	availability: number;
	/** Redundant instances in parallel. 1 means no redundancy. */
	count: number;
}

/** Availability of n identical independent instances in parallel: 1 - (1 - a)^n. */
export function parallel(a: number, n: number): number {
	if (!Number.isInteger(n) || n < 1)
		throw new Error('Instances must be a whole number of 1 or more');
	return 1 - Math.pow(1 - a, n);
}

/** Availability of components in series: the product. */
export function serial(as: number[]): number {
	return as.reduce((p, a) => p * a, 1);
}

export interface CompositeResult {
	tiers: { tier: Tier; fraction: number }[];
	fraction: number;
}

/** A chain of tiers in series, each tier made of N redundant instances. Fractions 0..1. */
export function composite(tiers: Tier[]): CompositeResult {
	if (!tiers.length) throw new Error('Add at least one component');
	const rows = tiers.map((tier) => {
		if (!(tier.availability >= 0 && tier.availability <= 100))
			throw new Error(`${tier.name || 'Component'}: availability must be 0 to 100 %`);
		return { tier, fraction: parallel(tier.availability / 100, tier.count) };
	});
	return { tiers: rows, fraction: serial(rows.map((r) => r.fraction)) };
}

/** Steady-state availability from mean time between failures and mean time to repair. */
export function fromMtbf(mtbf: number, mttr: number): number {
	if (!(mtbf > 0)) throw new Error('MTBF must be above zero');
	if (!(mttr >= 0)) throw new Error('MTTR cannot be negative');
	return mtbf / (mtbf + mttr);
}

/** Serialises tiers for the URL: "Web:99.9:2;DB:99.95:1". */
export function encodeTiers(tiers: Tier[]): string {
	return tiers.map((t) => `${t.name.replace(/[:;]/g, ' ')}:${t.availability}:${t.count}`).join(';');
}

export function decodeTiers(s: string): Tier[] {
	const out: Tier[] = [];
	for (const part of s.split(';')) {
		const [name, a, n] = part.split(':');
		const av = Number(a);
		const c = Number(n);
		if (!Number.isFinite(av) || av < 0 || av > 100 || !Number.isInteger(c) || c < 1 || c > 99)
			continue;
		out.push({ name: name ?? '', availability: av, count: c });
	}
	return out;
}
