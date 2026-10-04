import { analyse, reverseDns } from '../ip/logic';

/* ------------------------------------------------------------------ */
/* Resolvers                                                           */
/* ------------------------------------------------------------------ */

export type ResolverId = 'cloudflare' | 'google';

export interface Resolver {
	id: ResolverId;
	label: string;
	host: string;
	/** Base endpoint for the JSON API. */
	endpoint: string;
	/** Extra request headers. Cloudflare needs the JSON media type, Google ignores it. */
	headers: Record<string, string>;
}

export const resolvers: Record<ResolverId, Resolver> = {
	cloudflare: {
		id: 'cloudflare',
		label: 'Cloudflare',
		host: 'cloudflare-dns.com',
		endpoint: 'https://cloudflare-dns.com/dns-query',
		headers: { accept: 'application/dns-json' }
	},
	google: {
		id: 'google',
		label: 'Google',
		host: 'dns.google',
		endpoint: 'https://dns.google/resolve',
		headers: {}
	}
};

/** The only hosts this tool ever contacts. Must match meta.network and scripts/csp.js. */
export const allowedHosts = Object.values(resolvers).map((r) => r.host);

/* ------------------------------------------------------------------ */
/* Record types and response codes                                     */
/* ------------------------------------------------------------------ */

/** Types offered in the picker, in display order. */
export const queryTypes = [
	'A',
	'AAAA',
	'CNAME',
	'MX',
	'TXT',
	'NS',
	'SOA',
	'CAA',
	'SRV',
	'PTR',
	'DS',
	'DNSKEY',
	'TLSA',
	'HTTPS',
	'SVCB'
] as const;

export type QueryType = (typeof queryTypes)[number];
export type TypeChoice = QueryType | 'ALL';

/** The set run by "ALL common". */
export const commonTypes: QueryType[] = ['A', 'AAAA', 'MX', 'TXT', 'NS', 'CAA', 'SOA'];

/** IANA DNS RR TYPE numbers (the ones a resolver is likely to return). */
const typeNumbers: Record<number, string> = {
	1: 'A',
	2: 'NS',
	5: 'CNAME',
	6: 'SOA',
	12: 'PTR',
	13: 'HINFO',
	15: 'MX',
	16: 'TXT',
	17: 'RP',
	18: 'AFSDB',
	24: 'SIG',
	25: 'KEY',
	28: 'AAAA',
	29: 'LOC',
	33: 'SRV',
	35: 'NAPTR',
	36: 'KX',
	37: 'CERT',
	39: 'DNAME',
	41: 'OPT',
	42: 'APL',
	43: 'DS',
	44: 'SSHFP',
	45: 'IPSECKEY',
	46: 'RRSIG',
	47: 'NSEC',
	48: 'DNSKEY',
	49: 'DHCID',
	50: 'NSEC3',
	51: 'NSEC3PARAM',
	52: 'TLSA',
	53: 'SMIMEA',
	55: 'HIP',
	59: 'CDS',
	60: 'CDNSKEY',
	61: 'OPENPGPKEY',
	62: 'CSYNC',
	63: 'ZONEMD',
	64: 'SVCB',
	65: 'HTTPS',
	99: 'SPF',
	108: 'EUI48',
	109: 'EUI64',
	249: 'TKEY',
	250: 'TSIG',
	251: 'IXFR',
	252: 'AXFR',
	255: 'ANY',
	256: 'URI',
	257: 'CAA',
	32768: 'TA',
	32769: 'DLV'
};

/** Type name for a number, or the RFC 3597 form TYPE1234 for unknown ones. */
export function typeName(n: number): string {
	return typeNumbers[n] ?? `TYPE${n}`;
}

const rcodes: Record<number, [string, string]> = {
	0: ['NOERROR', 'No error'],
	1: ['FORMERR', 'Format error: the resolver could not read the query'],
	2: ['SERVFAIL', 'Server failure: the resolver could not get an answer (often a DNSSEC failure)'],
	3: ['NXDOMAIN', 'Name does not exist'],
	4: ['NOTIMP', 'Not implemented'],
	5: ['REFUSED', 'Query refused'],
	6: ['YXDOMAIN', 'Name exists when it should not'],
	7: ['YXRRSET', 'RR set exists when it should not'],
	8: ['NXRRSET', 'RR set that should exist does not'],
	9: ['NOTAUTH', 'Server not authoritative for zone'],
	10: ['NOTZONE', 'Name not contained in zone'],
	11: ['DSOTYPENI', 'DSO-TYPE not implemented'],
	16: ['BADVERS', 'Bad OPT version'],
	17: ['BADKEY', 'Key not recognized'],
	18: ['BADTIME', 'Signature out of time window'],
	19: ['BADMODE', 'Bad TKEY mode'],
	20: ['BADNAME', 'Duplicate key name'],
	21: ['BADALG', 'Algorithm not supported'],
	22: ['BADTRUNC', 'Bad truncation'],
	23: ['BADCOOKIE', 'Bad or missing server cookie']
};

export function rcodeName(n: number): string {
	return rcodes[n]?.[0] ?? `RCODE${n}`;
}

export function rcodeText(n: number): string {
	return rcodes[n]?.[1] ?? 'Unassigned response code';
}

/* ------------------------------------------------------------------ */
/* Formatting helpers                                                  */
/* ------------------------------------------------------------------ */

/** 3900 -> "1h 5m", 86400 -> "1d", 0 -> "0s". */
export function formatTtl(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds < 0) return '';
	let s = Math.floor(seconds);
	if (s === 0) return '0s';
	const parts: string[] = [];
	for (const [unit, size] of [
		['d', 86400],
		['h', 3600],
		['m', 60],
		['s', 1]
	] as const) {
		const n = Math.floor(s / size);
		if (n) parts.push(`${n}${unit}`);
		s -= n * size;
	}
	return parts.join(' ');
}

/**
 * Splits presentation-format character-strings into their decoded values.
 * `"v=spf1 " "-all"` -> ['v=spf1 ', '-all']. Handles \" \\ and \DDD (a byte, decimal),
 * and decodes the bytes as UTF-8. Data that is not quoted is returned as one string.
 */
export function txtStrings(data: string): string[] {
	const s = data.trim();
	if (!s.startsWith('"')) return [s];
	const out: string[] = [];
	const enc = new TextEncoder();
	const dec = new TextDecoder();
	let i = 0;
	while (i < s.length) {
		while (s[i] === ' ' || s[i] === '\t') i++;
		if (i >= s.length) break;
		if (s[i] !== '"') {
			let j = i;
			while (j < s.length && s[j] !== ' ' && s[j] !== '\t') j++;
			out.push(s.slice(i, j));
			i = j;
			continue;
		}
		i++;
		const bytes: number[] = [];
		while (i < s.length && s[i] !== '"') {
			if (s[i] === '\\' && i + 1 < s.length) {
				const d = s.slice(i + 1, i + 4);
				if (/^\d{3}$/.test(d) && Number(d) < 256) {
					bytes.push(Number(d));
					i += 4;
				} else {
					const cp = s.codePointAt(i + 1)!;
					const ch = String.fromCodePoint(cp);
					bytes.push(...enc.encode(ch));
					i += 1 + ch.length;
				}
			} else {
				const ch = String.fromCodePoint(s.codePointAt(i)!);
				bytes.push(...enc.encode(ch));
				i += ch.length;
			}
		}
		i++; // closing quote
		out.push(dec.decode(new Uint8Array(bytes)));
	}
	return out;
}

/** TXT record value as a mail server sees it: strings concatenated without separator. */
export function unquoteTxt(data: string): string {
	return txtStrings(data).join('');
}

export type TxtKind = 'SPF' | 'DMARC' | 'DKIM' | 'BIMI' | 'MTA-STS' | 'TLS-RPT';

/** Recognises the common mail policy records stored in TXT. */
export function classifyTxt(text: string, owner = ''): TxtKind | undefined {
	const t = text.trim();
	if (/^v=spf1(\s|$)/i.test(t)) return 'SPF';
	if (/^v=DMARC1\s*(;|$)/i.test(t)) return 'DMARC';
	if (/^v=DKIM1\s*(;|$)/i.test(t)) return 'DKIM';
	if (/\._domainkey\./i.test(owner) && /(^|;)\s*p=/.test(t)) return 'DKIM';
	if (/^v=BIMI1\s*(;|$)/i.test(t)) return 'BIMI';
	if (/^v=STSv1\s*(;|$)/i.test(t)) return 'MTA-STS';
	if (/^v=TLSRPTv1\s*(;|$)/i.test(t)) return 'TLS-RPT';
	return undefined;
}

/** Decodes RFC 3597 generic RDATA, `\# 4 0a000001`, into bytes. */
export function genericRdata(data: string): Uint8Array | null {
	const m = data.trim().match(/^\\#\s+(\d+)\s*([0-9a-fA-F\s]*)$/);
	if (!m) return null;
	const hex = m[2].replace(/\s/g, '');
	const len = Number(m[1]);
	if (hex.length !== len * 2) return null;
	const out = new Uint8Array(len);
	for (let i = 0; i < len; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	return out;
}

export interface Caa {
	flags: number;
	tag: string;
	value: string;
}

/** CAA in presentation form (`0 issue "letsencrypt.org"`) or generic form. */
export function parseCaa(data: string): Caa | null {
	const bytes = genericRdata(data);
	if (bytes) {
		if (bytes.length < 2 || bytes.length < 2 + bytes[1]) return null;
		const dec = new TextDecoder();
		return {
			flags: bytes[0],
			tag: dec.decode(bytes.subarray(2, 2 + bytes[1])),
			value: dec.decode(bytes.subarray(2 + bytes[1]))
		};
	}
	const m = data.trim().match(/^(\d{1,3})\s+([A-Za-z0-9]+)\s+(.*)$/s);
	if (!m) return null;
	return { flags: Number(m[1]), tag: m[2], value: unquoteTxt(m[3]) };
}

export interface Mx {
	preference: number;
	exchange: string;
}

export function parseMx(data: string): Mx | null {
	const m = data.trim().match(/^(\d{1,5})\s+(\S+)$/);
	return m ? { preference: Number(m[1]), exchange: m[2] } : null;
}

/* ------------------------------------------------------------------ */
/* Query preparation                                                   */
/* ------------------------------------------------------------------ */

/** Returns the reverse lookup name for a bare IPv4 or IPv6 address, or null. */
export function reverseName(input: string): string | null {
	const t = input.trim();
	if (!t || t.includes('/')) return null;
	if (!t.includes(':') && !/^\d{1,3}(\.\d{1,3}){3}$/.test(t)) return null;
	try {
		const r = analyse(t);
		return reverseDns(r.version, r.value);
	} catch {
		return null;
	}
}

export function isIpAddress(input: string): boolean {
	return reverseName(input) !== null;
}

/**
 * Turns user input into a query name: strips a URL down to its host, converts
 * international names to punycode (A-labels) and checks label lengths.
 */
export function normaliseName(input: string): string {
	let s = input.trim();
	if (!s) throw new Error('Enter a domain name or an IP address');
	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
		try {
			s = new URL(s).hostname;
		} catch {
			throw new Error('Could not read a host name from that URL');
		}
		if (s.startsWith('[')) s = s.slice(1, -1);
	}
	if (/\s/.test(s)) throw new Error('A domain name cannot contain spaces');
	if (s === '.') return s;
	const trailing = s.endsWith('.');
	let body = trailing ? s.slice(0, -1) : s;
	// eslint-disable-next-line no-control-regex
	if (/[^\x00-\x7f]/.test(body)) {
		try {
			body = new URL(`http://${body}/`).hostname;
		} catch {
			throw new Error('That international name cannot be converted to punycode');
		}
	}
	const labels = body.split('.');
	for (const l of labels) {
		if (l === '') throw new Error('Empty label: check for two dots in a row');
		if (l.length > 63) throw new Error(`Label "${l.slice(0, 20)}..." is longer than 63 characters`);
		if (!/^[A-Za-z0-9_*-]+$/.test(l)) {
			const c = l.match(/[^A-Za-z0-9_*-]/)![0];
			throw new Error(`Unexpected character "${c}" in name`);
		}
	}
	if (body.length > 253) throw new Error('Name is longer than 253 characters');
	return body + (trailing ? '.' : '');
}

export interface Query {
	name: string;
	type: QueryType;
}

export interface Plan {
	queries: Query[];
	/** Set when the input was an IP address and was turned into a reverse name. */
	reverseOf?: string;
	/** Set when the input was a URL and only its host is used. */
	fromUrl?: boolean;
}

/** What will be asked for a given input and type choice. Throws on invalid input. */
export function plan(input: string, choice: TypeChoice): Plan {
	const rev = reverseName(input);
	if (rev) return { queries: [{ name: rev, type: 'PTR' }], reverseOf: input.trim() };
	const name = normaliseName(input);
	const types = choice === 'ALL' ? commonTypes : [choice];
	const fromUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(input.trim()) || undefined;
	return { queries: types.map((type) => ({ name, type })), fromUrl };
}

/** The exact URL requested for one query. */
export function buildUrl(resolver: ResolverId, q: Query): string {
	const r = resolvers[resolver];
	const params = new URLSearchParams({ name: q.name, type: q.type });
	return `${r.endpoint}?${params.toString()}`;
}

/* ------------------------------------------------------------------ */
/* Response parsing                                                    */
/* ------------------------------------------------------------------ */

export interface DnsRecord {
	name: string;
	type: number;
	typeName: string;
	ttl: number;
	/** Raw data string as returned by the resolver. */
	data: string;
	/** Data prepared for display (TXT unquoted, generic CAA decoded). */
	display: string;
	txtKind?: TxtKind;
	mx?: Mx;
	caa?: Caa;
}

export interface Flags {
	/** Answer validated with DNSSEC by the resolver. */
	AD: boolean;
	/** Truncated. */
	TC: boolean;
	/** Recursion desired. */
	RD: boolean;
	/** Recursion available. */
	RA: boolean;
	/** Checking disabled (DNSSEC validation switched off by the client). */
	CD: boolean;
}

export interface DnsAnswer {
	status: number;
	statusName: string;
	statusText: string;
	flags: Flags;
	question: { name: string; type: string }[];
	answer: DnsRecord[];
	authority: DnsRecord[];
	additional: DnsRecord[];
	comment?: string;
}

function record(raw: unknown): DnsRecord | null {
	if (!raw || typeof raw !== 'object') return null;
	const r = raw as Record<string, unknown>;
	if (typeof r.name !== 'string' || typeof r.type !== 'number') return null;
	const data = typeof r.data === 'string' ? r.data : '';
	const ttl = typeof r.TTL === 'number' ? r.TTL : 0;
	const rec: DnsRecord = {
		name: r.name,
		type: r.type,
		typeName: typeName(r.type),
		ttl,
		data,
		display: data
	};
	if (r.type === 16 || r.type === 99) {
		rec.display = unquoteTxt(data);
		rec.txtKind = classifyTxt(rec.display, r.name);
	} else if (r.type === 15) {
		rec.mx = parseMx(data) ?? undefined;
	} else if (r.type === 257) {
		rec.caa = parseCaa(data) ?? undefined;
		if (rec.caa) rec.display = `${rec.caa.flags} ${rec.caa.tag} "${rec.caa.value}"`;
	}
	return rec;
}

function records(raw: unknown): DnsRecord[] {
	if (!Array.isArray(raw)) return [];
	return raw.map(record).filter((r): r is DnsRecord => r !== null);
}

/** MX records ordered by preference; everything else keeps the resolver's order. */
export function sortMx(list: DnsRecord[]): DnsRecord[] {
	const mx = list
		.filter((r) => r.mx)
		.sort((a, b) => a.mx!.preference - b.mx!.preference || a.data.localeCompare(b.data));
	let k = 0;
	return list.map((r) => (r.mx ? mx[k++] : r));
}

/** Parses the DoH JSON format shared by Cloudflare and Google. */
export function parseResponse(json: unknown): DnsAnswer {
	if (!json || typeof json !== 'object' || Array.isArray(json))
		throw new Error('The resolver answered with something that is not DNS JSON');
	const j = json as Record<string, unknown>;
	if (typeof j.Status !== 'number')
		throw new Error('The resolver answer has no Status field, so it is not DNS JSON');
	const flag = (k: string) => j[k] === true;
	const question = Array.isArray(j.Question)
		? j.Question.filter(
				(q): q is { name: string; type: number } =>
					!!q && typeof q.name === 'string' && typeof q.type === 'number'
			).map((q) => ({ name: q.name, type: typeName(q.type) }))
		: [];
	const comment = Array.isArray(j.Comment)
		? j.Comment.join(' ')
		: typeof j.Comment === 'string'
			? j.Comment
			: undefined;
	return {
		status: j.Status,
		statusName: rcodeName(j.Status),
		statusText: rcodeText(j.Status),
		flags: { AD: flag('AD'), TC: flag('TC'), RD: flag('RD'), RA: flag('RA'), CD: flag('CD') },
		question,
		answer: sortMx(records(j.Answer)),
		authority: records(j.Authority),
		additional: records(j.Additional),
		comment: comment || undefined
	};
}

/* ------------------------------------------------------------------ */
/* Network client                                                      */
/* ------------------------------------------------------------------ */

/** The subset of fetch the client needs, so tests can inject a fake. */
export type FetchFn = (
	url: string,
	init: RequestInit
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export const TIMEOUT_MS = 8000;

export interface LookupResult {
	query: Query;
	url: string;
	resolver: Resolver;
	/** Milliseconds from request to parsed answer. */
	ms: number;
	answer?: DnsAnswer;
	error?: string;
}

export interface LookupOptions {
	fetchFn?: FetchFn;
	timeoutMs?: number;
	now?: () => number;
}

/** The fetch options used for every request. No cookies, no referrer, no cache, no redirects. */
export function requestInit(resolver: ResolverId, signal?: AbortSignal): RequestInit {
	return {
		method: 'GET',
		headers: { ...resolvers[resolver].headers },
		credentials: 'omit',
		referrerPolicy: 'no-referrer',
		cache: 'no-store',
		mode: 'cors',
		redirect: 'error',
		signal
	};
}

/**
 * One DoH request. Never throws: failures come back in `error`. Never retries.
 */
export async function lookup(
	resolverId: ResolverId,
	query: Query,
	opts: LookupOptions = {}
): Promise<LookupResult> {
	const resolver = resolvers[resolverId];
	const fetchFn: FetchFn = opts.fetchFn ?? ((u, i) => fetch(u, i));
	const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
	const now = opts.now ?? (() => performance.now());
	const url = buildUrl(resolverId, query);
	if (!allowedHosts.includes(new URL(url).host))
		throw new Error(`Refusing to contact ${new URL(url).host}`);
	const ctrl = new AbortController();
	let timedOut = false;
	const timer = setTimeout(() => {
		timedOut = true;
		ctrl.abort();
	}, timeoutMs);
	const start = now();
	const base = { query, url, resolver };
	try {
		const res = await fetchFn(url, requestInit(resolverId, ctrl.signal));
		if (!res.ok) {
			let detail = '';
			try {
				const body = (await res.json()) as Record<string, unknown> | null;
				if (body && typeof body.error === 'string') detail = `: ${body.error}`;
				else if (body && typeof body.Comment === 'string') detail = `: ${body.Comment}`;
			} catch {
				/* body is not JSON, keep the status alone */
			}
			return {
				...base,
				ms: now() - start,
				error: `${resolver.host} answered HTTP ${res.status}${detail}. The query was not resolved.`
			};
		}
		let json: unknown;
		try {
			json = await res.json();
		} catch {
			throw new Error(`${resolver.host} sent a body that is not JSON`);
		}
		return { ...base, ms: now() - start, answer: parseResponse(json) };
	} catch (e) {
		const ms = now() - start;
		const err = e as Error;
		if (timedOut || err?.name === 'AbortError' || err?.name === 'TimeoutError')
			return {
				...base,
				ms,
				error: `No answer from ${resolver.host} within ${timeoutMs / 1000} s. Nothing was retried.`
			};
		if (err instanceof TypeError)
			return {
				...base,
				ms,
				error: `The request to ${resolver.host} failed before an answer arrived. You may be offline, or a firewall, DNS filter or content blocker is blocking DNS over HTTPS. Try the other resolver.`
			};
		return { ...base, ms, error: err?.message ?? String(e) };
	} finally {
		clearTimeout(timer);
	}
}

/** Runs all queries of a plan in parallel against one resolver. */
export function lookupAll(
	resolverId: ResolverId,
	queries: Query[],
	opts: LookupOptions = {}
): Promise<LookupResult[]> {
	return Promise.all(queries.map((q) => lookup(resolverId, q, opts)));
}

/* ------------------------------------------------------------------ */
/* Intake detection                                                    */
/* ------------------------------------------------------------------ */

/**
 * Domain names such as example.com or sub.example.co.uk. Leaves URLs with a scheme
 * or path to the URL tool and IP addresses to the ip and cidr tools.
 */
export function looksLikeDomain(input: string): number {
	const t = input.trim().replace(/\.$/, '');
	if (!t || t.length > 253 || /[\s/:@?#=%]/.test(t)) return 0;
	if (!t.includes('.')) return 0;
	if (/^[\d.]+$/.test(t)) return 0;
	const labels = t.split('.');
	const tld = labels[labels.length - 1];
	if (!/^([a-z]{2,63}|xn--[a-z0-9-]{1,59})$/i.test(tld)) return 0;
	for (const l of labels) {
		if (!/^(?!-)[a-z0-9_-]{1,63}(?<!-)$/i.test(l)) return 0;
	}
	return 0.6;
}
