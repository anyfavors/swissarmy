import { describe, expect, it } from 'vitest';
import {
	base32Decode,
	base32Encode,
	buildOtpauth,
	counterBytes,
	defaultConfig,
	hmac,
	hotp,
	looksLikeOtpauth,
	normaliseSecret,
	parseOtpauth,
	secondsRemaining,
	secretWarnings,
	timeStep,
	totp,
	truncate,
	type OtpAlgorithm
} from './logic';

const enc = (s: string) => new TextEncoder().encode(s);
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

describe('base32 (RFC 4648 section 10 test vectors)', () => {
	const v: [string, string][] = [
		['', ''],
		['f', 'MY======'],
		['fo', 'MZXQ===='],
		['foo', 'MZXW6==='],
		['foob', 'MZXW6YQ='],
		['fooba', 'MZXW6YTB'],
		['foobar', 'MZXW6YTBOI======']
	];
	it.each(v)('%j <-> %s', (plain, b32) => {
		expect(base32Encode(enc(plain), true)).toBe(b32);
		if (plain) expect(new TextDecoder().decode(base32Decode(b32))).toBe(plain);
	});
	it('tolerates spaces, hyphens, lowercase and missing padding', () => {
		expect(new TextDecoder().decode(base32Decode('mzxw 6ytb-oi'))).toBe('foobar');
		expect(normaliseSecret('jbsw y3dp ehpk 3pxp')).toBe('JBSWY3DPEHPK3PXP');
	});
	it('rejects bad input', () => {
		expect(() => base32Decode('')).toThrow('empty');
		expect(() => base32Decode('MZXW0')).toThrow('"0" at position 5');
		expect(() => base32Decode('MZXW0')).toThrow('no 0, 1, 8 or 9');
		expect(() => base32Decode('MZX')).toThrow('cannot have 3 characters');
	});
});

describe('HOTP (RFC 4226 appendix D)', () => {
	const key = enc('12345678901234567890');
	it('intermediate HMAC-SHA-1 and truncation for count 0 and 1', async () => {
		const mac0 = await hmac('SHA1', key, counterBytes(0));
		expect(hex(mac0)).toBe('cc93cf18508d94934c64b65d8ba7667fb7cde4b0');
		expect(truncate(mac0)).toBe(1284755224);
		const mac1 = await hmac('SHA1', key, counterBytes(1));
		expect(hex(mac1)).toBe('75a48a19d4cbe100644e8ac1397eea747a2d33ab');
		expect(truncate(mac1)).toBe(1094287082);
	});
	const codes = [
		'755224',
		'287082',
		'359152',
		'969429',
		'338314',
		'254676',
		'287922',
		'162583',
		'399871',
		'520489'
	];
	it.each(codes.map((c, i) => [i, c] as const))('count %i -> %s', async (count, code) => {
		expect(await hotp(key, count)).toBe(code);
	});
	it('rejects bad counters and keys', async () => {
		expect(() => counterBytes(-1)).toThrow('whole number');
		expect(() => counterBytes(1.5)).toThrow('whole number');
		await expect(hotp(new Uint8Array(0), 0)).rejects.toThrow('empty');
	});
	it('encodes large counters big-endian', () => {
		expect(hex(counterBytes(2 ** 32 + 5))).toBe('0000000100000005');
	});
});

describe('TOTP (RFC 6238 appendix B)', () => {
	// The reference implementation uses a key of the hash's output length for each algorithm.
	const keys: Record<OtpAlgorithm, Uint8Array> = {
		SHA1: enc('12345678901234567890'),
		SHA256: enc('12345678901234567890123456789012'),
		SHA512: enc('1234567890123456789012345678901234567890123456789012345678901234')
	};
	const table: [number, string, string, string, string][] = [
		[59, '0000000000000001', '94287082', '46119246', '90693936'],
		[1111111109, '00000000023523EC', '07081804', '68084774', '25091201'],
		[1111111111, '00000000023523ED', '14050471', '67062674', '99943326'],
		[1234567890, '000000000273EF07', '89005924', '91819424', '93441116'],
		[2000000000, '0000000003F940AA', '69279037', '90698825', '38618901'],
		[20000000000, '0000000027BC86AA', '65353130', '77737706', '47863826']
	];
	it.each(table)('T=%i (step %s)', async (t, step, s1, s256, s512) => {
		expect(hex(counterBytes(timeStep(t))).toUpperCase()).toBe(step);
		expect(await totp(keys.SHA1, t, 8, 'SHA1')).toBe(s1);
		expect(await totp(keys.SHA256, t, 8, 'SHA256')).toBe(s256);
		expect(await totp(keys.SHA512, t, 8, 'SHA512')).toBe(s512);
	});
	it('6 digits is the last 6 of the 8-digit code', async () => {
		expect(await totp(keys.SHA1, 59, 6)).toBe('287082');
	});
	it('counts down the period', () => {
		expect(secondsRemaining(0)).toBe(30);
		expect(secondsRemaining(59)).toBe(1);
		expect(secondsRemaining(61.9)).toBe(29);
		expect(secondsRemaining(10, 60)).toBe(50);
	});
});

describe('otpauth URI', () => {
	it('parses a full TOTP URI', () => {
		const { config, warnings } = parseOtpauth(
			'otpauth://totp/ACME%20Co:john.doe@email.com?secret=HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ&issuer=ACME%20Co&algorithm=SHA256&digits=8&period=60'
		);
		expect(config).toMatchObject({
			type: 'totp',
			issuer: 'ACME Co',
			account: 'john.doe@email.com',
			secret: 'HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ',
			algorithm: 'SHA256',
			digits: 8,
			period: 60
		});
		expect(warnings).toHaveLength(2);
	});
	it('applies defaults and reads the issuer from the label', () => {
		const { config, warnings } = parseOtpauth(
			'otpauth://totp/Example:alice?secret=jbswy3dpehpk3pxp'
		);
		expect(config).toMatchObject({
			issuer: 'Example',
			account: 'alice',
			algorithm: 'SHA1',
			digits: 6,
			period: 30,
			secret: 'JBSWY3DPEHPK3PXP'
		});
		expect(warnings).toEqual([]);
	});
	it('warns when label issuer and parameter differ', () => {
		const { warnings } = parseOtpauth('otpauth://totp/A:alice?secret=JBSWY3DPEHPK3PXP&issuer=B');
		expect(warnings[0]).toContain('differ');
	});
	it('parses HOTP with counter', () => {
		const { config } = parseOtpauth('otpauth://hotp/alice?secret=JBSWY3DPEHPK3PXP&counter=42');
		expect(config).toMatchObject({ type: 'hotp', counter: 42, issuer: '', account: 'alice' });
	});
	it('rejects bad URIs', () => {
		expect(() => parseOtpauth('https://example.com')).toThrow('Not an otpauth');
		expect(() => parseOtpauth('otpauth://foo/x?secret=AA')).toThrow('Unknown OTP type');
		expect(() => parseOtpauth('otpauth://totp/x')).toThrow('no secret');
		expect(() => parseOtpauth('otpauth://totp/x?secret=JBSWY3DP&digits=7')).toThrow('6 or 8');
		expect(() => parseOtpauth('otpauth://totp/x?secret=JBSWY3DP&algorithm=MD5')).toThrow(
			'Unsupported algorithm'
		);
		expect(() => parseOtpauth('otpauth://totp/x?secret=JBSWY3DP&period=0')).toThrow('period');
		expect(() => parseOtpauth('otpauth://hotp/x?secret=JBSWY3DP')).toThrow('counter');
		expect(() => parseOtpauth('otpauth://totp/x?secret=JBSW1')).toThrow('base32');
	});
	it('builds and round-trips', () => {
		const c = {
			...defaultConfig(),
			secret: 'jbsw y3dp ehpk 3pxp',
			issuer: 'ACME Co',
			account: 'jane@example.com'
		};
		const uri = buildOtpauth(c);
		expect(uri).toBe(
			'otpauth://totp/ACME%20Co:jane%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=ACME%20Co&algorithm=SHA1&digits=6&period=30'
		);
		expect(parseOtpauth(uri).config).toMatchObject({
			issuer: 'ACME Co',
			account: 'jane@example.com',
			secret: 'JBSWY3DPEHPK3PXP'
		});
		expect(buildOtpauth({ ...c, type: 'hotp', counter: 7 })).toContain('&counter=7');
		expect(() => buildOtpauth({ ...c, issuer: 'a:b' })).toThrow('colon');
		expect(() => buildOtpauth({ ...c, account: '' })).toThrow('account');
	});
	it('detects otpauth URIs only', () => {
		expect(looksLikeOtpauth('otpauth://totp/x?secret=AA')).toBe(0.95);
		expect(looksLikeOtpauth('JBSWY3DPEHPK3PXP')).toBe(0);
	});
});

describe('secret strength', () => {
	it('flags short secrets (RFC 4226 R6)', () => {
		expect(secretWarnings(new Uint8Array(10))[0]).toContain('80 bits');
		expect(secretWarnings(new Uint8Array(16))[0]).toContain('recommends 160');
		expect(secretWarnings(new Uint8Array(20))).toEqual([]);
	});
});
