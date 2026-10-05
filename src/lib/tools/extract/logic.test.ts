import { describe, expect, it } from 'vitest';
import {
	defang,
	defangValue,
	extractAll,
	find,
	isIPv4,
	isIPv6,
	looksDefanged,
	refang
} from './logic';
import { ops } from './ops';

const f = (t: string, k: Parameters<typeof find>[1]) => find(t, k);

describe('extract: validators', () => {
	it('IPv4', () => {
		expect(isIPv4('192.0.2.1')).toBe(true);
		expect(isIPv4('255.255.255.255')).toBe(true);
		expect(isIPv4('256.1.1.1')).toBe(false);
		expect(isIPv4('01.2.3.4')).toBe(false);
		expect(isIPv4('1.2.3')).toBe(false);
	});

	it('IPv6 (RFC 4291 text forms)', () => {
		for (const ok of [
			'2001:db8::1',
			'::1',
			'::',
			'fe80::',
			'2001:0db8:0000:0000:0000:ff00:0042:8329',
			'::ffff:192.0.2.128',
			'64:ff9b::192.0.2.33'
		])
			expect(isIPv6(ok), ok).toBe(true);
		for (const bad of [
			'2001:db8:::1',
			'1:2:3:4:5:6:7',
			'1:2:3:4:5:6:7:8:9',
			'g::1',
			'12345::',
			'1::2::3'
		])
			expect(isIPv6(bad), bad).toBe(false);
	});
});

describe('extract: find', () => {
	const text = `Seen from 192.0.2.10 and 198.51.100.7, again 192.0.2.10.
Bad: 999.1.1.1, version 1.2.3.4.5, net 10.0.0.0/8 and 2001:db8::/32.
v6 host 2001:DB8::1 and loopback ::1, but not 12:30:45 or std::vector.`;

	it('finds valid IPv4 only, deduped, without CIDRs or version strings', () => {
		expect(f(text, 'ipv4')).toEqual(['192.0.2.10', '198.51.100.7']);
	});

	it('finds IPv6 and skips times and C++ scopes', () => {
		expect(f(text, 'ipv6')).toEqual(['2001:db8::1', '::1']);
	});

	it('finds CIDRs for both families and validates prefix length', () => {
		expect(f(text, 'cidr')).toEqual(['10.0.0.0/8', '2001:db8::/32']);
		expect(f('1.2.3.4/33 and ::/129', 'cidr')).toEqual([]);
	});

	it('keeps duplicates when asked and sorts IPs numerically', () => {
		expect(find('1.1.1.1 1.1.1.1', 'ipv4', { dedupe: false, sort: false })).toHaveLength(2);
		expect(find('10.0.0.2 9.0.0.1 10.0.0.10', 'ipv4', { dedupe: true, sort: true })).toEqual([
			'9.0.0.1',
			'10.0.0.2',
			'10.0.0.10'
		]);
	});

	it('finds URLs and trims sentence punctuation and unbalanced parentheses', () => {
		const t =
			'See https://example.com/a?b=1. Also (http://x.dk/wiki/A_(b)) and ftp://files.example.org/x, end';
		expect(f(t, 'url')).toEqual([
			'https://example.com/a?b=1',
			'http://x.dk/wiki/A_(b)',
			'ftp://files.example.org/x'
		]);
	});

	it('finds emails and domains, but not file names', () => {
		const t =
			'Mail first.last+tag@Example.COM about report.pdf, logic.ts and www.dr.dk or sub.example.co.uk.';
		expect(f(t, 'email')).toEqual(['first.last+tag@example.com']);
		expect(f(t, 'domain')).toEqual(['example.com', 'www.dr.dk', 'sub.example.co.uk']);
	});

	it('finds MAC addresses in three notations', () => {
		expect(
			f('00:1A:2B:3C:4D:5E 00-1a-2b-3c-4d-5f 001a.2b3c.4d60 00:1a-2b:3c:4d:5e', 'mac')
		).toEqual(['00:1a:2b:3c:4d:5e', '00-1a-2b-3c-4d-5f', '001a.2b3c.4d60']);
	});

	it('classifies hashes by length', () => {
		const md5 = 'd41d8cd98f00b204e9800998ecf8427e';
		const sha1 = 'da39a3ee5e6b4b0d3255bfef95601890afd80709';
		const sha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
		const t = `${md5} ${sha1.toUpperCase()} ${sha256}`;
		expect(f(t, 'md5')).toEqual([md5]);
		expect(f(t, 'sha1')).toEqual([sha1]);
		expect(f(t, 'sha256')).toEqual([sha256]);
		expect(f(sha256, 'md5')).toEqual([]);
	});

	it('finds CVE ids, UUIDs and ARNs', () => {
		expect(f('cve-2021-44228 and CVE-2021-42574.', 'cve')).toEqual([
			'CVE-2021-44228',
			'CVE-2021-42574'
		]);
		expect(f('id 123E4567-E89B-12D3-A456-426614174000.', 'uuid')).toEqual([
			'123e4567-e89b-12d3-a456-426614174000'
		]);
		expect(
			f('role arn:aws:iam::123456789012:role/Admin, bucket arn:aws:s3:::my-bucket/key.', 'arn')
		).toEqual(['arn:aws:iam::123456789012:role/Admin', 'arn:aws:s3:::my-bucket/key']);
	});

	it('finds Windows paths, quoted ones with spaces', () => {
		const t = String.raw`Ran C:\Windows\System32\cmd.exe and "C:\Program Files\App\app.exe", share \\srv\c$\tmp.`;
		expect(f(t, 'winpath')).toEqual([
			String.raw`C:\Windows\System32\cmd.exe`,
			String.raw`C:\Program Files\App\app.exe`,
			String.raw`\\srv\c$\tmp`
		]);
	});
});

describe('extract: defang and refang', () => {
	it('defangs single values', () => {
		expect(defangValue('https://evil.example.com')).toBe('hxxps[:]//evil[.]example[.]com');
		expect(defangValue('a@b.com')).toBe('a[@]b[.]com');
		expect(defangValue('192.0.2.1')).toBe('192[.]0[.]2[.]1');
	});

	it('defangs indicators in text, leaving prose and URL paths alone', () => {
		expect(defang('Go to http://evil.com/x.php now. Mail bad@evil.com from 10.0.0.1. Done.')).toBe(
			'Go to hxxp[:]//evil[.]com/x.php now. Mail bad[@]evil[.]com from 10[.]0[.]0[.]1. Done.'
		);
	});

	it('refangs common styles and round-trips', () => {
		expect(refang('hxxps[:]//evil[.]com and hXXp://a(.)b{.}c and x[at]y[dot]com')).toBe(
			'https://evil.com and http://a.b.c and x@y.com'
		);
		const t = 'Visit https://example.com/a.b and 192.0.2.1';
		expect(refang(defang(t))).toBe(t);
	});

	it('extracts from defanged text', () => {
		const r = extractAll('C2 at hxxp://bad[.]example/x and 203.0.113[.]5', ['url', 'ipv4'], {
			dedupe: true,
			sort: false
		});
		expect(r.map((x) => x.values)).toEqual([['203.0.113.5'], ['http://bad.example/x']]);
	});

	it('detects defanged input', () => {
		expect(looksDefanged('hxxps://x')).toBeGreaterThan(0.5);
		expect(looksDefanged('evil[.]com')).toBeGreaterThan(0.5);
		expect(looksDefanged('plain text')).toBe(0);
	});
});

describe('extract: ops', () => {
	const run = (id: string, s: string) => ops.find((o) => o.id === id)!.run(s);
	it('extracts and throws when nothing is found', () => {
		expect(run('extract.ips', 'a 10.0.0.1 b ::1')).toBe('10.0.0.1\n::1');
		expect(() => run('extract.urls', 'nothing')).toThrow(/No URLs found/);
		expect(run('extract.emails', 'x a@b.dk y')).toBe('a@b.dk');
	});
});
