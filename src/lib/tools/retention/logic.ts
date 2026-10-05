/**
 * Grandfather-father-son (GFS) retention. One backup per day; the weekly is the backup taken
 * on the chosen weekday, the monthly the one on the 1st, the yearly the one on 1 January.
 * A restore point that qualifies twice (a Sunday that is also the 1st) is stored once.
 * All dates are calendar days in UTC, so time zones and DST do not shift them.
 */

export interface Gfs {
	daily: number;
	weekly: number;
	monthly: number;
	yearly: number;
	/** 0 = Sunday ... 6 = Saturday. */
	weekday: number;
}

export type Kind = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Point {
	day: number;
	kinds: Kind[];
}

export interface Plan {
	points: Point[];
	oldest?: number;
	counts: Record<Kind, number>;
}

const MS_DAY = 86_400_000;

export function parseDay(iso: string): number {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
	if (!m) throw new Error('Use a date as YYYY-MM-DD');
	const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
	const d = new Date(t);
	if (d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3])
		throw new Error(`${iso} is not a calendar date`);
	return Math.floor(t / MS_DAY);
}

export function formatDay(day: number): string {
	return new Date(day * MS_DAY).toISOString().slice(0, 10);
}

export const weekdayNames = [
	'Sunday',
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday'
];

export function weekdayOf(day: number): number {
	return new Date(day * MS_DAY).getUTCDay();
}

function validate(g: Gfs) {
	for (const k of ['daily', 'weekly', 'monthly', 'yearly'] as const) {
		const v = g[k];
		if (!Number.isInteger(v) || v < 0)
			throw new Error(`${k} count must be a whole number, 0 or more`);
	}
	if (g.daily > 3660 || g.weekly > 520 || g.monthly > 600 || g.yearly > 100)
		throw new Error('Counts are too large (max 3660 daily, 520 weekly, 600 monthly, 100 yearly)');
	if (!(g.daily + g.weekly + g.monthly + g.yearly))
		throw new Error('Keep at least one restore point');
}

/** Restore points kept on `today` (the backup of today included), newest first. */
export function plan(g: Gfs, today: number): Plan {
	validate(g);
	const span = Math.max(g.daily, 7 * g.weekly + 7, 31 * (g.monthly + 1), 366 * (g.yearly + 1)) + 1;
	const left = { daily: g.daily, weekly: g.weekly, monthly: g.monthly, yearly: g.yearly };
	const points: Point[] = [];
	for (let i = 0; i < span; i++) {
		const day = today - i;
		const d = new Date(day * MS_DAY);
		const kinds: Kind[] = [];
		if (left.daily > 0) kinds.push('daily');
		if (left.weekly > 0 && d.getUTCDay() === g.weekday) kinds.push('weekly');
		if (left.monthly > 0 && d.getUTCDate() === 1) kinds.push('monthly');
		if (left.yearly > 0 && d.getUTCDate() === 1 && d.getUTCMonth() === 0) kinds.push('yearly');
		for (const k of kinds) left[k]--;
		if (kinds.length) points.push({ day, kinds });
		if (!left.daily && !left.weekly && !left.monthly && !left.yearly) break;
	}
	const counts = { daily: 0, weekly: 0, monthly: 0, yearly: 0 };
	for (const p of points) for (const k of p.kinds) counts[k]++;
	return { points, oldest: points.at(-1)?.day, counts };
}

export type Chain = 'forever' | 'weekly';

export interface StorageInput {
	/** Size of one full backup before reduction, in GB. */
	full: number;
	/** Daily change rate, percent of the full. */
	change: number;
	/** Combined dedupe and compression factor, 2 means 2:1. */
	reduction: number;
	chain: Chain;
}

export interface Storage {
	fulls: number;
	incrementals: number;
	/** Before dedupe and compression, GB. */
	logical: number;
	/** After dedupe and compression, GB. */
	stored: number;
	/** Every restore point as a full, after reduction, GB. */
	allFulls: number;
}

/**
 * Model: the daily points form one backup chain. 'forever' is one full plus incrementals;
 * 'weekly' starts a new full on the weekly weekday, plus the full the oldest increments
 * still depend on. Every weekly, monthly or yearly point outside the daily chain is a full.
 */
export function storage(p: Plan, g: Gfs, s: StorageInput): Storage {
	if (!(s.full > 0)) throw new Error('Full backup size must be above zero');
	if (!(s.change >= 0 && s.change <= 100)) throw new Error('Change rate must be 0 to 100 %');
	if (!(s.reduction >= 1)) throw new Error('Reduction factor must be 1 or more (1 = none)');
	const chain = p.points.filter((x) => x.kinds.includes('daily'));
	const outside = p.points.length - chain.length;
	let chainFulls = 0;
	if (chain.length) {
		if (s.chain === 'forever') chainFulls = 1;
		else {
			chainFulls = chain.filter((x) => weekdayOf(x.day) === g.weekday).length;
			if (weekdayOf(chain[chain.length - 1].day) !== g.weekday) chainFulls++;
		}
	}
	const incrementals = Math.max(0, chain.length - Math.min(chainFulls, chain.length));
	const fulls = outside + chainFulls;
	const logical = fulls * s.full + incrementals * s.full * (s.change / 100);
	return {
		fulls,
		incrementals,
		logical,
		stored: logical / s.reduction,
		allFulls: (p.points.length * s.full) / s.reduction
	};
}

export interface Rule {
	id: string;
	rule: string;
	text: string;
}

/**
 * 3-2-1 is usually credited to photographer Peter Krogh (The DAM Book, 2nd ed., 2009);
 * the extra 1 and 0 are a later vendor extension (Veeam, "3-2-1-1-0").
 */
export const rules: Rule[] = [
	{ id: '3', rule: '3', text: 'Three copies of the data: production plus two backups' },
	{ id: '2', rule: '2', text: 'On two different media or storage systems' },
	{ id: 'o', rule: '1', text: 'One copy offsite, in another building or region' },
	{ id: 'i', rule: '1', text: 'One copy offline, air-gapped or immutable' },
	{ id: '0', rule: '0', text: 'Zero errors: backups verified and restores tested' }
];

export function formatGB(gb: number): string {
	if (gb >= 1000) return `${Number((gb / 1000).toFixed(2)).toLocaleString('en-GB')} TB`;
	return `${Number(gb.toFixed(1)).toLocaleString('en-GB')} GB`;
}
