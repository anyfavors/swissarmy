/**
 * Address sets for IPv4 and IPv6 as BigInt ranges: parsing lists of addresses, prefixes and
 * ranges, aggregation to the minimal CIDR set, range to CIDR conversion, set difference and
 * membership checks. Parsing and formatting reuse FM 2-01 (cidr) and FM 2-02 (ip).
 */
import { maskToPrefix } from '../cidr/logic';
import { compressIPv6, formatIPv4, mask, parseIPv4, parseIPv6 } from '../ip/logic';

export type Family = 4 | 6;

export const bitsOf = (v: Family): number => (v === 4 ? 32 : 128);
export const maxOf = (v: Family): bigint => (1n << BigInt(bitsOf(v))) - 1n;

export interface Prefix {
	v: Family;
	net: bigint;
	len: number;
}

/** Inclusive range of addresses in one family. */
export interface Range {
	v: Family;
	start: bigint;
	end: bigint;
}

export function formatAddress(v: Family, n: bigint): string {
	return v === 4 ? formatIPv4(Number(n)) : compressIPv6(n);
}

export function formatPrefix(p: Prefix): string {
	return `${formatAddress(p.v, p.net)}/${p.len}`;
}

export function formatRange(r: Range): string {
	return r.start === r.end
		? formatAddress(r.v, r.start)
		: `${formatAddress(r.v, r.start)}-${formatAddress(r.v, r.end)}`;
}

/** An IPv4 or IPv6 address, without prefix. IPv6 may be written in brackets. */
export function parseAddress(raw: string): { v: Family; n: bigint } {
	let s = raw.trim();
	if (!s) throw new Error('Empty address');
	if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1);
	if (s.includes(':')) return { v: 6, n: parseIPv6(s) };
	return { v: 4, n: BigInt(parseIPv4(s)) };
}

export function prefixSize(p: Prefix): bigint {
	return 1n << BigInt(bitsOf(p.v) - p.len);
}

export function prefixEnd(p: Prefix): bigint {
	return p.net + prefixSize(p) - 1n;
}

export function prefixToRange(p: Prefix): Range {
	return { v: p.v, start: p.net, end: prefixEnd(p) };
}

export interface ParsedPrefix extends Prefix {
	/** The address as typed, before host bits were cleared. */
	input: bigint;
	hostBitsSet: boolean;
}

/**
 * "10.0.0.0/8", "10.0.0.0/255.0.0.0", "2001:db8::/32" or a bare address (/32 or /128).
 * Host bits are cleared and reported in `hostBitsSet`.
 */
export function parsePrefix(raw: string): ParsedPrefix {
	const s = raw.trim();
	if (!s) throw new Error('Enter a prefix, e.g. 10.0.0.0/16 or 2001:db8::/48');
	const slash = s.indexOf('/');
	const addr = parseAddress(slash < 0 ? s : s.slice(0, slash));
	const bits = bitsOf(addr.v);
	let len = bits;
	if (slash >= 0) {
		const p = s.slice(slash + 1).trim();
		if (addr.v === 4 && p.includes('.')) len = maskToPrefix(parseIPv4(p));
		else if (/^\d{1,3}$/.test(p) && Number(p) <= bits) len = Number(p);
		else throw new Error(`Prefix length in "${s}" must be 0 to ${bits}`);
	}
	const net = addr.n & mask(bits, len);
	return { v: addr.v, net, len, input: addr.n, hostBitsSet: net !== addr.n };
}

/**
 * Splits [start, end] into the fewest aligned CIDR blocks, lowest first.
 * Each step takes the largest block that starts at `start` and stays inside the range.
 */
export function rangeToCidrs(r: Range): Prefix[] {
	if (r.start > r.end) throw new Error('Range start is after its end');
	const bits = bitsOf(r.v);
	const out: Prefix[] = [];
	let cur = r.start;
	while (cur <= r.end) {
		// Largest power of two that divides cur (alignment), capped by the remaining size.
		let size = cur === 0n ? 1n << BigInt(bits) : cur & -cur;
		const remaining = r.end - cur + 1n;
		while (size > remaining) size >>= 1n;
		const host = size.toString(2).length - 1;
		out.push({ v: r.v, net: cur, len: bits - host });
		cur += size;
	}
	return out;
}

/** Sorts (IPv4 first) and merges overlapping or adjacent ranges within each family. */
export function mergeRanges(ranges: Range[]): Range[] {
	const sorted = ranges
		.slice()
		.sort((a, b) => a.v - b.v || (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
		.map((r) => ({ ...r }));
	const out: Range[] = [];
	for (const r of sorted) {
		const last = out[out.length - 1];
		if (last && last.v === r.v && r.start <= last.end + 1n) {
			if (r.end > last.end) last.end = r.end;
		} else out.push(r);
	}
	return out;
}

/** a minus b, both lists merged first. */
export function subtractRanges(a: Range[], b: Range[]): Range[] {
	const cut = mergeRanges(b);
	const out: Range[] = [];
	for (const r of mergeRanges(a)) {
		let start = r.start;
		let done = false;
		for (const c of cut) {
			if (c.v !== r.v || c.end < start) continue;
			if (c.start > r.end) break;
			if (c.start > start) out.push({ v: r.v, start, end: c.start - 1n });
			if (c.end >= r.end) {
				done = true;
				break;
			}
			start = c.end + 1n;
		}
		if (!done && start <= r.end) out.push({ v: r.v, start, end: r.end });
	}
	return out;
}

export function intersectRanges(a: Range[], b: Range[]): Range[] {
	const out: Range[] = [];
	const bm = mergeRanges(b);
	for (const r of mergeRanges(a))
		for (const c of bm) {
			if (c.v !== r.v) continue;
			const s = r.start > c.start ? r.start : c.start;
			const e = r.end < c.end ? r.end : c.end;
			if (s <= e) out.push({ v: r.v, start: s, end: e });
		}
	return out;
}

export function rangeSize(r: Range): bigint {
	return r.end - r.start + 1n;
}

export interface Entry {
	/** The text as written. */
	text: string;
	line: number;
	range: Range;
	hostBitsSet?: boolean;
}

export interface ParsedList {
	entries: Entry[];
	errors: string[];
}

/** One entry: an address, a prefix, a netmask form or a range "a-b". */
export function parseEntry(raw: string): { range: Range; hostBitsSet?: boolean } {
	const s = raw.trim();
	const dash = s.match(/^([^\s-]+)\s*(?:-|\u2013|\bto\b)\s*([^\s-]+)$/);
	if (dash) {
		const a = parseAddress(dash[1]);
		const b = parseAddress(dash[2]);
		if (a.v !== b.v) throw new Error(`"${s}" mixes IPv4 and IPv6`);
		if (a.n > b.n) throw new Error(`"${s}": the start is after the end`);
		return { range: { v: a.v, start: a.n, end: b.n } };
	}
	const p = parsePrefix(s);
	return { range: prefixToRange(p), hostBitsSet: p.hostBitsSet };
}

/**
 * A list separated by newlines, commas, semicolons or spaces. "#" and "//" start a comment.
 * "10.0.0.0 255.0.0.0" (address, space, netmask) is read as one entry.
 */
export function parseList(text: string): ParsedList {
	const entries: Entry[] = [];
	const errors: string[] = [];
	text.split(/\r?\n/).forEach((rawLine, i) => {
		const line = rawLine.replace(/(#|\/\/).*$/, '').trim();
		if (!line) return;
		const joined = line
			.replace(/(\d+\.\d+\.\d+\.\d+)\s+(255\.\d+\.\d+\.\d+)/g, '$1/$2')
			.replace(/\s*(?:-|\u2013)\s*/g, '-')
			.replace(/\s+to\s+/gi, '-');
		for (const tok of joined.split(/[\s,;]+/)) {
			if (!tok) continue;
			try {
				const e = parseEntry(tok);
				entries.push({ text: tok, line: i + 1, ...e });
			} catch (err) {
				errors.push(`Line ${i + 1}: ${(err as Error).message}`);
			}
		}
	});
	return { entries, errors };
}

export function cidrsOf(ranges: Range[]): Prefix[] {
	return mergeRanges(ranges).flatMap(rangeToCidrs);
}

/** IPv4 first, then IPv6, each sorted. */
export function byFamily<T extends { v: Family }>(xs: T[]): T[] {
	return [...xs.filter((x) => x.v === 4), ...xs.filter((x) => x.v === 6)];
}

export interface SetSummary {
	cidrs: Prefix[];
	ranges: Range[];
	count4: bigint;
	count6: bigint;
}

export function summarise(ranges: Range[]): SetSummary {
	const merged = byFamily(mergeRanges(ranges));
	let count4 = 0n;
	let count6 = 0n;
	for (const r of merged) {
		if (r.v === 4) count4 += rangeSize(r);
		else count6 += rangeSize(r);
	}
	return { cidrs: merged.flatMap(rangeToCidrs), ranges: merged, count4, count6 };
}

/** Throws on the first unreadable entry, for the chain view. */
export function aggregateText(text: string): string {
	const { entries, errors } = parseList(text);
	if (errors.length) throw new Error(errors[0]);
	if (!entries.length) throw new Error('No addresses or prefixes found');
	return summarise(entries.map((e) => e.range))
		.cidrs.map(formatPrefix)
		.join('\n');
}

export type Containment = 'inside' | 'partial' | 'outside';

export interface CheckRow {
	entry: Entry;
	status: Containment;
	/** Entries of the second list that contain or overlap this one. */
	matches: Entry[];
}

/** For each entry of `items`, which entries of `sets` contain it fully or overlap it. */
export function checkMembership(items: Entry[], sets: Entry[]): CheckRow[] {
	const all = sets.map((s) => s.range);
	return items.map((entry) => {
		const r = entry.range;
		const matches = sets.filter(
			(s) => s.range.v === r.v && s.range.start <= r.end && s.range.end >= r.start
		);
		let status: Containment = 'outside';
		if (matches.length) {
			const rest = subtractRanges([r], all);
			status = rest.length === 0 ? 'inside' : 'partial';
		}
		return { entry, status, matches };
	});
}

/** Format a big count with thousands separators, and as a power of two when exact and large. */
export function formatCount(n: bigint): string {
	const digits = n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	if (n > 0n && (n & (n - 1n)) === 0n && n > 1n << 32n)
		return `2^${n.toString(2).length - 1} (${digits})`;
	return digits;
}

export interface Preset {
	id: string;
	label: string;
	include: string;
	exclude: string;
	note: string;
}

/** RFC 1918 private ranges. RFC 4193 ULA, RFC 4291 link-local and multicast for IPv6. */
export const presets: Preset[] = [
	{
		id: 'wg-rfc1918',
		label: 'WireGuard: all IPv4 except RFC 1918',
		include: '0.0.0.0/0',
		exclude: '10.0.0.0/8\n172.16.0.0/12\n192.168.0.0/16',
		note: 'Full tunnel for IPv4 while private LAN ranges stay local. Paste the result into AllowedIPs.'
	},
	{
		id: 'wg-local',
		label: 'WireGuard: all IPv4 and IPv6 except local ranges',
		include: '0.0.0.0/0\n::/0',
		exclude:
			'10.0.0.0/8\n172.16.0.0/12\n192.168.0.0/16\n169.254.0.0/16 # link-local\n' +
			'fc00::/7 # ULA\nfe80::/10 # link-local',
		note: 'Excludes RFC 1918, IPv4 link-local, IPv6 unique local and link-local addresses.'
	},
	{
		id: 'wg-endpoint',
		label: 'WireGuard: all IPv4 except the endpoint',
		include: '0.0.0.0/0',
		exclude: '203.0.113.10 # replace with your endpoint',
		note: 'Keeps the tunnel endpoint itself out of AllowedIPs, for clients without policy routing.'
	}
];
