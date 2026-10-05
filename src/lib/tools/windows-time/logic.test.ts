import { describe, expect, it } from 'vitest';
import {
	civilFromDays,
	convert,
	daysFromCivil,
	divDecimal,
	formatIso,
	formats,
	gpsLeapOffset,
	guessKind,
	looksLikeWindowsTime,
	parse,
	parseIso,
	uuidTime
} from './logic';

const iso = (raw: string, kind?: Parameters<typeof parse>[1]) => {
	const p = parse(raw, kind);
	if (p.ns === undefined) throw new Error('no date');
	return formatIso(p.ns);
};
const row = (ns: bigint, kind: string) => formats(ns).find((r) => r.kind === kind)!;

describe('calendar helpers', () => {
	it('round-trips days and handles far years', () => {
		expect(daysFromCivil(1970, 1, 1)).toBe(0);
		expect(daysFromCivil(1601, 1, 1)).toBe(-134774);
		expect(civilFromDays(-719162)).toEqual([1, 1, 1]);
		for (const d of [-800000, -134774, -1, 0, 59, 20089, 2932896]) {
			const [y, m, dd] = civilFromDays(d);
			expect(daysFromCivil(y, m, dd)).toBe(d);
		}
	});

	it('parses ISO with offsets and 7 fraction digits', () => {
		expect(formatIso(parseIso('2026-10-05T14:00:00+02:00'))).toBe('2026-10-05T12:00:00Z');
		expect(formatIso(parseIso('2026-10-05T12:00:00.1234567Z'))).toBe(
			'2026-10-05T12:00:00.1234567Z'
		);
		expect(formatIso(parseIso('0001-01-01'))).toBe('0001-01-01T00:00:00Z');
		expect(() => parseIso('2025-02-29')).toThrow(/does not exist/);
		expect(() => parseIso('yesterday')).toThrow(/ISO 8601/);
	});

	it('formats decimals with rounding', () => {
		expect(divDecimal(1n, 3n, 4)).toBe('0.3333');
		expect(divDecimal(-3n, 2n, 2)).toBe('-1.5');
		expect(divDecimal(10n, 5n, 3)).toBe('2');
	});
});

describe('Windows FILETIME and AD attributes', () => {
	it('converts the Unix epoch', () => {
		expect(iso('116444736000000000')).toBe('1970-01-01T00:00:00Z');
		expect(iso('0x019DB1DED53E8000')).toBe('1970-01-01T00:00:00Z');
	});

	it('keeps 100 ns precision', () => {
		expect(iso('116444736000000001', 'filetime')).toBe('1970-01-01T00:00:00.0000001Z');
		expect(convert('2026-10-05T12:00:00.1234567Z', 'iso', 'filetime')).toBe(
			String(116444736000000000n + 1791201600_1234567n)
		);
	});

	it('handles the AD special values', () => {
		const zero = parse('0', 'filetime');
		expect(zero.ns).toBeUndefined();
		expect(zero.special).toMatch(/next logon/);
		const never = parse('9223372036854775807');
		expect(never.kind).toBe('filetime');
		expect(never.special).toMatch(/never/i);
		expect(parse('0x7FFFFFFFFFFFFFFF').special).toMatch(/never/i);
	});

	it('rejects negative and too large values', () => {
		expect(() => parse('-1', 'filetime')).toThrow(/negative/);
		expect(() => parse('0x8000000000000000', 'filetime')).toThrow(/maximum/);
	});
});

describe('other epochs', () => {
	it('.NET ticks and WebKit', () => {
		expect(iso('621355968000000000')).toBe('1970-01-01T00:00:00Z');
		expect(guessKind('638000000000000000')).toBe('dotnet');
		expect(iso('11644473600000000', 'webkit')).toBe('1970-01-01T00:00:00Z');
		expect(iso('13370000000000000')).toBe('2024-09-05T08:53:20Z');
	});

	it('Excel 1900 system with the 1900 leap-year bug', () => {
		expect(iso('1', 'excel1900')).toBe('1900-01-01T00:00:00Z');
		expect(iso('59', 'excel1900')).toBe('1900-02-28T00:00:00Z');
		expect(() => parse('60', 'excel1900')).toThrow(/1900-02-29/);
		expect(iso('61', 'excel1900')).toBe('1900-03-01T00:00:00Z');
		expect(iso('25569')).toBe('1970-01-01T00:00:00Z');
		expect(iso('45658.5')).toBe('2025-01-01T12:00:00Z');
		expect(iso('45658,25', 'excel1900')).toBe('2025-01-01T06:00:00Z');
		expect(row(parseIso('1900-02-28'), 'excel1900').value).toBe('59');
		expect(row(parseIso('1900-03-01'), 'excel1900').value).toBe('61');
		expect(row(parseIso('1899-12-31'), 'excel1900').value).toBe('0');
		expect(row(parseIso('1899-12-30'), 'excel1900').value).toBe('');
	});

	it('Excel 1904 system', () => {
		expect(iso('0', 'excel1904')).toBe('1904-01-01T00:00:00Z');
		expect(iso('24107', 'excel1904')).toBe('1970-01-01T00:00:00Z');
	});

	it('Cocoa reference date', () => {
		expect(iso('0', 'cocoa')).toBe('2001-01-01T00:00:00Z');
		expect(iso('-978307200', 'cocoa')).toBe('1970-01-01T00:00:00Z');
	});

	it('GPS time with leap seconds', () => {
		expect(gpsLeapOffset(0n)).toBe(0);
		expect(gpsLeapOffset(1483228800n)).toBe(18);
		expect(gpsLeapOffset(1483228799n)).toBe(17);
		expect(iso('0', 'gps')).toBe('1980-01-06T00:00:00Z');
		expect(iso('1167264018', 'gps')).toBe('2017-01-01T00:00:00Z');
		const r = row(parseIso('2017-01-01T00:00:00Z'), 'gps');
		expect(r.value).toBe('1167264018');
		expect(r.extra).toMatch(/week 1930/);
	});

	it('NTP, decimal and 32.32 hex', () => {
		expect(iso('2208988800', 'ntp')).toBe('1970-01-01T00:00:00Z');
		expect(iso('83AA7E80.80000000')).toBe('1970-01-01T00:00:00.5Z');
		const r = row(parseIso('1970-01-01T00:00:00.5Z'), 'ntp');
		expect(r.extra).toBe('83AA7E80.80000000, era 0');
		expect(row(parseIso('2036-02-07T06:28:16Z'), 'ntp').extra).toBe('00000000.00000000, era 1');
	});

	it('Discord snowflake (example from the Discord API docs)', () => {
		const p = parse('175928847299117063', 'discord');
		expect(formatIso(p.ns!)).toBe('2016-04-30T11:18:25.796Z');
		expect(p.details).toEqual([
			{ label: 'Worker', value: '1' },
			{ label: 'Process', value: '0' },
			{ label: 'Sequence', value: '7' }
		]);
	});

	it('X / Twitter snowflake round trip', () => {
		expect(iso('0', 'twitter')).toBe('2010-11-04T01:42:54.657Z');
		const id = convert('2022-01-01T00:00:00Z', 'iso', 'twitter');
		expect(iso(id, 'twitter')).toBe('2022-01-01T00:00:00Z');
		expect(row(parseIso('2000-01-01'), 'twitter').value).toBe('');
	});

	it('UUID v1, v6, v7 (RFC 9562 appendix A vectors)', () => {
		const v1 = uuidTime('C232AB00-9414-11EC-B3C8-9F6BDECED846');
		expect(formatIso(v1.ns)).toBe('2022-02-22T19:22:22Z');
		expect(v1.clockSeq).toBe(0x33c8);
		expect(v1.node).toBe('9f:6b:de:ce:d8:46');
		expect(iso('1EC9414C-232A-6B00-B3C8-9F6BDECED846')).toBe('2022-02-22T19:22:22Z');
		expect(iso('017F22E2-79B0-7CC3-98C4-DC0C0C07398F')).toBe('2022-02-22T19:22:22Z');
		expect(() => uuidTime('919108f7-52d1-4320-9bac-f847db4148a8')).toThrow(/version 4/);
		expect(row(parseIso('2022-02-22T19:22:22Z'), 'uuid').value).toBe(
			'017f22e2-79b0-7000-8000-000000000000'
		);
	});

	it('ULID (example from the ULID spec)', () => {
		expect(iso('01ARZ3NDEKTSV4RRFFQ69G5FAV')).toBe('2016-07-30T23:54:10.259Z');
		expect(convert('2016-07-30T23:54:10.259Z', 'iso', 'ulid')).toBe('01ARZ3NDEK0000000000000000');
		expect(() => parse('81ARZ3NDEKTSV4RRFFQ69G5FAV', 'ulid')).toThrow(/ULID/);
	});
});

describe('detection', () => {
	it('guesses formats and refuses ambiguous numbers', () => {
		expect(guessKind('133735200000000000')).toBe('filetime');
		expect(guessKind('2026-10-05')).toBe('iso');
		expect(guessKind('1700000000000000')).toBeNull();
		expect(() => parse('1234567890123456789')).toThrow(/Pick the format/);
	});

	it('claims 18-digit numbers and ULIDs only', () => {
		expect(looksLikeWindowsTime('133735200000000000')).toBe(0.7);
		expect(looksLikeWindowsTime('01ARZ3NDEKTSV4RRFFQ69G5FAV')).toBe(0.8);
		expect(looksLikeWindowsTime('1700000000')).toBe(0);
		expect(looksLikeWindowsTime('1700000000000000000')).toBe(0);
		expect(looksLikeWindowsTime('1700000000000000')).toBe(0);
	});

	it('names the error for an empty value', () => {
		expect(() => parse('  ')).toThrow(/Enter a value/);
	});
});
