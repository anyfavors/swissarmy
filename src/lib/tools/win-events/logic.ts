import type { CodeKind, ErrorCode, LogonType, WinEvent } from './data';

/**
 * Reads a status or error code: "0xC000006A", "C000006A", "-1073741718", "1326", "0x18".
 * Returns the unsigned 32-bit value and whether it was written as hex.
 */
export function parseCode(s: string): { value: number; hex: boolean } | undefined {
	const t = s.trim().replace(/[\s_]/g, '');
	let m = /^0x([0-9a-f]{1,8})$/i.exec(t);
	if (m) return { value: parseInt(m[1], 16) >>> 0, hex: true };
	m = /^([0-9a-f]{8})$/i.exec(t);
	if (m && /[a-f]/i.test(t)) return { value: parseInt(m[1], 16) >>> 0, hex: true };
	if (/^-\d{1,10}$/.test(t)) {
		const n = Number(t);
		if (n < -2147483648) return undefined;
		return { value: n >>> 0, hex: false };
	}
	if (/^\d{1,10}$/.test(t)) {
		const n = Number(t);
		if (n > 0xffffffff) return undefined;
		return { value: n, hex: false };
	}
	return undefined;
}

export const hex8 = (v: number) => '0x' + (v >>> 0).toString(16).toUpperCase().padStart(8, '0');

export interface CodeHit {
	code: ErrorCode;
	/** How the input was matched */
	via: string;
}

export interface Hresult {
	severity: 'success' | 'failure';
	facility: number;
	code: number;
	/** HRESULT_FROM_WIN32 */
	fromWin32: boolean;
}

/** Splits an HRESULT into its fields ([MS-ERREF] 2.1). */
export function splitHresult(v: number): Hresult {
	const u = v >>> 0;
	const facility = (u >>> 16) & 0x7ff;
	return {
		severity: u & 0x80000000 ? 'failure' : 'success',
		facility,
		code: u & 0xffff,
		fromWin32: (u & 0xffff0000) >>> 0 === 0x80070000
	};
}

/** All table entries that a code value can mean. */
export function lookupCode(codes: ErrorCode[], value: number, wasHex: boolean): CodeHit[] {
	const v = value >>> 0;
	const hits: CodeHit[] = [];
	for (const c of codes) {
		if (c.code !== v) continue;
		// Small hex values are Kerberos result codes in event logs; small decimals are Win32
		if (c.kind === 'Kerberos' && !wasHex && v !== 0) continue;
		hits.push({ code: c, via: 'value' });
	}
	const h = splitHresult(v);
	if (h.fromWin32) {
		for (const c of codes)
			if (c.kind === 'Win32' && c.code === h.code)
				hits.push({ code: c, via: `HRESULT_FROM_WIN32(${h.code})` });
	}
	const order: Record<CodeKind, number> = { NTSTATUS: 0, HRESULT: 1, Win32: 2, Kerberos: 3 };
	return hits.sort((a, b) => order[a.code.kind] - order[b.code.kind]);
}

/** HRESULT_FROM_WIN32 */
export function hresultFromWin32(code: number): number {
	if (code <= 0) return code >>> 0;
	return ((code & 0xffff) | 0x80070000) >>> 0;
}

export interface SearchResult {
	events: WinEvent[];
	logonTypes: LogonType[];
	codes: CodeHit[];
}

/**
 * Search across events, logon types and codes. A number matches event IDs (prefix),
 * logon types (exact) and codes. Words must all appear somewhere in the entry.
 */
export function search(
	q: string,
	data: { events: WinEvent[]; logonTypes: LogonType[]; codes: ErrorCode[] }
): SearchResult {
	const t = q.trim();
	if (!t) return { events: data.events, logonTypes: data.logonTypes, codes: [] };
	const parsed = parseCode(t);
	if (parsed) {
		const digits = /^\d+$/.test(t) ? t : undefined;
		return {
			events: digits ? data.events.filter((e) => String(e.id).startsWith(digits)) : [],
			logonTypes:
				digits && digits.length <= 2
					? data.logonTypes.filter((l) => String(l.type) === digits)
					: [],
			codes: lookupCode(data.codes, parsed.value, parsed.hex)
		};
	}
	const words = t.toLowerCase().split(/\s+/);
	const has = (hay: string) => words.every((w) => hay.includes(w));
	return {
		events: data.events.filter((e) =>
			has([e.id, e.log, e.title, e.category, e.why, ...(e.fields ?? [])].join(' ').toLowerCase())
		),
		logonTypes: data.logonTypes.filter((l) =>
			has(`logon type ${l.type} ${l.name} ${l.text}`.toLowerCase())
		),
		codes: data.codes
			.filter((c) =>
				has(`${hex8(c.code)} ${c.code} ${c.kind} ${c.name} ${c.text} ${c.seen ?? ''}`.toLowerCase())
			)
			.map((c) => ({ code: c, via: 'text' }))
	};
}

/** Paste recognition: NTSTATUS failure codes (0xC000....) and HRESULT_FROM_WIN32 values only. */
export function looksLikeStatus(s: string): number {
	const t = s.trim();
	if (/^0x?c0000[0-9a-f]{3}$/i.test(t)) return 0.8;
	if (/^0x8007[0-9a-f]{4}$/i.test(t)) return 0.7;
	if (/^event\s*(id)?\s*[147]\d{3}$/i.test(t)) return 0.8;
	return 0;
}

/** How a code is usually written: Win32 in decimal, Kerberos as short hex, the rest as 8 hex digits. */
export function showCode(c: ErrorCode): string {
	if (c.kind === 'Win32') return String(c.code);
	if (c.kind === 'Kerberos') return '0x' + c.code.toString(16).toUpperCase();
	return hex8(c.code);
}
