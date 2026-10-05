import { describe, expect, it } from 'vitest';
import {
	bin,
	bytes,
	clearBit,
	clz,
	compute,
	ctz,
	fromPattern,
	hex,
	maskFromBits,
	parseBit,
	parseOperand,
	parseShift,
	popcount,
	rotateLeft,
	rotateRight,
	setBit,
	shiftLeft,
	shiftRightArithmetic,
	shiftRightLogical,
	testBit,
	toggleBit,
	toPattern
} from './logic';

const get = (rs: ReturnType<typeof compute>, id: string) => rs.find((r) => r.id === id)!.pattern;

describe('operands', () => {
	it('parses dec, hex and bin', () => {
		expect(parseOperand('0xF0')).toBe(240n);
		expect(parseOperand('0b1010')).toBe(10n);
		expect(parseOperand('-1')).toBe(-1n);
		expect(() => parseOperand('0xZZ')).toThrow();
	});

	it('maps signed and unsigned onto the same pattern', () => {
		expect(toPattern(-1n, 8)).toBe(0xffn);
		expect(toPattern(255n, 8)).toBe(0xffn);
		expect(toPattern(-128n, 8)).toBe(0x80n);
		expect(() => toPattern(256n, 8)).toThrow(/does not fit in 8 bits/);
		expect(() => toPattern(-129n, 8)).toThrow(/range -128 to 255/);
		expect(toPattern(-1n, 64)).toBe(0xffffffffffffffffn);
		expect(fromPattern(0xffn, 8, true)).toBe(-1n);
		expect(fromPattern(0xffn, 8, false)).toBe(255n);
		expect(fromPattern(0x7fn, 8, true)).toBe(127n);
	});

	it('parses shift counts and bit positions', () => {
		expect(parseShift('3')).toBe(3);
		expect(() => parseShift('-1')).toThrow(/whole number/);
		expect(parseBit('7', 8)).toBe(7);
		expect(() => parseBit('8', 8)).toThrow(/outside 8 bits/);
	});
});

describe('operations', () => {
	it('logic ops at 8 bits', () => {
		const r = compute(0b11001100n, 0b10101010n, 1, 8, false);
		expect(get(r, 'and')).toBe(0b10001000n);
		expect(get(r, 'or')).toBe(0b11101110n);
		expect(get(r, 'xor')).toBe(0b01100110n);
		expect(get(r, 'andnot')).toBe(0b01000100n);
		expect(get(r, 'nota')).toBe(0b00110011n);
		expect(get(r, 'notb')).toBe(0b01010101n);
	});

	it('shifts like C/Java on int32', () => {
		const a = toPattern(-16n, 32);
		expect(fromPattern(shiftRightArithmetic(a, 2, 32), 32, true)).toBe(-4n); // -16 >> 2
		expect(shiftRightLogical(a, 2)).toBe(1073741820n); // -16 >>> 2 in Java
		expect(fromPattern(shiftLeft(1n, 31, 32), 32, true)).toBe(-2147483648n); // 1 << 31
		expect(shiftLeft(1n, 32, 32)).toBe(0n);
		expect(shiftRightArithmetic(a, 40, 32)).toBe(0xffffffffn);
		const r = compute(a, 0n, 2, 32, true);
		expect(get(r, 'shr')).toBe(toPattern(-4n, 32));
		expect(get(r, 'ushr')).toBe(1073741820n);
		expect(get(compute(a, 0n, 2, 32, false), 'shr')).toBe(1073741820n);
	});

	it('rotates', () => {
		expect(rotateLeft(0b10000001n, 1, 8)).toBe(0b00000011n);
		expect(rotateRight(0b10000001n, 1, 8)).toBe(0b11000000n);
		expect(rotateLeft(0x12345678n, 8, 32)).toBe(0x34567812n);
		expect(rotateRight(0x12345678n, 8, 32)).toBe(0x78123456n);
		expect(rotateLeft(0xabn, 8, 8)).toBe(0xabn);
		expect(rotateLeft(0xabn, 0, 8)).toBe(0xabn);
		expect(rotateRight(0x0123456789abcdefn, 4, 64)).toBe(0xf0123456789abcden);
	});

	it('counts bits', () => {
		expect(popcount(0n)).toBe(0);
		expect(popcount(0xffn)).toBe(8);
		expect(popcount(0xffffffffffffffffn)).toBe(64);
		expect(popcount(0b1011n)).toBe(3);
		expect(clz(1n, 32)).toBe(31);
		expect(clz(0n, 16)).toBe(16);
		expect(ctz(8n, 32)).toBe(3);
		expect(ctz(0n, 8)).toBe(8);
	});
});

describe('masks', () => {
	it('builds masks from positions and ranges', () => {
		expect(maskFromBits('0, 3, 7', 8)).toBe(0b10001001n);
		expect(maskFromBits('4-7', 8)).toBe(0xf0n);
		expect(maskFromBits('7-4', 8)).toBe(0xf0n);
		expect(maskFromBits('', 8)).toBe(0n);
		expect(maskFromBits('63', 64)).toBe(1n << 63n);
		expect(() => maskFromBits('8', 8)).toThrow(/outside 8 bits/);
		expect(() => maskFromBits('x', 8)).toThrow(/not a bit position/);
	});

	it('tests, sets, clears and toggles bits', () => {
		expect(testBit(0b100n, 2)).toBe(true);
		expect(testBit(0b100n, 1)).toBe(false);
		expect(setBit(0n, 5)).toBe(32n);
		expect(clearBit(0xffn, 0)).toBe(0xfen);
		expect(toggleBit(0b1010n, 1)).toBe(0b1000n);
	});
});

describe('formatting', () => {
	it('pads to the width', () => {
		expect(hex(0xan, 16)).toBe('0x000a');
		expect(bin(0xan, 8)).toBe('0000 1010');
		expect(bytes(0x1ffn, 16)).toEqual(['00000001', '11111111']);
	});
});
