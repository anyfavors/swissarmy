import { describe, expect, it } from 'vitest';
import {
	addressCount,
	analyse,
	classifyIPv6,
	compressIPv6,
	embeddedIPv4,
	expandIPv6,
	looksLikeIp,
	parseIPv6,
	reverseDns,
	toBinaryGroups,
	toHex
} from './logic';

const c = (s: string) => compressIPv6(parseIPv6(s));

describe('ip: IPv6 parsing and canonical form (RFC 5952)', () => {
	it('drops leading zeros and lowercases (4.1, 4.3)', () => {
		expect(c('2001:0db8::0001')).toBe('2001:db8::1');
		expect(c('2001:DB8::1')).toBe('2001:db8::1');
	});

	it('compresses the longest run, leftmost on a tie (4.2.3)', () => {
		expect(c('2001:db8:0:0:1:0:0:1')).toBe('2001:db8::1:0:0:1');
		expect(c('2001:0:0:1:0:0:0:1')).toBe('2001:0:0:1::1');
		expect(c('2001:db8:0:0:0::1')).toBe('2001:db8::1');
		expect(c('2001:db8:0:0:1:0:0:0')).toBe('2001:db8:0:0:1::');
	});

	it('never compresses a single zero group (4.2.2)', () => {
		expect(c('2001:db8:0:1:1:1:1:1')).toBe('2001:db8:0:1:1:1:1:1');
	});

	it('handles :: and ::1', () => {
		expect(c('0:0:0:0:0:0:0:0')).toBe('::');
		expect(c('0:0:0:0:0:0:0:1')).toBe('::1');
		expect(c('1:0:0:0:0:0:0:0')).toBe('1::');
	});

	it('writes IPv4-mapped addresses in mixed notation (section 5)', () => {
		expect(c('::ffff:c000:0280')).toBe('::ffff:192.0.2.128');
		expect(c('0:0:0:0:0:ffff:1.2.3.4')).toBe('::ffff:1.2.3.4');
	});

	it('expands to the full form', () => {
		expect(expandIPv6(parseIPv6('2001:db8::1'))).toBe('2001:0db8:0000:0000:0000:0000:0000:0001');
		expect(expandIPv6(parseIPv6('64:ff9b::192.0.2.33'))).toBe(
			'0064:ff9b:0000:0000:0000:0000:c000:0221'
		);
	});

	it('rejects malformed input with a reason', () => {
		expect(() => parseIPv6('1::2::3')).toThrow(/only once/);
		expect(() => parseIPv6('1:2:3:4:5:6:7')).toThrow(/8 groups, found 7/);
		expect(() => parseIPv6('1:2:3:4:5:6:7:8:9')).toThrow(/8 groups/);
		expect(() => parseIPv6('1:2:3:4::5:6:7:8')).toThrow(/too many groups/);
		expect(() => parseIPv6('12345::')).toThrow(/1 to 4 hex/);
		expect(() => parseIPv6('fe80::g')).toThrow(/unexpected character "g"/);
		expect(() => parseIPv6('::1.2.3.4:5')).toThrow(/must come last/);
		expect(() => parseIPv6(':1:2:3:4:5:6:7')).toThrow(/empty group/);
	});
});

describe('ip: classification', () => {
	const cases: [string, string, string][] = [
		['::', 'Unspecified', 'RFC 4291'],
		['::1', 'Loopback', 'RFC 4291'],
		['fe80::1', 'Link-local', 'RFC 4291'],
		['febf:ffff::1', 'Link-local', 'RFC 4291'],
		['fd12:3456::1', 'Unique local (ULA)', 'RFC 4193'],
		['fc00::1', 'Unique local (ULA)', 'RFC 4193'],
		['ff02::1', 'Multicast', 'RFC 4291'],
		['2001:db8::1', 'Documentation', 'RFC 3849'],
		['3fff:fff::1', 'Documentation', 'RFC 9637'],
		['2002:c000:204::1', '6to4', 'RFC 3056'],
		['2001:0:4136:e378:8000:63bf:3fff:fdd2', 'Teredo', 'RFC 4380'],
		['::ffff:1.2.3.4', 'IPv4-mapped', 'RFC 4291'],
		['64:ff9b::1.2.3.4', 'NAT64 well-known prefix', 'RFC 6052'],
		['2606:4700:4700::1111', 'Global unicast', 'RFC 4291']
	];
	it.each(cases)('%s is %s', (a, label, rfc) => {
		expect(classifyIPv6(parseIPv6(a))).toEqual({ label, rfc });
	});

	it('does not treat 3fff:1000:: as documentation (/20 boundary)', () => {
		expect(classifyIPv6(parseIPv6('3fff:1000::')).label).toBe('Global unicast');
	});

	it('extracts embedded IPv4 from Teredo (RFC 4380 example) and 6to4', () => {
		expect(embeddedIPv4(parseIPv6('2001:0:4136:e378:8000:63bf:3fff:fdd2'))).toEqual([
			{ label: 'Teredo server', value: '65.54.227.120' },
			{ label: 'Teredo client (public)', value: '192.0.2.45' },
			{ label: 'Teredo client port', value: '40000' }
		]);
		expect(embeddedIPv4(parseIPv6('2002:c000:204::1'))[0].value).toBe('192.0.2.4');
	});
});

describe('ip: representations', () => {
	it('gives integer and hex', () => {
		const r = analyse('2001:db8::1');
		expect(r.value).toBe(0x20010db8000000000000000000000001n);
		expect(toHex(r.value, 128)).toBe('0x20010db8000000000000000000000001');
		expect(analyse('::ffff:ffff:ffff').value.toString()).toBe('281474976710655');
		expect(toHex(255n, 32)).toBe('0x000000ff');
	});

	it('builds reverse DNS names (RFC 3596 example)', () => {
		expect(reverseDns(6, parseIPv6('4321:0:1:2:3:4:567:89ab'))).toBe(
			'b.a.9.8.7.6.5.0.4.0.0.0.3.0.0.0.2.0.0.0.1.0.0.0.0.0.0.0.1.2.3.4.ip6.arpa'
		);
		expect(reverseDns(4, analyse('192.0.2.10').value)).toBe('10.2.0.192.in-addr.arpa');
	});

	it('groups binary', () => {
		expect(toBinaryGroups(analyse('255.0.1.2').value, 32)).toEqual([
			'11111111',
			'00000000',
			'00000001',
			'00000010'
		]);
		const g = toBinaryGroups(parseIPv6('ffff::1'), 128);
		expect(g).toHaveLength(8);
		expect(g[0]).toBe('1111111111111111');
		expect(g[7]).toBe('0000000000000001');
	});
});

describe('ip: analyse', () => {
	it('reads IPv4 with classification from the cidr tool', () => {
		const r = analyse('10.1.2.3');
		expect(r.version).toBe(4);
		expect(r.value).toBe(167838211n);
		expect(r.classification.rfc).toBe('RFC 1918');
		expect(r.expanded).toBe('010.001.002.003');
	});

	it('applies an IPv6 prefix', () => {
		const r = analyse('2001:db8:abcd:12::77/56');
		expect(compressIPv6(r.network!)).toBe('2001:db8:abcd::');
		expect(compressIPv6(r.last!)).toBe('2001:db8:abcd:ff:ffff:ffff:ffff:ffff');
		expect(addressCount(128, 56)).toBe('2^72 (4,722,366,482,869,645,213,696)');
		expect(addressCount(32, 24)).toBe('256');
	});

	it('handles /0 and /128', () => {
		const all = analyse('::/0');
		expect(expandIPv6(all.last!)).toBe('ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff');
		const one = analyse('::1/128');
		expect(one.network).toBe(1n);
		expect(one.last).toBe(1n);
	});

	it('accepts zone IDs and brackets', () => {
		const r = analyse('fe80::1%eth0');
		expect(r.zone).toBe('eth0');
		expect(r.canonical).toBe('fe80::1');
		expect(analyse('[2001:db8::1]:443').canonical).toBe('2001:db8::1');
	});

	it('rejects bad prefixes', () => {
		expect(() => analyse('::1/129')).toThrow(/0 to 128/);
		expect(() => analyse('10.0.0.1/33')).toThrow(/0 to 32/);
		expect(() => analyse('::1/x')).toThrow(/must be a number/);
		expect(() => analyse('10.0.0.1%eth0')).toThrow(/only apply to IPv6/);
	});
});

describe('ip: detect', () => {
	it('claims IPv6 strongly and bare IPv4 weakly', () => {
		expect(looksLikeIp('2001:db8::1')).toBe(0.9);
		expect(looksLikeIp('fe80::1%eth0')).toBe(0.9);
		expect(looksLikeIp('2001:db8::/32')).toBe(0.9);
		expect(looksLikeIp('192.168.1.1')).toBe(0.5);
		expect(looksLikeIp('12:30:45')).toBe(0);
		expect(looksLikeIp('hello')).toBe(0);
		expect(looksLikeIp('10.0.0.0/8')).toBe(0);
	});
});
