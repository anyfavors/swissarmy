/**
 * Equal splits and VLSM planning for IPv4 and IPv6 prefixes. Prefix maths comes from
 * FM 2-05 (cidr-sets), which builds on FM 2-01 and FM 2-02.
 */
import {
	bitsOf,
	formatAddress,
	formatPrefix,
	parsePrefix,
	prefixEnd,
	prefixSize,
	rangeToCidrs,
	type Family,
	type Prefix
} from '../cidr-sets/logic';

export { formatAddress, formatPrefix, parsePrefix, type Family, type Prefix };

/**
 * Usable host addresses in a block. IPv4 loses the network and broadcast address, except /31
 * (two hosts, RFC 3021) and /32. IPv6 has no broadcast: every address is usable, although the
 * first is the subnet-router anycast address (RFC 4291 section 2.6.1).
 */
export function usableHosts(v: Family, len: number): bigint {
	const total = 1n << BigInt(bitsOf(v) - len);
	if (v === 6) return total;
	if (len >= 31) return total;
	return total - 2n;
}

export function firstUsable(p: Prefix): bigint {
	return p.v === 4 && p.len < 31 ? p.net + 1n : p.net;
}

export function lastUsable(p: Prefix): bigint {
	const end = prefixEnd(p);
	return p.v === 4 && p.len < 31 ? end - 1n : end;
}

export interface Subnet extends Prefix {
	first: bigint;
	last: bigint;
	usable: bigint;
}

function subnet(v: Family, net: bigint, len: number): Subnet {
	const p = { v, net, len };
	return { ...p, first: firstUsable(p), last: lastUsable(p), usable: usableHosts(v, len) };
}

export interface Split {
	parent: Prefix;
	newLen: number;
	/** 2^(newLen - parent.len). */
	count: bigint;
	subnets: Subnet[];
	/** True when only the first `limit` subnets are listed. */
	truncated: boolean;
}

/** Splits a prefix into equal subnets of length newLen. Lists at most `limit`. */
export function splitTo(parent: Prefix, newLen: number, limit = 256): Split {
	const bits = bitsOf(parent.v);
	if (!Number.isInteger(newLen) || newLen < parent.len || newLen > bits)
		throw new Error(`New prefix length must be ${parent.len} to ${bits}`);
	const count = 1n << BigInt(newLen - parent.len);
	const step = 1n << BigInt(bits - newLen);
	const n = count < BigInt(limit) ? Number(count) : limit;
	const subnets = Array.from({ length: n }, (_, i) =>
		subnet(parent.v, parent.net + BigInt(i) * step, newLen)
	);
	return { parent, newLen, count, subnets, truncated: count > BigInt(n) };
}

/** Bits needed to make at least n subnets. */
export function bitsForCount(n: bigint): number {
	if (n < 1n) throw new Error('Number of subnets must be at least 1');
	return (n - 1n).toString(2).length - (n === 1n ? 1 : 0);
}

/** Splits into at least n equal subnets (rounded up to a power of two). */
export function splitCount(parent: Prefix, n: bigint, limit = 256): Split {
	const add = bitsForCount(n);
	if (parent.len + add > bitsOf(parent.v))
		throw new Error(`/${parent.len} cannot be split into ${n} subnets`);
	return splitTo(parent, parent.len + add, limit);
}

/** Smallest prefix length whose block holds `hosts` usable addresses. */
export function lenForHosts(v: Family, hosts: bigint, opts: VlsmOptions = {}): number {
	const bits = bitsOf(v);
	if (hosts < 1n) throw new Error('Hosts must be at least 1');
	let len = bits;
	if (v === 4 && !opts.pointToPoint) len = 30;
	while (len > 0 && usableHosts(v, len) < hosts) len--;
	if (usableHosts(v, len) < hosts) throw new Error(`${hosts} hosts do not fit in IPv${v}`);
	if (v === 6 && opts.min64 !== false && len > 64) len = 64;
	return len;
}

export interface Need {
	name: string;
	hosts: bigint;
}

export interface VlsmOptions {
	/** IPv4: allow /31 for two hosts and /32 for one (RFC 3021). Default off: smallest is /30. */
	pointToPoint?: boolean;
	/** IPv6: never allocate smaller than /64 (RFC 7421). Default on. */
	min64?: boolean;
}

export interface Allocation extends Subnet {
	name: string;
	hosts: bigint;
	/** Addresses in the block not asked for: size minus requested hosts. */
	wasted: bigint;
}

export interface Plan {
	parent: Prefix;
	allocations: Allocation[];
	free: Prefix[];
	used: bigint;
	total: bigint;
}

/**
 * Lines like "Office 120", "Office, 120", "Office: 120" or "Office	120". The last number on the
 * line is the host count, the rest is the name.
 */
export function parseNeeds(text: string): Need[] {
	const out: Need[] = [];
	text.split(/\r?\n/).forEach((raw, i) => {
		const line = raw.replace(/#.*$/, '').trim();
		if (!line) return;
		const m = line.match(/^(.*?)[\s,;:=]*(\d[\d_]*)$/);
		if (!m) throw new Error(`Line ${i + 1}: end the line with a host count, e.g. "Office 50"`);
		const hosts = BigInt(m[2].replace(/_/g, ''));
		if (hosts < 1n) throw new Error(`Line ${i + 1}: hosts must be at least 1`);
		out.push({ name: m[1].trim() || `Subnet ${out.length + 1}`, hosts });
	});
	return out;
}

/**
 * Largest first. Blocks are powers of two sorted by size, so placing each right after the
 * previous one keeps every block aligned and leaves one contiguous free range at the end.
 */
export function planVlsm(parent: Prefix, needs: Need[], opts: VlsmOptions = {}): Plan {
	if (!needs.length) throw new Error('Add at least one subnet need');
	const bits = bitsOf(parent.v);
	const sized = needs
		.map((n, i) => ({ ...n, i, len: lenForHosts(parent.v, n.hosts, opts) }))
		.sort((a, b) => a.len - b.len || a.i - b.i);
	const total = prefixSize(parent);
	let used = 0n;
	for (const s of sized) used += 1n << BigInt(bits - s.len);
	if (used > total) {
		const tooBig = sized.find((s) => s.len < parent.len);
		if (tooBig)
			throw new Error(
				`"${tooBig.name}" needs a /${tooBig.len}, larger than ${formatPrefix(parent)}`
			);
		throw new Error(
			`The plan needs ${used} addresses, ${formatPrefix(parent)} has ${total}. Use a shorter parent prefix or fewer hosts.`
		);
	}
	let cur = parent.net;
	const allocations: Allocation[] = sized.map((s) => {
		const sub = subnet(parent.v, cur, s.len);
		cur += 1n << BigInt(bits - s.len);
		return { ...sub, name: s.name, hosts: s.hosts, wasted: prefixSize(sub) - s.hosts };
	});
	const end = prefixEnd(parent);
	const free = cur <= end ? rangeToCidrs({ v: parent.v, start: cur, end }) : [];
	return { parent, allocations, free, used, total };
}

const csvCell = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export function planRows(plan: Plan): string[][] {
	const f = (n: bigint) => formatAddress(plan.parent.v, n);
	return plan.allocations.map((a) => [
		a.name,
		String(a.hosts),
		formatPrefix(a),
		f(a.first),
		f(a.last),
		String(a.usable),
		String(a.wasted)
	]);
}

export const planHeader = ['Name', 'Hosts', 'Prefix', 'First', 'Last', 'Usable', 'Wasted'];

/** RFC 4180 CSV with CRLF line ends. */
export function planCsv(plan: Plan): string {
	const rows = [planHeader, ...planRows(plan)];
	for (const fr of plan.free) rows.push(['(free)', '', formatPrefix(fr), '', '', '', '']);
	return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function planMarkdown(plan: Plan): string {
	const esc = (s: string) => s.replace(/\|/g, '\\|');
	const lines = [
		`| ${planHeader.join(' | ')} |`,
		`| ${planHeader.map((_, i) => (i === 1 || i >= 5 ? '---:' : '---')).join(' | ')} |`,
		...planRows(plan).map((r) => `| ${r.map(esc).join(' | ')} |`)
	];
	if (plan.free.length) {
		lines.push('', `Free: ${plan.free.map(formatPrefix).join(', ')}`);
	}
	return lines.join('\n') + '\n';
}
