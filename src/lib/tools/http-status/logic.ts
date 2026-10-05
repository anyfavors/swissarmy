import type { HttpStatus } from './data';

export type ClassFilter = 0 | 1 | 2 | 3 | 4 | 5;

export interface Filter {
	query: string;
	cls: ClassFilter;
	/** Include codes outside the IANA registry (nginx, Cloudflare). */
	nonStandard: boolean;
}

/**
 * Filters the list. A query of digits matches code prefixes ("4", "40", "404"),
 * "4xx" matches a class, anything else matches words in the name, meaning, cause or source.
 * All words must match.
 */
export function search(list: HttpStatus[], f: Filter): HttpStatus[] {
	const q = f.query.trim().toLowerCase();
	const out = list.filter((s) => {
		if (!f.nonStandard && s.vendor) return false;
		if (f.cls && Math.floor(s.code / 100) !== f.cls) return false;
		if (!q) return true;
		const cls = q.match(/^([1-5])xx$/);
		if (cls) return Math.floor(s.code / 100) === Number(cls[1]);
		if (/^\d{1,3}$/.test(q)) return String(s.code).startsWith(q);
		const hay = [s.code, s.name, s.meaning, s.cause, s.ref, s.vendor ?? '', s.status ?? '']
			.join(' ')
			.toLowerCase();
		return q.split(/\s+/).every((w) => hay.includes(w));
	});
	return out.sort((a, b) => a.code - b.code || (a.vendor ? 1 : 0) - (b.vendor ? 1 : 0));
}

/** Codes RFC 9110 §15.1 lists as heuristically cacheable. */
export const heuristicallyCacheable = [200, 203, 204, 206, 300, 301, 308, 404, 405, 410, 414, 501];
