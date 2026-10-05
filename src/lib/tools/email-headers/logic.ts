/*
 * Email header analysis.
 * RFC 5322: header syntax, folding (2.2.3), date-time (3.3, obsolete zones 4.3).
 * RFC 5321 4.4: Received trace fields. RFC 2047: encoded-words. RFC 2231 section 5: language tag.
 * RFC 8601: Authentication-Results. RFC 7208 9.1: Received-SPF. RFC 6376: DKIM-Signature.
 * RFC 8617: ARC (ARC-Seal, ARC-Message-Signature, ARC-Authentication-Results).
 */
import { relaxedAligned } from '../dmarc/logic';

export interface Header {
	name: string;
	/** Unfolded value, as written (encoded-words not decoded). */
	value: string;
	/** Position in the header block, 0 is the top. */
	index: number;
}

export interface HeaderBlock {
	headers: Header[];
	/** Lines that are neither a header nor a continuation. */
	skipped: string[];
}

/** Unfolds and splits a header block. Stops at the first empty line (start of the body). */
export function parseHeaders(raw: string): HeaderBlock {
	const lines = raw.replace(/\r\n?/g, '\n').split('\n');
	const headers: Header[] = [];
	const skipped: string[] = [];
	let started = false;
	for (const line of lines) {
		if (line.trim() === '') {
			if (started) break;
			continue;
		}
		if (/^[ \t]/.test(line)) {
			const last = headers[headers.length - 1];
			if (last) last.value += ' ' + line.trim();
			else skipped.push(line);
			continue;
		}
		const m = line.match(/^([!-9;-~]+):[ \t]?(.*)$/);
		if (!m) {
			// mbox "From " separator or other junk
			skipped.push(line);
			continue;
		}
		started = true;
		headers.push({ name: m[1], value: m[2].trim(), index: headers.length });
	}
	return { headers, skipped };
}

export function all(h: Header[], name: string): Header[] {
	const n = name.toLowerCase();
	return h.filter((x) => x.name.toLowerCase() === n);
}

export function first(h: Header[], name: string): Header | undefined {
	return all(h, name)[0];
}

/* ------------------------------------------------------------------ */
/* RFC 2047 encoded-words                                              */
/* ------------------------------------------------------------------ */

const encodedWord = /=\?([^?\s]+)\?([BbQq])\?([^?\s]*)\?=/g;

function decodeBytes(charset: string, bytes: Uint8Array): string | null {
	const cs = charset.split('*')[0].toLowerCase();
	try {
		return new TextDecoder(cs).decode(bytes);
	} catch {
		return null;
	}
}

function wordBytes(enc: string, text: string): Uint8Array | null {
	if (enc.toUpperCase() === 'B') {
		try {
			const bin = atob(text.replace(/[^A-Za-z0-9+/=]/g, ''));
			return Uint8Array.from(bin, (c) => c.charCodeAt(0));
		} catch {
			return null;
		}
	}
	const out: number[] = [];
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (c === '_') out.push(0x20);
		else if (c === '=' && /^[0-9A-Fa-f]{2}$/.test(text.slice(i + 1, i + 3))) {
			out.push(parseInt(text.slice(i + 1, i + 3), 16));
			i += 2;
		} else out.push(c.charCodeAt(0) & 0xff);
	}
	return new Uint8Array(out);
}

/**
 * Decodes RFC 2047 encoded-words. Whitespace between two adjacent encoded-words is dropped
 * (RFC 2047 section 6.2). Adjacent words in the same charset are joined as bytes first, so a
 * multi-byte character split across two words still decodes. Unknown charsets are left as is.
 */
export function decodeWords(s: string): string {
	if (!s.includes('=?')) return s;
	const parts: { text: string; word?: { charset: string; bytes: Uint8Array } }[] = [];
	let last = 0;
	for (const m of s.matchAll(encodedWord)) {
		const between = s.slice(last, m.index);
		const bytes = wordBytes(m[2], m[3]);
		if (between) parts.push({ text: between });
		parts.push(bytes ? { text: m[0], word: { charset: m[1], bytes } } : { text: m[0] });
		last = m.index! + m[0].length;
	}
	if (last < s.length) parts.push({ text: s.slice(last) });
	// drop whitespace-only text between two encoded words
	const cleaned = parts.filter(
		(p, i) => p.word || !(/^[ \t]+$/.test(p.text) && parts[i - 1]?.word && parts[i + 1]?.word)
	);
	let out = '';
	for (let i = 0; i < cleaned.length; i++) {
		const p = cleaned[i];
		if (!p.word) {
			out += p.text;
			continue;
		}
		const cs = p.word.charset.toLowerCase();
		const chunks = [p.word.bytes];
		while (cleaned[i + 1]?.word && cleaned[i + 1].word!.charset.toLowerCase() === cs) {
			chunks.push(cleaned[i + 1].word!.bytes);
			i++;
		}
		const total = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
		let o = 0;
		for (const c of chunks) {
			total.set(c, o);
			o += c.length;
		}
		out += decodeBytes(p.word.charset, total) ?? p.text;
	}
	return out;
}

/* ------------------------------------------------------------------ */
/* Comments, quoting, splitting                                        */
/* ------------------------------------------------------------------ */

/** Removes RFC 5322 comments (nested parentheses), outside quoted strings. Returns both parts. */
export function stripComments(s: string): { text: string; comments: string[] } {
	let text = '';
	const comments: string[] = [];
	let depth = 0;
	let cur = '';
	let quoted = false;
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (c === '\\' && i + 1 < s.length) {
			if (depth) cur += s[i + 1];
			else text += c + s[i + 1];
			i++;
			continue;
		}
		if (!depth && c === '"') {
			quoted = !quoted;
			text += c;
			continue;
		}
		if (quoted) {
			text += c;
			continue;
		}
		if (c === '(') {
			if (depth) cur += c;
			depth++;
			continue;
		}
		if (c === ')' && depth) {
			depth--;
			if (depth) cur += c;
			else {
				comments.push(cur.trim());
				cur = '';
				text += ' ';
			}
			continue;
		}
		if (depth) cur += c;
		else text += c;
	}
	if (depth && cur) comments.push(cur.trim());
	return { text: text.replace(/[ \t]+/g, ' ').trim(), comments };
}

/** Splits on a separator outside quotes and comments. */
export function splitTop(s: string, sep: string): string[] {
	const out: string[] = [];
	let cur = '';
	let depth = 0;
	let quoted = false;
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (c === '\\' && i + 1 < s.length) {
			cur += c + s[i + 1];
			i++;
			continue;
		}
		if (c === '"' && !depth) quoted = !quoted;
		else if (!quoted && c === '(') depth++;
		else if (!quoted && c === ')' && depth) depth--;
		if (c === sep && !quoted && !depth) {
			out.push(cur);
			cur = '';
		} else cur += c;
	}
	out.push(cur);
	return out;
}

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** RFC 5322 4.3 obsolete zone names, in minutes east of UTC. */
const zones: Record<string, number> = {
	UT: 0,
	UTC: 0,
	GMT: 0,
	Z: 0,
	EST: -300,
	EDT: -240,
	CST: -360,
	CDT: -300,
	MST: -420,
	MDT: -360,
	PST: -480,
	PDT: -420
};

export interface MailDate {
	/** Milliseconds since the epoch, UTC. */
	ms: number;
	/** Offset in minutes east of UTC, as written. */
	offset: number;
	/** Zone could not be read (military letter or missing): taken as UTC. */
	zoneUnknown?: boolean;
}

/** Parses an RFC 5322 date-time, tolerating the obsolete forms. Returns null when unreadable. */
export function parseMailDate(input: string): MailDate | null {
	const s = stripComments(input).text;
	const m = s.match(
		/^(?:[A-Za-z]{3,9},?\s*)?(\d{1,2})[\s-]+([A-Za-z]{3})[a-z]*[\s-]+(\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*([+-]\d{4}|[A-Za-z]{1,5})?/
	);
	if (!m) return null;
	const month = months.indexOf(m[2].toLowerCase());
	if (month < 0) return null;
	let year = Number(m[3]);
	if (m[3].length === 2) year += year < 50 ? 2000 : 1900;
	else if (m[3].length === 3) year += 1900;
	const day = Number(m[1]);
	const h = Number(m[4]);
	const min = Number(m[5]);
	const sec = m[6] ? Number(m[6]) : 0;
	if (day < 1 || day > 31 || h > 23 || min > 59 || sec > 60) return null;
	let offset = 0;
	let zoneUnknown: boolean | undefined;
	const z = m[7];
	if (!z) zoneUnknown = true;
	else if (/^[+-]\d{4}$/.test(z)) {
		const sign = z[0] === '-' ? -1 : 1;
		offset = sign * (Number(z.slice(1, 3)) * 60 + Number(z.slice(3, 5)));
		if (z === '-0000') zoneUnknown = true;
	} else if (z.toUpperCase() in zones) offset = zones[z.toUpperCase()];
	else zoneUnknown = true;
	const ms = Date.UTC(year, month, day, h, min, sec) - offset * 60000;
	return { ms, offset, zoneUnknown };
}

/** 3725 -> "1h 2m 5s". Negative values keep their sign. */
export function formatDuration(sec: number): string {
	const neg = sec < 0;
	let s = Math.round(Math.abs(sec));
	if (s === 0) return '0s';
	const parts: string[] = [];
	for (const [u, n] of [
		['d', 86400],
		['h', 3600],
		['m', 60],
		['s', 1]
	] as const) {
		const k = Math.floor(s / n);
		if (k) parts.push(`${k}${u}`);
		s -= k * n;
	}
	return (neg ? '-' : '') + parts.join(' ');
}

/** ISO-like UTC display: 2024-10-01 12:34:56 UTC. */
export function formatUtc(ms: number): string {
	return new Date(ms)
		.toISOString()
		.replace('T', ' ')
		.replace(/\.\d+Z$/, ' UTC');
}

/* ------------------------------------------------------------------ */
/* Received                                                            */
/* ------------------------------------------------------------------ */

export interface Hop {
	/** 1 is the first server (bottom header). */
	n: number;
	raw: string;
	from?: string;
	/** Reverse DNS or comment text the receiving server noted about the sender. */
	fromInfo?: string;
	fromIp?: string;
	by?: string;
	with?: string;
	id?: string;
	for?: string;
	via?: string;
	dateRaw?: string;
	date: MailDate | null;
	/** Seconds since the previous hop that has a date. */
	delay?: number;
	flag?: 'slow' | 'skew';
}

const clauseKeys = ['from', 'by', 'via', 'with', 'id', 'for'] as const;
type ClauseKey = (typeof clauseKeys)[number];

/** Splits the trace part of a Received header into its from / by / with ... clauses. */
export function receivedClauses(s: string): Partial<Record<ClauseKey, string>> {
	const out: Partial<Record<ClauseKey, string>> = {};
	let depth = 0;
	let key: ClauseKey | null = null;
	let start = 0;
	const close = (end: number) => {
		if (key && !(key in out)) out[key] = s.slice(start, end).trim();
	};
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (c === '(') depth++;
		else if (c === ')' && depth) depth--;
		else if (!depth && (i === 0 || /\s/.test(s[i - 1]))) {
			const m = s.slice(i).match(/^(from|by|via|with|id|for)\s/i);
			if (m) {
				close(i);
				key = m[1].toLowerCase() as ClauseKey;
				start = i + m[0].length;
				i += m[0].length - 1;
			}
		}
	}
	close(s.length);
	return out;
}

const ipInBrackets = /\[(?:IPv6:)?([0-9A-Fa-f:.]+)\]/;
const bareIpv4 = /\b((?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3})\b/;

export function parseReceived(value: string): Omit<Hop, 'n'> {
	// The date follows the last semicolon outside comments.
	const parts = splitTop(value, ';');
	const dateRaw = parts.length > 1 ? parts[parts.length - 1].trim() : undefined;
	const trace = parts.length > 1 ? parts.slice(0, -1).join(';') : value;
	const cl = receivedClauses(trace);
	const hop: Omit<Hop, 'n'> = {
		raw: value,
		dateRaw,
		date: dateRaw ? parseMailDate(dateRaw) : null
	};
	if (cl.from) {
		const { text, comments } = stripComments(cl.from);
		hop.from = text.split(' ')[0] || undefined;
		const info = comments.join(' ');
		if (info) hop.fromInfo = info;
		const ip = cl.from.match(ipInBrackets) ?? info.match(bareIpv4) ?? text.match(bareIpv4);
		if (ip) hop.fromIp = ip[1];
	}
	for (const k of ['by', 'with', 'id', 'via'] as const)
		if (cl[k]) hop[k] = stripComments(cl[k]!).text.split(' ')[0] || undefined;
	if (cl.for) hop.for = stripComments(cl.for).text.replace(/^<|>$/g, '');
	return hop;
}

/** Delays above this many seconds are flagged as slow. */
export const SLOW_HOP = 300;

/** Received headers in the order the message travelled (bottom header first). */
export function hops(headers: Header[]): Hop[] {
	const list = all(headers, 'Received')
		.reverse()
		.map((h, i) => ({ n: i + 1, ...parseReceived(h.value) }) as Hop);
	let prev: number | undefined;
	for (const h of list) {
		if (!h.date) continue;
		if (prev !== undefined) {
			h.delay = (h.date.ms - prev) / 1000;
			if (h.delay < 0) h.flag = 'skew';
			else if (h.delay >= SLOW_HOP) h.flag = 'slow';
		}
		prev = h.date.ms;
	}
	return list;
}

export interface Transit {
	/** From the first to the last dated Received header, seconds. */
	total?: number;
	/** From the Date: header to the first dated Received header, seconds. */
	fromDate?: number;
}

export function transit(list: Hop[], date: MailDate | null): Transit {
	const dated = list.filter((h) => h.date);
	const t: Transit = {};
	if (dated.length >= 2) t.total = (dated[dated.length - 1].date!.ms - dated[0].date!.ms) / 1000;
	if (date && dated.length) t.fromDate = (dated[0].date!.ms - date.ms) / 1000;
	return t;
}

/* ------------------------------------------------------------------ */
/* Authentication-Results                                              */
/* ------------------------------------------------------------------ */

export interface AuthResult {
	method: string;
	version?: string;
	result: string;
	reason?: string;
	/** ptype.property=value pairs, e.g. header.d=example.com. */
	props: { key: string; value: string }[];
	comments: string[];
	explain: string;
}

export interface AuthResults {
	authserv: string;
	results: AuthResult[];
	raw: string;
	/** ARC instance, for ARC-Authentication-Results. */
	instance?: number;
}

/** Plain-language meaning of method results (RFC 8601 2.7, RFC 7208 2.6, RFC 6376, RFC 7489, RFC 8617). */
const explanations: Record<string, Record<string, string>> = {
	spf: {
		pass: 'The sending IP is allowed by the SPF record of the envelope sender domain.',
		fail: 'The envelope sender domain says this IP may not send for it.',
		softfail: 'The domain says this IP is probably not allowed (~all), but asks not to reject.',
		neutral: 'The domain makes no statement about this IP (?all).',
		none: 'No SPF record, or no domain to check.',
		temperror: 'Temporary DNS error during the SPF check.',
		permerror:
			'The SPF record is broken: bad syntax, more than 10 lookups, or more than one record.',
		policy: 'The result was overridden by local policy.'
	},
	dkim: {
		pass: 'A signature verified: the signed headers and body are unchanged since the d= domain signed them.',
		fail: 'A signature did not verify: the message changed in transit or the key does not match.',
		neutral: 'The signature could not be checked, for example because of a syntax error.',
		policy: 'The signature verified but local policy did not accept it, for example a weak key.',
		none: 'The message was not signed.',
		temperror: 'The public key could not be fetched (temporary DNS problem).',
		permerror: 'The signature is unusable: key missing in DNS, or malformed header.'
	},
	dmarc: {
		pass: 'SPF or DKIM passed for a domain aligned with the From: domain.',
		fail: 'Neither SPF nor DKIM passed for a domain aligned with From:. The domain policy (p=) applies.',
		none: 'The From: domain publishes no DMARC policy.',
		temperror: 'Temporary error looking up the DMARC policy.',
		permerror: 'The DMARC record could not be read.',
		bestguesspass: 'No DMARC record, but the message would have passed if there were one.'
	},
	arc: {
		pass: 'The ARC chain is intact: earlier hops recorded their results and nothing broke the seals.',
		fail: 'The ARC chain is broken: a seal does not verify or a set is missing.',
		none: 'No ARC headers were present.'
	},
	iprev: {
		pass: 'The reverse DNS name of the sending IP resolves back to that IP.',
		fail: 'The reverse DNS name of the sending IP does not resolve back to it.',
		temperror: 'Temporary DNS error during the reverse check.',
		permerror: 'No reverse DNS name for the sending IP.'
	},
	auth: {
		pass: 'The sender logged in with SMTP AUTH.',
		fail: 'SMTP AUTH failed.',
		none: 'No SMTP AUTH was used.'
	},
	'dkim-atps': {
		pass: 'The third-party DKIM signer is authorised by the From: domain (RFC 6541).'
	},
	bimi: {
		pass: 'A BIMI logo record was found and the message qualifies for logo display.',
		none: 'No BIMI record.',
		fail: 'BIMI checks failed, no logo is shown.',
		skipped: 'BIMI was not evaluated, usually because DMARC policy is not enforcing.'
	}
};

export function explainResult(method: string, result: string): string {
	const m = explanations[method.toLowerCase()];
	const r = result.toLowerCase();
	if (m?.[r]) return m[r];
	const generic: Record<string, string> = {
		pass: 'The check passed.',
		fail: 'The check failed.',
		none: 'Nothing to check.',
		neutral: 'No definite result.',
		temperror: 'Temporary error, the check may succeed later.',
		permerror: 'Permanent error, the check cannot succeed.',
		policy: 'Overridden by local policy.',
		softfail: 'Weak fail.'
	};
	return generic[r] ?? 'Result not defined for this method.';
}

/** Parses an Authentication-Results value (RFC 8601 section 2.2). */
export function parseAuthResults(value: string): AuthResults {
	const pieces = splitTop(value, ';');
	const head = stripComments(pieces[0]).text;
	const authserv = head.split(' ')[0] ?? '';
	const results: AuthResult[] = [];
	for (const piece of pieces.slice(1)) {
		const { text, comments } = stripComments(piece);
		if (!text || /^none$/i.test(text)) continue;
		const tokens = tokenize(text);
		const first = tokens.shift() ?? '';
		const m = first.match(/^([A-Za-z0-9_.-]+)(?:\/(\d+))?=(.*)$/);
		if (!m) continue;
		const r: AuthResult = {
			method: m[1].toLowerCase(),
			version: m[2],
			result: unquote(m[3]).toLowerCase(),
			props: [],
			comments,
			explain: ''
		};
		for (const t of tokens) {
			const kv = t.match(/^([^=]+)=(.*)$/);
			if (!kv) continue;
			if (kv[1].toLowerCase() === 'reason') r.reason = unquote(kv[2]);
			else r.props.push({ key: kv[1].toLowerCase(), value: unquote(kv[2]) });
		}
		r.explain = explainResult(r.method, r.result);
		results.push(r);
	}
	return { authserv, results, raw: value };
}

function tokenize(s: string): string[] {
	const out: string[] = [];
	let cur = '';
	let quoted = false;
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (c === '\\' && quoted && i + 1 < s.length) {
			cur += c + s[i + 1];
			i++;
		} else if (c === '"') {
			quoted = !quoted;
			cur += c;
		} else if (/\s/.test(c) && !quoted) {
			if (cur) out.push(cur);
			cur = '';
		} else cur += c;
	}
	if (cur) out.push(cur);
	// "key = value" with spaces around "=" -> join
	const joined: string[] = [];
	for (let i = 0; i < out.length; i++) {
		if (out[i + 1] === '=' && i + 2 < out.length) {
			joined.push(`${out[i]}=${out[i + 2]}`);
			i += 2;
		} else if (out[i].endsWith('=') && i + 1 < out.length && !out[i + 1].includes('=')) {
			joined.push(out[i] + out[i + 1]);
			i++;
		} else joined.push(out[i]);
	}
	return joined;
}

function unquote(s: string): string {
	return s.startsWith('"') && s.endsWith('"') && s.length >= 2
		? s.slice(1, -1).replace(/\\(.)/g, '$1')
		: s;
}

/* ------------------------------------------------------------------ */
/* Received-SPF                                                        */
/* ------------------------------------------------------------------ */

export interface ReceivedSpf {
	result: string;
	comment?: string;
	pairs: { key: string; value: string }[];
	explain: string;
}

export function parseReceivedSpf(value: string): ReceivedSpf {
	const m = value.trim().match(/^([A-Za-z]+)\s*(.*)$/s);
	const result = (m?.[1] ?? '').toLowerCase();
	const rest = m?.[2] ?? '';
	const { text, comments } = stripComments(rest);
	const pairs: { key: string; value: string }[] = [];
	for (const p of splitTop(text, ';')) {
		const kv = p.trim().match(/^([A-Za-z0-9_.-]+)\s*=\s*(.*)$/);
		if (kv) pairs.push({ key: kv[1].toLowerCase(), value: unquote(kv[2].trim()) });
	}
	return {
		result,
		comment: comments.join(' ') || undefined,
		pairs,
		explain: explainResult('spf', result)
	};
}

/* ------------------------------------------------------------------ */
/* DKIM-Signature and ARC tag lists                                    */
/* ------------------------------------------------------------------ */

/** Parses a tag=value list (RFC 6376 3.2). Whitespace is removed from b, bh and h values. */
export function tagList(value: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const p of value.split(';')) {
		const eq = p.indexOf('=');
		if (eq < 0) continue;
		const k = p.slice(0, eq).trim().toLowerCase();
		let v = p.slice(eq + 1).trim();
		if (['b', 'bh', 'h'].includes(k)) v = v.replace(/\s+/g, '');
		if (k && !(k in out)) out[k] = v;
	}
	return out;
}

export interface DkimSig {
	tags: Record<string, string>;
	domain?: string;
	selector?: string;
	algorithm?: string;
	signedHeaders: string[];
	/** DNS name of the public key: selector._domainkey.domain */
	keyName?: string;
	/** Signature length in bits (from the base64 b= value). */
	bits?: number;
	signedAt?: number;
	expires?: number;
	warnings: string[];
}

export function parseDkim(value: string, fromDomain?: string, now?: number): DkimSig {
	const tags = tagList(value);
	const sig: DkimSig = {
		tags,
		domain: tags.d?.toLowerCase(),
		selector: tags.s,
		algorithm: tags.a?.toLowerCase(),
		signedHeaders: tags.h ? tags.h.split(':').filter(Boolean) : [],
		warnings: []
	};
	if (sig.domain && sig.selector) sig.keyName = `${sig.selector}._domainkey.${sig.domain}`;
	if (tags.b) sig.bits = Math.floor((tags.b.replace(/=+$/, '').length * 6) / 8) * 8;
	if (/^\d+$/.test(tags.t ?? '')) sig.signedAt = Number(tags.t);
	if (/^\d+$/.test(tags.x ?? '')) sig.expires = Number(tags.x);
	for (const t of ['v', 'a', 'b', 'bh', 'd', 'h', 's'])
		if (!(t in tags)) sig.warnings.push(`Required tag ${t}= is missing`);
	if (sig.algorithm === 'rsa-sha1')
		sig.warnings.push('rsa-sha1 is no longer accepted by verifiers (RFC 8301)');
	if (sig.bits !== undefined && sig.algorithm?.startsWith('rsa') && sig.bits < 1024)
		sig.warnings.push(
			`${sig.bits}-bit RSA key: verifiers must reject keys under 1024 bits (RFC 8301)`
		);
	if (sig.signedHeaders.length && !sig.signedHeaders.some((h) => h.toLowerCase() === 'from'))
		sig.warnings.push('From is not in h=: the signature is invalid (RFC 6376 5.4)');
	if ('l' in tags)
		sig.warnings.push(
			`l=${tags.l} limits the signed body length: anyone can append content without breaking the signature`
		);
	if (sig.expires !== undefined && now !== undefined && sig.expires < now)
		sig.warnings.push('The signature had expired (x=) when the message was dated');
	if (fromDomain && sig.domain && !relaxedAligned(sig.domain, fromDomain))
		sig.warnings.push(
			`d=${sig.domain} is not aligned with the From: domain ${fromDomain}, so this signature cannot make DMARC pass`
		);
	return sig;
}

export interface ArcSet {
	instance: number;
	seal?: Record<string, string>;
	signature?: Record<string, string>;
	results?: AuthResults;
	warnings: string[];
}

export function arcSets(headers: Header[]): { sets: ArcSet[]; warnings: string[] } {
	const map = new Map<number, ArcSet>();
	const get = (i: number) => {
		if (!map.has(i)) map.set(i, { instance: i, warnings: [] });
		return map.get(i)!;
	};
	const inst = (v: string) => {
		const m = v.match(/(?:^|;)\s*i\s*=\s*(\d+)/);
		return m ? Number(m[1]) : NaN;
	};
	const warnings: string[] = [];
	for (const h of headers) {
		const n = h.name.toLowerCase();
		if (!n.startsWith('arc-')) continue;
		const i = inst(h.value);
		if (!Number.isFinite(i)) {
			warnings.push(`${h.name} without i= tag`);
			continue;
		}
		if (n === 'arc-seal') get(i).seal = tagList(h.value);
		else if (n === 'arc-message-signature') get(i).signature = tagList(h.value);
		else if (n === 'arc-authentication-results') {
			const rest = h.value.replace(/^\s*i\s*=\s*\d+\s*;/, '');
			get(i).results = { ...parseAuthResults(rest), instance: i };
		}
	}
	const sets = [...map.values()].sort((a, b) => a.instance - b.instance);
	sets.forEach((s, k) => {
		if (s.instance !== k + 1)
			warnings.push(`ARC instances are not 1, 2, 3...: found i=${s.instance}`);
		if (!s.seal) s.warnings.push('ARC-Seal missing');
		if (!s.signature) s.warnings.push('ARC-Message-Signature missing');
		if (!s.results) s.warnings.push('ARC-Authentication-Results missing');
		const cv = s.seal?.cv?.toLowerCase();
		if (cv === 'fail') s.warnings.push('cv=fail: this hop found the chain already broken');
		else if (s.instance === 1 && cv && cv !== 'none')
			s.warnings.push('The first set must have cv=none');
		else if (s.instance > 1 && cv && cv !== 'pass') s.warnings.push('Later sets must have cv=pass');
	});
	if (sets.length > 50) warnings.push('More than 50 ARC sets: the chain is invalid (RFC 8617)');
	return { sets, warnings };
}

/* ------------------------------------------------------------------ */
/* Addresses                                                           */
/* ------------------------------------------------------------------ */

export interface Address {
	display?: string;
	address: string;
	domain?: string;
}

/** Reads the first mailbox of an address header. */
export function parseAddress(value: string): Address | null {
	const decoded = value.trim();
	if (!decoded) return null;
	const angle = decoded.match(/^(.*)<([^<>]*)>\s*(?:\(.*\))?\s*$/s);
	let display: string | undefined;
	let address: string;
	if (angle) {
		display =
			decodeWords(
				stripComments(angle[1])
					.text.replace(/^"(.*)"$/s, '$1')
					.replace(/\\(.)/g, '$1')
			).trim() || undefined;
		address = angle[2].trim();
	} else {
		const { text, comments } = stripComments(decoded);
		address = text.split(/[\s,]/)[0];
		if (comments.length) display = decodeWords(comments.join(' '));
	}
	const at = address.lastIndexOf('@');
	const domain =
		at > 0
			? address
					.slice(at + 1)
					.toLowerCase()
					.replace(/\.$/, '')
			: undefined;
	return { display, address, domain };
}

/* ------------------------------------------------------------------ */
/* Whole analysis                                                      */
/* ------------------------------------------------------------------ */

export type Level = 'error' | 'warn' | 'info';
export interface Finding {
	level: Level;
	text: string;
}

export interface Analysis {
	headers: Header[];
	skipped: string[];
	subject?: string;
	date?: { raw: string; parsed: MailDate | null };
	from?: Address;
	replyTo?: Address;
	returnPath?: Address;
	sender?: Address;
	to?: string;
	messageId?: { raw: string; domain?: string };
	hops: Hop[];
	transit: Transit;
	auth: AuthResults[];
	receivedSpf: ReceivedSpf[];
	dkim: DkimSig[];
	arc: { sets: ArcSet[]; warnings: string[] };
	originatingIp?: string;
	xHeaders: Header[];
	findings: Finding[];
}

export function analyse(raw: string): Analysis {
	const { headers, skipped } = parseHeaders(raw);
	if (!headers.length)
		throw new Error(
			'No header lines found. Paste the raw headers, starting with a line like "Received: ..."'
		);
	const findings: Finding[] = [];
	const get = (n: string) => first(headers, n)?.value;

	const fromAll = all(headers, 'From');
	const from = fromAll[0] ? (parseAddress(fromAll[0].value) ?? undefined) : undefined;
	const replyTo = get('Reply-To') ? (parseAddress(get('Reply-To')!) ?? undefined) : undefined;
	const rp = all(headers, 'Return-Path');
	const returnPath = rp[0] ? (parseAddress(rp[0].value) ?? undefined) : undefined;
	const sender = get('Sender') ? (parseAddress(get('Sender')!) ?? undefined) : undefined;
	const dateRaw = get('Date');
	const date = dateRaw ? { raw: dateRaw, parsed: parseMailDate(dateRaw) } : undefined;
	const midRaw = get('Message-ID');
	const messageId = midRaw
		? { raw: midRaw, domain: midRaw.match(/@([^>\s]+)>?\s*$/)?.[1]?.toLowerCase() }
		: undefined;

	const hopList = hops(headers);
	const tr = transit(hopList, date?.parsed ?? null);
	const auth = all(headers, 'Authentication-Results').map((h) => parseAuthResults(h.value));
	const receivedSpf = all(headers, 'Received-SPF').map((h) => parseReceivedSpf(h.value));
	const dkim = all(headers, 'DKIM-Signature').map((h) =>
		parseDkim(h.value, from?.domain, date?.parsed ? date.parsed.ms / 1000 : undefined)
	);
	const arc = arcSets(headers);
	const xHeaders = headers.filter((h) => /^x-/i.test(h.name));
	const xoip = xHeaders.find((h) => /^x-originating-ip$/i.test(h.name));

	if (fromAll.length > 1)
		findings.push({
			level: 'error',
			text: `${fromAll.length} From: headers: a classic spoofing trick, most receivers reject this`
		});
	if (!from) findings.push({ level: 'warn', text: 'No From: header' });
	if (from?.display) {
		const inName = from.display.match(/[^\s<>"@]+@[^\s<>"@]+\.[A-Za-z]{2,}/);
		if (inName && inName[0].toLowerCase() !== from.address.toLowerCase())
			findings.push({
				level: 'warn',
				text: `The From: display name shows ${inName[0]}, but the real address is ${from.address}`
			});
	}
	if (from?.domain && replyTo?.domain && !relaxedAligned(from.domain, replyTo.domain))
		findings.push({
			level: 'warn',
			text: `Replies go to ${replyTo.address}, a different domain than From: (${from.domain}). Common in phishing, also used by mailing lists and helpdesks.`
		});
	if (returnPath && !returnPath.address)
		findings.push({ level: 'info', text: 'Null Return-Path <>: this is a bounce or auto-reply' });
	else if (from?.domain && returnPath?.domain && from.domain !== returnPath.domain)
		findings.push({
			level: relaxedAligned(from.domain, returnPath.domain) ? 'info' : 'warn',
			text: relaxedAligned(from.domain, returnPath.domain)
				? `Return-Path ${returnPath.domain} is a subdomain or parent of From: ${from.domain}: aligned under relaxed SPF alignment`
				: `Return-Path domain ${returnPath.domain} differs from From: ${from.domain}. Normal for mailing services, but SPF then cannot make DMARC pass, only DKIM can.`
		});
	if (rp.length > 1)
		findings.push({ level: 'info', text: `${rp.length} Return-Path headers, the top one counts` });
	if (from?.domain && sender?.domain && !relaxedAligned(from.domain, sender.domain))
		findings.push({
			level: 'info',
			text: `Sent on behalf of ${from.address} by ${sender.address} (Sender:)`
		});
	if (from?.domain && messageId?.domain && !relaxedAligned(from.domain, messageId.domain))
		findings.push({
			level: 'info',
			text: `Message-ID domain ${messageId.domain} differs from From: ${from.domain}: shows which system created the message`
		});
	if (!messageId) findings.push({ level: 'info', text: 'No Message-ID header' });
	if (!hopList.length)
		findings.push({
			level: 'info',
			text: 'No Received headers: these may not be the full headers'
		});
	for (const h of hopList) {
		if (h.flag === 'slow')
			findings.push({
				level: 'warn',
				text: `Hop ${h.n} took ${formatDuration(h.delay!)} (queued or greylisted)`
			});
		if (h.flag === 'skew')
			findings.push({
				level: 'info',
				text: `Hop ${h.n} is dated ${formatDuration(-h.delay!)} before the previous one: clocks out of sync`
			});
	}
	if (tr.fromDate !== undefined && tr.fromDate < -300)
		findings.push({
			level: 'info',
			text: 'The Date: header is later than the first Received: the sender clock is ahead, or Date: was set by hand'
		});
	for (const a of auth)
		for (const r of a.results)
			if (
				['dmarc', 'spf', 'dkim'].includes(r.method) &&
				['fail', 'permerror', 'softfail'].includes(r.result)
			)
				findings.push({
					level: 'warn',
					text: `${a.authserv || 'Receiver'}: ${r.method}=${r.result}`
				});
	for (const d of dkim)
		for (const w of d.warnings)
			findings.push({ level: 'warn', text: `DKIM ${d.domain ?? ''}: ${w}` });
	for (const w of arc.warnings) findings.push({ level: 'warn', text: w });

	return {
		headers,
		skipped,
		subject: get('Subject') !== undefined ? decodeWords(get('Subject')!) : undefined,
		date,
		from,
		replyTo,
		returnPath,
		sender,
		to: get('To') !== undefined ? decodeWords(get('To')!) : undefined,
		messageId,
		hops: hopList,
		transit: tr,
		auth,
		receivedSpf,
		dkim,
		arc,
		originatingIp: xoip?.value.replace(/^\[|\]$/g, ''),
		xHeaders,
		findings
	};
}

/** Raw headers: at least one Received: line and two other header lines. */
export function looksLikeHeaders(input: string): number {
	if (input.length < 30) return 0;
	const sample = input.slice(0, 20000);
	if (!/^Received:\s/im.test(sample)) return 0;
	const lines = sample.match(/^[A-Za-z][A-Za-z0-9-]*:\s/gm) ?? [];
	return lines.length >= 3 ? 0.9 : 0;
}
