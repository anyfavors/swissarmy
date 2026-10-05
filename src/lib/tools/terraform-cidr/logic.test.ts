import { describe, expect, it } from 'vitest';
import {
	cidrhost,
	cidrnetmask,
	cidrsubnet,
	cidrsubnets,
	evaluate,
	formatNet,
	hostBitsSet,
	looksLikeCidrCall,
	parseCall,
	parsePrefix,
	subnetTable
} from './logic';

const sub = (p: string, nb: number, n: number) => formatNet(cidrsubnet(p, BigInt(nb), BigInt(n)));
const subs = (p: string, ...nb: number[]) => cidrsubnets(p, nb.map(BigInt)).map(formatNet);

// Examples from the Terraform documentation pages of each function.
describe('Terraform documentation examples', () => {
	it('cidrsubnet', () => {
		expect(sub('172.16.0.0/12', 4, 2)).toBe('172.18.0.0/16');
		expect(sub('10.1.2.0/24', 4, 15)).toBe('10.1.2.240/28');
		expect(sub('fd00:fd12:3456:7890::/56', 16, 162)).toBe('fd00:fd12:3456:7800:a200::/72');
	});

	it('cidrhost', () => {
		expect(cidrhost('10.12.112.0/20', 16n)).toBe('10.12.112.16');
		expect(cidrhost('10.12.112.0/20', 268n)).toBe('10.12.113.12');
		expect(cidrhost('fd00:fd12:3456:7890:00a2::/72', 34n)).toBe('fd00:fd12:3456:7890::22');
	});

	it('cidrnetmask', () => {
		expect(cidrnetmask('172.16.0.0/12')).toBe('255.240.0.0');
	});

	it('cidrsubnets', () => {
		expect(subs('10.1.0.0/16', 4, 4, 8, 4)).toEqual([
			'10.1.0.0/20',
			'10.1.16.0/20',
			'10.1.32.0/24',
			'10.1.48.0/20'
		]);
		expect(subs('fd00:fd12:3456:7890::/56', 16, 16, 16, 32)).toEqual([
			'fd00:fd12:3456:7800::/72',
			'fd00:fd12:3456:7800:100::/72',
			'fd00:fd12:3456:7800:200::/72',
			'fd00:fd12:3456:7800:300::/88'
		]);
	});
});

describe('edge cases', () => {
	it('ignores host bits in the prefix, like net.ParseCIDR', () => {
		expect(sub('10.1.2.3/16', 8, 5)).toBe('10.1.5.0/24');
		expect(hostBitsSet('10.1.2.3/16')).toBe(true);
		expect(hostBitsSet('10.1.0.0/16')).toBe(false);
	});

	it('newbits 0 returns the prefix itself', () => {
		expect(sub('10.0.0.0/8', 0, 0)).toBe('10.0.0.0/8');
	});

	it('rejects netnum that does not fit', () => {
		expect(() => sub('10.0.0.0/16', 4, 16)).toThrow(
			/prefix extension of 4 does not accommodate a subnet numbered 16/
		);
		expect(() => sub('10.0.0.0/16', 4, -1)).toThrow(/negative/);
	});

	it('rejects extending past the address size', () => {
		expect(() => sub('10.0.0.0/30', 4, 0)).toThrow(
			/insufficient address space to extend prefix of 30 by 4/
		);
		expect(() => sub('fd00::/8', 33, 0)).toThrow(/more than 32 bits/);
	});

	it('cidrhost counts negative numbers from the end', () => {
		expect(cidrhost('10.0.0.0/24', -1n)).toBe('10.0.0.255');
		expect(cidrhost('10.0.0.0/24', -256n)).toBe('10.0.0.0');
		expect(() => cidrhost('10.0.0.0/24', -257n)).toThrow(/does not accommodate/);
		expect(() => cidrhost('10.0.0.0/24', 256n)).toThrow(
			/prefix of 24 does not accommodate a host numbered 256/
		);
	});

	it('cidrnetmask is IPv4 only', () => {
		expect(cidrnetmask('0.0.0.0/0')).toBe('0.0.0.0');
		expect(cidrnetmask('1.2.3.4/32')).toBe('255.255.255.255');
		expect(() => cidrnetmask('fd00::/8')).toThrow(/IPv6/);
	});

	it('cidrsubnets runs out of space', () => {
		expect(() => cidrsubnets('10.0.0.0/24', [1n, 1n, 1n])).toThrow(
			/argument 4: not enough remaining address space for a subnet with a prefix of 25 bits after 10.0.0.128\/25/
		);
		expect(() => cidrsubnets('10.0.0.0/24', [0n])).toThrow(/at least one bit/);
		expect(() => cidrsubnets('10.0.0.0/30', [3n])).toThrow(
			/33 bits, which is too long for an IPv4/
		);
		expect(subs('10.0.0.0/24', 1, 1)).toEqual(['10.0.0.0/25', '10.0.0.128/25']);
	});

	it('cidrsubnets aligns a larger subnet after a smaller one', () => {
		expect(subs('10.0.0.0/16', 8, 4)).toEqual(['10.0.0.0/24', '10.0.16.0/20']);
	});

	it('cidrsubnets from the zero network', () => {
		expect(subs('0.0.0.0/0', 1, 1)).toEqual(['0.0.0.0/1', '128.0.0.0/1']);
		expect(subs('::/0', 4)).toEqual(['::/4']);
	});

	it('parses prefixes and reports errors', () => {
		expect(parsePrefix('192.168.0.0/16').version).toBe(4);
		expect(parsePrefix('2001:db8::/32').bits).toBe(128);
		expect(() => parsePrefix('10.0.0.0')).toThrow(/invalid CIDR address/);
		expect(() => parsePrefix('10.0.0.0/33')).toThrow(/at most \/32/);
		expect(() => parsePrefix('300.0.0.0/8')).toThrow(/invalid CIDR address/);
		expect(() => parsePrefix('')).toThrow(/Enter a prefix/);
	});

	it('builds a table and stops at the last netnum', () => {
		const t = subnetTable('10.0.0.0/16', 2n, 2n, 10);
		expect(t.map((r) => r.cidr)).toEqual(['10.0.128.0/18', '10.0.192.0/18']);
		expect(t[0].first).toBe('10.0.128.0');
		expect(t[0].last).toBe('10.0.191.255');
		expect(t[0].size).toBe(16384n);
		const v6 = subnetTable('2001:db8::/32', 16n, 0n, 2);
		expect(v6[1].cidr).toBe('2001:db8:1::/48');
		expect(v6[1].last).toBe('2001:db8:1:ffff:ffff:ffff:ffff:ffff');
	});
});

describe('expressions', () => {
	it('parses and evaluates calls', () => {
		expect(evaluate(parseCall('cidrsubnet("172.16.0.0/12", 4, 2)'))).toBe('"172.18.0.0/16"');
		expect(evaluate(parseCall('cidrhost("10.12.112.0/20", 268)'))).toBe('"10.12.113.12"');
		expect(evaluate(parseCall('cidrnetmask("10.0.0.0/8")'))).toBe('"255.0.0.0"');
		expect(evaluate(parseCall('cidrsubnets("10.1.0.0/16", 4, 4)'))).toBe(
			'tolist([\n  "10.1.0.0/20",\n  "10.1.16.0/20",\n])'
		);
		expect(evaluate(parseCall('cidrsubnets("10.1.0.0/16")'))).toBe('tolist([])');
	});

	it('explains bad calls', () => {
		expect(() => parseCall('cidrsubnet(var.cidr, 4, 2)')).toThrow(/literal arguments/);
		expect(() => parseCall('cidrsubnet("10.0.0.0/8", 4)')).toThrow(/takes 3 arguments, got 2/);
		expect(() => parseCall('foo')).toThrow(/Write a call/);
	});

	it('detects pasted calls', () => {
		expect(looksLikeCidrCall('cidrsubnet("10.0.0.0/16", 8, 1)')).toBeGreaterThan(0.9);
		expect(looksLikeCidrCall('10.0.0.0/16')).toBe(0);
	});
});
