import { describe, expect, it } from 'vitest';
import {
	binPattern,
	exactValue,
	fields,
	hexFloat,
	hexPattern,
	nextDown,
	nextUp,
	parseInput,
	shortest,
	toNumber,
	ulpExponent,
	type Format
} from './logic';
import { ops } from './ops';

const bits = (s: string, f: Format) => parseInput(s, f).bits;
const hex = (s: string, f: Format) => hexPattern(bits(s, f), f);

/** float64 pattern of a JS number, the reference for correctly rounded parsing. */
function ref64(x: number): bigint {
	const dv = new DataView(new ArrayBuffer(8));
	dv.setFloat64(0, x);
	return dv.getBigUint64(0);
}

describe('decimal to bits', () => {
	it('float64 known values', () => {
		expect(hex('0.1', 'f64')).toBe('0x3FB999999999999A');
		expect(hex('1', 'f64')).toBe('0x3FF0000000000000');
		expect(hex('-2', 'f64')).toBe('0xC000000000000000');
		expect(hex('0', 'f64')).toBe('0x0000000000000000');
		expect(hex('-0', 'f64')).toBe('0x8000000000000000');
		expect(hex('1.7976931348623157e308', 'f64')).toBe('0x7FEFFFFFFFFFFFFF');
		expect(hex('2.2250738585072014e-308', 'f64')).toBe('0x0010000000000000');
		expect(hex('5e-324', 'f64')).toBe('0x0000000000000001');
		expect(hex('2e-324', 'f64')).toBe('0x0000000000000000');
		expect(hex('1e309', 'f64')).toBe('0x7FF0000000000000');
		expect(hex('-Infinity', 'f64')).toBe('0xFFF0000000000000');
		expect(hex('NaN', 'f64')).toBe('0x7FF8000000000000');
		expect(hex('1e-1000', 'f64')).toBe('0x0000000000000000');
		expect(hex('3,5', 'f64')).toBe(hex('3.5', 'f64'));
	});

	it('float32 known values', () => {
		expect(hex('0.1', 'f32')).toBe('0x3DCCCCCD');
		expect(hex('1', 'f32')).toBe('0x3F800000');
		expect(hex('3.4028234663852886e38', 'f32')).toBe('0x7F7FFFFF');
		expect(hex('3.4028236e38', 'f32')).toBe('0x7F800000');
		expect(hex('1.401298464324817e-45', 'f32')).toBe('0x00000001');
		expect(hex('1.1754943508222875e-38', 'f32')).toBe('0x00800000');
		expect(hex('16777217', 'f32')).toBe('0x4B800000'); // tie, rounds to even 16777216
		expect(hex('16777219', 'f32')).toBe('0x4B800002'); // tie, rounds to even 16777220
		expect(hex('NaN', 'f32')).toBe('0x7FC00000');
	});

	it('matches JavaScript parsing for float64', () => {
		let seed = 12345;
		const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
		for (let i = 0; i < 2000; i++) {
			const digits = String(Math.floor(rnd() * 1e17)).slice(0, 1 + Math.floor(rnd() * 17));
			const e = Math.floor(rnd() * 640) - 330;
			const s = `${digits}e${e}`;
			expect(bits(s, 'f64')).toBe(ref64(Number(s)));
		}
	});

	it('rounds float32 once, not via a double', () => {
		// 1 + 2^-24 + 2^-60: a double rounds this to the float32 halfway point 1 + 2^-24,
		// and fround then ties to even (1). Correct rounding goes up to 1 + 2^-23.
		const num = (1n << 60n) + (1n << 36n) + 1n;
		const k = 60n;
		const s = (num * 5n ** k).toString();
		const dec = `${s.slice(0, s.length - 60)}.${s.slice(s.length - 60)}`;
		expect(Math.fround(Number(dec))).toBe(1);
		expect(hex(dec, 'f32')).toBe('0x3F800001');
	});

	it('flags inexact input', () => {
		expect(parseInput('0.1', 'f64').inexact).toBe(true);
		expect(parseInput('0.5', 'f64').inexact).toBe(false);
		expect(parseInput('16777217', 'f32').inexact).toBe(true);
	});
});

describe('patterns and hex floats as input', () => {
	it('reads raw patterns of the right length', () => {
		expect(parseInput('0x3FB999999999999A', 'f64')).toEqual({
			bits: 0x3fb999999999999an,
			as: 'bits',
			inexact: false
		});
		expect(bits('0x3dcc_cccd', 'f32')).toBe(0x3dcccccdn);
		expect(bits('0b' + '0'.repeat(31) + '1', 'f32')).toBe(1n);
		expect(() => parseInput('0xFF', 'f64')).toThrow(/16 hex digits, got 2/);
		expect(() => parseInput('-0x3F800000', 'f32')).toThrow(/no sign/);
		expect(() => parseInput('abc', 'f64')).toThrow(/not a number/);
		expect(() => parseInput('', 'f64')).toThrow(/Enter/);
	});

	it('reads C hex floats', () => {
		expect(hex('0x1.8p1', 'f64')).toBe(hex('3', 'f64'));
		expect(hex('0x1.999999999999ap-4', 'f64')).toBe('0x3FB999999999999A');
		expect(hex('-0x1p-1074', 'f64')).toBe('0x8000000000000001');
		expect(parseInput('0x1p0', 'f32').as).toBe('hex float');
	});
});

describe('fields and special values', () => {
	it('splits sign, exponent and fraction', () => {
		expect(fields(0x3fb999999999999an, 'f64')).toMatchObject({
			sign: 0,
			exponent: 1019,
			unbiased: -4,
			fraction: 0x999999999999an,
			kind: 'normal'
		});
		expect(fields(0x80000000n, 'f32')).toMatchObject({ sign: 1, kind: 'zero' });
		expect(fields(1n, 'f64')).toMatchObject({ kind: 'subnormal', unbiased: -1022 });
		expect(fields(0x7f800000n, 'f32').kind).toBe('infinity');
	});

	it('reads NaN payloads and the quiet bit', () => {
		expect(fields(0x7ff8000000000000n, 'f64')).toMatchObject({
			kind: 'nan',
			quiet: true,
			payload: 0n
		});
		expect(fields(0x7ff0000000000001n, 'f64')).toMatchObject({
			kind: 'nan',
			quiet: false,
			payload: 1n
		});
		expect(fields(0xffc00123n, 'f32')).toMatchObject({
			kind: 'nan',
			quiet: true,
			payload: 0x123n,
			sign: 1
		});
	});
});

describe('exact decimal value', () => {
	it('prints every digit', () => {
		expect(exactValue(bits('0.1', 'f64'), 'f64')).toBe(
			'0.1000000000000000055511151231257827021181583404541015625'
		);
		expect(exactValue(bits('0.1', 'f32'), 'f32')).toBe('0.100000001490116119384765625');
		expect(exactValue(bits('1e23', 'f64'), 'f64')).toBe('99999999999999991611392');
		expect(exactValue(0x8000000000000000n, 'f64')).toBe('-0');
		expect(exactValue(0x7ff0000000000000n, 'f64')).toBe('Infinity');
		expect(exactValue(0x7ff8000000000000n, 'f64')).toBe('NaN');
		const tiny = exactValue(1n, 'f64');
		expect(tiny.startsWith('0.000000000000')).toBe(true);
		expect(tiny.endsWith('65625')).toBe(true);
		expect(tiny.length).toBe(2 + 1074); // 0. then 1074 decimals
		expect(exactValue(0x7fefffffffffffffn, 'f64')).toBe(BigInt(Number.MAX_VALUE).toString());
	});
});

describe('neighbours and ULP', () => {
	it('steps to the next representable value', () => {
		expect(nextUp(0x3ff0000000000000n, 'f64')).toBe(0x3ff0000000000001n);
		expect(nextDown(0x3ff0000000000000n, 'f64')).toBe(0x3fefffffffffffffn);
		expect(nextUp(0n, 'f64')).toBe(1n);
		expect(nextUp(0x8000000000000000n, 'f64')).toBe(1n);
		expect(nextDown(0n, 'f64')).toBe(0x8000000000000001n);
		expect(nextUp(0x8000000000000001n, 'f64')).toBe(0x8000000000000000n);
		expect(nextUp(0x7fefffffffffffffn, 'f64')).toBe(0x7ff0000000000000n);
		expect(nextUp(0x7ff0000000000000n, 'f64')).toBe(0x7ff0000000000000n);
		expect(nextUp(0xfff0000000000000n, 'f64')).toBe(0xffefffffffffffffn);
		expect(nextUp(0x7ff8000000000000n, 'f64')).toBe(null);
		expect(nextUp(0x3f800000n, 'f32')).toBe(0x3f800001n);
		// Agrees with JS arithmetic.
		expect(toNumber(nextUp(ref64(1), 'f64')!, 'f64')).toBe(1 + Number.EPSILON);
	});

	it('gives the ULP as a power of two', () => {
		expect(ulpExponent(ref64(1), 'f64')).toBe(-52); // Number.EPSILON
		expect(ulpExponent(0x3f800000n, 'f32')).toBe(-23);
		expect(ulpExponent(1n, 'f64')).toBe(-1074);
		expect(ulpExponent(0n, 'f64')).toBe(-1074);
		expect(ulpExponent(0x7fefffffffffffffn, 'f64')).toBe(971);
		expect(ulpExponent(0x7ff0000000000000n, 'f64')).toBe(null);
	});
});

describe('formatting', () => {
	it('hex float notation', () => {
		expect(hexFloat(0x3fb999999999999an, 'f64')).toBe('0x1.999999999999ap-4');
		expect(hexFloat(0x3f800000n, 'f32')).toBe('0x1p+0');
		expect(hexFloat(0x3dcccccdn, 'f32')).toBe('0x1.99999ap-4');
		expect(hexFloat(1n, 'f64')).toBe('0x0.0000000000001p-1022');
		expect(hexFloat(0x80000000n, 'f32')).toBe('-0x0p+0');
	});

	it('shortest round-trip decimal', () => {
		expect(shortest(0x3dcccccdn, 'f32')).toBe('0.1');
		expect(shortest(0x3fb999999999999an, 'f64')).toBe('0.1');
		expect(shortest(0x7f7fffffn, 'f32')).toBe('3.4028235e+38');
		expect(shortest(1n, 'f32')).toBe('1e-45');
		expect(shortest(0x80000000n, 'f32')).toBe('-0');
		expect(binPattern(1n, 'f32')).toBe('0'.repeat(31) + '1');
	});
});

describe('ops', () => {
	const run = (id: string, s: string) => ops.find((o) => o.id === id)!.run(s);
	it('converts', () => {
		expect(run('float.to-bits64', '0.1')).toBe('0x3FB999999999999A');
		expect(run('float.to-bits32', '0.1')).toBe('0x3DCCCCCD');
		expect(run('float.from-bits64', '0x3FB999999999999A')).toBe('0.1');
		expect(run('float.exact64', '0.5')).toBe('0.5');
		expect(() => run('float.from-bits64', '0.1')).toThrow(/16 hex digits/);
	});
});
