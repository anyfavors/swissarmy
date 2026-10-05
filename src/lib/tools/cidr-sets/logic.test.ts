import { describe, expect, it } from 'vitest';
import {
	aggregateText,
	checkMembership,
	cidrsOf,
	formatCount,
	formatPrefix,
	formatRange,
	mergeRanges,
	parseEntry,
	parseList,
	parsePrefix,
	presets,
	rangeToCidrs,
	subtractRanges,
	summarise,
	type Range
} from './logic';
import { ops } from './ops';

const r = (s: string): Range => parseEntry(s).range;
const cidrs = (s: string) => rangeToCidrs(r(s)).map(formatPrefix);

describe('parsePrefix', () => {
	it('reads IPv4, netmask and IPv6 forms', () => {
		expect(formatPrefix(parsePrefix('10.1.2.3/8'))).toBe('10.0.0.0/8');
		expect(parsePrefix('10.1.2.3/8').hostBitsSet).toBe(true);
		expect(formatPrefix(parsePrefix('192.168.1.0/255.255.255.0'))).toBe('192.168.1.0/24');
		expect(formatPrefix(parsePrefix('2001:db8::1/32'))).toBe('2001:db8::/32');
		expect(formatPrefix(parsePrefix('[2001:db8::1]'))).toBe('2001:db8::1/128');
		expect(formatPrefix(parsePrefix('8.8.8.8'))).toBe('8.8.8.8/32');
	});
	it('rejects bad lengths and addresses', () => {
		expect(() => parsePrefix('10.0.0.0/33')).toThrow('0 to 32');
		expect(() => parsePrefix('::/129')).toThrow('0 to 128');
		expect(() => parsePrefix('10.0.0/8')).toThrow('not an IPv4');
		expect(() => parsePrefix('1.2.3.4/255.0.255.0')).toThrow('contiguous');
		expect(() => parsePrefix('')).toThrow('Enter a prefix');
	});
});

describe('rangeToCidrs', () => {
	it('splits ranges into aligned blocks', () => {
		expect(cidrs('192.168.0.1-192.168.0.6')).toEqual([
			'192.168.0.1/32',
			'192.168.0.2/31',
			'192.168.0.4/31',
			'192.168.0.6/32'
		]);
		expect(cidrs('10.0.0.0-10.0.255.255')).toEqual(['10.0.0.0/16']);
		expect(cidrs('0.0.0.0-255.255.255.255')).toEqual(['0.0.0.0/0']);
		expect(cidrs('::-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff')).toEqual(['::/0']);
		expect(cidrs('2001:db8::-2001:db8::2')).toEqual(['2001:db8::/127', '2001:db8::2/128']);
	});
	it('rejects reversed and mixed ranges', () => {
		expect(() => parseEntry('10.0.0.5-10.0.0.1')).toThrow('after the end');
		expect(() => parseEntry('10.0.0.1-::1')).toThrow('mixes IPv4 and IPv6');
	});
});

describe('aggregation', () => {
	it('merges adjacent and overlapping prefixes', () => {
		expect(aggregateText('10.0.0.0/25\n10.0.0.128/25\n10.0.1.0/24')).toBe('10.0.0.0/23');
		expect(aggregateText('192.168.1.0/24, 192.168.1.77, 192.168.0.0/16')).toBe('192.168.0.0/16');
		expect(aggregateText('10.0.0.1 10.0.0.2 10.0.0.3')).toBe('10.0.0.1/32\n10.0.0.2/31');
	});
	it('handles both families, comments and netmask notation', () => {
		const text = `# office
			2001:db8:1::/48
			2001:db8::/48 // first
			172.16.0.0 255.255.0.0
			172.17.0.0/16`;
		expect(aggregateText(text)).toBe('172.16.0.0/15\n2001:db8::/47');
	});
	it('reads ranges written with spaces or "to"', () => {
		expect(aggregateText('10.0.0.0 - 10.0.0.255')).toBe('10.0.0.0/24');
		expect(aggregateText('10.0.0.0 to 10.0.1.255')).toBe('10.0.0.0/23');
	});
	it('reports bad entries with line numbers', () => {
		const p = parseList('10.0.0.0/8\nfoo\n1.2.3.4');
		expect(p.entries).toHaveLength(2);
		expect(p.errors[0]).toMatch(/^Line 2: /);
		expect(() => aggregateText('nope')).toThrow('Line 1');
		expect(() => aggregateText('  ')).toThrow('No addresses');
	});
	it('counts addresses', () => {
		const s = summarise([r('10.0.0.0/8'), r('10.0.0.0/9'), r('::/64')]);
		expect(s.count4).toBe(16777216n);
		expect(s.count6).toBe(1n << 64n);
		expect(formatCount(s.count6)).toBe('2^64 (18,446,744,073,709,551,616)');
		expect(formatCount(1000n)).toBe('1,000');
	});
});

describe('subtraction', () => {
	it('0.0.0.0/0 minus RFC 1918 gives the well known AllowedIPs list', () => {
		const p = presets.find((x) => x.id === 'wg-rfc1918')!;
		const inc = parseList(p.include).entries.map((e) => e.range);
		const exc = parseList(p.exclude).entries.map((e) => e.range);
		expect(cidrsOf(subtractRanges(inc, exc)).map(formatPrefix)).toEqual([
			'0.0.0.0/5',
			'8.0.0.0/7',
			'11.0.0.0/8',
			'12.0.0.0/6',
			'16.0.0.0/4',
			'32.0.0.0/3',
			'64.0.0.0/2',
			'128.0.0.0/3',
			'160.0.0.0/5',
			'168.0.0.0/6',
			'172.0.0.0/12',
			'172.32.0.0/11',
			'172.64.0.0/10',
			'172.128.0.0/9',
			'173.0.0.0/8',
			'174.0.0.0/7',
			'176.0.0.0/4',
			'192.0.0.0/9',
			'192.128.0.0/11',
			'192.160.0.0/13',
			'192.169.0.0/16',
			'192.170.0.0/15',
			'192.172.0.0/14',
			'192.176.0.0/12',
			'192.192.0.0/10',
			'193.0.0.0/8',
			'194.0.0.0/7',
			'196.0.0.0/6',
			'200.0.0.0/5',
			'208.0.0.0/4',
			'224.0.0.0/3'
		]);
	});
	it('works for IPv6 and leaves other families alone', () => {
		const out = subtractRanges([r('::/0'), r('10.0.0.0/8')], [r('8000::/1')]);
		expect(out.map(formatRange)).toEqual([
			'10.0.0.0-10.255.255.255',
			'::-7fff:ffff:ffff:ffff:ffff:ffff:ffff:ffff'
		]);
	});
	it('handles cuts at the edges and full removal', () => {
		expect(subtractRanges([r('10.0.0.0/24')], [r('10.0.0.0/24')])).toEqual([]);
		expect(
			subtractRanges([r('10.0.0.0/24')], [r('10.0.0.0'), r('10.0.0.255')]).map(formatRange)
		).toEqual(['10.0.0.1-10.0.0.254']);
		expect(
			subtractRanges([r('10.0.0.0/30')], [r('10.0.0.1'), r('10.0.0.2')]).map(formatRange)
		).toEqual(['10.0.0.0', '10.0.0.3']);
	});
});

describe('mergeRanges', () => {
	it('keeps families apart', () => {
		expect(mergeRanges([r('::1'), r('0.0.0.1')])).toHaveLength(2);
	});
});

describe('checkMembership', () => {
	it('classifies inside, partial and outside', () => {
		const items = parseList('10.1.2.3\n192.168.0.0/23\n8.8.8.8\n2001:db8::1').entries;
		const sets = parseList('10.0.0.0/8\n192.168.0.0/24\n2001:db8::/32').entries;
		const res = checkMembership(items, sets);
		expect(res.map((x) => x.status)).toEqual(['inside', 'partial', 'outside', 'inside']);
		expect(res[0].matches.map((m) => m.text)).toEqual(['10.0.0.0/8']);
	});
	it('counts a prefix covered by two adjacent sets as inside', () => {
		const res = checkMembership(
			parseList('10.0.0.0/23').entries,
			parseList('10.0.0.0/24 10.0.1.0/24').entries
		);
		expect(res[0].status).toBe('inside');
		expect(res[0].matches).toHaveLength(2);
	});
});

describe('ops', () => {
	it('aggregates and lists ranges', async () => {
		const agg = ops.find((o) => o.id === 'cidr-sets.aggregate')!;
		expect(await agg.run('10.0.0.0/25 10.0.0.128/25')).toBe('10.0.0.0/24');
		const rng = ops.find((o) => o.id === 'cidr-sets.ranges')!;
		expect(await rng.run('10.0.0.0/25 10.0.0.128/25 ::/127')).toBe('10.0.0.0-10.0.0.255\n::-::1');
		expect(() => rng.run('x')).toThrow('Line 1');
	});
});
