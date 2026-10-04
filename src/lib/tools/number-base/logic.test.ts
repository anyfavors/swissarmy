import { describe, expect, it } from 'vitest';
import {
	fittingWidth,
	group,
	looksLikeBaseLiteral,
	parseAuto,
	parseInBase,
	toBase,
	twosComplement
} from './logic';

describe('number-base: parsing', () => {
	it('reads each base', () => {
		expect(parseInBase('ff', 16)).toBe(255n);
		expect(parseInBase('FF', 16)).toBe(255n);
		expect(parseInBase('777', 8)).toBe(511n);
		expect(parseInBase('1010', 2)).toBe(10n);
		expect(parseInBase('zz', 36)).toBe(1295n);
		expect(parseInBase('-42', 10)).toBe(-42n);
	});

	it('accepts prefixes and separators', () => {
		expect(parseInBase('0xDEAD_BEEF', 16)).toBe(0xdeadbeefn);
		expect(parseInBase('0b1111 0000', 2)).toBe(240n);
		expect(parseInBase('0o17', 8)).toBe(15n);
		expect(parseInBase('1_000_000', 10)).toBe(1000000n);
		expect(parseInBase('-0x10', 16)).toBe(-16n);
	});

	it('auto-detects the base from the prefix', () => {
		expect(parseAuto('0xff')).toBe(255n);
		expect(parseAuto('0B101')).toBe(5n);
		expect(parseAuto('0o10')).toBe(8n);
		expect(parseAuto('99')).toBe(99n);
	});

	it('handles numbers beyond 2^53 and 2^64 exactly', () => {
		expect(parseInBase('18446744073709551615', 10)).toBe(0xffffffffffffffffn);
		const big = '123456789012345678901234567890123456789';
		expect(toBase(parseInBase(big, 10), 10)).toBe(big);
		expect(toBase(parseInBase(big, 10), 36)).toBe(toBase(BigInt(big), 36));
	});

	it('explains bad input', () => {
		expect(() => parseInBase('12', 2)).toThrow(/"2" is not a valid binary digit/);
		expect(() => parseInBase('0x1', 10)).toThrow(/means base 16, not base 10/);
		expect(() => parseInBase('0x', 16)).toThrow(/No digits/);
		expect(() => parseInBase('', 10)).toThrow(/Enter a number/);
		expect(() => parseInBase('g', 16)).toThrow(/not a valid hex digit/);
		expect(() => parseInBase('1', 37)).toThrow(/2 to 36/);
	});
});

describe('number-base: two’s complement', () => {
	it('encodes negative numbers', () => {
		const t = twosComplement(-1n, 8);
		expect(t.hex).toBe('ff');
		expect(t.bin).toBe('11111111');
		expect(twosComplement(-128n, 8).hex).toBe('80');
		expect(twosComplement(-2n, 16).hex).toBe('fffe');
		expect(twosComplement(-1n, 64).hex).toBe('ffffffffffffffff');
		expect(twosComplement(-2147483648n, 32).hex).toBe('80000000');
	});

	it('gives the signed reading of a positive pattern', () => {
		const t = twosComplement(200n, 8);
		expect(t.signed).toBe(-56n);
		expect(t.unsigned).toBe(200n);
		expect(twosComplement(0xffffffffn, 32).signed).toBe(-1n);
		expect(twosComplement(127n, 8).signed).toBe(127n);
	});

	it('rejects values outside the width', () => {
		expect(() => twosComplement(256n, 8)).toThrow(/Does not fit in 8 bits \(range -128 to 255\)/);
		expect(() => twosComplement(-129n, 8)).toThrow(/8 bits/);
	});

	it('picks the smallest fitting width', () => {
		expect(fittingWidth(255n)).toBe(8);
		expect(fittingWidth(-129n)).toBe(16);
		expect(fittingWidth(1n << 64n)).toBeNull();
	});
});

describe('number-base: grouping and detect', () => {
	it('groups from the right', () => {
		expect(group('101101')).toBe('0010 1101');
		expect(group('deadbeef', 4)).toBe('dead beef');
		expect(group('-111')).toBe('-0111');
	});

	it('detects literals', () => {
		expect(looksLikeBaseLiteral('0xdeadbeef')).toBe(0.9);
		expect(looksLikeBaseLiteral('0b1010_1010')).toBe(0.9);
		expect(looksLikeBaseLiteral('0o755')).toBe(0.8);
		expect(looksLikeBaseLiteral('1700000000')).toBe(0);
		expect(looksLikeBaseLiteral('0xg')).toBe(0);
	});
});
