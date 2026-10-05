import { describe, expect, it } from 'vitest';
import { decodeFlags, encodeFlags, lookupEtype, maskOf, parseFlags, TICKET_FLAGS } from './logic';
import { ops } from './ops';

describe('ticket flags', () => {
	it('uses RFC 4120 bit order, bit 0 is the MSB', () => {
		expect(maskOf(0)).toBe(0x80000000);
		expect(maskOf(1)).toBe(0x40000000);
		expect(maskOf(15)).toBe(0x00010000);
	});
	it('decodes the usual Windows TGT value like klist', () => {
		const d = decodeFlags(0x40e10000);
		expect(d.set.map((f) => f.name)).toEqual([
			'forwardable',
			'renewable',
			'initial',
			'pre-authent',
			'name-canonicalize'
		]);
		expect(d.klist).toBe(
			'Ticket Flags 0x40e10000 -> forwardable renewable initial pre_authent name_canonicalize'
		);
		expect(d.mit).toBe('FRIA');
	});
	it('decodes a service ticket with ok-as-delegate', () => {
		const d = decodeFlags(0x40a50000);
		expect(d.set.map((f) => f.klist)).toEqual([
			'forwardable',
			'renewable',
			'pre_authent',
			'ok_as_delegate',
			'name_canonicalize'
		]);
	});
	it('reports undefined bits', () => {
		expect(decodeFlags(0x00000001).unknown).toEqual([31]);
		expect(decodeFlags(0).klist).toBe('Ticket Flags 0x00000000 ->');
	});
	it('encodes', () => {
		expect(encodeFlags([1, 8, 9, 10, 15])).toBe(0x40e10000);
		expect(encodeFlags([0])).toBe(0x80000000);
		expect(encodeFlags(TICKET_FLAGS.map((f) => f.bit))).toBe(0xffff0000);
	});
	it('parses many spellings', () => {
		expect(parseFlags('0x40e10000')).toBe(0x40e10000);
		expect(parseFlags('40e10000')).toBe(0x40e10000);
		expect(parseFlags('1088487424')).toBe(0x40e10000);
		expect(parseFlags('Ticket Flags 0x60a10000 -> forwardable forwarded')).toBe(0x60a10000);
		expect(() => parseFlags('')).toThrow(/Enter/);
		expect(() => parseFlags('hello')).toThrow(/not a flags value/);
		expect(() => parseFlags('99999999999')).toThrow(/32 bits/);
	});
});

describe('encryption types', () => {
	it('looks up by number and hex as in event 4769', () => {
		expect(lookupEtype('23').etype?.name).toBe('rc4-hmac');
		expect(lookupEtype('0x17').etype?.strength).toBe('weak');
		expect(lookupEtype('0x12').etype?.name).toBe('aes256-cts-hmac-sha1-96');
		expect(lookupEtype('17').etype?.strength).toBe('good');
		expect(lookupEtype('1').etype?.strength).toBe('broken');
	});
	it('reads negative Microsoft values, also as unsigned hex', () => {
		expect(lookupEtype('-135').etype?.name).toBe('KERB_ETYPE_RC4_HMAC_OLD_EXP');
		expect(lookupEtype('0xffffff79').etype?.id).toBe(-135);
	});
	it('treats 0xffffffff as a failure', () => {
		expect(lookupEtype('0xFFFFFFFF').failure).toBe(true);
		expect(lookupEtype('-1').failure).toBe(true);
	});
	it('looks up by name', () => {
		expect(lookupEtype('RC4-HMAC').id).toBe(23);
		expect(lookupEtype('aes256-cts-hmac-sha1-96').id).toBe(18);
		expect(() => lookupEtype('blowfish')).toThrow(/Unknown/);
		expect(lookupEtype('99').etype).toBeUndefined();
	});
});

describe('ops', () => {
	it('turns flags into a klist line', async () => {
		const op = ops.find((o) => o.id === 'kerberos.flags')!;
		expect(await op.run('0x40e10000')).toMatch(/forwardable renewable initial/);
		expect(() => op.run('nope')).toThrow(/not a flags value/);
	});
});
