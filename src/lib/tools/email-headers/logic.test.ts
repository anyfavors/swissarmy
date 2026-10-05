import { describe, expect, it } from 'vitest';
import {
	analyse,
	arcSets,
	decodeWords,
	formatDuration,
	hops,
	looksLikeHeaders,
	parseAddress,
	parseAuthResults,
	parseDkim,
	parseHeaders,
	parseMailDate,
	parseReceived,
	parseReceivedSpf,
	receivedClauses,
	stripComments
} from './logic';

const sample = `Delivered-To: bob@example.net
Received: by 2002:a05:6a10:1234 with SMTP id abc123;
        Tue, 1 Oct 2024 05:40:12 -0700 (PDT)
Received: from mail.example.com (mail.example.com. [192.0.2.25])
        by mx.example.net with ESMTPS id x12si345
        for <bob@example.net>
        (version=TLS1_3 cipher=TLS_AES_256_GCM_SHA384 bits=256/256);
        Tue, 01 Oct 2024 05:40:11 -0700 (PDT)
Received: from [10.0.0.5] (unknown [198.51.100.7])
	by mail.example.com (Postfix) with ESMTPSA id 4XYZ;
	Tue,  1 Oct 2024 12:30:00 +0000 (UTC)
Authentication-Results: mx.example.net;
       dkim=pass header.i=@example.com header.s=sel1 header.b=AbCd;
       spf=pass (example.net: domain of alice@example.com designates 192.0.2.25 as permitted sender) smtp.mailfrom=alice@example.com;
       dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=example.com
Received-SPF: pass (example.net: domain of alice@example.com designates 192.0.2.25 as permitted sender) client-ip=192.0.2.25;
DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed;
        d=example.com; s=sel1; t=1727785800;
        h=from:to:subject:date:message-id;
        bh=47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=;
        b=dGVzdA==
Return-Path: <bounce@bounces.example.com>
From: =?UTF-8?B?QWxpY2Ugw4Z0aGVy?= <alice@example.com>
Reply-To: alice@example.com
To: Bob <bob@example.net>
Subject: =?ISO-8859-1?Q?Caf=E9?= =?ISO-8859-1?Q?_au_lait?= for you
Date: Tue, 1 Oct 2024 14:29:58 +0200
Message-ID: <abc.123@mail.example.com>
X-Originating-IP: [198.51.100.7]
X-Mailer: Example Mail 1.0

Body text here.
`;

describe('parseHeaders', () => {
	it('unfolds continuation lines and stops at the body', () => {
		const { headers } = parseHeaders(sample);
		expect(headers.map((h) => h.name)).toContain('X-Mailer');
		expect(headers.some((h) => h.value.includes('Body text'))).toBe(false);
		const dkim = headers.find((h) => h.name === 'DKIM-Signature')!;
		expect(dkim.value).toContain('d=example.com; s=sel1;');
	});

	it('skips mbox separators and handles CRLF', () => {
		const r = parseHeaders(
			'From alice@example.com Tue Oct  1 12:00:00 2024\r\nSubject: hi\r\n there\r\n'
		);
		expect(r.headers).toEqual([{ name: 'Subject', value: 'hi there', index: 0 }]);
		expect(r.skipped).toHaveLength(1);
	});
});

describe('RFC 2047', () => {
	// RFC 2047 section 8 examples
	it('decodes the RFC examples', () => {
		expect(decodeWords('=?ISO-8859-1?Q?Keld_J=F8rn_Simonsen?=')).toBe('Keld Jørn Simonsen');
		expect(decodeWords('=?ISO-8859-1?Q?Andr=E9?= Pirard')).toBe('André Pirard');
		expect(decodeWords('(=?ISO-8859-1?Q?a?= =?ISO-8859-1?Q?b?=)')).toBe('(ab)');
		expect(decodeWords('(=?ISO-8859-1?Q?a?=  \t =?ISO-8859-1?Q?b?=)')).toBe('(ab)');
		expect(decodeWords('(=?ISO-8859-1?Q?a_b?=)')).toBe('(a b)');
		expect(decodeWords('(=?ISO-8859-1?Q?a?= b)')).toBe('(a b)');
	});

	it('decodes base64 and joins split multi-byte characters', () => {
		expect(decodeWords('=?UTF-8?B?QWxpY2Ugw4Z0aGVy?=')).toBe('Alice Æther');
		// "é" = C3 A9 split across two words
		expect(decodeWords('=?UTF-8?Q?caf=C3?= =?UTF-8?Q?=A9?=')).toBe('café');
		expect(decodeWords('=?utf-8*en?Q?hi?=')).toBe('hi');
	});

	it('leaves unknown charsets and plain text alone', () => {
		expect(decodeWords('=?x-nope?Q?abc?=')).toBe('=?x-nope?Q?abc?=');
		expect(decodeWords('plain')).toBe('plain');
	});
});

describe('dates', () => {
	it('parses RFC 5322 dates with zones', () => {
		const d = parseMailDate('Tue, 1 Oct 2024 05:40:12 -0700 (PDT)')!;
		expect(new Date(d.ms).toISOString()).toBe('2024-10-01T12:40:12.000Z');
		expect(d.offset).toBe(-420);
		expect(parseMailDate('1 Oct 24 05:40 EDT')!.ms).toBe(Date.UTC(2024, 9, 1, 9, 40));
		expect(parseMailDate('Fri, 21 Nov 1997 09:55:06 -0600')!.ms).toBe(
			Date.UTC(1997, 10, 21, 15, 55, 6)
		);
		expect(parseMailDate('Tue,  1 Oct 2024 12:30:00 +0000 (UTC)')!.offset).toBe(0);
		expect(parseMailDate('1 Oct 2024 12:30:00 -0000')!.zoneUnknown).toBe(true);
		expect(parseMailDate('1 Oct 2024 12:30:00 J')!.zoneUnknown).toBe(true);
		expect(parseMailDate('yesterday')).toBeNull();
		expect(parseMailDate('1 Foo 2024 12:00:00 +0000')).toBeNull();
	});

	it('formats durations', () => {
		expect(formatDuration(3725)).toBe('1h 2m 5s');
		expect(formatDuration(-2)).toBe('-2s');
		expect(formatDuration(0)).toBe('0s');
	});
});

describe('Received', () => {
	it('splits clauses outside comments', () => {
		expect(
			receivedClauses(
				'from a.example (b.example [192.0.2.1]) by c.example (with nothing) with ESMTP id 42 for <x@y>'
			)
		).toEqual({
			from: 'a.example (b.example [192.0.2.1])',
			by: 'c.example (with nothing)',
			with: 'ESMTP',
			id: '42',
			for: '<x@y>'
		});
	});

	it('reads a full header', () => {
		const h = parseReceived(
			'from mail.example.com (mail.example.com. [192.0.2.25]) by mx.example.net with ESMTPS id x12 for <bob@example.net> (version=TLS1_3); Tue, 01 Oct 2024 05:40:11 -0700 (PDT)'
		);
		expect(h).toMatchObject({
			from: 'mail.example.com',
			fromIp: '192.0.2.25',
			fromInfo: 'mail.example.com. [192.0.2.25]',
			by: 'mx.example.net',
			with: 'ESMTPS',
			id: 'x12',
			for: 'bob@example.net'
		});
		expect(h.date?.ms).toBe(Date.UTC(2024, 9, 1, 12, 40, 11));
	});

	it('reads IPv6 literals', () => {
		expect(
			parseReceived('from x ([IPv6:2001:db8::1]) by y; 1 Oct 2024 00:00:00 +0000').fromIp
		).toBe('2001:db8::1');
	});

	it('orders hops bottom-up and flags delays', () => {
		const list = hops(parseHeaders(sample).headers);
		expect(list.map((h) => h.by)).toEqual([
			'mail.example.com',
			'mx.example.net',
			'2002:a05:6a10:1234'
		]);
		expect(list[0].delay).toBeUndefined();
		expect(list[1].delay).toBe(611);
		expect(list[1].flag).toBe('slow');
		expect(list[2].delay).toBe(1);
		const skew = hops(
			parseHeaders(
				'Received: by b; 1 Oct 2024 00:00:00 +0000\nReceived: by a; 1 Oct 2024 00:00:05 +0000'
			).headers
		);
		expect(skew[1]).toMatchObject({ delay: -5, flag: 'skew' });
	});
});

describe('Authentication-Results', () => {
	it('parses RFC 8601 style results', () => {
		const a = parseAuthResults(
			'example.com; spf=pass smtp.mailfrom=example.net; dkim=fail reason="bad sig" header.d=example.net (comment); dmarc=none'
		);
		expect(a.authserv).toBe('example.com');
		expect(a.results.map((r) => [r.method, r.result])).toEqual([
			['spf', 'pass'],
			['dkim', 'fail'],
			['dmarc', 'none']
		]);
		expect(a.results[1].reason).toBe('bad sig');
		expect(a.results[1].props).toEqual([{ key: 'header.d', value: 'example.net' }]);
		expect(a.results[1].comments).toEqual(['comment']);
		expect(a.results[0].explain).toMatch(/allowed by the SPF record/);
	});

	it('handles none and versions', () => {
		expect(parseAuthResults('example.org 1; none').results).toEqual([]);
		const r = parseAuthResults('example.com; dkim/1=pass header.d=x.example').results[0];
		expect(r.version).toBe('1');
	});

	it('parses Received-SPF', () => {
		const r = parseReceivedSpf(
			'softfail (example.net: transitioning domain of a@b.example does not designate 192.0.2.1) client-ip=192.0.2.1; envelope-from="a@b.example"; helo=x.example;'
		);
		expect(r.result).toBe('softfail');
		expect(r.comment).toMatch(/transitioning/);
		expect(r.pairs).toEqual([
			{ key: 'client-ip', value: '192.0.2.1' },
			{ key: 'envelope-from', value: 'a@b.example' },
			{ key: 'helo', value: 'x.example' }
		]);
	});
});

describe('DKIM and ARC', () => {
	it('parses a DKIM signature and warns', () => {
		const d = parseDkim(
			'v=1; a=rsa-sha1; d=mailer.example; s=s1; l=100; h=to:subject; bh=abc; b=dGVz dA==',
			'example.com'
		);
		expect(d.keyName).toBe('s1._domainkey.mailer.example');
		expect(d.signedHeaders).toEqual(['to', 'subject']);
		expect(d.tags.b).toBe('dGVzdA==');
		expect(d.warnings.join('\n')).toMatch(/rsa-sha1/);
		expect(d.warnings.join('\n')).toMatch(/From is not in h=/);
		expect(d.warnings.join('\n')).toMatch(/l=100/);
		expect(d.warnings.join('\n')).toMatch(/not aligned/);
	});

	it('groups ARC sets', () => {
		const { headers } = parseHeaders(`ARC-Seal: i=2; a=rsa-sha256; cv=pass; d=b.example; s=s; b=x
ARC-Message-Signature: i=2; a=rsa-sha256; d=b.example; s=s; h=from; bh=y; b=z
ARC-Authentication-Results: i=2; b.example; arc=pass; dkim=pass header.d=a.example
ARC-Seal: i=1; a=rsa-sha256; cv=none; d=a.example; s=s; b=x
ARC-Authentication-Results: i=1; a.example; spf=pass smtp.mailfrom=a.example`);
		const r = arcSets(headers);
		expect(r.sets.map((s) => s.instance)).toEqual([1, 2]);
		expect(r.sets[0].warnings).toEqual(['ARC-Message-Signature missing']);
		expect(r.sets[1].warnings).toEqual([]);
		expect(r.sets[1].results?.results.map((x) => x.method)).toEqual(['arc', 'dkim']);
		expect(r.sets[1].results?.authserv).toBe('b.example');
	});
});

describe('addresses', () => {
	it('reads display names and addresses', () => {
		expect(parseAddress('"Doe, Jane" <jane@Example.COM>')).toEqual({
			display: 'Doe, Jane',
			address: 'jane@Example.COM',
			domain: 'example.com'
		});
		expect(parseAddress('jane@example.com (Jane Doe)')).toEqual({
			display: 'Jane Doe',
			address: 'jane@example.com',
			domain: 'example.com'
		});
		expect(parseAddress('<>')).toEqual({ display: undefined, address: '', domain: undefined });
	});
});

describe('analyse', () => {
	it('summarises a full header block', () => {
		const a = analyse(sample);
		expect(a.subject).toBe('Café au lait for you');
		expect(a.from).toEqual({
			display: 'Alice Æther',
			address: 'alice@example.com',
			domain: 'example.com'
		});
		expect(a.messageId?.domain).toBe('mail.example.com');
		expect(a.originatingIp).toBe('198.51.100.7');
		expect(a.xHeaders.map((h) => h.name)).toEqual(['X-Originating-IP', 'X-Mailer']);
		expect(a.transit.total).toBe(612);
		expect(a.transit.fromDate).toBe(2);
		expect(a.auth[0].results.map((r) => r.result)).toEqual(['pass', 'pass', 'pass']);
		expect(a.dkim[0].keyName).toBe('sel1._domainkey.example.com');
		const t = a.findings.map((f) => f.text);
		expect(t.some((x) => /Return-Path bounces.example.com is a subdomain/.test(x))).toBe(true);
		expect(t.some((x) => /Hop 2 took 10m 11s/.test(x))).toBe(true);
	});

	it('warns about spoofing patterns', () => {
		const a = analyse(`Received: by x; 1 Oct 2024 00:00:00 +0000
From: "support@bank.example" <evil@attacker.example>
From: other@x.example
Reply-To: collect@elsewhere.example
Return-Path: <bounce@mailer.example>
Authentication-Results: mx.example; dmarc=fail header.from=attacker.example`);
		const t = a.findings.map((f) => f.text).join('\n');
		expect(t).toMatch(/2 From: headers/);
		expect(t).toMatch(/display name shows support@bank.example/);
		expect(t).toMatch(/Replies go to collect@elsewhere.example/);
		expect(t).toMatch(/Return-Path domain mailer.example differs/);
		expect(t).toMatch(/dmarc=fail/);
	});

	it('rejects input without headers', () => {
		expect(() => analyse('just some text')).toThrow(/No header lines/);
	});
});

describe('helpers', () => {
	it('strips nested comments', () => {
		expect(stripComments('a (b (c)) "q (x)" d')).toEqual({
			text: 'a "q (x)" d',
			comments: ['b (c)']
		});
	});

	it('detects header blocks', () => {
		expect(looksLikeHeaders(sample)).toBe(0.9);
		expect(looksLikeHeaders('Received: yes')).toBe(0);
		expect(looksLikeHeaders('Subject: x\nFrom: y\nTo: z\n')).toBe(0);
	});
});
