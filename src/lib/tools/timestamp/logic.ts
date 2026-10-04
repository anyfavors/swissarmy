export type Unit = 's' | 'ms' | 'us' | 'ns';

export const unitLabel: Record<Unit, string> = {
	s: 'seconds',
	ms: 'milliseconds',
	us: 'microseconds',
	ns: 'nanoseconds'
};

const perMs: Record<Unit, number> = { s: 1e-3, ms: 1, us: 1e3, ns: 1e6 };

/**
 * Guesses the unit from the number of digits. Works for dates between
 * roughly 1973 and 5138, which covers anything you will paste in practice.
 */
export function guessUnit(digits: string): Unit {
	const len = digits.replace(/^-/, '').length;
	if (len <= 11) return 's';
	if (len <= 14) return 'ms';
	if (len <= 17) return 'us';
	return 'ns';
}

export interface Parsed {
	/** Milliseconds since the epoch. */
	ms: number;
	/** How the input was read. */
	source: { kind: 'epoch'; unit: Unit } | { kind: 'date' };
}

export function parseInput(raw: string, forced?: Unit): Parsed {
	const s = raw.trim();
	if (!s) throw new Error('Enter a timestamp or a date');
	if (/^-?\d+(\.\d+)?$/.test(s)) {
		const unit = forced ?? guessUnit(s.split('.')[0]);
		const ms = Number(s) / perMs[unit];
		if (!Number.isFinite(ms) || Math.abs(ms) > 8.64e15)
			throw new Error('Out of range for a JavaScript date');
		return { ms, source: { kind: 'epoch', unit } };
	}
	const ms = Date.parse(s);
	if (Number.isNaN(ms))
		throw new Error(`Could not read "${s}" as a date. Try ISO 8601, e.g. 2026-10-04T12:00:00Z`);
	return { ms, source: { kind: 'date' } };
}

export function toUnit(ms: number, unit: Unit): string {
	if (unit === 'ms') return String(Math.trunc(ms));
	if (unit === 's') return String(Math.floor(ms / 1000));
	return (BigInt(Math.trunc(ms)) * BigInt(perMs[unit])).toString();
}

/** ISO 8601 week number and week-year, in UTC. */
export function isoWeek(ms: number): { year: number; week: number } {
	const d = new Date(ms);
	const day = (d.getUTCDay() + 6) % 7; // Monday = 0
	const thursday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 3);
	const year = new Date(thursday).getUTCFullYear();
	const jan4 = Date.UTC(year, 0, 4);
	const jan4Day = (new Date(jan4).getUTCDay() + 6) % 7;
	const week1Thursday = jan4 - jan4Day * 864e5 + 3 * 864e5;
	return { year, week: 1 + Math.round((thursday - week1Thursday) / (7 * 864e5)) };
}

export function relative(ms: number, now: number): string {
	const diff = ms - now;
	const abs = Math.abs(diff);
	const units: [Intl.RelativeTimeFormatUnit, number][] = [
		['year', 365.2425 * 864e5],
		['month', 30.436875 * 864e5],
		['week', 7 * 864e5],
		['day', 864e5],
		['hour', 36e5],
		['minute', 6e4],
		['second', 1e3]
	];
	const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
	for (const [u, size] of units) {
		if (abs >= size || u === 'second') return rtf.format(Math.round(diff / size), u);
	}
	return '';
}

export function formatInZone(ms: number, timeZone: string): string {
	return new Intl.DateTimeFormat('en-GB', {
		timeZone,
		weekday: 'short',
		year: 'numeric',
		month: 'short',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		timeZoneName: 'shortOffset',
		hourCycle: 'h23'
	}).format(ms);
}

export function looksLikeTimestamp(s: string): number {
	const t = s.trim();
	if (/^1\d{9}$/.test(t)) return 0.9; // seconds, 2001 to 2033
	if (/^1\d{12}$/.test(t)) return 0.9; // milliseconds
	if (/^1\d{15}$|^1\d{18}$/.test(t)) return 0.7;
	if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(t))
		return 0.8;
	return 0;
}
