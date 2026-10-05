import { describe, expect, it } from 'vitest';
import {
	classifyInput,
	dohResolve,
	looksLikeSpf,
	parseSpf,
	walkSpf,
	type DnsReply,
	type Resolve,
	type RrType
} from './logic';
import type { LookupResult } from '../dns/logic';

/** Fake DNS: zone maps "name TYPE" to records, or to 'NX' for NXDOMAIN. */
function fake(zone: Record<string, string[] | 'NX'>): { resolve: Resolve; asked: string[] } {
	const asked: string[] = [];
	const resolve = async (name: string, type: RrType): Promise<DnsReply> => {
		asked.push(`${name} ${type}`);
		const v = zone[`${name} ${type}`];
		if (v === 'NX') return { status: 3, data: [] };
		return { status: 0, data: v ?? [] };
	};
	return { resolve, asked };
}

describe('parseSpf', () => {
	it('parses mechanisms, qualifiers and modifiers', () => {
		const p = parseSpf(
			'v=spf1 ip4:192.0.2.0/24 ip6:2001:db8::/32 a mx:mail.example.com/24 include:_spf.example.net ~all'
		);
		expect(p.terms.map((t) => t.name)).toEqual(['ip4', 'ip6', 'a', 'mx', 'include', 'all']);
		expect(p.terms[0]).toMatchObject({ value: '192.0.2.0', cidr4: 24, lookup: false });
		expect(p.terms[1]).toMatchObject({ value: '2001:db8::', cidr6: 32 });
		expect(p.terms[3]).toMatchObject({ value: 'mail.example.com', cidr4: 24, lookup: true });
		expect(p.terms[5].qualifier).toBe('~');
		expect(p.lookups).toBe(3);
		expect(p.findings).toEqual([]);
	});

	it('reads dual cidr lengths', () => {
		const t = parseSpf('v=spf1 a:example.com/24//64 a//48 -all').terms;
		expect(t[0]).toMatchObject({ value: 'example.com', cidr4: 24, cidr6: 64 });
		expect(t[1]).toMatchObject({ cidr6: 48 });
		expect(t[1].value).toBeUndefined();
	});

	it('accepts quoted, split TXT strings', () => {
		const p = parseSpf('"v=spf1 ip4:192.0.2.1 " "-all"');
		expect(p.terms.map((t) => t.raw)).toEqual(['ip4:192.0.2.1', '-all']);
	});

	it('rejects input that is not SPF', () => {
		expect(() => parseSpf('v=DMARC1; p=none')).toThrow(/starts with v=spf1/);
		expect(() => parseSpf('')).toThrow(/Paste an SPF record/);
	});

	it('flags +all, ?all, ptr and missing all', () => {
		expect(parseSpf('v=spf1 +all').findings[0]).toMatchObject({ level: 'error' });
		expect(parseSpf('v=spf1 all').findings[0].text).toMatch(/every server/);
		expect(parseSpf('v=spf1 ?all').findings[0]).toMatchObject({ level: 'warn' });
		expect(parseSpf('v=spf1 ptr -all').findings.some((f) => /deprecated/.test(f.text))).toBe(true);
		expect(parseSpf('v=spf1 ip4:192.0.2.1').findings[0].text).toMatch(/No all/);
	});

	it('reports syntax errors', () => {
		const f = parseSpf(
			'v=spf1 ip4:300.1.1.1 ip6:zz:: ip4:192.0.2.0/33 foo:bar include:nodot -all'
		).findings.map((x) => x.text);
		expect(f).toEqual([
			'ip4:300.1.1.1: Needs an IPv4 address, e.g. ip4:192.0.2.0/24',
			'ip6:zz::: Needs an IPv6 address, e.g. ip6:2001:db8::/32',
			'ip4:192.0.2.0/33: IPv4 prefix length must be 0 to 32',
			'foo:bar: Unknown mechanism "foo": the whole record is a permerror',
			'include:nodot: A domain needs at least one dot'
		]);
	});

	it('handles redirect and exp', () => {
		const p = parseSpf('v=spf1 redirect=_spf.example.com exp=explain.example.com');
		expect(p.redirect).toBe('_spf.example.com');
		expect(p.lookups).toBe(1);
		expect(p.findings).toEqual([]);
		const q = parseSpf('v=spf1 -all redirect=_spf.example.com');
		expect(q.redirectIgnored).toBe(true);
		expect(q.lookups).toBe(0);
		expect(parseSpf('v=spf1 redirect=a.example redirect=b.example').findings[0].text).toMatch(
			/more than once/
		);
	});

	it('marks terms after all as unreachable and does not count them', () => {
		const p = parseSpf('v=spf1 -all include:example.com');
		expect(p.terms[1].unreachable).toBe(true);
		expect(p.lookups).toBe(0);
	});

	it('recognises macros', () => {
		const p = parseSpf('v=spf1 exists:%{i}._spf.example.com -all');
		expect(p.terms[0].macro).toBe(true);
		expect(p.terms[0].error).toBeUndefined();
		expect(parseSpf('v=spf1 exists:%{q}.example.com -all').terms[0].error).toBe('Malformed macro');
	});

	it('rejects a qualifier on a modifier', () => {
		expect(parseSpf('v=spf1 -redirect=example.com').terms[0].error).toMatch(/qualifier/);
	});
});

describe('walkSpf', () => {
	it('counts nested lookups and reports every query', async () => {
		const { resolve, asked } = fake({
			'example.com TXT': ['v=spf1 include:_spf.a.example mx a -all', 'google-site-verification=x'],
			'_spf.a.example TXT': ['v=spf1 include:_spf.b.example ip4:192.0.2.0/24 ~all'],
			'_spf.b.example TXT': ['v=spf1 ip4:198.51.100.0/24 ~all'],
			'example.com MX': ['10 mx.example.com.'],
			'example.com A': ['192.0.2.10']
		});
		const t = await walkSpf('example.com', resolve);
		expect(t.lookups).toBe(4);
		expect(t.root.own).toBe(3);
		expect(t.root.children[0].total).toBe(1);
		expect(t.root.children[0].children[0].total).toBe(0);
		expect(t.voids).toBe(0);
		expect(asked).toEqual([
			'example.com TXT',
			'_spf.a.example TXT',
			'_spf.b.example TXT',
			'example.com MX',
			'example.com A'
		]);
		expect(t.queries).toBe(5);
		expect(t.findings).toEqual([]);
	});

	it('flags more than 10 lookups', async () => {
		const zone: Record<string, string[]> = {
			'big.example TXT': [
				'v=spf1 ' + Array.from({ length: 6 }, (_, i) => `include:i${i}.example`).join(' ') + ' -all'
			]
		};
		for (let i = 0; i < 6; i++) zone[`i${i}.example TXT`] = ['v=spf1 exists:x.example ~all'];
		zone['x.example A'] = ['127.0.0.2'];
		const t = await walkSpf('big.example', fake(zone).resolve);
		expect(t.lookups).toBe(12);
		expect(t.findings[0]).toMatchObject({ level: 'error' });
		expect(t.findings[0].text).toMatch(/12 DNS lookups, over the limit of 10/);
	});

	it('counts void lookups', async () => {
		const { resolve } = fake({
			'v.example TXT': ['v=spf1 a:gone1.example a:gone2.example mx:nomx.example -all'],
			'gone1.example A': 'NX',
			'gone1.example AAAA': 'NX',
			'nomx.example MX': []
		});
		const t = await walkSpf('v.example', resolve);
		expect(t.voids).toBe(3);
		expect(t.root.checks.map((c) => c.result)).toEqual(['void', 'void', 'void']);
		expect(t.findings.some((f) => /3 void lookups/.test(f.text))).toBe(true);
	});

	it('an a mechanism with only AAAA records is not void', async () => {
		const { resolve } = fake({
			'six.example TXT': ['v=spf1 a -all'],
			'six.example AAAA': ['2001:db8::1']
		});
		const t = await walkSpf('six.example', resolve);
		expect(t.voids).toBe(0);
		expect(t.root.checks[0].detail).toBe('1 AAAA');
	});

	it('flags multiple SPF records, missing records and loops', async () => {
		const { resolve } = fake({
			'two.example TXT': ['v=spf1 -all', 'v=spf1 ~all'],
			'loop.example TXT': ['v=spf1 include:loop2.example -all'],
			'loop2.example TXT': ['v=spf1 include:loop.example -all'],
			'inc.example TXT': ['v=spf1 include:none.example -all'],
			'none.example TXT': ['hello']
		});
		expect((await walkSpf('two.example', resolve)).root.error).toMatch(/2 SPF records/);
		const loop = await walkSpf('loop.example', resolve);
		expect(loop.root.children[0].children[0].error).toMatch(/^Loop: loop.example > loop2.example/);
		const inc = await walkSpf('inc.example', resolve);
		expect(inc.root.children[0].error).toMatch(/no SPF record: include gives permerror/);
		const nx = await walkSpf('nx.example', fake({ 'nx.example TXT': 'NX' }).resolve);
		expect(nx.root.error).toMatch(/NXDOMAIN/);
	});

	it('follows redirect and skips macros', async () => {
		const { resolve, asked } = fake({
			'r.example TXT': ['v=spf1 exists:%{i}.x.example redirect=_spf.r.example'],
			'_spf.r.example TXT': ['v=spf1 ip4:192.0.2.1 -all']
		});
		const t = await walkSpf('r.example', resolve);
		expect(t.lookups).toBe(2);
		expect(t.root.children[0].via).toBe('redirect');
		expect(t.root.checks[0].detail).toMatch(/Not resolved/);
		expect(asked).toEqual(['r.example TXT', '_spf.r.example TXT']);
	});

	it('stops at the query cap', async () => {
		const { resolve } = fake({
			'c.example TXT': ['v=spf1 include:a.example include:b.example -all'],
			'a.example TXT': ['v=spf1 -all']
		});
		const t = await walkSpf('c.example', resolve, { maxQueries: 2 });
		expect(t.truncated).toBe(true);
		expect(t.root.children[1].error).toMatch(/Query limit/);
	});

	it('reports transport errors', async () => {
		const t = await walkSpf('e.example', async () => ({ status: -1, data: [], error: 'offline' }));
		expect(t.root.error).toBe('offline');
	});
});

describe('dohResolve', () => {
	it('uses the shared client and reports each request', async () => {
		const seen: LookupResult[] = [];
		const fetchFn = async (url: string) => ({
			ok: true,
			status: 200,
			json: async () => ({
				Status: 0,
				Answer: [
					{ name: 'example.com', type: 16, TTL: 60, data: '"v=spf1 " "-all"' },
					{ name: 'example.com', type: 5, TTL: 60, data: 'x.example.' }
				],
				url
			})
		});
		const r = dohResolve('cloudflare', (q) => seen.push(q), fetchFn);
		const reply = await r('example.com', 'TXT');
		expect(reply).toEqual({ status: 0, data: ['v=spf1 -all'] });
		expect(seen[0].url).toBe('https://cloudflare-dns.com/dns-query?name=example.com&type=TXT');
	});
});

describe('input', () => {
	it('classifies records and domains', () => {
		expect(classifyInput('v=spf1 -all')).toEqual({ kind: 'record', record: 'v=spf1 -all' });
		expect(classifyInput(' Example.com ')).toEqual({ kind: 'domain', domain: 'Example.com' });
		expect(classifyInput('')).toBeNull();
		expect(() => classifyInput('bad..name')).toThrow(/Empty label/);
	});

	it('detects SPF records only', () => {
		expect(looksLikeSpf('v=spf1 include:_spf.google.com ~all')).toBeGreaterThan(0.9);
		expect(looksLikeSpf('"v=spf1 -all"')).toBeGreaterThan(0.9);
		expect(looksLikeSpf('example.com')).toBe(0);
		expect(looksLikeSpf('v=spf10')).toBe(0);
	});
});
