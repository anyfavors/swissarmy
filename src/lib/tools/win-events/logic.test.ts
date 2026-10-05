import { describe, expect, it } from 'vitest';
import { codes, events, logonTypes } from './data';
import {
	hex8,
	hresultFromWin32,
	looksLikeStatus,
	lookupCode,
	parseCode,
	search,
	showCode,
	splitHresult
} from './logic';

const data = { events, logonTypes, codes };
const names = (q: string) => search(q, data).codes.map((h) => h.code.name);

describe('data', () => {
	it('has unique event IDs and the requested events', () => {
		const ids = events.map((e) => e.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const id of [
			4624, 4625, 4634, 4647, 4648, 4672, 4688, 4697, 4698, 4719, 4720, 4722, 4723, 4724, 4725,
			4726, 4728, 4732, 4756, 4740, 4767, 4768, 4769, 4771, 4776, 5136, 5140, 5145, 1102, 7045
		])
			expect(ids).toContain(id);
	});
	it('has the 4624 logon types', () => {
		expect(logonTypes.map((l) => l.type)).toEqual([2, 3, 4, 5, 7, 8, 9, 10, 11]);
		expect(logonTypes.find((l) => l.type === 10)?.name).toBe('RemoteInteractive');
	});
	it('has no duplicate codes per kind', () => {
		const keys = codes.map((c) => `${c.kind}:${c.code}`);
		expect(new Set(keys).size).toBe(keys.length);
	});
});

describe('parseCode', () => {
	it('reads hex, signed and unsigned decimal', () => {
		expect(parseCode('0xC000006A')).toEqual({ value: 0xc000006a, hex: true });
		expect(parseCode('c000006a')).toEqual({ value: 0xc000006a, hex: true });
		expect(parseCode('-1073741718')).toEqual({ value: 0xc000006a, hex: false });
		expect(parseCode('1326')).toEqual({ value: 1326, hex: false });
		expect(parseCode('0x18')).toEqual({ value: 0x18, hex: true });
		expect(parseCode('logon')).toBeUndefined();
		expect(parseCode('99999999999')).toBeUndefined();
	});
	it('formats hex', () => {
		expect(hex8(0xc000006a)).toBe('0xC000006A');
	});
});

describe('lookup', () => {
	it('finds 4625 status codes', () => {
		expect(names('0xC000006A')).toEqual(['STATUS_WRONG_PASSWORD']);
		expect(names('0xC0000064')).toEqual(['STATUS_NO_SUCH_USER']);
		expect(names('0xC000006D')).toEqual(['STATUS_LOGON_FAILURE']);
		expect(names('0xC0000234')).toEqual(['STATUS_ACCOUNT_LOCKED_OUT']);
		expect(names('0xC0000072')).toEqual(['STATUS_ACCOUNT_DISABLED']);
		expect(names('0xC000006F')).toEqual(['STATUS_INVALID_LOGON_HOURS']);
		expect(names('0xC0000070')).toEqual(['STATUS_INVALID_WORKSTATION']);
		expect(names('0xC0000071')).toEqual(['STATUS_PASSWORD_EXPIRED']);
		expect(names('0xC0000193')).toEqual(['STATUS_ACCOUNT_EXPIRED']);
		expect(names('0xC0000224')).toEqual(['STATUS_PASSWORD_MUST_CHANGE']);
		expect(names('-1073741718')).toEqual(['STATUS_WRONG_PASSWORD']);
	});
	it('finds HRESULTs and unwraps HRESULT_FROM_WIN32', () => {
		expect(names('0x80070005')).toEqual(['E_ACCESSDENIED', 'ERROR_ACCESS_DENIED']);
		expect(names('0x80004005')).toEqual(['E_FAIL']);
		const h = lookupCode(codes, 0x8007052e, true);
		expect(h.map((x) => x.code.name)).toEqual(['ERROR_LOGON_FAILURE']);
		expect(h[0].via).toBe('HRESULT_FROM_WIN32(1326)');
	});
	it('finds Win32 codes by decimal', () => {
		expect(names('5')).toEqual(['ERROR_ACCESS_DENIED']);
		expect(names('2')).toEqual(['ERROR_FILE_NOT_FOUND']);
		expect(names('1326')).toEqual(['ERROR_LOGON_FAILURE']);
		expect(names('1327')).toEqual(['ERROR_ACCOUNT_RESTRICTION']);
	});
	it('reads small hex as Kerberos result codes', () => {
		expect(names('0x18')).toEqual(['KDC_ERR_PREAUTH_FAILED']);
		expect(names('0x12')).toEqual(['KDC_ERR_CLIENT_REVOKED']);
		expect(names('0x25')).toEqual(['KRB_AP_ERR_SKEW']);
		expect(names('24')).toEqual([]);
	});
	it('splits HRESULTs', () => {
		expect(splitHresult(0x80070005)).toEqual({
			severity: 'failure',
			facility: 7,
			code: 5,
			fromWin32: true
		});
		expect(hresultFromWin32(1326)).toBe(0x8007052e);
		expect(hresultFromWin32(0)).toBe(0);
	});
});

describe('search', () => {
	it('matches event IDs by prefix', () => {
		const r = search('472', data);
		expect(r.events.map((e) => e.id)).toEqual([4720, 4722, 4723, 4724, 4725, 4726, 4728, 4729]);
	});
	it('matches logon types by number', () => {
		expect(search('10', data).logonTypes.map((l) => l.name)).toEqual(['RemoteInteractive']);
	});
	it('matches words everywhere', () => {
		const r = search('locked out', data);
		expect(r.events.map((e) => e.id)).toContain(4740);
		expect(r.codes.map((c) => c.code.name)).toContain('STATUS_ACCOUNT_LOCKED_OUT');
		expect(search('kerberoasting', data).events.map((e) => e.id)).toEqual([4769]);
		expect(search('remote desktop', data).logonTypes.map((l) => l.type)).toEqual([10]);
	});
	it('returns everything for an empty query', () => {
		expect(search('', data).events).toHaveLength(events.length);
	});
});

describe('detect', () => {
	it('recognises status codes, not plain numbers', () => {
		expect(looksLikeStatus('0xC000006A')).toBeGreaterThan(0.5);
		expect(looksLikeStatus('0x80070005')).toBeGreaterThan(0.5);
		expect(looksLikeStatus('Event ID 4625')).toBeGreaterThan(0.5);
		expect(looksLikeStatus('4625')).toBe(0);
		expect(looksLikeStatus('0xdeadbeef')).toBe(0);
	});
});

describe('showCode', () => {
	it('writes codes the usual way', () => {
		const get = (n: string) => codes.find((c) => c.name === n)!;
		expect(showCode(get('ERROR_LOGON_FAILURE'))).toBe('1326');
		expect(showCode(get('KDC_ERR_PREAUTH_FAILED'))).toBe('0x18');
		expect(showCode(get('STATUS_WRONG_PASSWORD'))).toBe('0xC000006A');
	});
});
