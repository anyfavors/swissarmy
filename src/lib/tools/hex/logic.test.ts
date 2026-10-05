import { describe, expect, it } from 'vitest';
import {
	bytesToText,
	formatBinary,
	formatDecimal,
	formatHex,
	hexdump,
	looksLikeHexBytes,
	parseBinary,
	parseDecimal,
	parseHex,
	parseInput,
	swapEndian,
	utf8
} from './logic';
import { ops } from './ops';

const hello = utf8('Hello');

describe('hex formatting', () => {
	it('formats every style', () => {
		expect(formatHex(hello, 'plain')).toBe('48656c6c6f');
		expect(formatHex(hello, 'spaced')).toBe('48 65 6c 6c 6f');
		expect(formatHex(hello, 'prefixed', true)).toBe('0x48 0x65 0x6C 0x6C 0x6F');
		expect(formatHex(hello, 'c')).toBe('{ 0x48, 0x65, 0x6c, 0x6c, 0x6f }');
		expect(formatHex(hello, 'escaped')).toBe('\\x48\\x65\\x6c\\x6c\\x6f');
		expect(formatHex(new Uint8Array(), 'c')).toBe('{ }');
	});

	it('encodes UTF-8 multi-byte characters', () => {
		expect(formatHex(utf8('æ€'), 'spaced')).toBe('c3 a6 e2 82 ac');
		expect(formatHex(utf8('😀'), 'plain')).toBe('f09f9880');
	});
});

describe('hex parsing', () => {
	it.each([
		'48656c6c6f',
		'48 65 6C 6c 6F',
		'0x48 0x65 0x6c 0x6c 0x6f',
		'{0x48,0x65,0x6c,0x6c,0x6f}',
		'unsigned char s[] = { 0x48, 0x65, 0x6c, 0x6c, 0x6f };',
		'\\x48\\x65\\x6c\\x6c\\x6f',
		'48:65:6c:6c:6f',
		'0x48656c6c6f',
		'48656c\n6c6f'
	])('reads %j', (s) => {
		expect(parseHex(s)).toEqual(hello);
	});

	it('pads short prefixed values', () => {
		expect(parseHex('{0x5, 0xa}')).toEqual(new Uint8Array([5, 10]));
		expect(parseHex('\\x5\\x41')).toEqual(new Uint8Array([5, 0x41]));
	});

	it('rejects bad input with a reason', () => {
		expect(() => parseHex('48 6g')).toThrow('Invalid hex character "g"');
		expect(() => parseHex('486')).toThrow(/odd number/);
		expect(() => parseHex('0x')).toThrow(/Empty/);
	});

	it('returns no bytes for empty input', () => {
		expect(parseHex('  ')).toEqual(new Uint8Array());
	});
});

describe('binary and decimal', () => {
	it('round trips binary', () => {
		expect(formatBinary(utf8('Hi'))).toBe('01001000 01101001');
		expect(parseBinary('01001000 01101001')).toEqual(utf8('Hi'));
		expect(parseBinary('0100100001101001')).toEqual(utf8('Hi'));
		expect(parseBinary('1001000 1101001')).toEqual(utf8('Hi'));
		expect(parseBinary('0b1 0b10')).toEqual(new Uint8Array([1, 2]));
	});

	it('rejects bad binary', () => {
		expect(() => parseBinary('0102')).toThrow('Invalid binary character "2"');
		expect(() => parseBinary('010010001')).toThrow(/multiple of 8/);
	});

	it('round trips decimal', () => {
		expect(formatDecimal(utf8('Hi'))).toBe('72 105');
		expect(parseDecimal('72, 105')).toEqual(utf8('Hi'));
		expect(parseDecimal('[72, 105]')).toEqual(utf8('Hi'));
		expect(() => parseDecimal('72 256')).toThrow(/larger than a byte/);
		expect(() => parseDecimal('7x')).toThrow(/not a decimal byte/);
	});

	it('parses by input kind', () => {
		expect(parseInput('Hi', 'text')).toEqual(utf8('Hi'));
		expect(parseInput('48 69', 'hex')).toEqual(utf8('Hi'));
	});
});

describe('text decoding', () => {
	it('flags invalid UTF-8', () => {
		expect(bytesToText(utf8('æ'))).toEqual({ text: 'æ', utf8: true });
		expect(bytesToText(new Uint8Array([0xe6])).utf8).toBe(false);
	});
});

describe('endianness', () => {
	const b = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
	it('swaps 16, 32 and 64-bit words', () => {
		expect(swapEndian(b, 2)).toEqual(new Uint8Array([2, 1, 4, 3, 6, 5, 8, 7]));
		expect(swapEndian(b, 4)).toEqual(new Uint8Array([4, 3, 2, 1, 8, 7, 6, 5]));
		expect(swapEndian(b, 8)).toEqual(new Uint8Array([8, 7, 6, 5, 4, 3, 2, 1]));
	});
	it('needs whole words', () => {
		expect(() => swapEndian(new Uint8Array(3), 2)).toThrow(
			'3 bytes is not a whole number of 16-bit words'
		);
	});
});

describe('hexdump', () => {
	it('matches hexdump -C layout', () => {
		const d = hexdump(utf8('Hello, world! 0123456789\n'));
		expect(d.split('\n')).toEqual([
			'00000000  48 65 6c 6c 6f 2c 20 77  6f 72 6c 64 21 20 30 31  |Hello, world! 01|',
			'00000010  32 33 34 35 36 37 38 39  0a                       |23456789.|',
			'00000019'
		]);
	});
	it('stops at the limit', () => {
		const d = hexdump(new Uint8Array(100), 32);
		expect(d.split('\n')).toHaveLength(3);
		expect(d.endsWith('00000020')).toBe(true);
	});
});

describe('intake', () => {
	it('recognises explicit byte notations only', () => {
		expect(looksLikeHexBytes('\\x48\\x65\\x6c\\x6c\\x6f')).toBeGreaterThan(0.8);
		expect(looksLikeHexBytes('{0x48, 0x65, 0x6c, 0x6c}')).toBeGreaterThan(0.8);
		expect(looksLikeHexBytes('de ad be ef 00 11 22 33')).toBe(0.6);
		expect(looksLikeHexBytes('12 34 56 78 90 12 34 56')).toBe(0);
		expect(looksLikeHexBytes('deadbeef')).toBe(0);
		expect(looksLikeHexBytes('0x1f')).toBe(0);
	});
});

describe('ops', () => {
	const run = (id: string, s: string) => ops.find((o) => o.id === id)!.run(s);
	it('round trips through the chain', () => {
		expect(run('hex.encode', 'Hi')).toBe('48 69');
		expect(run('hex.decode', '4869')).toBe('Hi');
		expect(run('hex.binary-decode', run('hex.binary-encode', 'æ') as string)).toBe('æ');
		expect(run('hex.decimal-decode', '72 105')).toBe('Hi');
		expect(() => run('hex.decode', 'ff')).toThrow(/not UTF-8/);
	});
});
