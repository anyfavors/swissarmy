import { describe, expect, it } from 'vitest';
import { decode, encode, looksLikeUrlEncoded, parseUrl } from './logic';

describe('url-encoding: encode', () => {
	it('component mode matches encodeURIComponent', () => {
		expect(encode('a b&c=d/é')).toBe('a%20b%26c%3Dd%2F%C3%A9');
		expect(encode("!'()*~-_.")).toBe("!'()*~-_.");
	});

	it('uri mode keeps reserved characters', () => {
		expect(encode('https://x.dk/a b?q=æ&r=1#top', 'uri')).toBe(
			'https://x.dk/a%20b?q=%C3%A6&r=1#top'
		);
	});

	it('form mode follows application/x-www-form-urlencoded', () => {
		expect(encode('a b+c', 'form')).toBe('a+b%2Bc');
		expect(encode("!'()~*-._", 'form')).toBe('%21%27%28%29%7E*-._');
		expect(encode('🍓', 'form')).toBe('%F0%9F%8D%93');
	});

	it('rejects lone surrogates', () => {
		expect(() => encode('a\uD800b')).toThrow(/Lone surrogate at position 2/);
	});
});

describe('url-encoding: decode', () => {
	it('decodes UTF-8 sequences', () => {
		expect(decode('R%C3%B8dgr%C3%B8d%20%F0%9F%8D%93')).toBe('Rødgrød 🍓');
		expect(decode('%c3%a6')).toBe('æ');
	});

	it('reads + as space only in form mode', () => {
		expect(decode('a+b', 'form')).toBe('a b');
		expect(decode('a+b', 'component')).toBe('a+b');
		expect(decode('a%2Bb', 'form')).toBe('a+b');
	});

	it('keeps reserved escapes in uri mode like decodeURI', () => {
		expect(decode('/a%2Fb%20c%3F', 'uri')).toBe(decodeURI('/a%2Fb%20c%3F'));
		expect(decode('/a%2fb', 'uri')).toBe('/a%2fb');
	});

	it('reports malformed sequences with position', () => {
		expect(() => decode('abc%zz')).toThrow(/Malformed % sequence "%zz" at position 4/);
		expect(() => decode('100%')).toThrow(/at position 4/);
		expect(() => decode('%4')).toThrow(/at position 1/);
	});

	it('reports invalid UTF-8 with position', () => {
		expect(() => decode('ok%C3%28')).toThrow(/%C3%28 at position 3 are not valid UTF-8/);
		expect(() => decode('%FF')).toThrow(/not valid UTF-8/);
	});

	it('round-trips every mode', () => {
		const s = 'Søren & Co / 50% off? a+b=c #1 🍓';
		for (const m of ['component', 'uri', 'form'] as const) expect(decode(encode(s, m), m)).toBe(s);
	});
});

describe('url-encoding: parseUrl', () => {
	it('splits a URL and decodes each query parameter', () => {
		const p = parseUrl(
			'https://user@example.com:8443/a%20b/c?q=r%C3%B8d+gr%C3%B8d&x=1&x=2#sec%201'
		);
		expect(p).not.toBeNull();
		const get = (l: string) => p!.parts.find((x) => x.label === l)?.value;
		expect(get('Protocol')).toBe('https');
		expect(get('Host')).toBe('example.com');
		expect(get('Port')).toBe('8443');
		expect(get('Path')).toBe('/a b/c');
		expect(get('Fragment')).toBe('sec 1');
		expect(get('User')).toBe('user');
		expect(p!.params).toEqual([
			['q', 'rød grød'],
			['x', '1'],
			['x', '2']
		]);
	});

	it('shows default ports', () => {
		const p = parseUrl('http://example.com/');
		expect(p!.parts.find((x) => x.label === 'Port')?.value).toBe('80 (default)');
	});

	it('ignores non-URLs', () => {
		expect(parseUrl('hello world')).toBeNull();
		expect(parseUrl('a%20b')).toBeNull();
	});
});

describe('url-encoding: detect', () => {
	it('scores percent-encoded text and URLs with queries moderately', () => {
		expect(looksLikeUrlEncoded('caf%C3%A9%20au%20lait')).toBeGreaterThan(0.5);
		expect(looksLikeUrlEncoded('https://x.dk/search?q=a')).toBeGreaterThan(0.5);
		expect(looksLikeUrlEncoded('https://x.dk/')).toBe(0);
		expect(looksLikeUrlEncoded('hello')).toBe(0);
		expect(looksLikeUrlEncoded('{"a":"%20"}')).toBe(0);
		expect(looksLikeUrlEncoded('caf%C3%A9')).toBeLessThan(0.7);
	});
});
