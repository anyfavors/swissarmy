import { quantities, type Quantity, type Unit } from './data';

export { quantities };
export type { Quantity, Unit };

interface Entry {
	q: Quantity;
	u: Unit;
}

const exact = new Map<string, Entry[]>();
const folded = new Map<string, Entry[]>();

function add(map: Map<string, Entry[]>, key: string, e: Entry) {
	const list = map.get(key) ?? [];
	if (!list.some((x) => x.u === e.u)) list.push(e);
	map.set(key, list);
}

for (const q of quantities)
	for (const u of q.units)
		for (const a of [u.symbol, ...(u.aliases ?? [])]) {
			add(exact, a, { q, u });
			add(folded, a.toLowerCase(), { q, u });
		}

const byLength = (m: Map<string, Entry[]>) => [...m.keys()].sort((a, b) => b.length - a.length);
const exactKeys = byLength(exact);
const foldedKeys = byLength(folded);

/** A unit ends where a letter does not follow, so m does not match the start of mi. */
const boundary = (s: string, i: number) => i >= s.length || !/\p{L}/u.test(s[i]);

function matchUnit(rest: string): { entries: Entry[]; len: number } | null {
	for (const k of exactKeys)
		if (rest.startsWith(k) && boundary(rest, k.length))
			return { entries: exact.get(k)!, len: k.length };
	const low = rest.toLowerCase();
	for (const k of foldedKeys) {
		if (!low.startsWith(k) || !boundary(rest, k.length)) continue;
		const entries = folded.get(k)!;
		// Only accept a case-insensitive match that cannot mean two units (mW and MW).
		if (entries.length === 1 || entries.every((e) => e.q === entries[0].q && e.u === entries[0].u))
			return { entries, len: k.length };
	}
	return null;
}

function pick(entries: Entry[], prefer?: Quantity): Entry {
	return (prefer && entries.find((e) => e.q === prefer)) || entries[0];
}

export interface Term {
	value: number;
	unit: Unit;
}

export interface Parsed {
	quantity: Quantity;
	terms: Term[];
	/** Value in the SI unit of the quantity (kelvin for temperatures). */
	si: number;
	/** Unit asked for with "to", "in" or "->". */
	target?: Unit;
	readAs: string;
}

export function toSi(value: number, u: Unit): number {
	return u.to ? u.to(value) : value * u.factor;
}

export function fromSi(si: number, u: Unit): number {
	return u.from ? u.from(si) : si / u.factor;
}

function normalise(raw: string): string {
	return raw
		.trim()
		.replace(/º/g, '°')
		.replace(/−/g, '-')
		.replace(/(\d),(\d)/g, '$1.$2')
		.replace(/\bdeg(?:rees?)?\s*([CFR])\b/gi, '°$1')
		.replace(/°\s+(?=[CFKR]\b)/g, '°');
}

const numberRe = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?/i;
const targetRe = /^(?:to|in|into|as|->|→|=)\s*/i;

/**
 * Reads free text such as "5 ft 11 in", "72 °F", "3 mi to km", "12°30'", "1,5 kWh".
 * A comma between digits is a decimal comma. Several terms of the same quantity are added.
 */
export function parseQuantity(raw: string): Parsed {
	const s = normalise(raw);
	if (!s) throw new Error('Enter a value with a unit, like 5 ft 11 in or 72 °F');
	const terms: Term[] = [];
	let quantity: Quantity | undefined;
	let target: Unit | undefined;
	let i = 0;
	const skip = () => {
		while (i < s.length && /\s/.test(s[i])) i++;
	};
	while (true) {
		skip();
		if (i >= s.length) break;
		let rest = s.slice(i);
		if (terms.length) {
			const join = rest.match(/^(?:\+|and\b|og\b)\s*/i);
			if (join && numberRe.test(rest.slice(join[0].length))) {
				i += join[0].length;
				rest = s.slice(i);
			}
		}
		const num = rest.match(numberRe);
		if (num) {
			i += num[0].length;
			skip();
			const m = matchUnit(s.slice(i));
			if (!m) {
				const word = s.slice(i).match(/^\S+/)?.[0];
				throw new Error(
					word
						? `Unknown unit "${word}"`
						: `${num[0]} needs a unit, like ${num[0]} m or ${num[0]} °C`
				);
			}
			const e = pick(m.entries, quantity);
			if (quantity && e.q !== quantity)
				throw new Error(
					`Cannot add ${e.u.symbol} (${e.q.name.toLowerCase()}) to ${quantity.name.toLowerCase()}`
				);
			quantity = e.q;
			terms.push({ value: Number(num[0]), unit: e.u });
			i += m.len;
			continue;
		}
		const kw = terms.length ? rest.match(targetRe) : null;
		if (kw) {
			const after = rest.slice(kw[0].length);
			const m = matchUnit(after);
			if (!m || after.slice(m.len).trim()) throw new Error(`Unknown target unit "${after.trim()}"`);
			const e = pick(m.entries, quantity);
			if (e.q !== quantity)
				throw new Error(
					`Cannot convert ${quantity!.name.toLowerCase()} to ${e.u.symbol} (${e.q.name.toLowerCase()})`
				);
			target = e.u;
			break;
		}
		throw new Error(`Cannot read "${rest}", expected a number and a unit`);
	}
	if (!quantity || !terms.length)
		throw new Error('Enter a value with a unit, like 5 ft 11 in or 72 °F');
	if (terms.length > 1 && !quantity.compound)
		throw new Error(`${quantity.name} values cannot be added up; enter one value`);
	const si = terms.reduce((a, t) => a + toSi(t.value, t.unit), 0);
	const readAs = terms.map((t) => `${t.value} ${t.unit.symbol}`).join(' + ');
	return { quantity, terms, si, target, readAs };
}

export function getQuantity(id: string): Quantity | undefined {
	return quantities.find((q) => q.id === id);
}

export interface Row {
	unit: Unit;
	value: number;
}

export function table(q: Quantity, si: number): Row[] {
	return q.units.map((unit) => ({ unit, value: fromSi(si, unit) }));
}

/** Rounds away binary noise: 12 significant digits. */
export function clean(x: number): number {
	return Number(x.toPrecision(12));
}

export function fmt(x: number): string {
	if (!Number.isFinite(x)) return String(x);
	const v = clean(x);
	if (v === 0) return '0';
	const a = Math.abs(v);
	if (a >= 1e12 || a < 1e-6)
		return v
			.toExponential(11)
			.replace(/\.?0+e/, 'e')
			.replace('e+', 'e');
	return new Intl.NumberFormat('en-GB', { maximumSignificantDigits: 12 }).format(v);
}

/** Plain digits for copying: 15 significant digits, no grouping. */
export function plain(x: number): string {
	return String(Number(x.toPrecision(15)));
}

/** Mixed forms such as 5 ft 11 in, 12 st 3 lb, 1 h 30 min, 12° 30′ 15″. */
export function mixed(q: Quantity, si: number): string | null {
	const split = (v: number, big: number, small: number, bs: string, ss: string, dp: number) => {
		const neg = v < 0;
		let total = Math.abs(v) / small;
		total = Math.round(total * 10 ** dp) / 10 ** dp;
		const per = big / small;
		let b = Math.floor(total / per + 1e-9);
		let r = Math.round((total - b * per) * 10 ** dp) / 10 ** dp;
		if (r >= per) {
			b++;
			r = 0;
		}
		return `${neg ? '-' : ''}${b} ${bs} ${fmt(r)} ${ss}`;
	};
	const f = (id: string) => q.units.find((u) => u.id === id)!.factor;
	switch (q.id) {
		case 'length':
			return split(si, f('ft'), f('in'), 'ft', 'in', 2);
		case 'mass':
			return `${split(si, f('lb'), f('oz'), 'lb', 'oz', 2)} · ${split(si, f('st'), f('lb'), 'st', 'lb', 2)}`;
		case 'angle': {
			const deg = Math.abs(si) / f('deg');
			let d = Math.floor(deg + 1e-12);
			let m = Math.floor((deg - d) * 60 + 1e-9);
			let sec = Math.round(((deg - d) * 60 - m) * 60 * 100) / 100;
			if (sec >= 60) {
				sec = 0;
				m++;
			}
			if (m >= 60) {
				m = 0;
				d++;
			}
			return `${si < 0 ? '-' : ''}${d}° ${m}′ ${fmt(sec)}″`;
		}
		case 'time': {
			const neg = si < 0;
			let t = Math.abs(si);
			const d = Math.floor(t / 86400);
			t -= d * 86400;
			const h = Math.floor(t / 3600);
			t -= h * 3600;
			const m = Math.floor(t / 60);
			const sec = clean(t - m * 60);
			const parts = [
				d && `${d} d`,
				h && `${h} h`,
				m && `${m} min`,
				(sec || !(d || h || m)) && `${fmt(sec)} s`
			];
			return (neg ? '-' : '') + parts.filter(Boolean).join(' ');
		}
	}
	return null;
}

/** Below absolute zero is not a temperature. */
export function temperatureWarning(p: Parsed): string | null {
	if (p.quantity.id === 'temperature' && p.si < 0)
		return 'Below absolute zero (0 K), which no temperature can be';
	return null;
}

export function looksLikeQuantity(raw: string): number {
	const t = raw.trim();
	if (t.length > 40 || !/\d/.test(t) || !/[^\d\s.,+-]/.test(t)) return 0;
	try {
		parseQuantity(t);
		return 0.5;
	} catch {
		return 0;
	}
}
