import { classify as classifyV4, formatIPv4, parseIPv4 } from '../cidr/logic';

export { formatIPv4, parseIPv4 };

/** Parses an IPv6 address (no prefix, no zone) into a 128-bit BigInt. */
export function parseIPv6(raw: string): bigint {
	const s = raw.trim();
	const bad = (why: string) => new Error(`"${s}" is not an IPv6 address: ${why}`);
	if (!s) throw new Error('Enter an IPv6 address');
	if (!/^[0-9a-fA-F:.]+$/.test(s)) {
		const c = s.match(/[^0-9a-fA-F:.]/)![0];
		throw bad(`unexpected character "${c}"`);
	}
	const dbl = s.split('::');
	if (dbl.length > 2) throw bad(':: may appear only once');
	const side = (part: string, isLast: boolean): number[] => {
		if (part === '') return [];
		const groups = part.split(':');
		const out: number[] = [];
		groups.forEach((g, i) => {
			if (g.includes('.')) {
				if (!isLast || i !== groups.length - 1)
					throw bad('an embedded IPv4 address must come last');
				let v: number;
				try {
					v = parseIPv4(g);
				} catch {
					throw bad(`"${g}" is not a valid embedded IPv4 address`);
				}
				out.push(v >>> 16, v & 0xffff);
			} else {
				if (!/^[0-9a-fA-F]{1,4}$/.test(g))
					throw bad(g === '' ? 'empty group' : `group "${g}" must be 1 to 4 hex digits`);
				out.push(parseInt(g, 16));
			}
		});
		return out;
	};
	let groups: number[];
	if (dbl.length === 2) {
		const head = side(dbl[0], false);
		const tail = side(dbl[1], true);
		const fill = 8 - head.length - tail.length;
		if (fill < 1) throw bad('too many groups for ::');
		groups = [...head, ...new Array(fill).fill(0), ...tail];
	} else {
		groups = side(s, true);
		if (groups.length !== 8) throw bad(`needs 8 groups, found ${groups.length}`);
	}
	return groups.reduce((acc, g) => (acc << 16n) | BigInt(g), 0n);
}

export function groups(n: bigint): number[] {
	return Array.from({ length: 8 }, (_, i) => Number((n >> BigInt((7 - i) * 16)) & 0xffffn));
}

/** Full form: eight groups of four lowercase hex digits. */
export function expandIPv6(n: bigint): string {
	return groups(n)
		.map((g) => g.toString(16).padStart(4, '0'))
		.join(':');
}

/**
 * Canonical text form per RFC 5952: lowercase, no leading zeros, the longest run
 * of two or more zero groups replaced by ::, the leftmost run on a tie.
 * IPv4-mapped addresses are written with the IPv4 part in dotted form (section 5).
 */
export function compressIPv6(n: bigint): string {
	if (n >> 32n === 0xffffn) return `::ffff:${formatIPv4(Number(n & 0xffffffffn))}`;
	const g = groups(n);
	let bestStart = -1;
	let bestLen = 0;
	for (let i = 0; i < 8;) {
		if (g[i] !== 0) {
			i++;
			continue;
		}
		let j = i;
		while (j < 8 && g[j] === 0) j++;
		if (j - i > bestLen) {
			bestStart = i;
			bestLen = j - i;
		}
		i = j;
	}
	const hex = g.map((x) => x.toString(16));
	if (bestLen < 2) return hex.join(':');
	const left = hex.slice(0, bestStart).join(':');
	const right = hex.slice(bestStart + bestLen).join(':');
	return `${left}::${right}`;
}

export interface Classification {
	label: string;
	rfc?: string;
}

interface Range6 {
	net: bigint;
	prefix: number;
	c: Classification;
}

const r6 = (addr: string, prefix: number, label: string, rfc: string): Range6 => ({
	net: parseIPv6(addr),
	prefix,
	c: { label, rfc }
});

/** Most specific first. */
const special6: Range6[] = [
	r6('::', 128, 'Unspecified', 'RFC 4291'),
	r6('::1', 128, 'Loopback', 'RFC 4291'),
	r6('::ffff:0:0', 96, 'IPv4-mapped', 'RFC 4291'),
	r6('64:ff9b::', 96, 'NAT64 well-known prefix', 'RFC 6052'),
	r6('64:ff9b:1::', 48, 'NAT64 local-use prefix', 'RFC 8215'),
	r6('100::', 64, 'Discard-only', 'RFC 6666'),
	r6('2001::', 32, 'Teredo', 'RFC 4380'),
	r6('2001:db8::', 32, 'Documentation', 'RFC 3849'),
	r6('3fff::', 20, 'Documentation', 'RFC 9637'),
	r6('2002::', 16, '6to4', 'RFC 3056'),
	r6('fc00::', 7, 'Unique local (ULA)', 'RFC 4193'),
	r6('fe80::', 10, 'Link-local', 'RFC 4291'),
	r6('ff00::', 8, 'Multicast', 'RFC 4291'),
	r6('2000::', 3, 'Global unicast', 'RFC 4291')
].sort((a, b) => b.prefix - a.prefix);

export function mask(bits: number, prefix: number): bigint {
	const all = (1n << BigInt(bits)) - 1n;
	return prefix === 0 ? 0n : (all >> BigInt(bits - prefix)) << BigInt(bits - prefix);
}

export function classifyIPv6(n: bigint): Classification {
	for (const r of special6) if ((n & mask(128, r.prefix)) === r.net) return r.c;
	return { label: 'Reserved or unassigned', rfc: 'RFC 4291' };
}

/** The special-purpose IPv6 ranges, for display. */
export const ipv6Ranges = special6
	.slice()
	.sort((a, b) => (a.net < b.net ? -1 : a.net > b.net ? 1 : a.prefix - b.prefix))
	.map((r) => ({ cidr: `${compressIPv6(r.net)}/${r.prefix}`, ...r.c }));

export interface Embedded {
	label: string;
	value: string;
}

/** IPv4 addresses carried inside some IPv6 ranges. */
export function embeddedIPv4(n: bigint): Embedded[] {
	const v4 = (x: bigint) => formatIPv4(Number(x & 0xffffffffn));
	const c = classifyIPv6(n).label;
	if (c === 'IPv4-mapped' || c.startsWith('NAT64'))
		return [{ label: 'Embedded IPv4', value: v4(n) }];
	if (c === '6to4') return [{ label: 'Embedded IPv4', value: v4(n >> 80n) }];
	if (c === 'Teredo') {
		return [
			{ label: 'Teredo server', value: v4(n >> 64n) },
			{ label: 'Teredo client (public)', value: v4(~n) },
			{ label: 'Teredo client port', value: String(Number((~n >> 32n) & 0xffffn)) }
		];
	}
	return [];
}

export interface IpResult {
	version: 4 | 6;
	bits: 32 | 128;
	value: bigint;
	prefix?: number;
	zone?: string;
	canonical: string;
	expanded: string;
	classification: Classification;
	embedded: Embedded[];
	network?: bigint;
	last?: bigint;
}

export function formatAddr(version: 4 | 6, n: bigint): string {
	return version === 4 ? formatIPv4(Number(n)) : compressIPv6(n);
}

/** Accepts an IPv4 or IPv6 address, an optional /prefix and, for IPv6, an optional %zone. */
export function analyse(raw: string): IpResult {
	let s = raw.trim();
	if (!s) throw new Error('Enter an IPv4 or IPv6 address');
	if (s.startsWith('[')) s = s.replace(/^\[([^\]]*)\](?::\d+)?$/, '$1');
	let prefix: number | undefined;
	const slash = s.indexOf('/');
	if (slash >= 0) {
		const p = s.slice(slash + 1).trim();
		s = s.slice(0, slash).trim();
		if (!/^\d{1,3}$/.test(p)) throw new Error(`Prefix "/${p}" must be a number`);
		prefix = Number(p);
	}
	let zone: string | undefined;
	const pct = s.indexOf('%');
	if (pct >= 0) {
		zone = s.slice(pct + 1);
		s = s.slice(0, pct);
		if (!zone) throw new Error('Empty zone after %');
	}
	const v6 = s.includes(':');
	if (!v6 && zone) throw new Error('Zone IDs (%...) only apply to IPv6');
	const version = v6 ? 6 : 4;
	const bits = v6 ? 128 : 32;
	if (prefix !== undefined && prefix > bits) throw new Error(`Prefix must be 0 to ${bits}`);
	const value = v6 ? parseIPv6(s) : BigInt(parseIPv4(s));
	const r: IpResult = {
		version,
		bits,
		value,
		prefix,
		zone,
		canonical: v6 ? compressIPv6(value) : formatIPv4(Number(value)),
		expanded: v6
			? expandIPv6(value)
			: formatIPv4(Number(value))
					.split('.')
					.map((o) => o.padStart(3, '0'))
					.join('.'),
		classification: v6 ? classifyIPv6(value) : classifyV4(Number(value)),
		embedded: v6 ? embeddedIPv4(value) : []
	};
	if (prefix !== undefined) {
		const m = mask(bits, prefix);
		r.network = value & m;
		r.last = r.network | (((1n << BigInt(bits)) - 1n) ^ m);
	}
	return r;
}

export function toHex(n: bigint, bits: number): string {
	return '0x' + n.toString(16).padStart(bits / 4, '0');
}

/** Binary, 8-bit groups for IPv4 and 16-bit groups split into nibbles for IPv6. */
export function toBinaryGroups(n: bigint, bits: number): string[] {
	const b = n.toString(2).padStart(bits, '0');
	const size = bits === 32 ? 8 : 16;
	const out: string[] = [];
	for (let i = 0; i < bits; i += size) out.push(b.slice(i, i + size));
	return out;
}

export function reverseDns(version: 4 | 6, n: bigint): string {
	if (version === 4) return formatIPv4(Number(n)).split('.').reverse().join('.') + '.in-addr.arpa';
	return n.toString(16).padStart(32, '0').split('').reverse().join('.') + '.ip6.arpa';
}

/** 2^k written out, with the power for large values. */
export function addressCount(bits: number, prefix: number): string {
	const host = bits - prefix;
	const n = 1n << BigInt(host);
	const digits = n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	return host > 32 ? `2^${host} (${digits})` : digits;
}

export function looksLikeIp(s: string): number {
	const t = s.trim();
	if (/^\d{1,3}(\.\d{1,3}){3}$/.test(t)) return 0.5;
	if (t.length > 60 || !t.includes(':') || !/^[0-9a-fA-F:.]+(%[\w.-]+)?(\/\d{1,3})?$/.test(t))
		return 0;
	if ((t.match(/:/g) ?? []).length < 2) return 0;
	try {
		analyse(t);
		return 0.9;
	} catch {
		return 0;
	}
}
