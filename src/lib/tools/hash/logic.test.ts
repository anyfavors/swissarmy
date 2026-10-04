import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
	digest,
	digestAll,
	formatSize,
	hexToBytes,
	hmac,
	hmacAll,
	lengthHint,
	matchExpected,
	md5,
	normaliseExpected,
	parseKey,
	toBase64,
	toHex
} from './logic';

const utf8 = (s: string) => new TextEncoder().encode(s);

// RFC 1321 appendix A.5 test suite
const md5Suite: [string, string][] = [
	['', 'd41d8cd98f00b204e9800998ecf8427e'],
	['a', '0cc175b9c0f1b6a831c399e269772661'],
	['abc', '900150983cd24fb0d6963f7d28e17f72'],
	['message digest', 'f96b697d7cb7938d525a2f31aaf161d0'],
	['abcdefghijklmnopqrstuvwxyz', 'c3fcd3d76192e4007dfb496cca67e13b'],
	[
		'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
		'd174ab98d277d9f5a5611c2c9f419d9f'
	],
	['1234567890'.repeat(8), '57edf4a22be3c955ac49da2e2107b67a']
];

// FIPS 180 examples (NIST CSRC example values): "abc" and the empty string
const fips: [string, string, string][] = [
	['SHA-1', 'abc', 'a9993e364706816aba3e25717850c26c9cd0d89d'],
	['SHA-1', '', 'da39a3ee5e6b4b0d3255bfef95601890afd80709'],
	['SHA-256', 'abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
	['SHA-256', '', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
	[
		'SHA-384',
		'abc',
		'cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7'
	],
	[
		'SHA-384',
		'',
		'38b060a751ac96384cd9327eb1b1e36a21fdb71114be07434c0cc7bf63f6e1da274edebfe76f65fbd51ad2f14898b95b'
	],
	[
		'SHA-512',
		'abc',
		'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f'
	],
	[
		'SHA-512',
		'',
		'cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e'
	]
];

// RFC 4231 test cases 1 and 2 (SHA-2), RFC 2202 test cases 1 and 2 (SHA-1)
const tc1Key = new Uint8Array(20).fill(0x0b);
const hmacVectors: [string, Uint8Array, string, string][] = [
	['SHA-1', tc1Key, 'Hi There', 'b617318655057264e28bc0b6fb378c8ef146be00'],
	[
		'SHA-1',
		utf8('Jefe'),
		'what do ya want for nothing?',
		'effcdf6ae5eb2fa2d27416d5f184df9c259a7c79'
	],
	[
		'SHA-256',
		tc1Key,
		'Hi There',
		'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7'
	],
	[
		'SHA-384',
		tc1Key,
		'Hi There',
		'afd03944d84895626b0825f4ab46907f15f9dadbe4101ec682aa034c7cebc59cfaea9ea9076ede7f4af152e8b2fa9cb6'
	],
	[
		'SHA-512',
		tc1Key,
		'Hi There',
		'87aa7cdea5ef619d4ff0b4241a1d6cb02379f4e2ce4ec2787ad0b30545e17cdedaa833b7d6b8a702038b274eaea3f4e4be9d914eeb61f1702e696c203a126854'
	],
	[
		'SHA-256',
		utf8('Jefe'),
		'what do ya want for nothing?',
		'5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843'
	],
	[
		'SHA-384',
		utf8('Jefe'),
		'what do ya want for nothing?',
		'af45d2e376484031617f78d2b58a6b1b9c7ef464f5a01b47e42ec3736322445e8e2240ca5e69e2c78b3239ecfab21649'
	],
	[
		'SHA-512',
		utf8('Jefe'),
		'what do ya want for nothing?',
		'164b7a7bfcf819e2e395fbe73b56e0a387bd64222e831fd610270cd7ea2505549758bf75c05a994a6d034f65f8f0e6fdcaeab1a34d4a6b4b636e070a38bce737'
	]
];

describe('md5', () => {
	it.each(md5Suite)('RFC 1321: MD5(%j)', (input, hex) => {
		expect(toHex(md5(utf8(input)))).toBe(hex);
	});

	it('matches node:crypto around block and padding boundaries', () => {
		for (const n of [0, 1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129, 1000, 4097]) {
			const data = new Uint8Array(n).map((_, i) => (i * 31 + n) & 0xff);
			expect(toHex(md5(data)), `length ${n}`).toBe(createHash('md5').update(data).digest('hex'));
		}
	});

	it('hashes UTF-8 bytes, not UTF-16 code units', () => {
		expect(toHex(md5(utf8('æøå')))).toBe(createHash('md5').update('æøå', 'utf8').digest('hex'));
	});
});

describe('sha', () => {
	it.each(fips)('FIPS 180: %s(%j)', async (algo, input, hex) => {
		expect(toHex(await digest(algo as 'SHA-256', utf8(input)))).toBe(hex);
	});

	it('digestAll returns all five', async () => {
		const r = await digestAll(utf8('abc'));
		expect(Object.keys(r)).toEqual(['MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512']);
		expect(toHex(r.MD5)).toBe('900150983cd24fb0d6963f7d28e17f72');
	});
});

describe('hmac', () => {
	it.each(hmacVectors)('HMAC-%s vector', async (algo, key, data, hex) => {
		expect(toHex(await hmac(algo as 'SHA-256', key, utf8(data)))).toBe(hex);
		expect(hex).toBe(
			createHmac(algo.replace('-', '').toLowerCase(), key).update(data).digest('hex')
		);
	});

	it('hmacAll covers SHA-1 to SHA-512', async () => {
		const r = await hmacAll(utf8('Jefe'), utf8('what do ya want for nothing?'));
		expect(toHex(r['SHA-256'])).toBe(hmacVectors[5][3]);
		expect(Object.keys(r)).toHaveLength(4);
	});

	it('rejects an empty key', async () => {
		await expect(hmac('SHA-256', new Uint8Array(), utf8('x'))).rejects.toThrow(/empty/);
	});

	it('parses keys as text or hex', () => {
		expect(parseKey('Jefe', 'text')).toEqual(utf8('Jefe'));
		expect(parseKey('0x4a 65:66 65', 'hex')).toEqual(utf8('Jefe'));
		expect(() => hexToBytes('abc')).toThrow(/odd number/);
		expect(() => hexToBytes('zz')).toThrow(/Invalid hex character "z"/);
	});
});

describe('encoding and compare', () => {
	const abc256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

	it('encodes hex lowercase and Base64', () => {
		expect(toHex(new Uint8Array([0, 0xab, 0xff]))).toBe('00abff');
		expect(toBase64(hexToBytes(abc256))).toBe('ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=');
	});

	it('normalises pasted checksums', () => {
		expect(normaliseExpected(`  ${abc256.toUpperCase()}\n`)).toBe(abc256.toUpperCase());
		expect(normaliseExpected(`${abc256}  ubuntu.iso`)).toBe(abc256);
		expect(normaliseExpected(`SHA256 (ubuntu.iso) = ${abc256}`)).toBe(abc256);
		expect(normaliseExpected('ba:78:16 bf')).toBe('ba7816bf');
	});

	it('marks the matching algorithm, case-insensitive for hex', async () => {
		const r = await digestAll(utf8('abc'));
		expect(matchExpected(` ${abc256.toUpperCase()} `, r)).toEqual(['SHA-256']);
		expect(matchExpected('ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=', r)).toEqual(['SHA-256']);
		expect(matchExpected('UNGWV48BZ+PBQUDEXA4II7ADYAOWF3QCTBD/YFIAFA0=', r)).toEqual([]);
		expect(matchExpected(abc256.slice(0, -1) + '0', r)).toEqual([]);
		expect(matchExpected('', r)).toEqual([]);
	});

	it('hints at the algorithm by length', () => {
		expect(lengthHint('0'.repeat(64))).toEqual(['SHA-256']);
		expect(lengthHint('0'.repeat(40))).toEqual(['SHA-1']);
		expect(lengthHint('xyz')).toEqual([]);
	});

	it('formats file sizes', () => {
		expect(formatSize(12)).toBe('12 bytes');
		expect(formatSize(1536)).toBe('1.50 KiB (1,536 bytes)');
	});
});
