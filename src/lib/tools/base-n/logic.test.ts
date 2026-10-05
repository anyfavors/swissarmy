import { describe, expect, it } from 'vitest';
import {
	ascii85Decode,
	ascii85Encode,
	base32Decode,
	base32Encode,
	base36Decode,
	base36Encode,
	base45Decode,
	base45Encode,
	base58CheckDecode,
	base58CheckEncode,
	base58Decode,
	base58Encode,
	crockfordDecode,
	crockfordEncode,
	decode,
	encode,
	encodings,
	looksLikeAscii85,
	z85Decode,
	z85Encode
} from './logic';
import { ops } from './ops';

const te = (s: string) => new TextEncoder().encode(s);
const td = (b: Uint8Array) => new TextDecoder().decode(b);
const hex = (s: string) => new Uint8Array(s.match(/../g)?.map((h) => parseInt(h, 16)) ?? []);

describe('Base32 (RFC 4648 section 10)', () => {
	const v: [string, string, string][] = [
		['', '', ''],
		['f', 'MY======', 'CO======'],
		['fo', 'MZXQ====', 'CPNG===='],
		['foo', 'MZXW6===', 'CPNMU==='],
		['foob', 'MZXW6YQ=', 'CPNMUOG='],
		['fooba', 'MZXW6YTB', 'CPNMUOJ1'],
		['foobar', 'MZXW6YTBOI======', 'CPNMUOJ1E8======']
	];
	it.each(v)('%j', (plain, b32, b32hex) => {
		expect(base32Encode(te(plain))).toBe(b32);
		expect(base32Encode(te(plain), true)).toBe(b32hex);
		expect(td(base32Decode(b32))).toBe(plain);
		expect(td(base32Decode(b32hex, true))).toBe(plain);
	});

	it('accepts lower case, no padding and line breaks', () => {
		expect(td(base32Decode('mzxw6ytboi'))).toBe('foobar');
		expect(td(base32Decode('MZXW\n6YTB'))).toBe('fooba');
		expect(base32Encode(te('f'), false, false)).toBe('MY');
	});

	it('rejects bad input', () => {
		expect(() => base32Decode('MZ1W')).toThrow('Invalid Base32 character "1"');
		expect(() => base32Decode('M')).toThrow(/Length/);
		expect(() => base32Decode('MY=====')).toThrow(/padding/);
		expect(() => base32Decode('MY==Y===')).toThrow(/Padding in the wrong place/);
	});
});

describe('Crockford Base32', () => {
	it('round trips and reads the aliases', () => {
		const enc = crockfordEncode(te('foobar'));
		expect(enc).toBe('CSQPYRK1E8');
		expect(td(crockfordDecode(enc))).toBe('foobar');
		expect(td(crockfordDecode('csqp-yrk1-e8'))).toBe('foobar');
		expect(crockfordDecode('O0')).toEqual(crockfordDecode('00'));
		expect(crockfordDecode('Li')).toEqual(crockfordDecode('11'));
		expect(() => crockfordDecode('UU')).toThrow('Invalid Crockford Base32 character "U"');
	});
});

describe('Base58 (draft-msporny-base58 test vectors)', () => {
	it.each([
		['Hello World!', '2NEpo7TZRRrLZSi2U'],
		[
			'The quick brown fox jumps over the lazy dog.',
			'USm3fpXnKG5EUBx2ndxBDMPVciP5hGey2Jh4NDv6gmeo1LkMeiKrLJUUBk6Z'
		]
	])('%j', (plain, enc) => {
		expect(base58Encode(te(plain))).toBe(enc);
		expect(td(base58Decode(enc))).toBe(plain);
	});

	it('keeps leading zero bytes as 1', () => {
		expect(base58Encode(hex('0000287fb4cd'))).toBe('11233QC4');
		expect(base58Decode('11233QC4')).toEqual(hex('0000287fb4cd'));
		expect(base58Encode(new Uint8Array())).toBe('');
	});

	it('rejects characters outside the alphabet', () => {
		expect(() => base58Decode('0OIl')).toThrow('Invalid Base58 character "0"');
	});
});

describe('Base58Check', () => {
	// A Bitcoin P2PKH address: version 0x00, 20-byte hash, 4-byte checksum.
	const addr = '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2';

	it('verifies a Bitcoin address', async () => {
		const r = await base58CheckDecode(addr);
		expect(r.valid).toBe(true);
		expect(r.version).toBe(0);
		expect(r.payload).toHaveLength(21);
		expect(await base58CheckEncode(r.payload)).toBe(addr);
	});

	it('catches a changed character', async () => {
		const r = await base58CheckDecode('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN3');
		expect(r.valid).toBe(false);
		await expect(decode('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN3', 'base58check')).rejects.toThrow(
			/checksum/
		);
		await expect(base58CheckDecode('2NE')).rejects.toThrow(/Too short/);
	});
});

describe('Ascii85', () => {
	it('encodes the Adobe form', () => {
		expect(ascii85Encode(te('Man '))).toBe('<~9jqo^~>');
		expect(ascii85Encode(te('sure.'))).toBe('<~F*2M7/c~>');
		expect(ascii85Encode(te('Man is distinguished'))).toBe('<~9jqo^BlbD-BleB1DJ+*+F(f,q~>');
		expect(ascii85Encode(new Uint8Array([0, 0, 0, 0, 0x61, 0x62, 0x63]))).toBe('<~z@:E^~>');
		expect(ascii85Encode(new Uint8Array())).toBe('<~~>');
	});

	it('decodes with or without brackets and line breaks', () => {
		expect(td(ascii85Decode('<~9jqo^BlbD-BleB1DJ+*+F(f,q~>'))).toBe('Man is distinguished');
		expect(td(ascii85Decode('F*2M\n7/c'))).toBe('sure.');
		expect(ascii85Decode('z@:E^')).toEqual(new Uint8Array([0, 0, 0, 0, 0x61, 0x62, 0x63]));
	});

	it('rejects bad input', () => {
		expect(() => ascii85Decode('9jqo~')).toThrow(/Invalid Ascii85 character "~"/);
		expect(() => ascii85Decode('9jqo^F')).toThrow(/single character/);
		expect(() => ascii85Decode('uuuuu')).toThrow(/out of range/);
		expect(() => ascii85Decode('9jz')).toThrow(/"z" inside a group/);
	});
});

describe('Z85 (ZeroMQ RFC 32)', () => {
	const bytes = hex('864fd26fb559f75b');
	it('matches the spec example', () => {
		expect(z85Encode(bytes)).toBe('HelloWorld');
		expect(z85Decode('HelloWorld')).toEqual(bytes);
	});
	it('needs whole frames', () => {
		expect(() => z85Encode(te('abc'))).toThrow('Z85 needs a multiple of 4 bytes, this is 3');
		expect(() => z85Decode('Hello')).not.toThrow();
		expect(() => z85Decode('Hell')).toThrow(/multiple of 5/);
		expect(() => z85Decode('Hell~')).toThrow(/Invalid Z85 character "~"/);
	});
});

describe('Base45 (RFC 9285 section 4)', () => {
	it.each([
		['AB', 'BB8'],
		['Hello!!', '%69 VD92EX0'],
		['base-45', 'UJCLQE7W581'],
		['ietf!', 'QED8WEX0']
	])('%j', (plain, enc) => {
		expect(base45Encode(te(plain))).toBe(enc);
		expect(td(base45Decode(enc))).toBe(plain);
	});

	it('rejects bad input', () => {
		expect(() => base45Decode('GGW')).toThrow(/out of range/);
		expect(() => base45Decode('BB8B')).toThrow(/Length/);
		expect(() => base45Decode('ab')).toThrow('Invalid Base45 character "a"');
	});
});

describe('Base36', () => {
	it('round trips as a big-endian number', () => {
		expect(base36Encode(te('Hello'))).toBe('3yud78mn');
		expect(td(base36Decode('3YUD78MN'))).toBe('Hello');
		expect(base36Encode(new Uint8Array([0, 1]))).toBe('01');
		expect(base36Decode('01')).toEqual(new Uint8Array([0, 1]));
		expect(() => base36Decode('a-b')).toThrow(/Invalid Base36 character "-"/);
	});
});

describe('every encoding', () => {
	const sample = te('Rødgrød med fløde.');
	it.each(encodings.filter((e) => e.id !== 'z85').map((e) => e.id))(
		'%s round trips',
		async (id) => {
			expect(await decode(await encode(sample, id), id)).toEqual(sample);
		}
	);
});

describe('intake and ops', () => {
	it('claims bracketed Ascii85 only', () => {
		expect(looksLikeAscii85('<~9jqo^BlbD-BleB1DJ+*+F(f,q~>')).toBe(0.9);
		expect(looksLikeAscii85('MZXW6YTBOI======')).toBe(0);
	});
	it('runs through the chain', async () => {
		const run = (id: string, s: string) => ops.find((o) => o.id === id)!.run(s);
		expect(await run('base-n.base32-encode', 'foobar')).toBe('MZXW6YTBOI======');
		expect(await run('base-n.base58-decode', '2NEpo7TZRRrLZSi2U')).toBe('Hello World!');
		await expect(run('base-n.z85-decode', 'HelloWorld')).rejects.toThrow(/not UTF-8/);
		expect(ops).toHaveLength(encodings.length * 2);
	});
});
