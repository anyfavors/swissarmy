import { describe, expect, it, vi } from 'vitest';
import {
	allowedHosts,
	buildUrl,
	classifyTxt,
	formatTtl,
	genericRdata,
	isIpAddress,
	lookup,
	lookupAll,
	looksLikeDomain,
	normaliseName,
	parseCaa,
	parseMx,
	parseResponse,
	plan,
	rcodeName,
	requestInit,
	reverseName,
	txtStrings,
	typeName,
	unquoteTxt,
	type FetchFn
} from './logic';
import { meta } from './meta';

/* Hand-written fixtures in the documented DoH JSON format
   (developers.google.com/speed/public-dns/docs/doh/json,
   developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json/). */

const aFixture = {
	Status: 0,
	TC: false,
	RD: true,
	RA: true,
	AD: true,
	CD: false,
	Question: [{ name: 'example.com', type: 1 }],
	Answer: [
		{ name: 'example.com', type: 1, TTL: 1726, data: '93.184.215.14' },
		{ name: 'example.com', type: 1, TTL: 1726, data: '96.7.128.175' }
	]
};

const mxFixture = {
	Status: 0,
	TC: false,
	RD: true,
	RA: true,
	AD: false,
	CD: false,
	Question: [{ name: 'gmail.com.', type: 15 }],
	Answer: [
		{ name: 'gmail.com.', type: 15, TTL: 3600, data: '20 alt2.gmail-smtp-in.l.google.com.' },
		{ name: 'gmail.com.', type: 15, TTL: 3600, data: '5 gmail-smtp-in.l.google.com.' },
		{ name: 'gmail.com.', type: 15, TTL: 3600, data: '10 alt1.gmail-smtp-in.l.google.com.' }
	]
};

const txtFixture = {
	Status: 0,
	TC: false,
	RD: true,
	RA: true,
	AD: false,
	CD: false,
	Question: [{ name: 'example.org.', type: 16 }],
	Answer: [
		{
			name: 'example.org.',
			type: 16,
			TTL: 300,
			data: '"v=spf1 include:_spf.google.com " "include:mailgun.org ~all"'
		},
		{ name: 'example.org.', type: 16, TTL: 300, data: '"google-site-verification=abc123"' }
	]
};

const nxFixture = {
	Status: 3,
	TC: false,
	RD: true,
	RA: true,
	AD: true,
	CD: false,
	Question: [{ name: 'nope.example.com.', type: 1 }],
	Authority: [
		{
			name: 'example.com.',
			type: 6,
			TTL: 3600,
			data: 'ns.icann.org. noc.dns.icann.org. 2024081457 7200 3600 1209600 3600'
		}
	],
	Comment: 'Response from 199.43.135.53.'
};

const caaCloudflareGeneric = {
	Status: 0,
	TC: false,
	RD: true,
	RA: true,
	AD: false,
	CD: false,
	Question: [{ name: 'example.net', type: 257 }],
	// 0 issue "letsencrypt.org" in RFC 3597 generic form
	Answer: [
		{
			name: 'example.net',
			type: 257,
			TTL: 300,
			data: '\\# 22 00 05 69 73 73 75 65 6c 65 74 73 65 6e 63 72 79 70 74 2e 6f 72 67'
		}
	]
};

function fakeFetch(body: unknown, status = 200): FetchFn & ReturnType<typeof vi.fn> {
	return vi.fn(async () => ({
		ok: status >= 200 && status < 300,
		status,
		json: async () => {
			if (body instanceof Error) throw body;
			return body;
		}
	}));
}

describe('type and rcode mapping', () => {
	it('maps type numbers to names', () => {
		expect(typeName(1)).toBe('A');
		expect(typeName(28)).toBe('AAAA');
		expect(typeName(5)).toBe('CNAME');
		expect(typeName(46)).toBe('RRSIG');
		expect(typeName(65)).toBe('HTTPS');
		expect(typeName(64)).toBe('SVCB');
		expect(typeName(257)).toBe('CAA');
		expect(typeName(52)).toBe('TLSA');
		expect(typeName(4242)).toBe('TYPE4242');
	});
	it('maps RCODEs', () => {
		expect(rcodeName(0)).toBe('NOERROR');
		expect(rcodeName(2)).toBe('SERVFAIL');
		expect(rcodeName(3)).toBe('NXDOMAIN');
		expect(rcodeName(5)).toBe('REFUSED');
		expect(rcodeName(99)).toBe('RCODE99');
	});
});

describe('formatTtl', () => {
	it('formats seconds', () => {
		expect(formatTtl(0)).toBe('0s');
		expect(formatTtl(59)).toBe('59s');
		expect(formatTtl(300)).toBe('5m');
		expect(formatTtl(3900)).toBe('1h 5m');
		expect(formatTtl(86400)).toBe('1d');
		expect(formatTtl(90061)).toBe('1d 1h 1m 1s');
		expect(formatTtl(-1)).toBe('');
	});
});

describe('TXT', () => {
	it('unquotes and joins character-strings', () => {
		expect(txtStrings('"a b" "c"')).toEqual(['a b', 'c']);
		expect(unquoteTxt('"v=spf1 include:a " "~all"')).toBe('v=spf1 include:a ~all');
	});
	it('handles escapes', () => {
		expect(unquoteTxt('"say \\"hi\\" \\\\ ok"')).toBe('say "hi" \\ ok');
		expect(unquoteTxt('"semi\\059colon"')).toBe('semi;colon');
		// UTF-8 bytes of "e acute" as \DDD
		expect(unquoteTxt('"caf\\195\\169"')).toBe('café');
	});
	it('returns unquoted data as is', () => {
		expect(unquoteTxt('v=spf1 -all')).toBe('v=spf1 -all');
	});
	it('keeps empty strings', () => {
		expect(txtStrings('""')).toEqual(['']);
	});
	it('classifies mail policy records', () => {
		expect(classifyTxt('v=spf1 -all')).toBe('SPF');
		expect(classifyTxt('v=spf10')).toBeUndefined();
		expect(classifyTxt('v=DMARC1; p=reject; rua=mailto:d@example.com')).toBe('DMARC');
		expect(classifyTxt('v=DKIM1; k=rsa; p=MIIBIjAN')).toBe('DKIM');
		expect(classifyTxt('k=rsa; p=MIIBIjAN', 'sel._domainkey.example.com.')).toBe('DKIM');
		expect(classifyTxt('k=rsa; p=MIIBIjAN', 'example.com.')).toBeUndefined();
		expect(classifyTxt('v=STSv1; id=2024')).toBe('MTA-STS');
		expect(classifyTxt('google-site-verification=x')).toBeUndefined();
	});
});

describe('MX and CAA', () => {
	it('parses MX', () => {
		expect(parseMx('10 mx.example.com.')).toEqual({ preference: 10, exchange: 'mx.example.com.' });
		expect(parseMx('nonsense')).toBeNull();
	});
	it('parses presentation CAA', () => {
		expect(parseCaa('0 issue "letsencrypt.org"')).toEqual({
			flags: 0,
			tag: 'issue',
			value: 'letsencrypt.org'
		});
		expect(parseCaa('128 iodef "mailto:sec@example.com"')).toEqual({
			flags: 128,
			tag: 'iodef',
			value: 'mailto:sec@example.com'
		});
	});
	it('parses generic RDATA CAA', () => {
		expect(genericRdata('\\# 2 0a ff')).toEqual(new Uint8Array([10, 255]));
		expect(genericRdata('\\# 3 0a ff')).toBeNull();
		expect(parseCaa(caaCloudflareGeneric.Answer[0].data)).toEqual({
			flags: 0,
			tag: 'issue',
			value: 'letsencrypt.org'
		});
	});
});

describe('reverse names', () => {
	it('builds in-addr.arpa and ip6.arpa names', () => {
		expect(reverseName('192.0.2.1')).toBe('1.2.0.192.in-addr.arpa');
		expect(reverseName('2001:db8::1')).toBe(
			'1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa'
		);
		expect(reverseName('example.com')).toBeNull();
		expect(reverseName('10.0.0.0/8')).toBeNull();
		expect(reverseName('999.1.1.1')).toBeNull();
		expect(isIpAddress(' 8.8.8.8 ')).toBe(true);
	});
	it('plans a PTR query for an IP whatever type was chosen', () => {
		expect(plan('8.8.4.4', 'A')).toEqual({
			queries: [{ name: '4.4.8.8.in-addr.arpa', type: 'PTR' }],
			reverseOf: '8.8.4.4'
		});
	});
});

describe('names and plans', () => {
	it('normalises names', () => {
		expect(normaliseName(' example.com ')).toBe('example.com');
		expect(normaliseName('example.com.')).toBe('example.com.');
		expect(normaliseName('_dmarc.example.com')).toBe('_dmarc.example.com');
		expect(normaliseName('https://www.example.com/a/b?c=1')).toBe('www.example.com');
		expect(normaliseName('bücher.example')).toBe('xn--bcher-kva.example');
		expect(normaliseName('.')).toBe('.');
	});
	it('rejects bad names', () => {
		expect(() => normaliseName('')).toThrow('Enter a domain name');
		expect(() => normaliseName('a b.com')).toThrow('spaces');
		expect(() => normaliseName('a..com')).toThrow('Empty label');
		expect(() => normaliseName('a'.repeat(64) + '.com')).toThrow('63');
		expect(() => normaliseName('ex!ample.com')).toThrow('"!"');
	});
	it('expands ALL into the common set', () => {
		const p = plan('example.com', 'ALL');
		expect(p.queries.map((q) => q.type)).toEqual(['A', 'AAAA', 'MX', 'TXT', 'NS', 'CAA', 'SOA']);
		expect(p.fromUrl).toBeUndefined();
		expect(plan('https://example.com/', 'MX').fromUrl).toBe(true);
	});
});

describe('buildUrl', () => {
	it('builds Cloudflare and Google URLs', () => {
		expect(buildUrl('cloudflare', { name: 'example.com', type: 'A' })).toBe(
			'https://cloudflare-dns.com/dns-query?name=example.com&type=A'
		);
		expect(buildUrl('google', { name: '_dmarc.example.com', type: 'TXT' })).toBe(
			'https://dns.google/resolve?name=_dmarc.example.com&type=TXT'
		);
	});
	it('only targets the two allowed hosts', () => {
		expect(allowedHosts).toEqual(['cloudflare-dns.com', 'dns.google']);
		expect(meta.network && meta.network.hosts).toEqual(allowedHosts);
		for (const r of ['cloudflare', 'google'] as const)
			expect(allowedHosts).toContain(new URL(buildUrl(r, { name: 'x.y', type: 'A' })).host);
	});
	it('uses a private request mode', () => {
		const i = requestInit('cloudflare');
		expect(i.credentials).toBe('omit');
		expect(i.referrerPolicy).toBe('no-referrer');
		expect(i.cache).toBe('no-store');
		expect(i.redirect).toBe('error');
		expect(i.headers).toEqual({ accept: 'application/dns-json' });
		expect(requestInit('google').headers).toEqual({});
	});
});

describe('parseResponse', () => {
	it('parses an A answer with flags', () => {
		const r = parseResponse(aFixture);
		expect(r.statusName).toBe('NOERROR');
		expect(r.flags).toEqual({ AD: true, TC: false, RD: true, RA: true, CD: false });
		expect(r.question).toEqual([{ name: 'example.com', type: 'A' }]);
		expect(r.answer).toHaveLength(2);
		expect(r.answer[0]).toMatchObject({ typeName: 'A', ttl: 1726, display: '93.184.215.14' });
		expect(r.authority).toEqual([]);
	});
	it('sorts MX by preference', () => {
		const r = parseResponse(mxFixture);
		expect(r.answer.map((a) => a.mx?.preference)).toEqual([5, 10, 20]);
	});
	it('unquotes and labels TXT', () => {
		const r = parseResponse(txtFixture);
		expect(r.answer[0].display).toBe('v=spf1 include:_spf.google.com include:mailgun.org ~all');
		expect(r.answer[0].txtKind).toBe('SPF');
		expect(r.answer[1].txtKind).toBeUndefined();
	});
	it('reads NXDOMAIN with SOA in authority and the comment', () => {
		const r = parseResponse(nxFixture);
		expect(r.statusName).toBe('NXDOMAIN');
		expect(r.answer).toEqual([]);
		expect(r.authority[0].typeName).toBe('SOA');
		expect(r.comment).toBe('Response from 199.43.135.53.');
	});
	it('accepts Comment as an array', () => {
		expect(parseResponse({ Status: 2, Comment: ['a', 'b'] }).comment).toBe('a b');
	});
	it('decodes generic CAA for display', () => {
		const r = parseResponse(caaCloudflareGeneric);
		expect(r.answer[0].caa).toEqual({ flags: 0, tag: 'issue', value: 'letsencrypt.org' });
		expect(r.answer[0].display).toBe('0 issue "letsencrypt.org"');
	});
	it('rejects non DNS JSON', () => {
		expect(() => parseResponse(null)).toThrow('not DNS JSON');
		expect(() => parseResponse([])).toThrow('not DNS JSON');
		expect(() => parseResponse({ hello: 1 })).toThrow('no Status');
	});
});

describe('lookup client', () => {
	const q = { name: 'example.com', type: 'A' as const };
	let t = 0;
	const now = () => (t += 21);

	it('requests the built URL with private options and parses the answer', async () => {
		const f = fakeFetch(aFixture);
		const r = await lookup('cloudflare', q, { fetchFn: f, now });
		expect(f).toHaveBeenCalledTimes(1);
		const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe('https://cloudflare-dns.com/dns-query?name=example.com&type=A');
		expect(init.credentials).toBe('omit');
		expect(init.signal).toBeInstanceOf(AbortSignal);
		expect(r.error).toBeUndefined();
		expect(r.answer?.answer).toHaveLength(2);
		expect(r.resolver.host).toBe('cloudflare-dns.com');
		expect(r.ms).toBe(21);
	});

	it('reports HTTP errors with the resolver message', async () => {
		const f = fakeFetch({ error: 'Invalid query name' }, 400);
		const r = await lookup('google', q, { fetchFn: f });
		expect(r.error).toBe(
			'dns.google answered HTTP 400: Invalid query name. The query was not resolved.'
		);
	});

	it('reports a body that is not JSON', async () => {
		const r = await lookup('google', q, { fetchFn: fakeFetch(new SyntaxError('bad')) });
		expect(r.error).toBe('dns.google sent a body that is not JSON');
	});

	it('reports network failures without retrying', async () => {
		const f = vi.fn(async () => {
			throw new TypeError('Failed to fetch');
		});
		const r = await lookup('cloudflare', q, { fetchFn: f });
		expect(f).toHaveBeenCalledTimes(1);
		expect(r.error).toMatch(/^The request to cloudflare-dns.com failed/);
	});

	it('times out after the limit and aborts the request', async () => {
		vi.useFakeTimers();
		try {
			let seen: AbortSignal | undefined;
			const f: FetchFn = (_u, init) =>
				new Promise((_res, rej) => {
					seen = init.signal ?? undefined;
					seen?.addEventListener('abort', () =>
						rej(new DOMException('The operation was aborted.', 'AbortError'))
					);
				});
			const p = lookup('google', q, { fetchFn: f });
			await vi.advanceTimersByTimeAsync(8000);
			const r = await p;
			expect(seen?.aborted).toBe(true);
			expect(r.error).toBe('No answer from dns.google within 8 s. Nothing was retried.');
		} finally {
			vi.useRealTimers();
		}
	});

	it('runs ALL in parallel, one request per type', async () => {
		const f = fakeFetch({ Status: 0 });
		const res = await lookupAll('google', plan('example.com', 'ALL').queries, { fetchFn: f });
		expect(f).toHaveBeenCalledTimes(7);
		expect(res.map((r) => r.query.type)).toEqual(['A', 'AAAA', 'MX', 'TXT', 'NS', 'CAA', 'SOA']);
		expect(res.every((r) => r.answer?.statusName === 'NOERROR')).toBe(true);
	});
});

describe('looksLikeDomain', () => {
	it('claims domain names', () => {
		expect(looksLikeDomain('example.com')).toBe(0.6);
		expect(looksLikeDomain('sub.example.co.uk')).toBe(0.6);
		expect(looksLikeDomain('_dmarc.example.com')).toBe(0.6);
		expect(looksLikeDomain('example.com.')).toBe(0.6);
		expect(looksLikeDomain('xn--bcher-kva.xn--p1ai')).toBe(0.6);
	});
	it('leaves other input alone', () => {
		expect(looksLikeDomain('https://example.com')).toBe(0);
		expect(looksLikeDomain('example.com/path')).toBe(0);
		expect(looksLikeDomain('192.168.1.1')).toBe(0);
		expect(looksLikeDomain('10.0.0.0/8')).toBe(0);
		expect(looksLikeDomain('2001:db8::1')).toBe(0);
		expect(looksLikeDomain('localhost')).toBe(0);
		expect(looksLikeDomain('a@example.com')).toBe(0);
		expect(looksLikeDomain('hello world.com')).toBe(0);
		expect(looksLikeDomain('1.5')).toBe(0);
		expect(looksLikeDomain('-bad.com')).toBe(0);
		expect(looksLikeDomain('a.b.c1')).toBe(0);
	});
});
