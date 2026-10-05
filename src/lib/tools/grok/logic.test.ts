import { describe, expect, it } from 'vitest';
import { CORE } from './patterns';
import {
	compile,
	expand,
	looksLikeGrok,
	parsePatternFile,
	runGrok,
	segments,
	toJavaScript
} from './logic';

const fields = (grok: string, line: string, custom = {}) => {
	const r = runGrok(compile(grok, custom), line).results[0];
	return r.match ? Object.fromEntries(r.fields.map((f) => [f.field, f.value])) : null;
};

const APACHE =
	'127.0.0.1 - frank [10/Oct/2000:13:55:36 -0700] "GET /apache_pb.gif HTTP/1.0" 200 2326 "http://www.example.com/start.html" "Mozilla/4.08 [en] (Win98; I ;Nav)"';

describe('library', () => {
	it('every core pattern compiles on its own', () => {
		for (const p of CORE) expect(() => compile(`%{${p.name}}`), p.name).not.toThrow();
	});

	it('matches the basics', () => {
		const t = (p: string, s: string) => new RegExp(`^(?:${compile(`%{${p}}`).source})$`).test(s);
		expect(t('INT', '-42')).toBe(true);
		expect(t('NUMBER', '3.14')).toBe(true);
		expect(t('NUMBER', 'x')).toBe(false);
		expect(t('WORD', 'hello_1')).toBe(true);
		expect(t('IPV4', '192.168.1.255')).toBe(true);
		expect(t('IPV4', '256.1.1.1')).toBe(false);
		expect(t('IPV6', '2001:db8::1')).toBe(true);
		expect(t('IPV6', 'fe80::1%eth0')).toBe(true);
		expect(t('IPV6', '::ffff:192.0.2.1')).toBe(true);
		expect(t('IPV6', '2001:0db8:0000:0000:0000:ff00:0042:8329')).toBe(true);
		expect(t('IPV6', '::')).toBe(true);
		expect(t('IPV6', '12:34:56')).toBe(false);
		expect(t('HOSTNAME', 'www.example.com')).toBe(true);
		expect(t('UUID', '123e4567-e89b-12d3-a456-426614174000')).toBe(true);
		expect(t('MAC', '00:1A:2b:3c:4d:5e')).toBe(true);
		expect(t('UNIXPATH', '/var/log/nginx/access.log')).toBe(true);
		expect(t('WINPATH', 'C:\\Windows\\System32')).toBe(true);
		expect(t('URI', 'https://user@example.com:8443/a/b?c=d')).toBe(true);
		expect(t('HTTPDATE', '10/Oct/2000:13:55:36 -0700')).toBe(true);
		expect(t('TIMESTAMP_ISO8601', '2026-10-05T18:30:00.123+02:00')).toBe(true);
		expect(t('SYSLOGTIMESTAMP', 'Oct  5 08:01:02')).toBe(true);
		expect(t('LOGLEVEL', 'WARNING')).toBe(true);
		expect(t('QUOTEDSTRING', '"say \\"hi\\""')).toBe(true);
	});
});

describe('expand', () => {
	it('names fields, keeps casts and nested library captures', () => {
		const e = expand('%{IP:client} %{NUMBER:bytes:int} %{URIHOST}', {
			IP: '\\d+',
			NUMBER: '\\d+',
			URIHOST: '%{IP}(?::%{NUMBER:port})?'
		});
		expect(e.source).toBe('(?<g0>\\d+) (?<g1>\\d+) (?:(?:\\d+)(?::(?<g2>\\d+))?)');
		expect(e.captures.map((c) => [c.field, c.cast, c.pattern])).toEqual([
			['client', undefined, 'IP'],
			['bytes', 'int', 'NUMBER'],
			['port', undefined, 'NUMBER']
		]);
	});

	it('reports unknown patterns, loops and bad casts', () => {
		expect(() => compile('%{NOPE}')).toThrow(/Unknown pattern %\{NOPE\}/);
		expect(() => compile('%{A}', { A: '%{B}', B: '%{A}' })).toThrow(/refers to itself: A > B > A/);
		expect(() => compile('%{INT:x:long}')).toThrow(/only :int and :float/);
		expect(() => compile('')).toThrow(/Enter a grok pattern/);
	});

	it('renames inline named groups', () => {
		const c = compile('(?<queue_id>[0-9A-F]{10,11}): %{GREEDYDATA:msg}');
		expect(c.captures[0]).toMatchObject({ field: 'queue_id', pattern: 'regex' });
		expect(fields('(?<queue.id>[0-9A-F]{10,11}): %{GREEDYDATA:msg}', 'BEF25A72965: hello')).toEqual(
			{
				'queue.id': 'BEF25A72965',
				msg: 'hello'
			}
		);
	});
});

describe('Oniguruma translation', () => {
	it('emulates atomic groups', () => {
		const js = toJavaScript('(?>a+)b');
		expect(js).toBe('(?:(?=(?<a0>a+))\\k<a0>)b');
		expect(new RegExp(js).test('aaab')).toBe(true);
		// An atomic group never gives characters back: (?>a+)a cannot match.
		expect(new RegExp(toJavaScript('^(?>a+)a')).test('aaaa')).toBe(false);
		expect(new RegExp('^(?:a+)a').test('aaaa')).toBe(true);
	});

	it('translates anchors, \\h and POSIX classes', () => {
		expect(toJavaScript('\\Afoo\\z')).toBe('^foo$');
		expect(toJavaScript('\\h+')).toBe('[0-9A-Fa-f]+');
		expect(toJavaScript('[[:alpha:]_]+')).toBe('[A-Za-z_]+');
		expect(toJavaScript('[[[:alnum:]]_%]')).toBe('[A-Za-z0-9_%]');
		expect(toJavaScript('[]a]')).toBe('[\\]a]');
	});

	it('rejects what JavaScript cannot do', () => {
		expect(() => toJavaScript('a++')).toThrow(/Possessive/);
		expect(() => toJavaScript('(?i:a)')).toThrow(/Inline flags/);
		expect(() => toJavaScript('[a&&b]')).toThrow(/intersection/);
		expect(() => toJavaScript('(a')).toThrow(/Unterminated group/);
		expect(() => toJavaScript('a)')).toThrow(/Unmatched/);
		expect(toJavaScript('a+?')).toBe('a+?');
		expect(toJavaScript('\\++')).toBe('\\++');
	});

	it('takes a leading (?i) as a flag', () => {
		const c = compile('(?i)%{WORD:w} error');
		expect(c.flags).toBe('i');
		expect(fields('(?i)%{WORD:w} error', 'disk ERROR')).toEqual({ w: 'disk' });
	});
});

describe('matching', () => {
	it('parses an Apache combined line with COMBINEDAPACHELOG', () => {
		expect(fields('%{COMBINEDAPACHELOG}', APACHE)).toEqual({
			clientip: '127.0.0.1',
			ident: '-',
			auth: 'frank',
			timestamp: '10/Oct/2000:13:55:36 -0700',
			verb: 'GET',
			request: '/apache_pb.gif',
			httpversion: '1.0',
			response: '200',
			bytes: '2326',
			referrer: '"http://www.example.com/start.html"',
			agent: '"Mozilla/4.08 [en] (Win98; I ;Nav)"'
		});
	});

	it('parses a syslog line with SYSLOGBASE', () => {
		expect(
			fields(
				'%{SYSLOGBASE} %{GREEDYDATA:message}',
				'Oct  5 08:01:02 web01 sshd[4242]: Accepted publickey for deploy from 192.0.2.5 port 50412'
			)
		).toEqual({
			timestamp: 'Oct  5 08:01:02',
			logsource: 'web01',
			program: 'sshd',
			pid: '4242',
			message: 'Accepted publickey for deploy from 192.0.2.5 port 50412'
		});
	});

	it('casts :int and :float like Logstash', () => {
		expect(fields('%{NUMBER:a:int} %{NUMBER:b:float} %{NOTSPACE:c:int}', '3.9 2.50 abc')).toEqual({
			a: 3,
			b: 2.5,
			c: 0
		});
	});

	it('collects repeated field names into a list', () => {
		expect(fields('%{INT:n} %{INT:n}', '1 2')).toEqual({ n: ['1', '2'] });
	});

	it('uses custom patterns and reports non-matching lines', () => {
		const custom = parsePatternFile('# comment\nORDER ORD-%{INT}\n');
		const r = runGrok(compile('%{ORDER:order} shipped', custom), 'ORD-17 shipped\nnothing\n');
		expect(r.results.map((x) => x.match !== null)).toEqual([true, false]);
		expect(r.results[0].fields[0]).toMatchObject({
			field: 'order',
			value: 'ORD-17',
			start: 0,
			end: 6
		});
		expect(() => parsePatternFile('bad-line')).toThrow(/line 1/);
	});

	it('limits the number of lines', () => {
		const r = runGrok(compile('%{INT}'), Array(600).fill('1').join('\n'));
		expect(r.results).toHaveLength(500);
		expect(r.truncated).toBe(true);
	});

	it('splits a line into highlight segments', () => {
		const r = runGrok(compile('%{WORD:a}=%{INT:b}'), 'x: key=42 end').results[0];
		expect(segments(r)).toEqual([
			{ text: 'x: ', kind: 'plain', field: undefined },
			{ text: 'key', kind: 'field', field: 'a' },
			{ text: '=', kind: 'match', field: undefined },
			{ text: '42', kind: 'field', field: 'b' },
			{ text: ' end', kind: 'plain', field: undefined }
		]);
	});
});

describe('detect', () => {
	it('recognises grok expressions', () => {
		expect(looksLikeGrok('%{IP:client} %{WORD:method}')).toBe(0.9);
		expect(looksLikeGrok('100%{ not grok')).toBe(0);
	});
});
