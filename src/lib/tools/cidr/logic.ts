/** IPv4 only for now. IPv6 gets its own tool (FM 2-02). */

export function parseIPv4(s: string): number {
	const parts = s.trim().split('.');
	if (parts.length !== 4) throw new Error(`"${s}" is not an IPv4 address`);
	let n = 0;
	for (const p of parts) {
		if (!/^\d{1,3}$/.test(p) || Number(p) > 255) throw new Error(`"${s}" is not an IPv4 address`);
		n = n * 256 + Number(p);
	}
	return n;
}

export function formatIPv4(n: number): string {
	return [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.');
}

export function prefixToMask(prefix: number): number {
	return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
}

export function maskToPrefix(mask: number): number {
	const inv = ~mask >>> 0;
	if ((inv & (inv + 1)) !== 0) throw new Error(`${formatIPv4(mask)} is not a contiguous netmask`);
	return 32 - Math.log2(inv + 1);
}

export interface Classification {
	label: string;
	rfc?: string;
}

const special: [string, number, Classification][] = [
	['0.0.0.0', 8, { label: '"This network"', rfc: 'RFC 791' }],
	['10.0.0.0', 8, { label: 'Private', rfc: 'RFC 1918' }],
	['100.64.0.0', 10, { label: 'Carrier-grade NAT (shared)', rfc: 'RFC 6598' }],
	['127.0.0.0', 8, { label: 'Loopback', rfc: 'RFC 1122' }],
	['169.254.0.0', 16, { label: 'Link-local', rfc: 'RFC 3927' }],
	['172.16.0.0', 12, { label: 'Private', rfc: 'RFC 1918' }],
	['192.0.0.0', 24, { label: 'IETF protocol assignments', rfc: 'RFC 6890' }],
	['192.0.2.0', 24, { label: 'Documentation (TEST-NET-1)', rfc: 'RFC 5737' }],
	['192.88.99.0', 24, { label: '6to4 relay anycast (deprecated)', rfc: 'RFC 7526' }],
	['192.168.0.0', 16, { label: 'Private', rfc: 'RFC 1918' }],
	['198.18.0.0', 15, { label: 'Benchmarking', rfc: 'RFC 2544' }],
	['198.51.100.0', 24, { label: 'Documentation (TEST-NET-2)', rfc: 'RFC 5737' }],
	['203.0.113.0', 24, { label: 'Documentation (TEST-NET-3)', rfc: 'RFC 5737' }],
	['224.0.0.0', 4, { label: 'Multicast', rfc: 'RFC 5771' }],
	['255.255.255.255', 32, { label: 'Limited broadcast', rfc: 'RFC 919' }],
	['240.0.0.0', 4, { label: 'Reserved', rfc: 'RFC 1112' }]
];

export function classify(ip: number): Classification {
	for (const [net, prefix, c] of special) {
		const mask = prefixToMask(prefix);
		if ((ip & mask) >>> 0 === parseIPv4(net)) return c;
	}
	return { label: 'Public' };
}

export interface CidrResult {
	input: number;
	prefix: number;
	mask: number;
	wildcard: number;
	network: number;
	broadcast: number;
	firstHost: number;
	lastHost: number;
	/** Usable host addresses. /31 counts 2 (RFC 3021), /32 counts 1. */
	usable: number;
	total: number;
	classification: Classification;
	note?: string;
}

/**
 * Accepts "10.1.2.3/22", "10.1.2.3 255.255.252.0", "10.1.2.3/255.255.252.0" or a bare address (/32).
 */
export function parseCidr(raw: string): CidrResult {
	const s = raw.trim();
	if (!s) throw new Error('Enter an address, e.g. 192.168.10.0/22');
	const m = s.match(/^([\d.]+)\s*(?:[/\s]\s*([\d.]+))?$/);
	if (!m) throw new Error(`Could not read "${s}". Use 10.0.0.0/8 or 10.0.0.0 255.0.0.0`);
	const ip = parseIPv4(m[1]);
	let prefix = 32;
	if (m[2] !== undefined) {
		if (m[2].includes('.')) prefix = maskToPrefix(parseIPv4(m[2]));
		else {
			prefix = Number(m[2]);
			if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32)
				throw new Error('Prefix must be 0 to 32');
		}
	}
	const mask = prefixToMask(prefix);
	const wildcard = ~mask >>> 0;
	const network = (ip & mask) >>> 0;
	const broadcast = (network | wildcard) >>> 0;
	const total = 2 ** (32 - prefix);
	let firstHost = network + 1;
	let lastHost = broadcast - 1;
	let usable = Math.max(total - 2, 0);
	let note: string | undefined;
	if (prefix === 32) {
		firstHost = lastHost = network;
		usable = 1;
		note = 'Single host route.';
	} else if (prefix === 31) {
		firstHost = network;
		lastHost = broadcast;
		usable = 2;
		note = 'Point-to-point link: both addresses are usable (RFC 3021).';
	}
	if (ip !== network && prefix < 31)
		note = `Host bits are set. The network address is ${formatIPv4(network)}/${prefix}.`;
	return {
		input: ip,
		prefix,
		mask,
		wildcard,
		network,
		broadcast,
		firstHost,
		lastHost,
		usable,
		total,
		classification: classify(network),
		note
	};
}

export function toBinary(n: number): string {
	return [24, 16, 8, 0].map((s) => ((n >>> s) & 255).toString(2).padStart(8, '0')).join('.');
}

export function looksLikeCidr(s: string): number {
	const t = s.trim();
	if (/^\d{1,3}(\.\d{1,3}){3}\s*\/\s*\d{1,2}$/.test(t)) return 0.95;
	if (/^\d{1,3}(\.\d{1,3}){3}\s+255\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(t)) return 0.95;
	if (/^\d{1,3}(\.\d{1,3}){3}$/.test(t)) return 0.7;
	return 0;
}
