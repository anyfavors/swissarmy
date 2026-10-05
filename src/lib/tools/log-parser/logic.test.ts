import { describe, expect, it } from 'vitest';
import {
	apacheFormat,
	customFormat,
	decodePri,
	defaultAggregations,
	detectFormat,
	looksLikeLog,
	nginxFormat,
	parseLog,
	parseLogfmt,
	parseTime,
	parserFor,
	span,
	topN
} from './logic';

// Example line from the Apache httpd mod_log_config / log files documentation.
const APACHE_COMBINED =
	'127.0.0.1 - frank [10/Oct/2000:13:55:36 -0700] "GET /apache_pb.gif HTTP/1.0" 200 2326 "http://www.example.com/start.html" "Mozilla/4.08 [en] (Win98; I ;Nav)"';

describe('access logs', () => {
	it('parses the combined format', () => {
		const f = parserFor('combined')(APACHE_COMBINED)!;
		expect(f).toMatchObject({
			remote_addr: '127.0.0.1',
			remote_user: 'frank',
			time_local: '10/Oct/2000:13:55:36 -0700',
			request: 'GET /apache_pb.gif HTTP/1.0',
			method: 'GET',
			path: '/apache_pb.gif',
			protocol: 'HTTP/1.0',
			status: '200',
			body_bytes_sent: '2326',
			http_referer: 'http://www.example.com/start.html',
			http_user_agent: 'Mozilla/4.08 [en] (Win98; I ;Nav)'
		});
	});

	it('parses the common format and escaped quotes', () => {
		const f = parserFor('common')(
			'10.0.0.1 - - [01/Jan/2024:00:00:00 +0000] "GET /a?b=\\"c\\" HTTP/1.1" 404 -'
		)!;
		expect(f.status).toBe('404');
		expect(f.body_bytes_sent).toBe('-');
		expect(f.path).toBe('/a');
		expect(f.query).toBe('b=\\"c\\"');
		expect(parserFor('combined')('nonsense')).toBeNull();
	});
});

describe('custom formats', () => {
	it('derives a parser from an nginx log_format', () => {
		const c = nginxFormat(`log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for" $request_time';`);
		expect(c.name).toBe('main');
		expect(c.fields).toEqual([
			'remote_addr',
			'remote_user',
			'time_local',
			'request',
			'status',
			'body_bytes_sent',
			'http_referer',
			'http_user_agent',
			'http_x_forwarded_for',
			'request_time'
		]);
		const r = parseLog(
			'203.0.113.9 - - [05/Oct/2026:10:00:01 +0200] "POST /api/login HTTP/2.0" 401 17 "-" "curl/8.5.0" "198.51.100.1, 10.0.0.2" 0.012\n',
			'custom',
			c
		);
		expect(r.records).toHaveLength(1);
		expect(r.records[0].fields).toMatchObject({
			status: '401',
			path: '/api/login',
			http_x_forwarded_for: '198.51.100.1, 10.0.0.2',
			request_time: '0.012'
		});
		expect(r.range!.from).toBe(Date.UTC(2026, 9, 5, 8, 0, 1));
	});

	it('handles ${var}, escape= and a bare format string', () => {
		expect(
			nginxFormat(`log_format j escape=json '{"t":"$time_iso8601","s":$status}';`).fields
		).toEqual(['time_iso8601', 'status']);
		const c = nginxFormat('${remote_addr}:$status');
		expect(c.regex.exec('1.2.3.4:200')!.slice(1)).toEqual(['1.2.3.4', '200']);
		expect(() => nginxFormat("log_format x 'plain';")).toThrow(/No \$variables/);
	});

	it('derives a parser from an Apache LogFormat', () => {
		const c = apacheFormat(
			'LogFormat "%h %l %u %t \\"%r\\" %>s %b \\"%{Referer}i\\" \\"%{User-agent}i\\" %D" timed'
		);
		expect(c.name).toBe('timed');
		expect(c.fields).toEqual([
			'remote_addr',
			'ident',
			'remote_user',
			'time_local',
			'request',
			'status',
			'body_bytes_sent',
			'http_referer',
			'http_user_agent',
			'duration_us'
		]);
		const f = parseLog(APACHE_COMBINED + ' 1234', 'custom', c).records[0].fields;
		expect(f.duration_us).toBe('1234');
		expect(f.time_local).toBe('10/Oct/2000:13:55:36 -0700');
		expect(customFormat('%h %>s').kind).toBe('apache');
		expect(customFormat('$a $b').kind).toBe('nginx');
		expect(() => customFormat('hello')).toThrow(/No \$variables/);
		expect(() => apacheFormat('%Z')).toThrow(/Unknown directive %Z/);
	});
});

describe('syslog', () => {
	it('decodes PRI (RFC 5424 section 6.2.1)', () => {
		expect(decodePri(34)).toEqual({ facility: 'auth', severity: 'crit' });
		expect(decodePri(165)).toEqual({ facility: 'local4', severity: 'notice' });
		expect(decodePri(0)).toEqual({ facility: 'kern', severity: 'emerg' });
		expect(decodePri(191)).toEqual({ facility: 'local7', severity: 'debug' });
		expect(() => decodePri(192)).toThrow(/out of range/);
	});

	it('parses the RFC 3164 example', () => {
		const f = parserFor('syslog3164')(
			"<34>Oct 11 22:14:15 mymachine su: 'su root' failed for lonvick on /dev/pts/8"
		)!;
		expect(f).toMatchObject({
			pri: '34',
			facility: 'auth',
			severity: 'crit',
			timestamp: 'Oct 11 22:14:15',
			hostname: 'mymachine',
			app_name: 'su',
			msg: "'su root' failed for lonvick on /dev/pts/8"
		});
		const g = parserFor('syslog3164')('Mar  1 07:00:01 host CRON[1234]: (root) CMD (run-parts)')!;
		expect(g.procid).toBe('1234');
		expect(g.app_name).toBe('CRON');
		expect(g.pri).toBeUndefined();
	});

	it('parses the RFC 5424 examples (section 6.5)', () => {
		const p = parserFor('syslog5424');
		const a = p(
			"<34>1 2003-10-11T22:14:15.003Z mymachine.example.com su - ID47 - ﻿'su root' failed for lonvick on /dev/pts/8"
		)!;
		expect(a).toMatchObject({
			facility: 'auth',
			severity: 'crit',
			version: '1',
			hostname: 'mymachine.example.com',
			app_name: 'su',
			procid: '',
			msgid: 'ID47',
			msg: "'su root' failed for lonvick on /dev/pts/8"
		});
		const b = p(
			"<165>1 2003-08-24T05:14:15.000003-07:00 192.0.2.1 myproc 8710 - - %% It's time to make the do-nuts."
		)!;
		expect(b).toMatchObject({
			facility: 'local4',
			severity: 'notice',
			procid: '8710',
			msg: "%% It's time to make the do-nuts."
		});
		const c = p(
			'<165>1 2003-10-11T22:14:15.003Z mymachine.example.com evntslog - ID47 [exampleSDID@32473 iut="3" eventSource="Application" eventID="1011"][examplePriority@32473 class="high"]'
		)!;
		expect(c['sd.exampleSDID@32473.eventSource']).toBe('Application');
		expect(c['sd.examplePriority@32473.class']).toBe('high');
		expect(c.msg).toBe('');
		expect(p('<13>1 - - - - - [bad')).toBeNull();
	});

	it('reads times', () => {
		expect(parseTime('2003-10-11T22:14:15.003Z')).toBe(Date.UTC(2003, 9, 11, 22, 14, 15, 3));
		expect(parseTime('2003-08-24T05:14:15.000003-07:00')).toBe(Date.UTC(2003, 7, 24, 12, 14, 15));
		expect(parseTime('Oct 11 22:14:15', 2025)).toBe(Date.UTC(2025, 9, 11, 22, 14, 15));
		expect(parseTime('[10/Oct/2000:13:55:36 -0700]')).toBe(Date.UTC(2000, 9, 10, 20, 55, 36));
		expect(parseTime('1700000000')).toBe(1_700_000_000_000);
		expect(parseTime('1700000000123')).toBe(1_700_000_000_123);
		expect(parseTime('soon')).toBeUndefined();
	});
});

describe('JSON lines and logfmt', () => {
	it('flattens JSON objects', () => {
		const r = parseLog(
			'{"ts":"2024-01-01T00:00:00Z","level":"info","http":{"status_code":200},"tags":["a"]}\n{"ts":"2024-01-01T01:00:00Z","level":"error"}\nnot json\n',
			'auto'
		);
		expect(r.format).toBe('json');
		expect(r.records[0].fields).toEqual({
			ts: '2024-01-01T00:00:00Z',
			level: 'info',
			'http.status_code': '200',
			tags: '["a"]'
		});
		expect(r.failed).toEqual([{ line: 3, text: 'not json' }]);
		expect(r.range).toEqual({ from: Date.UTC(2024, 0, 1), to: Date.UTC(2024, 0, 1, 1) });
		expect(defaultAggregations(r)).toEqual(['http.status_code', 'level']);
	});

	it('reads logfmt', () => {
		expect(
			parseLogfmt('at=info method=GET path="/x y" status=200 fwd="1.2.3.4" dyno=web.1 debug')
		).toEqual({
			at: 'info',
			method: 'GET',
			path: '/x y',
			status: '200',
			fwd: '1.2.3.4',
			dyno: 'web.1',
			debug: 'true'
		});
		expect(parseLogfmt('just words')).toBeNull();
		expect(parseLogfmt('msg="say \\"hi\\""')!.msg).toBe('say "hi"');
	});
});

describe('detection and aggregation', () => {
	it('detects formats', () => {
		expect(detectFormat([APACHE_COMBINED])).toBe('combined');
		expect(detectFormat(['<34>Oct 11 22:14:15 mymachine su: x'])).toBe('syslog3164');
		expect(detectFormat(['<34>1 - - - - - - x'])).toBe('syslog5424');
		expect(detectFormat(['a=1 b=2', 'c=3'])).toBe('logfmt');
		expect(detectFormat(['hello world', 'nothing here'])).toBeNull();
	});

	it('counts top values and stops at the line cap', () => {
		const lines = [
			'1.1.1.1 - - [01/Jan/2024:00:00:00 +0000] "GET / HTTP/1.1" 200 1',
			'1.1.1.1 - - [01/Jan/2024:00:00:05 +0000] "GET /a HTTP/1.1" 404 1',
			'2.2.2.2 - - [01/Jan/2024:02:00:00 +0000] "GET / HTTP/1.1" 200 1'
		];
		const r = parseLog(lines.join('\n'), 'auto');
		expect(r.format).toBe('common');
		expect(defaultAggregations(r)).toEqual(['status', 'remote_addr', 'path']);
		expect(topN(r.records, 'remote_addr')).toEqual({
			top: [
				{ value: '1.1.1.1', count: 2 },
				{ value: '2.2.2.2', count: 1 }
			],
			distinct: 2
		});
		expect(span(r.range!.to - r.range!.from)).toBe('2 h');
		expect(span(90_061_000)).toBe('1 d 1 h 1 min');
		const big = parseLog(Array(100_005).fill(lines[0]).join('\n'), 'common');
		expect(big.truncated).toBe(true);
		expect(big.records).toHaveLength(100_000);
		expect(big.totalLines).toBe(100_005);
	});

	it('intake is conservative', () => {
		expect(looksLikeLog(APACHE_COMBINED)).toBe(0.85);
		expect(looksLikeLog('<34>1 2003-10-11T22:14:15.003Z host app - - - msg')).toBe(0.8);
		expect(looksLikeLog('{"a":1}')).toBe(0);
		expect(looksLikeLog('{"a":1}\n{"a":2}')).toBe(0.6);
		expect(looksLikeLog('key=value')).toBe(0);
	});
});
