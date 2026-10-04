import { describe, expect, it } from 'vitest';
import { base64ToBytes, decodeText, encodeText, looksLikeBase64 } from './logic';

// RFC 4648 section 10 test vectors
const rfc: [string, string][] = [
	['', ''],
	['f', 'Zg=='],
	['fo', 'Zm8='],
	['foo', 'Zm9v'],
	['foob', 'Zm9vYg=='],
	['fooba', 'Zm9vYmE='],
	['foobar', 'Zm9vYmFy']
];

describe('base64', () => {
	it.each(rfc)('encodes %j as %j', (plain, b64) => {
		expect(encodeText(plain)).toBe(b64);
		expect(decodeText(b64).text).toBe(plain);
	});

	it('handles UTF-8 (æøå and emoji)', () => {
		expect(encodeText('æøå')).toBe('w6bDuMOl');
		expect(decodeText(encodeText('Rødgrød 🍓')).text).toBe('Rødgrød 🍓');
	});

	it('produces and accepts URL-safe output without padding', () => {
		const bytes = new Uint8Array([0xfb, 0xff, 0xbf]);
		const std = '+/+/';
		expect(base64ToBytes(std)).toEqual(bytes);
		expect(encodeText('û', 'url', false)).toBe('w7s');
		expect(base64ToBytes('-_-_')).toEqual(bytes);
		expect(decodeText('Zg').text).toBe('f');
	});

	it('ignores line breaks', () => {
		expect(decodeText('Zm9v\nYmFy').text).toBe('foobar');
	});

	it('flags binary data as non-UTF-8', () => {
		expect(decodeText('/w==').utf8).toBe(false);
	});

	it('rejects invalid input with a reason', () => {
		expect(() => base64ToBytes('ab$c')).toThrow(/Invalid character "\$"/);
		expect(() => base64ToBytes('abcde')).toThrow(/Length/);
		expect(() => base64ToBytes('ab=c')).toThrow(/Padding/);
	});

	it('detects likely Base64', () => {
		expect(looksLikeBase64('SGVsbG8gd29ybGQ=')).toBeGreaterThan(0.7);
		expect(looksLikeBase64('hello')).toBe(0);
		expect(looksLikeBase64('1700000000')).toBeLessThan(0.1);
	});
});
