import { describe, expect, it } from 'vitest';
import {
	buildDmarc,
	defaultFields,
	dmarcName,
	externalAuthName,
	fieldsFrom,
	looksLikeDmarc,
	orgDomain,
	parseDmarc,
	relaxedAligned,
	toUris
} from './logic';

describe('parseDmarc', () => {
	it('parses the RFC 7489 example record', () => {
		// RFC 7489 appendix B.2.1
		const p = parseDmarc('v=DMARC1; p=none; rua=mailto:dmarc-feedback@example.com', 'example.com');
		expect(p.map).toEqual({ v: 'DMARC1', p: 'none', rua: 'mailto:dmarc-feedback@example.com' });
		expect(p.effective).toEqual({
			p: 'none',
			sp: 'none',
			np: 'none',
			pct: 100,
			adkim: 'r',
			aspf: 'r'
		});
		expect(p.tags[2].uris).toEqual([
			{
				raw: 'mailto:dmarc-feedback@example.com',
				address: 'dmarc-feedback@example.com',
				domain: 'example.com',
				limit: undefined
			}
		]);
		expect(p.findings.map((f) => f.level)).toEqual(['warn']);
		expect(p.findings[0].text).toMatch(/p=none only monitors/);
	});

	it('reads size limits and multiple URIs', () => {
		const p = parseDmarc(
			'v=DMARC1; p=reject; rua=mailto:a@example.com!10m, mailto:b@example.com',
			'example.com'
		);
		expect(p.tags[2].uris?.map((u) => [u.address, u.limit])).toEqual([
			['a@example.com', '10m'],
			['b@example.com', undefined]
		]);
		expect(p.findings).toEqual([]);
	});

	it('warns about external report addresses and names the authorisation record', () => {
		const p = parseDmarc(
			'v=DMARC1; p=quarantine; rua=mailto:x@reports.vendor.example',
			'example.com'
		);
		const f = p.findings.find((x) => /outside example.com/.test(x.text));
		expect(f?.text).toContain('example.com._report._dmarc.reports.vendor.example');
		// Same organisational domain is not external
		const q = parseDmarc('v=DMARC1; p=reject; rua=mailto:x@mail.example.com', 'example.com');
		expect(q.findings).toEqual([]);
	});

	it('flags pct below 100 and weaker subdomain policy', () => {
		const p = parseDmarc('v=DMARC1; p=reject; sp=none; pct=25; rua=mailto:a@example.com');
		const texts = p.findings.map((f) => f.text);
		expect(texts.some((t) => /pct=25/.test(t))).toBe(true);
		expect(texts.some((t) => /sp=none\) are weaker/.test(t))).toBe(true);
		expect(texts.some((t) => /pct= is removed in DMARCbis/.test(t))).toBe(true);
		expect(p.effective.pct).toBe(25);
		expect(p.effective.sp).toBe('none');
	});

	it('inherits sp and np', () => {
		expect(parseDmarc('v=DMARC1; p=reject').effective).toMatchObject({
			sp: 'reject',
			np: 'reject'
		});
		expect(parseDmarc('v=DMARC1; p=reject; sp=quarantine').effective.np).toBe('quarantine');
		expect(parseDmarc('v=DMARC1; p=none; np=reject').effective.np).toBe('reject');
	});

	it('handles a missing p', () => {
		const a = parseDmarc('v=DMARC1; rua=mailto:a@example.com');
		expect(a.effective.p).toBe('none');
		expect(a.findings[0].text).toMatch(/treat the record as p=none/);
		const b = parseDmarc('v=DMARC1; adkim=s');
		expect(b.effective.p).toBeNull();
		expect(b.findings[0].text).toMatch(/ignore this record/);
	});

	it('reports bad values and unknown tags', () => {
		const p = parseDmarc(
			'v=DMARC1; p=block; pct=150; adkim=x; fo=2; rf=iodef; ri=abc; foo=bar; rua=mailto:a@example.com'
		);
		const t = p.findings.map((f) => f.text);
		expect(t).toContain('p=: Must be none, quarantine or reject');
		expect(t).toContain('pct=: Must be a whole number from 0 to 100');
		expect(t).toContain('adkim=: Must be r or s');
		expect(t).toContain('fo=: Unknown option 2');
		expect(t).toContain('rf=: afrf (RFC 6591) is the only registered format');
		expect(t).toContain('ri=: Must be a number of seconds');
		expect(t).toContain('Unknown tag foo=, receivers ignore it.');
	});

	it('requires v=DMARC1 first', () => {
		expect(() => parseDmarc('p=none; v=DMARC1')).toThrow(/must start with v=DMARC1/);
		expect(() => parseDmarc('')).toThrow(/Paste a DMARC record/);
		expect(parseDmarc('v=DMARC2; p=none').findings[0].text).toBe('v=: Must be exactly DMARC1');
	});

	it('accepts quoted TXT strings and explains DMARCbis tags', () => {
		const p = parseDmarc('"v=DMARC1; p=reject; " "t=y; psd=n"');
		expect(p.map).toMatchObject({ t: 'y', psd: 'n' });
		expect(p.tags.find((x) => x.tag === 't')?.info?.source).toBe('DMARCbis');
		expect(p.tags.find((x) => x.tag === 't')?.explain).toMatch(/Testing mode/);
	});

	it('notes fo without ruf and duplicate tags', () => {
		const p = parseDmarc('v=DMARC1; p=reject; p=none; fo=1; rua=mailto:a@example.com');
		const t = p.findings.map((f) => f.text);
		expect(t.some((x) => /p= appears twice/.test(x))).toBe(true);
		expect(t).toContain('fo= has no effect without ruf=.');
		expect(p.effective.p).toBe('reject');
	});
});

describe('builder', () => {
	it('omits defaults', () => {
		expect(buildDmarc(defaultFields)).toBe('v=DMARC1; p=none');
	});

	it('builds a full record', () => {
		expect(
			buildDmarc({
				p: 'quarantine',
				sp: 'reject',
				np: 'reject',
				pct: '50',
				rua: 'dmarc@example.com, mailto:x@vendor.example',
				ruf: 'forensic@example.com',
				adkim: 's',
				aspf: 's',
				fo: ['1', 'd'],
				ri: '3600'
			})
		).toBe(
			'v=DMARC1; p=quarantine; sp=reject; np=reject; pct=50; rua=mailto:dmarc@example.com,mailto:x@vendor.example; ruf=mailto:forensic@example.com; adkim=s; aspf=s; fo=1:d; ri=3600'
		);
	});

	it('rejects bad numbers', () => {
		expect(() => buildDmarc({ ...defaultFields, pct: '101' })).toThrow(/pct/);
		expect(() => buildDmarc({ ...defaultFields, ri: '1h' })).toThrow(/ri/);
	});

	it('round-trips through the parser', () => {
		const rec = 'v=DMARC1; p=reject; sp=quarantine; rua=mailto:a@example.com; adkim=s; fo=1';
		expect(buildDmarc(fieldsFrom(parseDmarc(rec)))).toBe(rec);
	});

	it('makes names and URIs', () => {
		expect(dmarcName('example.com.')).toBe('_dmarc.example.com');
		expect(dmarcName('_dmarc.example.com')).toBe('_dmarc.example.com');
		expect(dmarcName('')).toBe('_dmarc.<domain>');
		expect(toUris('a@x.example\nb@y.example')).toBe('mailto:a@x.example,mailto:b@y.example');
		expect(externalAuthName('example.com', 'vendor.example')).toBe(
			'example.com._report._dmarc.vendor.example'
		);
	});
});

describe('organisational domain heuristic', () => {
	it('handles common cases', () => {
		expect(orgDomain('mail.example.com')).toBe('example.com');
		expect(orgDomain('a.b.example.co.uk')).toBe('example.co.uk');
		expect(orgDomain('example.com')).toBe('example.com');
		expect(relaxedAligned('bounce.example.com', 'example.com')).toBe(true);
		expect(relaxedAligned('example.net', 'example.com')).toBe(false);
	});
});

describe('detect', () => {
	it('only claims DMARC records', () => {
		expect(looksLikeDmarc('v=DMARC1; p=none')).toBeGreaterThan(0.9);
		expect(looksLikeDmarc('v=spf1 -all')).toBe(0);
	});
});
