import { describe, expect, it } from 'vitest';
import { bytesToGuid, info, looksLikeGuid, parseGuid, swapEndian, v4, v7 } from './logic';

// Example GUID from the Wikipedia "Universally unique identifier" article (Microsoft encoding)
const GUID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const AD_HEX = 'e004253f894fd3119a0c0305e82c3301';
const AD_B64 = '4AQlP4lP0xGaDAMF6CwzAQ==';

const asGuid = (raw: string, plain?: 'ad' | 'rfc') => bytesToGuid(parseGuid(raw, plain).rfc);

describe('objectGUID byte order', () => {
	it('converts string to AD hex, Base64 and LDAP filter', () => {
		const i = info(parseGuid(GUID).rfc);
		expect(i.adHex).toBe(AD_HEX);
		expect(i.base64).toBe(AD_B64);
		expect(i.ldapFilter).toBe(
			'(objectGUID=\\e0\\04\\25\\3f\\89\\4f\\d3\\11\\9a\\0c\\03\\05\\e8\\2c\\33\\01)'
		);
		expect(i.upperBraced).toBe('{3F2504E0-4F89-11D3-9A0C-0305E82C3301}');
		expect(i.bindDn).toBe(`<GUID=${GUID}>`);
	});

	it('reads every input form back', () => {
		for (const v of [
			GUID,
			'{3F2504E0-4F89-11D3-9A0C-0305E82C3301}',
			'urn:uuid:' + GUID,
			AD_HEX,
			AD_HEX.toUpperCase(),
			AD_HEX.match(/../g)!.join(' '),
			'\\' + AD_HEX.match(/../g)!.join('\\'),
			AD_B64,
			'objectGUID:: ' + AD_B64
		]) {
			expect(asGuid(v)).toBe(GUID);
		}
		expect(parseGuid(AD_B64).from).toBe('base64');
		expect(asGuid('3f2504e04f8911d39a0c0305e82c3301', 'rfc')).toBe(GUID);
	});

	it('swapping twice is a no-op', () => {
		const b = parseGuid(GUID).rfc;
		expect(swapEndian(swapEndian(b))).toEqual(b);
	});

	it('rejects bad input', () => {
		expect(() => parseGuid('')).toThrow(/Enter a GUID/);
		expect(() => parseGuid('3f2504e0-4f8911d3-9a0c-0305e82c3301')).toThrow(/8-4-4-4-12/);
		expect(() => parseGuid('AQUAAAAAAAUVAAAAoGXPfnhLm1/nfIdwCRwBAA==')).toThrow(/16 bytes/);
		expect(() => parseGuid('not a guid!')).toThrow();
	});
});

describe('UUID versions (RFC 9562)', () => {
	it('names version and variant', () => {
		const a = info(parseGuid('919108f7-52d1-4320-9bac-f847db4148a8').rfc);
		expect(a.version).toBe(4);
		expect(a.variant).toMatch(/RFC 9562/);
		expect(a.time).toBeUndefined();
		expect(info(parseGuid(GUID).rfc).version).toBe(1);
	});

	it('reads timestamps of v1 and v7 (RFC 9562 appendix A)', () => {
		expect(info(parseGuid('C232AB00-9414-11EC-B3C8-9F6BDECED846').rfc).time).toBe(
			'2022-02-22T19:22:22Z'
		);
		expect(info(parseGuid('017F22E2-79B0-7CC3-98C4-DC0C0C07398F').rfc).time).toBe(
			'2022-02-22T19:22:22Z'
		);
	});

	it('knows nil, max and the Microsoft variant', () => {
		expect(info(new Uint8Array(16)).special).toBe('Nil UUID');
		expect(info(new Uint8Array(16).fill(0xff)).special).toMatch(/Max/);
		expect(info(parseGuid('00000000-0000-0000-c000-000000000046').rfc).variant).toMatch(
			/Microsoft/
		);
	});

	it('generates v4 and v7 with the right bits', () => {
		const zero = (n: number) => new Uint8Array(n);
		const ones = (n: number) => new Uint8Array(n).fill(0xff);
		expect(v4(zero)).toBe('00000000-0000-4000-8000-000000000000');
		expect(v4(ones)).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
		expect(v7(1645557742000, zero)).toBe('017f22e2-79b0-7000-8000-000000000000');
		const real = v4();
		expect(real).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
		expect(info(parseGuid(v7()).rfc).version).toBe(7);
	});

	it('detects GUIDs', () => {
		expect(looksLikeGuid(GUID)).toBe(0.8);
		expect(looksLikeGuid('objectGUID:: ' + AD_B64)).toBe(0.95);
		expect(looksLikeGuid('S-1-5-18')).toBe(0);
	});
});
