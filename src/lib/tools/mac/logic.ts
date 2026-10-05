/**
 * MAC addresses (EUI-48): formats, the I/G and U/L bits, EUI-64 and the IPv6 interface
 * identifier used by SLAAC, and a small vendor table. Bit meanings from IEEE 802-2014
 * clause 8; modified EUI-64 from RFC 4291 section 2.5.1 and appendix A.
 */
import { compressIPv6, parseIPv6 } from '../ip/logic';

export type Bytes = number[];

/**
 * Accepts 00:1a:2b:3c:4d:5e, 00-1A-2B-3C-4D-5E, 001a.2b3c.4d5e (Cisco), 001a2b3c4d5e,
 * spaces as separators, and single-digit groups like 0:1a:2b:3c:4d:5e.
 */
export function parseMac(raw: string): Bytes {
	const s = raw.trim();
	if (!s) throw new Error('Enter a MAC address, e.g. 00:1a:2b:3c:4d:5e');
	let hex: string;
	if (/^[0-9a-f]{4}\.[0-9a-f]{4}\.[0-9a-f]{4}$/i.test(s)) hex = s.replace(/\./g, '');
	else if (/^[0-9a-f]{1,2}([:\- ])[0-9a-f]{1,2}(\1[0-9a-f]{1,2}){4}$/i.test(s))
		hex = s
			.split(/[:\- ]/)
			.map((g) => g.padStart(2, '0'))
			.join('');
	else if (/^[0-9a-f]{12}$/i.test(s)) hex = s;
	else {
		const digits = s.replace(/[^0-9a-f]/gi, '');
		if (digits.length === 16)
			throw new Error('That is 64 bits: an EUI-64. Enter a 48-bit MAC address');
		throw new Error(`"${s}" is not a MAC address: expected 12 hex digits`);
	}
	return hex.match(/../g)!.map((h) => parseInt(h, 16));
}

const h2 = (b: number) => b.toString(16).padStart(2, '0');

export type MacFormat = 'colon' | 'dash' | 'dot' | 'bare';

export function formatMac(b: Bytes, f: MacFormat, upper = false): string {
	const hex = b.map(h2);
	let s: string;
	if (f === 'colon') s = hex.join(':');
	else if (f === 'dash') s = hex.join('-');
	else if (f === 'dot') s = [0, 2, 4].map((i) => hex[i] + hex[i + 1]).join('.');
	else s = hex.join('');
	return upper ? s.toUpperCase() : s;
}

/** I/G bit: least significant bit of the first octet. 1 = group (multicast). */
export const isMulticast = (b: Bytes) => (b[0] & 1) === 1;
/** U/L bit: second least significant bit of the first octet. 1 = locally administered. */
export const isLocal = (b: Bytes) => (b[0] & 2) === 2;
export const isBroadcast = (b: Bytes) => b.every((x) => x === 0xff);

/**
 * IEEE 802c-2017 Structured Local Address Plan quadrant, from the two bits above U/L
 * (Y = 0x04, Z = 0x08) of a locally administered address. The second hex digit shows it:
 * x2 AAI, x6 reserved, xA ELI, xE SAI.
 */
export function slapQuadrant(b: Bytes): string | undefined {
	if (!isLocal(b)) return undefined;
	const y = (b[0] & 0x04) !== 0;
	const z = (b[0] & 0x08) !== 0;
	if (!y && z) return 'ELI, Extended Local Identifier';
	if (y && z) return 'SAI, Standard Assigned Identifier';
	if (!y && !z) return 'AAI, Administratively Assigned Identifier';
	return 'Reserved';
}

/** EUI-48 to EUI-64: FF-FE inserted between the OUI and the extension (IEEE guidance). */
export function toEui64(b: Bytes): Bytes {
	return [b[0], b[1], b[2], 0xff, 0xfe, b[3], b[4], b[5]];
}

/** Modified EUI-64 (RFC 4291 appendix A): EUI-64 with the U/L bit inverted. */
export function modifiedEui64(b: Bytes): Bytes {
	const e = toEui64(b);
	e[0] ^= 0x02;
	return e;
}

export function interfaceId(b: Bytes): bigint {
	return modifiedEui64(b).reduce((acc, x) => (acc << 8n) | BigInt(x), 0n);
}

export function linkLocal(b: Bytes): string {
	return compressIPv6((0xfe80n << 112n) | interfaceId(b));
}

/** SLAAC address in a /64: prefix plus the modified EUI-64 interface identifier. */
export function slaacAddress(prefix: string, b: Bytes): string {
	const m = prefix.trim().match(/^([0-9a-f:.]+)(?:\/(\d{1,3}))?$/i);
	if (!m) throw new Error('Enter an IPv6 /64 prefix, e.g. 2001:db8:1:2::/64');
	if (m[2] !== undefined && m[2] !== '64')
		throw new Error('SLAAC with EUI-64 needs a /64 prefix (RFC 4862, RFC 4291)');
	const net = parseIPv6(m[1]) & ~((1n << 64n) - 1n);
	return compressIPv6(net | interfaceId(b));
}

/** MAC from an IPv6 address whose interface identifier is modified EUI-64 (contains ff:fe). */
export function macFromIpv6(addr: string): Bytes | undefined {
	let n: bigint;
	try {
		n = parseIPv6(addr.replace(/%.*$/, ''));
	} catch {
		return undefined;
	}
	const iid = n & ((1n << 64n) - 1n);
	if (((iid >> 24n) & 0xffffn) !== 0xfffen) return undefined;
	const bytes = Array.from({ length: 8 }, (_, i) => Number((iid >> BigInt((7 - i) * 8)) & 0xffn));
	return [bytes[0] ^ 0x02, bytes[1], bytes[2], bytes[5], bytes[6], bytes[7]];
}

export interface Vendor {
	/** Hex prefix without separators, 6 digits for an OUI, fewer or more for other blocks. */
	prefix: string;
	name: string;
	note?: string;
}

/**
 * A short, partial list of assignments that are well known and stable. Not the IEEE registry
 * (regauth.standards.ieee.org), which is not bundled. Sources: the IEEE MA-L public listing for
 * the OUIs; RFC 7042 for IANA 00-00-5E and 01-00-5E; RFC 2464 for 33-33; RFC 5798 for VRRP;
 * RFC 2281 for HSRP; IEEE 802.1Q and 802.3 for the reserved 01-80-C2-00-00-0x group addresses;
 * hypervisor and Docker documentation for their default prefixes.
 */
export const vendors: Vendor[] = [
	{ prefix: 'ffffffffffff', name: 'Broadcast' },
	{ prefix: '0180c2000000', name: 'IEEE 802.1D Spanning Tree (bridge group address)' },
	{ prefix: '0180c200000e', name: 'IEEE 802.1AB LLDP (nearest bridge)' },
	{ prefix: '0180c2000002', name: 'IEEE 802.3 Slow Protocols (LACP)' },
	{ prefix: '01000ccccccc', name: 'Cisco CDP, VTP, DTP' },
	{ prefix: '00000c07ac', name: 'HSRP version 1 virtual router', note: 'RFC 2281' },
	{ prefix: '00005e0001', name: 'VRRP IPv4 virtual router', note: 'RFC 5798' },
	{ prefix: '00005e0002', name: 'VRRP IPv6 virtual router', note: 'RFC 5798' },
	{ prefix: '01005e', name: 'IPv4 multicast', note: 'RFC 1112, low 23 bits of the group' },
	{ prefix: '3333', name: 'IPv6 multicast', note: 'RFC 2464, low 32 bits of the group' },
	{ prefix: '00005e', name: 'IANA', note: 'RFC 7042' },
	{ prefix: '005056', name: 'VMware', note: 'manually set or vCenter assigned' },
	{ prefix: '000c29', name: 'VMware', note: 'auto-generated by ESXi and Workstation' },
	{ prefix: '000569', name: 'VMware' },
	{ prefix: '001c14', name: 'VMware' },
	{ prefix: '00155d', name: 'Microsoft Hyper-V virtual NIC' },
	{ prefix: '080027', name: 'Oracle VirtualBox virtual NIC' },
	{
		prefix: '525400',
		name: 'QEMU/KVM virtual NIC (libvirt default)',
		note: 'locally administered'
	},
	{ prefix: '00163e', name: 'Xen virtual NIC' },
	{ prefix: '001c42', name: 'Parallels virtual NIC' },
	{ prefix: '0242', name: 'Docker container (default bridge)', note: 'locally administered' },
	{ prefix: '00000c', name: 'Cisco' },
	{ prefix: 'b827eb', name: 'Raspberry Pi Foundation' },
	{ prefix: 'dca632', name: 'Raspberry Pi Trading' },
	{ prefix: 'e45f01', name: 'Raspberry Pi Trading' },
	{ prefix: '000393', name: 'Apple' },
	{ prefix: '000a95', name: 'Apple' },
	{ prefix: '001422', name: 'Dell' },
	{ prefix: '080009', name: 'Hewlett-Packard' },
	{ prefix: '0002b3', name: 'Intel' },
	{ prefix: '000585', name: 'Juniper Networks' }
];

/** Longest matching prefix wins. */
export function lookupVendor(b: Bytes): Vendor | undefined {
	const hex = b.map(h2).join('');
	let best: Vendor | undefined;
	for (const v of vendors)
		if (hex.startsWith(v.prefix) && (!best || v.prefix.length > best.prefix.length)) best = v;
	return best;
}

export interface MacInfo {
	bytes: Bytes;
	multicast: boolean;
	broadcast: boolean;
	local: boolean;
	/** Locally administered unicast and not a known virtual prefix: likely a randomised MAC. */
	randomised: boolean;
	slap?: string;
	vendor?: Vendor;
	oui: string;
}

export function analyse(raw: string): MacInfo {
	const bytes = parseMac(raw);
	const multicast = isMulticast(bytes);
	const local = isLocal(bytes);
	const vendor = lookupVendor(bytes);
	return {
		bytes,
		multicast,
		broadcast: isBroadcast(bytes),
		local,
		randomised: local && !multicast && !vendor,
		slap: slapQuadrant(bytes),
		vendor,
		oui: formatMac(bytes, 'dash', true).slice(0, 8)
	};
}

export function looksLikeMac(s: string): number {
	const t = s.trim();
	if (/^[0-9a-f]{2}([:-])[0-9a-f]{2}(\1[0-9a-f]{2}){4}$/i.test(t)) return 0.9;
	if (/^[0-9a-f]{4}\.[0-9a-f]{4}\.[0-9a-f]{4}$/i.test(t)) return 0.9;
	return 0;
}
