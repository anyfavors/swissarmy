/*
 * Cron expressions: Vixie/cronie 5-field syntax, macros, and an optional leading
 * seconds field (6 fields, as in Quartz and Spring).
 */

export type FieldName = 'second' | 'minute' | 'hour' | 'dom' | 'month' | 'dow';

interface FieldSpec {
	name: FieldName;
	label: string;
	min: number;
	max: number;
	names?: string[];
}

const monthNames = [
	'JAN',
	'FEB',
	'MAR',
	'APR',
	'MAY',
	'JUN',
	'JUL',
	'AUG',
	'SEP',
	'OCT',
	'NOV',
	'DEC'
];
const dowNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export const monthLong = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
];
export const dowLong = [
	'Sunday',
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday',
	'Sunday'
];

export const specs: Record<FieldName, FieldSpec> = {
	second: { name: 'second', label: 'Second', min: 0, max: 59 },
	minute: { name: 'minute', label: 'Minute', min: 0, max: 59 },
	hour: { name: 'hour', label: 'Hour', min: 0, max: 23 },
	dom: { name: 'dom', label: 'Day of month', min: 1, max: 31 },
	month: { name: 'month', label: 'Month', min: 1, max: 12, names: monthNames },
	dow: { name: 'dow', label: 'Day of week', min: 0, max: 7, names: dowNames }
};

/** One comma-separated element: a single value, a range, or *, with an optional step. */
export interface Item {
	start: number;
	end: number;
	step: number;
	/** Written as * (or ?). */
	star: boolean;
	/** Written as a single value, without range or step. */
	single: boolean;
}

export interface Field {
	spec: FieldSpec;
	raw: string;
	items: Item[];
	/** Sorted matching values. Day of week 7 is folded into 0. */
	values: number[];
	/** Vixie cron's rule: the field counts as unrestricted when it starts with * (or is ?). */
	starLike: boolean;
	/** Matches every value in range. */
	all: boolean;
}

export interface Schedule {
	kind: 'schedule';
	hasSeconds: boolean;
	second: Field;
	minute: Field;
	hour: Field;
	dom: Field;
	month: Field;
	dow: Field;
	/** The macro used, if any, e.g. @daily. */
	macro?: string;
	/** Text after the schedule in a crontab line, ignored. */
	command?: string;
}

export type Parsed = Schedule | { kind: 'reboot'; command?: string };

const macros: Record<string, string> = {
	'@yearly': '0 0 1 1 *',
	'@annually': '0 0 1 1 *',
	'@monthly': '0 0 1 * *',
	'@weekly': '0 0 * * 0',
	'@daily': '0 0 * * *',
	'@midnight': '0 0 * * *',
	'@hourly': '0 * * * *'
};

function parseValue(tok: string, spec: FieldSpec): number {
	if (/^\d+$/.test(tok)) {
		const v = Number(tok);
		if (v < spec.min || v > spec.max)
			throw new Error(`${spec.label}: ${v} is out of range ${spec.min}-${spec.max}`);
		return v;
	}
	const i = spec.names?.indexOf(tok.toUpperCase()) ?? -1;
	if (i >= 0) return i + (spec.name === 'month' ? 1 : 0);
	if (spec.names)
		throw new Error(
			`${spec.label}: "${tok}" is not a number or a name (${spec.names[0]}-${spec.names.at(-1)})`
		);
	throw new Error(`${spec.label}: "${tok}" is not a number`);
}

function unsupported(raw: string, spec: FieldSpec): void {
	if (/^H\b|^H\(|^H\//.test(raw))
		throw new Error(`${spec.label}: H is a Jenkins extension and is not supported here`);
	if (spec.name === 'dom' && /L|W/i.test(raw))
		throw new Error(
			`${spec.label}: "${raw}" uses the Quartz L (last day) or W (nearest weekday) extension, which is not supported here`
		);
	if (spec.name === 'dow' && /#/.test(raw))
		throw new Error(
			`${spec.label}: "${raw}" uses the Quartz # (nth weekday of the month) extension, which is not supported here`
		);
	if (spec.name === 'dow' && /^\d?L$/i.test(raw))
		throw new Error(
			`${spec.label}: "${raw}" uses the Quartz L (last weekday of the month) extension, which is not supported here`
		);
	if (raw.includes('?') && raw !== '?') throw new Error(`${spec.label}: ? must stand alone`);
	if (raw === '?' && spec.name !== 'dom' && spec.name !== 'dow')
		throw new Error(`${spec.label}: ? is only allowed in the day-of-month and day-of-week fields`);
}

export function parseField(raw: string, spec: FieldSpec): Field {
	unsupported(raw, spec);
	const items: Item[] = [];
	for (const part of raw.split(',')) {
		if (!part) throw new Error(`${spec.label}: empty element in list "${raw}"`);
		const m = /^([^/]+)(?:\/(.*))?$/.exec(part);
		if (!m) throw new Error(`${spec.label}: cannot read "${part}"`);
		const [, base, stepRaw] = m;
		let step = 1;
		if (stepRaw !== undefined) {
			if (!/^\d+$/.test(stepRaw))
				throw new Error(`${spec.label}: step "${stepRaw}" is not a number`);
			step = Number(stepRaw);
			if (step < 1) throw new Error(`${spec.label}: step must be 1 or more`);
		}
		const max = spec.name === 'dow' ? 6 : spec.max;
		if (base === '*' || base === '?') {
			items.push({ start: spec.min, end: max, step, star: true, single: false });
			continue;
		}
		const r = /^([^-]+)(?:-(.+))?$/.exec(base);
		if (!r) throw new Error(`${spec.label}: cannot read "${part}"`);
		const start = parseValue(r[1], spec);
		if (r[2] !== undefined) {
			const end = parseValue(r[2], spec);
			if (end < start)
				throw new Error(
					`${spec.label}: range ${r[1]}-${r[2]} runs backwards. Write it as a list instead`
				);
			items.push({ start, end, step, star: false, single: false });
		} else if (stepRaw !== undefined) {
			// "5/15" means from 5 to the maximum, every 15.
			items.push({ start, end: spec.max, step, star: false, single: false });
		} else items.push({ start, end: start, step, star: false, single: true });
	}
	const set = new Set<number>();
	for (const it of items)
		for (let v = it.start; v <= it.end; v += it.step)
			set.add(spec.name === 'dow' && v === 7 ? 0 : v);
	const values = [...set].sort((a, b) => a - b);
	const size = (spec.name === 'dow' ? 6 : spec.max) - spec.min + 1;
	return {
		spec,
		raw,
		items,
		values,
		starLike: raw.startsWith('*') || raw === '?',
		all: values.length === size
	};
}

const fieldOrder5: FieldName[] = ['minute', 'hour', 'dom', 'month', 'dow'];

function build(tokens: string[], hasSeconds: boolean): Schedule {
	const names = hasSeconds ? (['second', ...fieldOrder5] as FieldName[]) : fieldOrder5;
	const f = {} as Record<FieldName, Field>;
	names.forEach((n, i) => (f[n] = parseField(tokens[i], specs[n])));
	if (!hasSeconds) f.second = parseField('0', specs.second);
	return { kind: 'schedule', hasSeconds, ...f };
}

/**
 * Parses a cron expression. A crontab line with a command after the five fields is
 * accepted and the command is returned separately.
 */
export function parseCron(input: string): Parsed {
	const s = input.trim();
	if (!s) throw new Error('Enter a cron expression, e.g. */15 * * * *');
	const tokens = s.split(/\s+/);
	if (tokens[0].startsWith('@')) {
		const macro = tokens[0].toLowerCase();
		const command = tokens.slice(1).join(' ') || undefined;
		if (macro === '@reboot') return { kind: 'reboot', command };
		const expr = macros[macro];
		if (!expr)
			throw new Error(
				`Unknown macro ${tokens[0]}. Known: @yearly @annually @monthly @weekly @daily @midnight @hourly @reboot`
			);
		return { ...build(expr.split(' '), false), macro, command };
	}
	if (tokens.length < 5)
		throw new Error(
			`Expected 5 fields (minute hour day-of-month month day-of-week), got ${tokens.length}`
		);
	if (tokens.length === 5) return build(tokens, false);
	if (tokens.length === 6) {
		try {
			return build(tokens, true);
		} catch (e6) {
			// Maybe a crontab line: 5 fields and a one-word command.
			try {
				return { ...build(tokens.slice(0, 5), false), command: tokens[5] };
			} catch {
				throw e6;
			}
		}
	}
	if (tokens.length === 7) {
		try {
			parseField(tokens[6], { name: 'second', label: 'Year', min: 1970, max: 2099 });
			throw new Error(
				'7 fields look like Quartz with a year field. Only 5 fields, or 6 with seconds first, are supported'
			);
		} catch (e) {
			if ((e as Error).message.startsWith('7 fields')) throw e;
		}
	}
	try {
		return { ...build(tokens.slice(0, 5), false), command: tokens.slice(5).join(' ') };
	} catch (e) {
		throw new Error(
			`${(e as Error).message}. Expected 5 fields, or 6 with seconds first, got ${tokens.length}`
		);
	}
}

/* ---------- English description ---------- */

export function ordinal(n: number): string {
	const t = n % 100;
	if (t >= 11 && t <= 13) return `${n}th`;
	return n + ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th');
}

function list(xs: string[]): string {
	if (xs.length <= 1) return xs.join('');
	if (xs.length === 2) return `${xs[0]} and ${xs[1]}`;
	return `${xs.slice(0, -1).join(', ')}, and ${xs.at(-1)}`;
}

function valueName(f: Field, v: number): string {
	if (f.spec.name === 'month') return monthLong[v - 1];
	if (f.spec.name === 'dow') return dowLong[v];
	return String(v);
}

const unitWord: Record<FieldName, string> = {
	second: 'second',
	minute: 'minute',
	hour: 'hour',
	dom: 'day-of-month',
	month: 'month',
	dow: 'day-of-week'
};

/** Phrase for a field, e.g. "every 15th minute", "minute 5", "every hour from 8 through 18". */
function phrase(f: Field): string {
	const unit = unitWord[f.spec.name];
	const named = f.spec.name === 'month' || f.spec.name === 'dow';
	const range = (it: Item) => `from ${valueName(f, it.start)} through ${valueName(f, it.end)}`;
	if (f.items.every((it) => it.single)) {
		const vals = f.items.map((it) => valueName(f, it.start));
		return named ? list(vals) : `${unit} ${list(vals)}`;
	}
	if (f.items.length === 1) {
		const it = f.items[0];
		const every = it.step === 1 ? `every ${unit}` : `every ${ordinal(it.step)} ${unit}`;
		if (it.star) return every;
		if (named && it.step === 1) return `${valueName(f, it.start)} through ${valueName(f, it.end)}`;
		return `${every} ${range(it)}`;
	}
	const parts = f.items.map((it) => {
		if (it.single) return valueName(f, it.start);
		if (it.step === 1 && !it.star)
			return `${valueName(f, it.start)} through ${valueName(f, it.end)}`;
		const every = `every ${ordinal(it.step)}`;
		return it.star ? every : `${every} ${range(it)}`;
	});
	return named ? list(parts) : `${unit} ${list(parts)}`;
}

const two = (n: number) => String(n).padStart(2, '0');

export function describe(p: Parsed): string {
	if (p.kind === 'reboot') return 'Once, when the cron daemon starts.';
	const { second, minute, hour, dom, month, dow } = p;
	const singles = (f: Field) => f.items.every((it) => it.single);
	const secIsZero = second.values.length === 1 && second.values[0] === 0;
	let time: string;
	if (
		singles(minute) &&
		minute.values.length === 1 &&
		singles(hour) &&
		hour.values.length <= 4 &&
		(secIsZero || (singles(second) && second.values.length === 1))
	) {
		const sec = p.hasSeconds && !secIsZero ? `:${two(second.values[0])}` : '';
		time = `At ${list(hour.values.map((h) => `${two(h)}:${two(minute.values[0])}${sec}`))}`;
	} else {
		const parts: string[] = [];
		const secs = p.hasSeconds && !secIsZero;
		if (secs) parts.push(phrase(second));
		if (!(secs && minute.all)) parts.push(phrase(minute));
		if (!hour.all) parts.push(phrase(hour));
		time = `At ${parts.join(' past ')}`;
	}
	const days: string[] = [];
	const domR = !dom.starLike;
	const dowR = !dow.starLike;
	if (domR && dowR) days.push(`on ${phrase(dom)} or on ${phrase(dow)}`);
	else {
		if (!dom.all) days.push(`on ${phrase(dom)}`);
		if (!dow.all) days.push(`on ${phrase(dow)}`);
	}
	if (!month.all) days.push(`in ${phrase(month)}`);
	return [time, ...days].join(' ') + '.';
}

/** Matching values written compactly, e.g. "0-5, 10, 20-30" or "Mon-Fri". */
export function compact(f: Field): string {
	if (f.all) return 'every value';
	const runs: [number, number][] = [];
	for (const v of f.values) {
		const last = runs.at(-1);
		if (last && v === last[1] + 1) last[1] = v;
		else runs.push([v, v]);
	}
	const nm = (v: number) =>
		f.spec.name === 'month'
			? monthLong[v - 1].slice(0, 3)
			: f.spec.name === 'dow'
				? dowLong[v].slice(0, 3)
				: String(v);
	return runs
		.map(([a, b]) => (a === b ? nm(a) : b === a + 1 ? `${nm(a)}, ${nm(b)}` : `${nm(a)}-${nm(b)}`))
		.join(', ');
}

/* ---------- Time zones ---------- */

const fmtCache = new Map<string, Intl.DateTimeFormat>();

function formatter(zone: string): Intl.DateTimeFormat {
	let f = fmtCache.get(zone);
	if (!f) {
		f = new Intl.DateTimeFormat('en-US', {
			timeZone: zone,
			hourCycle: 'h23',
			year: 'numeric',
			month: 'numeric',
			day: 'numeric',
			hour: 'numeric',
			minute: 'numeric',
			second: 'numeric'
		});
		fmtCache.set(zone, f);
	}
	return f;
}

/** Throws a readable error for an unknown IANA zone and returns the canonical name. */
export function checkZone(zone: string): string {
	const z = zone.trim();
	if (!z) throw new Error('Enter an IANA time zone, e.g. Europe/Copenhagen');
	try {
		return new Intl.DateTimeFormat('en-US', { timeZone: z }).resolvedOptions().timeZone;
	} catch {
		throw new Error(`Unknown time zone "${z}". Use an IANA name like America/New_York`);
	}
}

export interface Wall {
	y: number;
	mo: number;
	d: number;
	h: number;
	mi: number;
	s: number;
}

export function wallAt(instant: number, zone: string): Wall {
	const p: Record<string, number> = {};
	for (const part of formatter(zone).formatToParts(instant))
		if (part.type !== 'literal') p[part.type] = Number(part.value);
	return { y: p.year, mo: p.month, d: p.day, h: p.hour, mi: p.minute, s: p.second };
}

function wallMs(w: Wall): number {
	const t = new Date(0);
	t.setUTCFullYear(w.y, w.mo - 1, w.d);
	t.setUTCHours(w.h, w.mi, w.s, 0);
	return t.getTime();
}

/** UTC offset in ms of a zone at an instant (whole seconds). */
export function offsetAt(instant: number, zone: string): number {
	const t = Math.floor(instant / 1000) * 1000;
	return wallMs(wallAt(t, zone)) - t;
}

/**
 * All instants at which a zone shows a given wall-clock time: one normally, none in a
 * spring-forward gap, two in a fall-back overlap. Sorted ascending.
 */
export function instantsFor(w: number, zone: string): number[] {
	const out = new Set<number>();
	for (const probe of [w - 864e5, w + 864e5]) {
		const o = offsetAt(probe, zone);
		if (offsetAt(w - o, zone) === o) out.add(w - o);
	}
	return [...out].sort((a, b) => a - b);
}

/** For a wall time inside a gap: the instant the clocks jumped (first valid time after it). */
function gapEnd(w: number, zone: string): number {
	const before = offsetAt(w - 864e5, zone);
	const after = offsetAt(w + 864e5, zone);
	// The jump lies between these two instants.
	let lo = w - Math.max(before, after) - 1000;
	let hi = w - Math.min(before, after) + 1000;
	while (hi - lo > 1000) {
		const mid = Math.floor((lo + hi) / 2000) * 1000;
		if (offsetAt(mid, zone) === before) lo = mid;
		else hi = mid;
	}
	return hi;
}

export interface Run {
	instant: number;
	/** Wall time in the zone, YYYY-MM-DD HH:MM:SS. */
	wall: string;
	weekday: string;
	/** UTC offset, e.g. +02:00. */
	offset: string;
	/** Set when DST changed the run. */
	dst?: { kind: 'gap' | 'overlap'; scheduled: string };
}

function fmtWall(w: Wall): string {
	return `${String(w.y).padStart(4, '0')}-${two(w.mo)}-${two(w.d)} ${two(w.h)}:${two(w.mi)}:${two(w.s)}`;
}

function fmtOffset(ms: number): string {
	const m = Math.round(ms / 60000);
	const a = Math.abs(m);
	return `${m < 0 ? '-' : '+'}${two(Math.floor(a / 60))}:${two(a % 60)}`;
}

export function dayMatches(p: Schedule, y: number, mo: number, d: number): boolean {
	if (!p.month.values.includes(mo)) return false;
	const t = new Date(0);
	t.setUTCFullYear(y, mo - 1, d);
	const wd = t.getUTCDay();
	const domOk = p.dom.values.includes(d);
	const dowOk = p.dow.values.includes(wd);
	// Vixie cron: if either field starts with *, both must match; otherwise either may.
	if (p.dom.starLike || p.dow.starLike) return domOk && dowOk;
	return domOk || dowOk;
}

/**
 * The next `count` run times strictly after `from`, in a zone.
 *
 * DST rules: a scheduled wall time that does not exist (spring forward) runs at the
 * first instant after the jump, e.g. 02:30 becomes 03:00. A wall time that occurs twice
 * (fall back) runs once, at the first occurrence. Runs that land on the same instant are
 * merged.
 */
export function nextRuns(
	p: Schedule,
	zone: string,
	from: number,
	count = 10
): { runs: Run[]; exhausted: boolean } {
	const runs: Run[] = [];
	const seen = new Set<number>();
	// Smallest UTC offset around the start. A wall time w can only map to an instant
	// at or before w - minOff, so blocks whose last wall time gives <= from are skipped.
	const minOff = Math.min(...[-2, -1, 0, 1].map((k) => offsetAt(from + k * 864e5, zone)));
	const cutoff = from + minOff;
	const w0 = wallAt(from, zone);
	const t = new Date(0);
	t.setUTCFullYear(w0.y, w0.mo - 1, w0.d - 1);
	t.setUTCHours(0, 0, 0, 0);
	const maxDays = 366 * 30;
	for (let i = 0; i < maxDays && runs.length < count; i++) {
		const day = new Date(t.getTime() + i * 864e5);
		const y = day.getUTCFullYear();
		const mo = day.getUTCMonth() + 1;
		const d = day.getUTCDate();
		if (!dayMatches(p, y, mo, d)) continue;
		const base = day.getTime();
		for (const h of p.hour.values) {
			if (base + h * 36e5 + 3599e3 <= cutoff) continue;
			for (const mi of p.minute.values) {
				if (base + h * 36e5 + mi * 6e4 + 59e3 <= cutoff) continue;
				for (const s of p.second.values) {
					const w = base + h * 36e5 + mi * 6e4 + s * 1000;
					if (w <= cutoff) continue;
					const inst = instantsFor(w, zone);
					let instant: number;
					let dst: Run['dst'];
					const scheduled = fmtWall({ y, mo, d, h, mi, s });
					if (inst.length === 0) {
						instant = gapEnd(w, zone);
						dst = { kind: 'gap', scheduled };
					} else {
						instant = inst[0];
						if (inst.length > 1) dst = { kind: 'overlap', scheduled };
					}
					if (instant <= from || seen.has(instant)) continue;
					seen.add(instant);
					const ww = wallAt(instant, zone);
					runs.push({
						instant,
						wall: fmtWall(ww),
						weekday: dowLong[weekdayOf(ww)],
						offset: fmtOffset(offsetAt(instant, zone)),
						dst
					});
					if (runs.length >= count) break;
				}
				if (runs.length >= count) break;
			}
			if (runs.length >= count) break;
		}
	}
	runs.sort((a, b) => a.instant - b.instant);
	return { runs: runs.slice(0, count), exhausted: runs.length < count };
}

function weekdayOf(w: Wall): number {
	const t = new Date(0);
	t.setUTCFullYear(w.y, w.mo - 1, w.d);
	return t.getUTCDay();
}

/* ---------- Intake ---------- */

const fieldRe = /^[\d*?/,A-Za-z-]+$/;

export function looksLikeCron(s: string): number {
	const t = s.trim();
	if (/^@(yearly|annually|monthly|weekly|daily|midnight|hourly|reboot)\b/i.test(t)) return 0.9;
	const tokens = t.split(/\s+/);
	if (tokens.length !== 5 && tokens.length !== 6) return 0;
	if (!tokens.every((x) => fieldRe.test(x))) return 0;
	try {
		const p = parseCron(t);
		if (p.kind !== 'schedule' || p.command) return 0;
		return tokens.some((x) => x.includes('*') || x.includes('?')) ? 0.9 : 0.3;
	} catch {
		return 0;
	}
}
