import { describe, expect, it } from 'vitest';
import {
	describeLifetime,
	guessKind,
	looksLikeCookie,
	parseCookieHeader,
	parseSetCookie,
	parseSetCookies
} from './logic';

const now = Date.UTC(2026, 9, 5, 12, 0, 0);
const texts = (line: string) =>
	parseSetCookie(line, now)
		.findings.map((f) => f.text)
		.join('\n');

describe('Cookie request header', () => {
	it('splits pairs and URL-decodes values', () => {
		const p = parseCookieHeader(
			'Cookie: SID=31d4d96e407aad42; lang=en-US; q=a%20b%2Fc; t="quoted"'
		);
		expect(p.map((c) => [c.name, c.value])).toEqual([
			['SID', '31d4d96e407aad42'],
			['lang', 'en-US'],
			['q', 'a b/c'],
			['t', 'quoted']
		]);
		expect(p[2].decoded).toBe(true);
	});

	it('keeps broken percent-encoding raw', () => {
		expect(parseCookieHeader('a=%E0%A4%A')[0]).toMatchObject({ value: '%E0%A4%A', decoded: false });
	});

	it('accepts a nameless value and empty input', () => {
		expect(parseCookieHeader('justvalue')[0]).toMatchObject({ name: '', value: 'justvalue' });
		expect(parseCookieHeader('  ')).toEqual([]);
	});
});

describe('Set-Cookie', () => {
	it('parses the RFC 6265 §3.1 examples', () => {
		const a = parseSetCookie('Set-Cookie: SID=31d4d96e407aad42; Path=/; Secure; HttpOnly', now);
		expect(a).toMatchObject({
			name: 'SID',
			value: '31d4d96e407aad42',
			path: '/',
			secure: true,
			httpOnly: true
		});
		expect(a.lifetime).toBeNull();
		const b = parseSetCookie('lang=en-US; Expires=Wed, 09 Jun 2021 10:18:14 GMT', now);
		expect(b.expires?.date?.toISOString()).toBe('2021-06-09T10:18:14.000Z');
		expect(texts('lang=en-US; Expires=Wed, 09 Jun 2021 10:18:14 GMT')).toMatch(
			/deletes the cookie/
		);
	});

	it('reads all attributes case-insensitively', () => {
		const c = parseSetCookie(
			'id=a3fWa; max-age=3600; DOMAIN=.Example.com; path=/app; secure; httponly; samesite=strict; partitioned; priority=High; foo=bar',
			now
		);
		expect(c).toMatchObject({
			domain: 'example.com',
			path: '/app',
			secure: true,
			httpOnly: true,
			sameSite: { value: 'Strict' },
			partitioned: true,
			priority: 'High',
			unknown: ['foo=bar'],
			lifetime: 3600
		});
	});

	it('gives Max-Age precedence over Expires', () => {
		const c = parseSetCookie('a=1; Expires=Wed, 09 Jun 2021 10:18:14 GMT; Max-Age=60', now);
		expect(c.lifetime).toBe(60);
	});

	it('flags SameSite=None without Secure', () => {
		expect(texts('a=1; SameSite=None')).toMatch(/SameSite=None without Secure/);
		expect(texts('a=1; SameSite=None; Secure')).not.toMatch(/SameSite=None without Secure/);
	});

	it('enforces cookie prefixes', () => {
		expect(texts('__Secure-a=1; Path=/')).toMatch(/__Secure- prefix requires Secure/);
		expect(texts('__Secure-a=1; Secure')).not.toMatch(/prefix/);
		const h = texts('__Host-a=1; Domain=example.com; Path=/x');
		expect(h).toMatch(/requires Secure/);
		expect(h).toMatch(/forbids Domain/);
		expect(h).toMatch(/requires Path=\//);
		expect(texts('__Host-a=1; Secure; Path=/')).not.toMatch(/prefix/);
		expect(texts('__host-a=1; Path=/')).toMatch(/__Host- prefix requires Secure/);
	});

	it('warns about session cookies without HttpOnly', () => {
		expect(texts('PHPSESSID=abc; Secure')).toMatch(/no HttpOnly/);
		expect(texts('session_id=abc; Secure; HttpOnly')).not.toMatch(/HttpOnly/);
		expect(texts('theme=dark; Secure')).not.toMatch(/HttpOnly/);
	});

	it('warns about lifetimes over 400 days', () => {
		expect(texts('a=1; Max-Age=63072000')).toMatch(/730 days.*400 days/);
		expect(texts('a=1; Max-Age=86400')).not.toMatch(/400 days/);
	});

	it('flags invalid attribute values and Partitioned without Secure', () => {
		expect(texts('a=1; Max-Age=1h')).toMatch(/not an integer/);
		expect(texts('a=1; Expires=tomorrow')).toMatch(/not a date/);
		expect(texts('a=1; SameSite=Loose')).toMatch(/not Strict, Lax or None/);
		expect(texts('a=1; Partitioned')).toMatch(/Partitioned requires Secure/);
	});

	it('rejects a line without a pair, per line', () => {
		const r = parseSetCookies('Set-Cookie: a=1\nnonsense\n\nb=2; Secure', now);
		expect(r).toHaveLength(3);
		expect(r[1].error).toMatch(/no "="/);
		expect(r[2].cookie?.name).toBe('b');
	});
});

describe('helpers', () => {
	it('describes lifetimes', () => {
		expect(describeLifetime(null)).toMatch(/Session cookie/);
		expect(describeLifetime(0)).toMatch(/Expired/);
		expect(describeLifetime(3600)).toBe('60 minutes');
		expect(describeLifetime(86400 * 30)).toBe('30 days');
	});

	it('guesses header kind and detects only labelled headers', () => {
		expect(guessKind('a=1; b=2')).toBe('cookie');
		expect(guessKind('a=1; Path=/; HttpOnly')).toBe('set-cookie');
		expect(guessKind('Set-Cookie: a=1')).toBe('set-cookie');
		expect(looksLikeCookie('Cookie: a=1')).toBeGreaterThan(0.9);
		expect(looksLikeCookie('Set-Cookie: a=1; Secure')).toBeGreaterThan(0.9);
		expect(looksLikeCookie('a=1&b=2')).toBe(0);
	});
});
