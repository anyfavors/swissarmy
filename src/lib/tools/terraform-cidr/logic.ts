/*
 * Terraform's IP network functions, simulated:
 * https://developer.hashicorp.com/terraform/language/functions/cidrsubnet (and cidrsubnets,
 * cidrhost, cidrnetmask). Terraform implements them with github.com/apparentlymart/go-cidr;
 * error messages follow that library's wording. Everything is BigInt so IPv6 works.
 */
import { formatIPv4, parseIPv4 } from '../cidr/logic';
import { compressIPv6, parseIPv6 } from '../ip/logic';

export interface Net {
	version: 4 | 6;
	bits: 32 | 128;
	/** Network address, host bits cleared. */
	addr: bigint;
	prefix: number;
}

function maskOf(bits: number, prefix: number): bigint {
	if (prefix === 0) return 0n;
	const all = (1n << BigInt(bits)) - 1n;
	return (all >> BigInt(bits - prefix)) << BigInt(bits - prefix);
}

export function formatAddr(version: 4 | 6, n: bigint): string {
	return version === 4 ? formatIPv4(Number(n)) : compressIPv6(n);
}

export function formatNet(n: Net): string {
	return `${formatAddr(n.version, n.addr)}/${n.prefix}`;
}

/**
 * Parses "a.b.c.d/n" or "x:y::/n". Like Terraform (Go's net.ParseCIDR), host bits in the
 * address are ignored: 10.1.2.3/16 is the network 10.1.0.0/16.
 */
export function parsePrefix(raw: string): Net {
	const s = raw.trim();
	if (!s) throw new Error('Enter a prefix in CIDR notation, e.g. 10.0.0.0/16');
	const m = /^([^/\s]+)\/(\d{1,3})$/.exec(s);
	if (!m) throw new Error(`invalid CIDR address: ${s} (needs an address, a slash and a length)`);
	const v6 = m[1].includes(':');
	const bits = v6 ? 128 : 32;
	const prefix = Number(m[2]);
	if (prefix > bits)
		throw new Error(`invalid CIDR address: ${s} (an IPv${v6 ? 6 : 4} prefix is at most /${bits})`);
	let addr: bigint;
	try {
		addr = v6 ? parseIPv6(m[1]) : BigInt(parseIPv4(m[1]));
	} catch (e) {
		throw new Error(`invalid CIDR address: ${s} (${(e as Error).message})`);
	}
	return { version: v6 ? 6 : 4, bits, addr: addr & maskOf(bits, prefix), prefix };
}

/** Whole number from text: digits with an optional minus sign. */
export function parseWhole(raw: string, what: string): bigint {
	const s = raw.trim();
	if (!/^-?\d+$/.test(s)) throw new Error(`${what} must be a whole number, got "${raw}"`);
	return BigInt(s);
}

/** True when the host bits of the written address were not zero. */
export function hostBitsSet(raw: string): boolean {
	const m = /^([^/\s]+)\/(\d{1,3})$/.exec(raw.trim());
	if (!m) return false;
	try {
		const v6 = m[1].includes(':');
		const a = v6 ? parseIPv6(m[1]) : BigInt(parseIPv4(m[1]));
		return a !== parsePrefix(raw).addr;
	} catch {
		return false;
	}
}

/** cidrsubnet(prefix, newbits, netnum) */
export function cidrsubnet(prefix: string, newbits: bigint, netnum: bigint): Net {
	const base = parsePrefix(prefix);
	if (newbits < 0n) throw new Error('newbits must not be negative');
	// Terraform rejects this before calling go-cidr (internal/lang/funcs/cidr.go).
	if (newbits > 32n) throw new Error('may not extend prefix by more than 32 bits');
	const nb = Number(newbits);
	const newLen = base.prefix + nb;
	if (newLen > base.bits)
		throw new Error(`insufficient address space to extend prefix of ${base.prefix} by ${nb}`);
	if (netnum < 0n) throw new Error('netnum must not be negative');
	if (netnum >= 1n << newbits)
		throw new Error(
			`prefix extension of ${nb} does not accommodate a subnet numbered ${netnum} (the largest is ${(1n << newbits) - 1n})`
		);
	const addr = base.addr | (netnum << BigInt(base.bits - newLen));
	return { version: base.version, bits: base.bits, addr, prefix: newLen };
}

/**
 * cidrhost(prefix, hostnum). A negative hostnum counts back from the end of the range,
 * -1 being the last address, as go-cidr does.
 */
export function cidrhost(prefix: string, hostnum: bigint): string {
	const base = parsePrefix(prefix);
	const hostLen = base.bits - base.prefix;
	const max = (1n << BigInt(hostLen)) - 1n;
	const n = hostnum < 0n ? max + hostnum + 1n : hostnum;
	if (n < 0n || n > max)
		throw new Error(
			`prefix of ${base.prefix} does not accommodate a host numbered ${hostnum} (the range is ${-max - 1n} to ${max})`
		);
	return formatAddr(base.version, base.addr | n);
}

/** cidrnetmask(prefix): IPv4 only. */
export function cidrnetmask(prefix: string): string {
	const base = parsePrefix(prefix);
	if (base.version === 6) throw new Error('IPv6 addresses cannot have a netmask: ' + prefix.trim());
	return formatIPv4(Number(maskOf(32, base.prefix)));
}

function lastOf(n: { addr: bigint; prefix: number }, bits: number): bigint {
	return n.addr | ((1n << BigInt(bits - n.prefix)) - 1n);
}

/**
 * cidrsubnets(prefix, newbits...): consecutive subnets, each aligned to its own size,
 * allocated the way Terraform does it (go-cidr PreviousSubnet then NextSubnet).
 */
export function cidrsubnets(prefix: string, newbits: bigint[]): Net[] {
	const base = parsePrefix(prefix);
	if (!newbits.length) return [];
	const lens = newbits.map((b, i) => {
		if (b < 1n) throw new Error(`argument ${i + 2}: must extend prefix by at least one bit`);
		if (b > 32n) throw new Error(`argument ${i + 2}: may not extend prefix by more than 32 bits`);
		const len = base.prefix + Number(b);
		if (len > base.bits)
			throw new Error(
				`argument ${i + 2}: would extend prefix to ${len} bits, which is too long for an IPv${base.version} address`
			);
		return len;
	});
	const size = 1n << BigInt(base.bits);
	const end = lastOf(base, base.bits);
	// The subnet just before the base network, at the first length.
	let cur = {
		addr: ((base.addr - 1n + size) % size) & maskOf(base.bits, lens[0]),
		prefix: lens[0]
	};
	const out: Net[] = [];
	lens.forEach((len, i) => {
		const m = maskOf(base.bits, len);
		const sub = lastOf(cur, base.bits) & m;
		const next = lastOf({ addr: sub, prefix: len }, base.bits) + 1n;
		const addr = next & m;
		if (next >= size && !(base.addr === 0n && i === 0 && next === size))
			throw new Error(
				`argument ${i + 2}: not enough remaining address space for a subnet with a prefix of ${len} bits after ${formatNet({ ...base, ...cur })}`
			);
		const a = next >= size ? 0n : addr;
		if (a < base.addr || a > end)
			throw new Error(
				`argument ${i + 2}: not enough remaining address space for a subnet with a prefix of ${len} bits after ${formatNet({ ...base, ...cur })}`
			);
		cur = { addr: a, prefix: len };
		out.push({ version: base.version, bits: base.bits, addr: a, prefix: len });
	});
	return out;
}

export interface Row {
	netnum: bigint;
	cidr: string;
	first: string;
	last: string;
	size: bigint;
}

/** cidrsubnet for a run of netnum values, with the address range of each subnet. */
export function subnetTable(prefix: string, newbits: bigint, from: bigint, count: number): Row[] {
	const rows: Row[] = [];
	const max = 1n << newbits;
	for (let i = 0n; i < BigInt(count) && from + i < max; i++) {
		const n = cidrsubnet(prefix, newbits, from + i);
		rows.push({
			netnum: from + i,
			cidr: formatNet(n),
			first: formatAddr(n.version, n.addr),
			last: formatAddr(n.version, lastOf(n, n.bits)),
			size: 1n << BigInt(n.bits - n.prefix)
		});
	}
	return rows;
}

/* ---------- Terraform expressions ---------- */

export type FnName = 'cidrsubnet' | 'cidrsubnets' | 'cidrhost' | 'cidrnetmask';

export interface Call {
	fn: FnName;
	prefix: string;
	args: string[];
}

const ARITY: Record<FnName, [number, number]> = {
	cidrsubnet: [2, 2],
	cidrsubnets: [0, Infinity],
	cidrhost: [1, 1],
	cidrnetmask: [0, 0]
};

/** Reads a call such as cidrsubnet("10.0.0.0/16", 8, 2), with literal arguments only. */
export function parseCall(raw: string): Call {
	const s = raw.trim();
	const m =
		/^(cidrsubnets?|cidrhost|cidrnetmask)\s*\(\s*"([^"]*)"\s*((?:,\s*-?\d+\s*)*),?\s*\)$/.exec(s);
	if (!m) {
		if (/^cidr\w*\s*\(/.test(s) && /\b(?:var|local|module|data)\./.test(s))
			throw new Error(
				'Only literal arguments can be evaluated here. Replace var.x or local.x with its value'
			);
		throw new Error(
			'Write a call like cidrsubnet("10.0.0.0/16", 8, 2) with a quoted prefix and whole numbers'
		);
	}
	const fn = m[1] as FnName;
	const args = m[3]
		.split(',')
		.map((a) => a.trim())
		.filter(Boolean);
	const [lo, hi] = ARITY[fn];
	if (args.length < lo || args.length > hi)
		throw new Error(
			`${fn} takes ${lo === hi ? lo + 1 : `${lo + 1} or more`} argument${lo === 0 && hi === 0 ? '' : 's'}, got ${args.length + 1}`
		);
	return { fn, prefix: m[2], args };
}

/** Evaluates a call and returns the result as Terraform prints it in the console. */
export function evaluate(c: Call): string {
	switch (c.fn) {
		case 'cidrsubnet':
			return `"${formatNet(cidrsubnet(c.prefix, parseWhole(c.args[0], 'newbits'), parseWhole(c.args[1], 'netnum')))}"`;
		case 'cidrhost':
			return `"${cidrhost(c.prefix, parseWhole(c.args[0], 'hostnum'))}"`;
		case 'cidrnetmask':
			return `"${cidrnetmask(c.prefix)}"`;
		case 'cidrsubnets': {
			const nets = cidrsubnets(
				c.prefix,
				c.args.map((a) => parseWhole(a, 'newbits'))
			);
			if (!nets.length) return 'tolist([])';
			return `tolist([\n${nets.map((n) => `  "${formatNet(n)}",`).join('\n')}\n])`;
		}
	}
}

/** Front page intake: a pasted Terraform cidr function call. */
export function looksLikeCidrCall(s: string): number {
	const t = s.trim();
	if (t.length > 300) return 0;
	return /^(?:cidrsubnets?|cidrhost|cidrnetmask)\s*\(/.test(t) ? 0.95 : 0;
}
