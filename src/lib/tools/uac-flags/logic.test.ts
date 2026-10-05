import { describe, expect, it } from 'vitest';
import {
	ENC_FLAGS,
	UAC_FLAGS,
	compose,
	decode,
	encWarnings,
	hex,
	ldapFilter,
	parseFlags
} from './logic';

const names = (v: number, t = UAC_FLAGS) => decode(v, t).set.map((f) => f.name);

describe('userAccountControl', () => {
	it('decodes the values from the Microsoft table', () => {
		expect(names(512)).toEqual(['NORMAL_ACCOUNT']);
		expect(names(514)).toEqual(['ACCOUNTDISABLE', 'NORMAL_ACCOUNT']);
		expect(names(66048)).toEqual(['NORMAL_ACCOUNT', 'DONT_EXPIRE_PASSWORD']);
		expect(names(4096)).toEqual(['WORKSTATION_TRUST_ACCOUNT']);
		expect(names(532480)).toEqual(['SERVER_TRUST_ACCOUNT', 'TRUSTED_FOR_DELEGATION']);
		expect(names(0x5001000)).toEqual([
			'WORKSTATION_TRUST_ACCOUNT',
			'TRUSTED_TO_AUTH_FOR_DELEGATION',
			'PARTIAL_SECRETS_ACCOUNT'
		]);
	});

	it('has distinct single-bit flags', () => {
		const seen = new Set<number>();
		for (const f of [...UAC_FLAGS]) {
			expect(f.value & (f.value - 1)).toBe(0);
			expect(seen.has(f.value)).toBe(false);
			seen.add(f.value);
		}
	});

	it('flags AS-REP roastable accounts', () => {
		const d = decode(4260352, UAC_FLAGS);
		const f = d.set.find((x) => x.name === 'DONT_REQ_PREAUTH');
		expect(f?.risk).toBe('high');
		expect(f?.note).toMatch(/AS-REP/);
	});

	it('reports unknown bits', () => {
		expect(decode(0x200 | 0x4, UAC_FLAGS).unknown).toBe(0x4);
		expect(decode(0x80000000, UAC_FLAGS).unknown).toBe(0x80000000);
	});

	it('composes and round-trips', () => {
		const v = compose(['NORMAL_ACCOUNT', 'DONT_EXPIRE_PASSWORD', 'ACCOUNTDISABLE'], UAC_FLAGS);
		expect(v).toBe(66050);
		expect(hex(v)).toBe('0x00010202');
		expect(() => compose(['NOPE'], UAC_FLAGS)).toThrow(/Unknown flag/);
	});

	it('parses decimal, hex and signed values', () => {
		expect(parseFlags('66048')).toBe(66048);
		expect(parseFlags('0x10200')).toBe(66048);
		expect(parseFlags('-1')).toBe(0xffffffff);
		expect(() => parseFlags('abc')).toThrow(/not a decimal/);
		expect(() => parseFlags('4294967296')).toThrow(/32-bit/);
		expect(() => parseFlags('')).toThrow(/Enter a value/);
	});

	it('builds LDAP bitwise filters', () => {
		expect(ldapFilter('userAccountControl', 2)).toBe(
			'(userAccountControl:1.2.840.113556.1.4.803:=2)'
		);
		expect(ldapFilter('userAccountControl', 4194304, 'none')).toBe(
			'(!(userAccountControl:1.2.840.113556.1.4.803:=4194304))'
		);
		expect(ldapFilter('userAccountControl', 0x80020, 'any')).toBe(
			'(userAccountControl:1.2.840.113556.1.4.804:=524320)'
		);
		expect(() => ldapFilter('userAccountControl', 0)).toThrow(/at least one/);
	});
});

describe('msDS-SupportedEncryptionTypes (MS-KILE 2.2.7)', () => {
	it('decodes common values', () => {
		expect(names(0x1c, ENC_FLAGS)).toEqual([
			'RC4-HMAC',
			'AES128-CTS-HMAC-SHA1-96',
			'AES256-CTS-HMAC-SHA1-96'
		]);
		expect(names(0x27, ENC_FLAGS)).toEqual([
			'DES-CBC-CRC',
			'DES-CBC-MD5',
			'RC4-HMAC',
			'AES256-CTS-HMAC-SHA1-96-SK'
		]);
	});

	it('warns about RC4 only and DES', () => {
		expect(
			encWarnings(4)
				.map((w) => w.text)
				.join(' ')
		).toMatch(/RC4 only/);
		expect(
			encWarnings(0x27)
				.map((w) => w.text)
				.join(' ')
		).toMatch(/DES/);
		expect(
			encWarnings(0x27)
				.map((w) => w.text)
				.join(' ')
		).toMatch(/RC4 only/);
		expect(encWarnings(0x1c).map((w) => w.text)).toEqual(['RC4 still allowed alongside AES.']);
		expect(encWarnings(0x18)).toEqual([{ level: 'good', text: 'AES only.' }]);
		expect(encWarnings(0)[0].text).toMatch(/default/);
	});
});
