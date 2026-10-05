import { describe, expect, it } from 'vitest';
import {
	bytesToBase64,
	entraObjectId,
	explain,
	ldapFilter,
	looksLikeSid,
	parseAny,
	parseBytes,
	parseSidString,
	sidFromBytes,
	sidToBytes,
	sidToString,
	toHex
} from './logic';

const DOMAIN_SID = 'S-1-5-21-2127521184-1604012920-1887927527-72713';
const DOMAIN_HEX = '010500000000000515000000a065cf7e784b9b5fe77c8770091c0100';

describe('SID encoding (MS-DTYP 2.4.2)', () => {
	it('encodes a domain SID', () => {
		expect(toHex(sidToBytes(parseSidString(DOMAIN_SID)))).toBe(DOMAIN_HEX);
	});

	it('decodes hex, escaped and Base64 forms', () => {
		const b64 = bytesToBase64(parseBytes(DOMAIN_HEX).bytes);
		for (const v of [
			DOMAIN_HEX,
			DOMAIN_HEX.toUpperCase(),
			'0x' + DOMAIN_HEX,
			DOMAIN_HEX.match(/../g)!.join(' '),
			'\\' + DOMAIN_HEX.match(/../g)!.join('\\'),
			b64,
			'objectSid:: ' + b64
		]) {
			expect(parseAny(v).e.string).toBe(DOMAIN_SID);
		}
		expect(parseAny(b64).format).toBe('base64');
		expect(
			parseAny('\\01\\02\\00\\00\\00\\00\\00\\05\\20\\00\\00\\00\\20\\02\\00\\00').format
		).toBe('escaped');
	});

	it('round-trips BUILTIN\\Administrators', () => {
		const e = parseAny('AQIAAAAAAAUgAAAAIAIAAA==').e;
		expect(e.string).toBe('S-1-5-32-544');
		expect(e.name).toBe('BUILTIN\\Administrators');
		expect(e.priv).toBe(true);
		expect(ldapFilter(e)).toBe(
			'(objectSid=\\01\\02\\00\\00\\00\\00\\00\\05\\20\\00\\00\\00\\20\\02\\00\\00)'
		);
	});

	it('handles authorities above 32 bits and zero sub-authorities', () => {
		const sid = { revision: 1, authority: 0x100000000n, subs: [1] };
		expect(sidToString(sid)).toBe('S-1-0x000100000000-1');
		expect(sidFromBytes(sidToBytes(sid))).toEqual(sid);
		expect(parseSidString('S-1-0x000100000000-1').authority).toBe(0x100000000n);
		expect(parseAny('S-1-5').e.name).toBe('NT Authority');
	});

	it('rejects malformed SIDs', () => {
		expect(() => parseSidString('S-2-5-18')).toThrow(/revision 1/i);
		expect(() => parseSidString('S-1-5-4294967296')).toThrow(/32 bits/);
		expect(() => parseSidString('S-1-5-' + Array(16).fill('1').join('-'))).toThrow(/at most 15/);
		expect(() => parseSidString('S-1-x')).toThrow(/looks like/);
		expect(() => sidFromBytes(new Uint8Array([1, 2, 0, 0, 0, 0, 0, 5, 32, 0, 0, 0]))).toThrow(
			/need 16 bytes/
		);
		expect(() => sidFromBytes(new Uint8Array([2, 0, 0, 0, 0, 0, 0, 5]))).toThrow(/revision 1/);
		expect(() => parseAny('')).toThrow(/Enter a SID/);
	});
});

describe('names', () => {
	it('knows well-known SIDs', () => {
		expect(parseAny('S-1-5-18').e.name).toBe('Local System (SYSTEM)');
		expect(parseAny('S-1-1-0').e.name).toBe('Everyone');
		expect(parseAny('S-1-16-12288').e.name).toBe('High Mandatory Level');
	});

	it('knows domain RIDs', () => {
		const base = 'S-1-5-21-1004336348-1177238915-682003330-';
		expect(parseAny(base + '500').e.name).toBe('Administrator');
		const k = parseAny(base + '502').e;
		expect(k.name).toMatch(/krbtgt/);
		expect(k.priv).toBe(true);
		expect(k.domain).toBe('S-1-5-21-1004336348-1177238915-682003330');
		expect(parseAny(base + '512').e.name).toBe('Domain Admins');
		expect(parseAny(base + '518').e.notes[0]).toMatch(/forest root/);
		expect(parseAny(base + '519').e.name).toBe('Enterprise Admins');
		expect(parseAny(base + '1105').e.kind).toBe('Domain or machine account');
		expect(parseAny(base.slice(0, -1)).e.kind).toBe('Domain or machine identifier');
	});

	it('decodes Entra ID object SIDs', () => {
		const e = explain(parseSidString('S-1-12-1-1943430372-1249052806-2496021943-3034400218'));
		expect(e.kind).toBe('Microsoft Entra ID object');
		expect(entraObjectId([1943430372, 1249052806, 2496021943, 3034400218])).toBe(
			'73d664e4-0886-4a73-b745-c694da45ddb4'
		);
	});

	it('detects SID strings', () => {
		expect(looksLikeSid('S-1-5-21-1-2-3-500')).toBe(0.95);
		expect(looksLikeSid('objectSid:: AQUAAAAAAAUVAAAA')).toBe(0.95);
		expect(looksLikeSid('hello')).toBe(0);
	});
});
