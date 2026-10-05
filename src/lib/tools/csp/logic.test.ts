import { describe, expect, it } from 'vitest';
import {
	analyse,
	build,
	defaultRows,
	describeSource,
	effective,
	examples,
	extractPolicy,
	looksLikeCsp,
	parsePolicy
} from './logic';

const find = (policy: string) => analyse(parsePolicy(policy));
const texts = (policy: string) =>
	find(policy)
		.map((f) => `${f.level}: ${f.text}`)
		.join('\n');

describe('parsing', () => {
	it('reads a header line', () => {
		const p = parsePolicy("Content-Security-Policy: default-src 'self'; img-src * data:");
		expect(p.directives.map((d) => d.name)).toEqual(['default-src', 'img-src']);
		expect(p.map.get('img-src')).toEqual(['*', 'data:']);
		expect(p.fromMeta).toBe(false);
	});

	it('reads a meta tag and decodes entities', () => {
		const e = extractPolicy(
			'<meta http-equiv="Content-Security-Policy" content="script-src &#39;self&#39;; object-src &apos;none&apos;">'
		);
		expect(e).toEqual({
			text: "script-src 'self'; object-src 'none'",
			fromMeta: true,
			reportOnly: false
		});
	});

	it('detects Report-Only', () => {
		expect(parsePolicy("Content-Security-Policy-Report-Only: default-src 'self'").reportOnly).toBe(
			true
		);
		expect(texts("Content-Security-Policy-Report-Only: default-src 'self'")).toMatch(
			/nothing is blocked/
		);
	});

	it('keeps the first of duplicate directives (CSP3 §2.2.1)', () => {
		const p = parsePolicy("script-src 'self'; script-src *");
		expect(p.map.get('script-src')).toEqual(["'self'"]);
		expect(p.directives[1].duplicate).toBe(true);
		expect(texts("script-src 'self'; script-src *")).toMatch(/appears twice/);
	});

	it('lower-cases directive names and ignores empty chunks', () => {
		const p = parsePolicy("DEFAULT-SRC 'self';; ");
		expect([...p.map.keys()]).toEqual(['default-src']);
	});

	it('rejects an empty policy', () => {
		expect(() => parsePolicy(' ; ')).toThrow(/No directives/);
	});

	it('follows fallback chains', () => {
		const p = parsePolicy("default-src 'self'; child-src blob:");
		expect(effective(p, 'script-src-elem')?.from).toBe('default-src');
		expect(effective(p, 'worker-src')?.from).toBe('child-src');
		expect(effective(p, 'frame-src')?.from).toBe('child-src');
		expect(effective(parsePolicy("img-src 'self'"), 'base-uri')).toBeNull();
	});
});

describe('sources', () => {
	it('describes keywords, nonces, hashes, schemes and hosts', () => {
		expect(describeSource("'self'")).toMatch(/Same origin/);
		expect(describeSource("'nonce-abc123'")).toMatch(/Nonce/);
		expect(describeSource("'sha256-B2yPHKaXnvFWtRChIbabYmUBFZdVfKKXHbWtWidDVF8='")).toMatch(/Hash/);
		expect(describeSource('data:')).toMatch(/data: URLs/);
		expect(describeSource('*.example.com')).toBe('Host example.com and all its subdomains.');
		expect(describeSource('https://cdn.example.com/js/')).toBe(
			'Host cdn.example.com, limited to that path.'
		);
		expect(describeSource('self')).toMatch(/without quotes/);
	});
});

describe('risk checks', () => {
	it('flags unsafe-inline without nonce or hash', () => {
		expect(texts("script-src 'self' 'unsafe-inline'")).toMatch(
			/danger: script-src: 'unsafe-inline' without a nonce/
		);
		expect(texts("script-src 'nonce-abc' 'unsafe-inline'")).toMatch(
			/info: .*ignored by modern browsers/
		);
		expect(texts("script-src 'strict-dynamic' 'nonce-a' 'unsafe-inline' https:")).not.toMatch(
			/danger/
		);
	});

	it('flags unsafe-eval, wildcards, data: and http:', () => {
		const t = texts("default-src *; script-src 'self' 'unsafe-eval' data: http: https:");
		expect(t).toMatch(/'unsafe-eval' allows eval/);
		expect(t).toMatch(/data: allows scripts from data: URLs/);
		expect(t).toMatch(/http: allows scripts from any host/);
		expect(t).toMatch(/default-src \* allows almost everything/);
		expect(texts('script-src *')).toMatch(/\* allows scripts from any host/);
		expect(texts('img-src http://example.com')).toMatch(/unencrypted/);
	});

	it('uses default-src for scripts when script-src is missing', () => {
		expect(texts("default-src 'self' 'unsafe-inline'")).toMatch(
			/default-src: 'unsafe-inline' without/
		);
		expect(texts("img-src 'self'")).toMatch(/No script-src and no default-src/);
	});

	it('requires object-src none, base-uri and frame-ancestors', () => {
		const t = texts("default-src 'self'");
		expect(t).toMatch(/object-src is not 'none' \(inherited from default-src\)/);
		expect(t).toMatch(/No base-uri/);
		expect(t).toMatch(/warn: No frame-ancestors/);
		const ok = texts(
			"default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
		);
		expect(ok).toBe('');
	});

	it('knows what a meta tag cannot do', () => {
		const t = texts(
			`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-ancestors 'none'; base-uri 'none'">`
		);
		expect(t).toMatch(/frame-ancestors is ignored in a meta tag/);
	});

	it('catches unquoted keywords and unknown directives', () => {
		expect(texts('script-src self')).toMatch(/needs single quotes/);
		expect(texts("scrpt-src 'self'")).toMatch(/Unknown directive scrpt-src/);
	});

	it('rates this site policy as clean apart from expected notes', () => {
		const meta = find(examples[0].value);
		expect(meta.filter((f) => f.level === 'danger')).toEqual([]);
		const header = find(examples[1].value);
		expect(header.filter((f) => f.level !== 'info')).toEqual([
			expect.objectContaining({ text: expect.stringMatching(/No script-src and no default-src/) })
		]);
	});
});

describe('builder and detection', () => {
	it('builds a header string from rows', () => {
		const s = build(defaultRows());
		expect(s).toBe(
			"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests"
		);
		expect(find(s).filter((f) => f.level !== 'info')).toEqual([]);
		expect(build(defaultRows(), true)).not.toMatch(/frame-ancestors/);
	});

	it('detects policies', () => {
		expect(looksLikeCsp("Content-Security-Policy: default-src 'self'")).toBeGreaterThan(0.9);
		expect(looksLikeCsp("default-src 'self'; script-src 'self'")).toBeGreaterThan(0.8);
		expect(looksLikeCsp('hello world')).toBe(0);
	});
});
