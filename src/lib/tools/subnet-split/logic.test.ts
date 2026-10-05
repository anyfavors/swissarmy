import { describe, expect, it } from 'vitest';
import {
	bitsForCount,
	formatAddress,
	formatPrefix,
	lenForHosts,
	parseNeeds,
	parsePrefix,
	planCsv,
	planMarkdown,
	planVlsm,
	splitCount,
	splitTo,
	usableHosts
} from './logic';

const P = parsePrefix;

describe('usableHosts', () => {
	it('follows IPv4 conventions and RFC 3021', () => {
		expect(usableHosts(4, 24)).toBe(254n);
		expect(usableHosts(4, 30)).toBe(2n);
		expect(usableHosts(4, 31)).toBe(2n);
		expect(usableHosts(4, 32)).toBe(1n);
	});
	it('counts every IPv6 address', () => {
		expect(usableHosts(6, 64)).toBe(1n << 64n);
		expect(usableHosts(6, 127)).toBe(2n);
	});
});

describe('equal split', () => {
	it('splits a /24 into four /26', () => {
		const s = splitCount(P('192.168.10.0/24'), 4n);
		expect(s.newLen).toBe(26);
		expect(s.subnets.map(formatPrefix)).toEqual([
			'192.168.10.0/26',
			'192.168.10.64/26',
			'192.168.10.128/26',
			'192.168.10.192/26'
		]);
		expect(formatAddress(4, s.subnets[1].first)).toBe('192.168.10.65');
		expect(formatAddress(4, s.subnets[1].last)).toBe('192.168.10.126');
		expect(s.subnets[1].usable).toBe(62n);
	});
	it('rounds a count up to a power of two', () => {
		expect(bitsForCount(1n)).toBe(0);
		expect(bitsForCount(2n)).toBe(1);
		expect(bitsForCount(5n)).toBe(3);
		expect(bitsForCount(8n)).toBe(3);
		expect(splitCount(P('10.0.0.0/8'), 5n).count).toBe(8n);
	});
	it('splits an IPv6 /48 into /64s and truncates the list', () => {
		const s = splitTo(P('2001:db8:abcd::/48'), 64, 4);
		expect(s.count).toBe(65536n);
		expect(s.truncated).toBe(true);
		expect(s.subnets.map(formatPrefix)).toEqual([
			'2001:db8:abcd::/64',
			'2001:db8:abcd:1::/64',
			'2001:db8:abcd:2::/64',
			'2001:db8:abcd:3::/64'
		]);
	});
	it('rejects impossible splits', () => {
		expect(() => splitTo(P('10.0.0.0/24'), 20)).toThrow('24 to 32');
		expect(() => splitCount(P('10.0.0.0/31'), 4n)).toThrow('cannot be split');
		expect(() => splitCount(P('10.0.0.0/24'), 0n)).toThrow('at least 1');
	});
});

describe('lenForHosts', () => {
	it('uses /30 as the smallest IPv4 block unless point-to-point is allowed', () => {
		expect(lenForHosts(4, 1n)).toBe(30);
		expect(lenForHosts(4, 2n)).toBe(30);
		expect(lenForHosts(4, 2n, { pointToPoint: true })).toBe(31);
		expect(lenForHosts(4, 1n, { pointToPoint: true })).toBe(32);
		expect(lenForHosts(4, 254n)).toBe(24);
		expect(lenForHosts(4, 255n)).toBe(23);
	});
	it('keeps IPv6 subnets at /64 unless told otherwise', () => {
		expect(lenForHosts(6, 500n)).toBe(64);
		expect(lenForHosts(6, 2n, { min64: false })).toBe(127);
		expect(lenForHosts(6, (1n << 64n) + 1n)).toBe(63);
	});
});

describe('parseNeeds', () => {
	it('reads names and counts in several layouts', () => {
		expect(parseNeeds('Office 100\nLab, 50\nVLAN 10: 20\n\n# comment\nWAN\t2')).toEqual([
			{ name: 'Office', hosts: 100n },
			{ name: 'Lab', hosts: 50n },
			{ name: 'VLAN 10', hosts: 20n },
			{ name: 'WAN', hosts: 2n }
		]);
		expect(parseNeeds('25')).toEqual([{ name: 'Subnet 1', hosts: 25n }]);
	});
	it('reports lines without a count', () => {
		expect(() => parseNeeds('Office\nLab 5')).toThrow('Line 1');
		expect(() => parseNeeds('Office 0')).toThrow('at least 1');
	});
});

describe('planVlsm', () => {
	it('allocates the textbook example largest first', () => {
		const plan = planVlsm(P('192.168.1.0/24'), parseNeeds('D 2\nB 50\nA 100\nC 25'));
		expect(plan.allocations.map((a) => `${a.name} ${formatPrefix(a)}`)).toEqual([
			'A 192.168.1.0/25',
			'B 192.168.1.128/26',
			'C 192.168.1.192/27',
			'D 192.168.1.224/30'
		]);
		expect(plan.allocations.map((a) => a.wasted)).toEqual([28n, 14n, 7n, 2n]);
		expect(plan.free.map(formatPrefix)).toEqual([
			'192.168.1.228/30',
			'192.168.1.232/29',
			'192.168.1.240/28'
		]);
		expect(plan.used).toBe(228n);
	});
	it('keeps input order for equal sizes', () => {
		const plan = planVlsm(P('10.0.0.0/24'), parseNeeds('x 10\ny 10'));
		expect(plan.allocations.map((a) => a.name)).toEqual(['x', 'y']);
		expect(plan.free.map(formatPrefix)).toEqual(['10.0.0.32/27', '10.0.0.64/26', '10.0.0.128/25']);
		expect(formatPrefix(planVlsm(P('10.0.0.0/24'), parseNeeds('x 10')).free[0])).toBe(
			'10.0.0.16/28'
		);
	});
	it('plans IPv6 sites as /64s', () => {
		const plan = planVlsm(P('2001:db8:1::/62'), parseNeeds('LAN 200\nGuests 50\nIoT 30'));
		expect(plan.allocations.map(formatPrefix)).toEqual([
			'2001:db8:1::/64',
			'2001:db8:1:1::/64',
			'2001:db8:1:2::/64'
		]);
		expect(plan.free.map(formatPrefix)).toEqual(['2001:db8:1:3::/64']);
	});
	it('says why a plan does not fit', () => {
		expect(() => planVlsm(P('10.0.0.0/24'), parseNeeds('a 300'))).toThrow('needs a /23');
		expect(() => planVlsm(P('10.0.0.0/24'), parseNeeds('a 120\nb 120\nc 10'))).toThrow(
			'needs 272 addresses'
		);
		expect(() => planVlsm(P('10.0.0.0/24'), [])).toThrow('at least one');
	});
});

describe('export', () => {
	const plan = planVlsm(P('10.0.0.0/24'), parseNeeds('Office, main 100\nLab|1 20'));
	it('writes CSV with quoting', () => {
		const csv = planCsv(plan).split('\r\n');
		expect(csv[0]).toBe('Name,Hosts,Prefix,First,Last,Usable,Wasted');
		expect(csv[1]).toBe('"Office, main",100,10.0.0.0/25,10.0.0.1,10.0.0.126,126,28');
		expect(csv[2]).toBe('Lab|1,20,10.0.0.128/27,10.0.0.129,10.0.0.158,30,12');
		expect(csv[3]).toBe('(free),,10.0.0.160/27,,,,');
	});
	it('writes a Markdown table', () => {
		const md = planMarkdown(plan).split('\n');
		expect(md[0]).toBe('| Name | Hosts | Prefix | First | Last | Usable | Wasted |');
		expect(md[1]).toBe('| --- | ---: | --- | --- | --- | ---: | ---: |');
		expect(md[3]).toBe('| Lab\\|1 | 20 | 10.0.0.128/27 | 10.0.0.129 | 10.0.0.158 | 30 | 12 |');
		expect(md[5]).toBe('Free: 10.0.0.160/27, 10.0.0.192/26');
	});
});
