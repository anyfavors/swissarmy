/*
 * SPF records, RFC 7208.
 * Section 4.6.4 limits the terms that cause DNS queries (include, a, mx, ptr, exists, redirect)
 * to 10 per check, and "void lookups" (answers with no records, or NXDOMAIN) to 2.
 * Section 5.5 (ptr) says ptr SHOULD NOT be used.
 */
import {
	lookup,
	normaliseName,
	unquoteTxt,
	type FetchFn,
	type LookupResult,
	type ResolverId
} from '../dns/logic';

export type Qualifier = '+' | '-' | '~' | '?';

export const qualifierWords: Record<Qualifier, { result: string; text: string }> = {
	'+': { result: 'pass', text: 'allowed to send' },
	'-': { result: 'fail', text: 'not allowed, reject' },
	'~': { result: 'softfail', text: 'probably not allowed, accept but mark' },
	'?': { result: 'neutral', text: 'no statement' }
};

export const mechanismNames = ['all', 'include', 'a', 'mx', 'ptr', 'ip4', 'ip6', 'exists'] as const;
export type MechanismName = (typeof mechanismNames)[number];

/** Terms that cost one DNS lookup each against the limit of 10. */
export const lookupTerms = new Set(['include', 'a', 'mx', 'ptr', 'exists', 'redirect']);

export const LOOKUP_LIMIT = 10;
export const VOID_LIMIT = 2;

export interface Term {
	raw: string;
	kind: 'mechanism' | 'modifier';
	name: string;
	qualifier: Qualifier;
	/** Whether the qualifier was written out. */
	explicitQualifier: boolean;
	/** Domain-spec, address or modifier value. */
	value?: string;
	cidr4?: number;
	cidr6?: number;
	/** Plain-language meaning. */
	explain: string;
	error?: string;
	/** True when the term costs a DNS lookup. */
	lookup: boolean;
	/** The value contains SPF macros (%{...}) and is expanded per message. */
	macro?: boolean;
	/** Never reached because an earlier "all" always matches. */
	unreachable?: boolean;
}

export type Level = 'error' | 'warn' | 'info';
export interface Finding {
	level: Level;
	text: string;
}

export interface ParsedSpf {
	record: string;
	terms: Term[];
	findings: Finding[];
	/** Lookups this record itself costs (not counting nested includes). */
	lookups: number;
	redirect?: string;
	/** True when redirect= is present but ignored because the record has an all mechanism. */
	redirectIgnored?: boolean;
	hasAll: boolean;
}

function ipv4ok(s: string): boolean {
	const p = s.split('.');
	return p.length === 4 && p.every((x) => /^\d{1,3}$/.test(x) && Number(x) <= 255);
}

function ipv6ok(s: string): boolean {
	if (!/^[0-9a-fA-F:.]+$/.test(s) || !s.includes(':')) return false;
	const dbl = s.split('::');
	if (dbl.length > 2) return false;
	let groups = s
		.replace('::', ':x:')
		.split(':')
		.filter((g) => g !== '');
	const last = groups[groups.length - 1];
	let count = 0;
	if (last && last.includes('.')) {
		if (!ipv4ok(last)) return false;
		groups = groups.slice(0, -1);
		count += 2;
	}
	for (const g of groups) {
		if (g === 'x') continue;
		if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return false;
		count++;
	}
	return dbl.length === 2 ? count < 8 : count === 8;
}

function domainSpecError(d: string): string | undefined {
	if (!d) return 'Missing domain';
	if (/%\{/.test(d)) {
		const bad = d.replace(/%\{[slodiphcrtv]\d*r?[.\-+,/_=]*\}|%%|%_|%-/gi, '');
		if (bad.includes('%')) return 'Malformed macro';
		return undefined;
	}
	if (/\s/.test(d)) return 'Domain contains whitespace';
	if (!/^[A-Za-z0-9_.-]+\.?$/.test(d)) return 'Not a valid domain name';
	if (!d.includes('.')) return 'A domain needs at least one dot';
	return undefined;
}

const macroNote = 'contains macros (%{...}) that are filled in per message';

function explainTerm(t: Term): string {
	const q = qualifierWords[t.qualifier];
	const verdict = `${q.result}: ${q.text}`;
	const target = (fallback: string) => t.value ?? fallback;
	switch (t.name) {
		case 'all':
			return `Everything not matched before: ${verdict}.`;
		case 'include':
			return `If ${target('?')}'s SPF record passes for the sender: ${verdict}. Costs one lookup plus whatever that record costs.`;
		case 'a': {
			const c = cidrText(t);
			return `If the sender's IP is an A or AAAA address of ${target('the domain being checked')}${c}: ${verdict}.`;
		}
		case 'mx': {
			const c = cidrText(t);
			return `If the sender's IP is an address of one of the MX hosts of ${target('the domain being checked')}${c}: ${verdict}. Each MX host is looked up too (at most 10).`;
		}
		case 'ptr':
			return `If the sender's IP has reverse DNS ending in ${target('the domain being checked')} that resolves back: ${verdict}. Deprecated, slow, and many receivers skip it.`;
		case 'ip4':
		case 'ip6': {
			const len = t.name === 'ip4' ? t.cidr4 : t.cidr6;
			return `If the sender's IP is in ${t.value}${len !== undefined ? `/${len}` : ''}: ${verdict}. No lookup needed.`;
		}
		case 'exists':
			return `If ${target('?')} has any A record: ${verdict}. Usually used with macros for per-sender checks.`;
		case 'redirect':
			return `If nothing above matched, use the SPF record of ${t.value} instead (only when there is no all).`;
		case 'exp':
			return `On fail, receivers may fetch an explanation text from the TXT record of ${t.value}. Does not count against the lookup limit.`;
		default:
			return 'Unknown modifier: receivers ignore it.';
	}
}

function cidrText(t: Term): string {
	const parts: string[] = [];
	if (t.cidr4 !== undefined) parts.push(`IPv4 /${t.cidr4}`);
	if (t.cidr6 !== undefined) parts.push(`IPv6 /${t.cidr6}`);
	return parts.length ? ` (widened to ${parts.join(' and ')})` : '';
}

function parseTerm(raw: string): Term {
	let s = raw;
	let qualifier: Qualifier = '+';
	let explicitQualifier = false;
	if (/^[+\-~?]/.test(s)) {
		qualifier = s[0] as Qualifier;
		explicitQualifier = true;
		s = s.slice(1);
	}
	const mod = s.match(/^([A-Za-z][A-Za-z0-9_.-]*)=(.*)$/);
	if (mod && !explicitQualifier) {
		const name = mod[1].toLowerCase();
		const t: Term = {
			raw,
			kind: 'modifier',
			name,
			qualifier,
			explicitQualifier,
			value: mod[2],
			explain: '',
			lookup: name === 'redirect'
		};
		if (name === 'redirect' || name === 'exp') {
			t.error = domainSpecError(mod[2]);
			if (/%\{/.test(mod[2])) t.macro = true;
		}
		t.explain = explainTerm(t);
		return t;
	}
	const m = s.match(/^([A-Za-z][A-Za-z0-9_.-]*)(?::(.*?))?(?:\/(\d+))?(?:\/\/(\d+))?$/);
	const name = (m?.[1] ?? s).toLowerCase();
	const t: Term = {
		raw,
		kind: 'mechanism',
		name,
		qualifier,
		explicitQualifier,
		explain: '',
		lookup: lookupTerms.has(name)
	};
	if (!m || !(mechanismNames as readonly string[]).includes(name)) {
		t.error = mod
			? 'A modifier cannot have a qualifier'
			: `Unknown mechanism "${name}": the whole record is a permerror`;
		t.lookup = false;
		t.explain = 'Not understood.';
		return t;
	}
	const value = m[2];
	const c4 = m[3] !== undefined ? Number(m[3]) : undefined;
	const c6 = m[4] !== undefined ? Number(m[4]) : undefined;
	if (value !== undefined) t.value = value;
	switch (name) {
		case 'all':
			if (value !== undefined || c4 !== undefined || c6 !== undefined)
				t.error = 'all takes no argument';
			break;
		case 'include':
		case 'exists':
			if (c4 !== undefined || c6 !== undefined) t.error = `${name} takes no CIDR length`;
			else t.error = domainSpecError(value ?? '');
			break;
		case 'a':
		case 'mx':
		case 'ptr':
			if (value !== undefined) t.error = domainSpecError(value);
			if (name === 'ptr' && (c4 !== undefined || c6 !== undefined))
				t.error = 'ptr takes no CIDR length';
			if (c4 !== undefined) {
				if (c4 > 32) t.error = 'IPv4 prefix length must be 0 to 32';
				t.cidr4 = c4;
			}
			if (c6 !== undefined) {
				if (c6 > 128) t.error = 'IPv6 prefix length must be 0 to 128';
				t.cidr6 = c6;
			}
			break;
		case 'ip4':
			if (!value || !ipv4ok(value)) t.error = 'Needs an IPv4 address, e.g. ip4:192.0.2.0/24';
			else if (c6 !== undefined) t.error = 'ip4 takes an IPv4 prefix length only';
			else if (c4 !== undefined && c4 > 32) t.error = 'IPv4 prefix length must be 0 to 32';
			t.cidr4 = c4;
			break;
		case 'ip6': {
			// ip6 values contain colons, so the regex split may have cut them. Re-read the raw value.
			const r = s.slice(4).match(/^([^/]+)(?:\/(\d+))?$/);
			t.value = r?.[1];
			const len = r?.[2] !== undefined ? Number(r[2]) : undefined;
			t.cidr4 = undefined;
			t.cidr6 = len;
			if (!r || !ipv6ok(r[1])) t.error = 'Needs an IPv6 address, e.g. ip6:2001:db8::/32';
			else if (len !== undefined && len > 128) t.error = 'IPv6 prefix length must be 0 to 128';
			break;
		}
	}
	if (t.value && /%\{/.test(t.value)) t.macro = true;
	t.explain = explainTerm(t);
	return t;
}

/** Parses one SPF record. Throws when it is not an SPF record at all. */
export function parseSpf(input: string): ParsedSpf {
	let record = input.trim();
	if (record.startsWith('"')) record = unquoteTxt(record);
	record = record.trim();
	const words = record.split(/[ \t]+/).filter(Boolean);
	if (!words.length) throw new Error('Paste an SPF record (v=spf1 ...) or a domain name');
	if (words[0].toLowerCase() !== 'v=spf1')
		throw new Error(`An SPF record starts with v=spf1, this one starts with "${words[0]}"`);
	const findings: Finding[] = [];
	const terms = words.slice(1).map(parseTerm);
	let seenAll = false;
	for (const t of terms) {
		if (seenAll && t.kind === 'mechanism') t.unreachable = true;
		if (t.kind === 'mechanism' && t.name === 'all') seenAll = true;
	}
	const hasAll = terms.some((t) => t.name === 'all' && t.kind === 'mechanism');
	const redirects = terms.filter((t) => t.kind === 'modifier' && t.name === 'redirect');
	const exps = terms.filter((t) => t.kind === 'modifier' && t.name === 'exp');
	for (const t of terms)
		if (t.error) findings.push({ level: 'error', text: `${t.raw}: ${t.error}` });
	if (redirects.length > 1)
		findings.push({ level: 'error', text: 'redirect= appears more than once: permerror' });
	if (exps.length > 1)
		findings.push({ level: 'error', text: 'exp= appears more than once: permerror' });
	const redirectIgnored = hasAll && redirects.length > 0;
	if (redirectIgnored) {
		findings.push({
			level: 'warn',
			text: 'redirect= is ignored because the record has an all mechanism'
		});
		for (const r of redirects) r.lookup = false;
	}
	const allTerm = terms.find((t) => t.name === 'all' && t.kind === 'mechanism');
	if (allTerm && (allTerm.qualifier === '+' || allTerm.qualifier === '?'))
		findings.push({
			level: allTerm.qualifier === '+' ? 'error' : 'warn',
			text:
				allTerm.qualifier === '+'
					? `${allTerm.raw}: every server on the internet passes SPF for this domain`
					: `${allTerm.raw}: unknown senders get neutral, which protects nothing`
		});
	if (!hasAll && !redirects.length)
		findings.push({
			level: 'warn',
			text: 'No all and no redirect=: senders that match nothing get neutral. End with ~all or -all.'
		});
	if (terms.some((t) => t.name === 'ptr' && t.kind === 'mechanism'))
		findings.push({
			level: 'warn',
			text: 'ptr is deprecated (RFC 7208 5.5): slow, unreliable, and some receivers ignore it'
		});
	const unreachable = terms.filter((t) => t.unreachable);
	if (unreachable.length)
		findings.push({
			level: 'warn',
			text: `Ignored after all: ${unreachable.map((t) => t.raw).join(' ')}`
		});
	const bytes = new TextEncoder().encode(record).length;
	if (bytes > 450)
		findings.push({
			level: 'info',
			text: `${bytes} bytes. Long records need several TXT strings (255 bytes each) and may need DNS over TCP.`
		});
	const lookups = terms.filter((t) => t.lookup && !t.unreachable).length;
	const redirect = redirectIgnored ? undefined : redirects[0]?.value;
	return { record, terms, findings, lookups, redirect, redirectIgnored, hasAll };
}

/* ------------------------------------------------------------------ */
/* Recursive lookup                                                    */
/* ------------------------------------------------------------------ */

export type RrType = 'TXT' | 'A' | 'AAAA' | 'MX';

export interface DnsReply {
	/** DNS response code, 0 is NOERROR, 3 is NXDOMAIN. */
	status: number;
	/** Record data of the asked type (TXT already unquoted). */
	data: string[];
	/** Transport or HTTP failure. */
	error?: string;
}

export type Resolve = (name: string, type: RrType) => Promise<DnsReply>;

export interface NodeCheck {
	term: string;
	name: string;
	type: RrType;
	result: 'ok' | 'void' | 'error';
	detail: string;
}

export interface SpfNode {
	domain: string;
	via: 'root' | 'include' | 'redirect';
	/** The term that led here, e.g. "include:_spf.google.com". */
	term?: string;
	record?: string;
	parsed?: ParsedSpf;
	error?: string;
	/** Lookups caused by terms in this record. */
	own: number;
	/** own plus everything below. */
	total: number;
	voids: number;
	children: SpfNode[];
	checks: NodeCheck[];
	findings: Finding[];
}

export interface SpfTree {
	root: SpfNode;
	lookups: number;
	voids: number;
	findings: Finding[];
	queries: number;
	truncated: boolean;
}

export interface WalkOptions {
	/** Also resolve a, mx and exists targets to find void lookups. Default true. */
	checkTargets?: boolean;
	/** Hard cap on DNS queries, protects against huge trees. */
	maxQueries?: number;
	maxDepth?: number;
}

const isVoid = (r: DnsReply) => !r.error && (r.status === 3 || (r.status === 0 && !r.data.length));

/**
 * Fetches a domain's SPF record and follows include and redirect, counting lookups the way
 * RFC 7208 4.6.4 does. This is a static count of everything a receiver might evaluate,
 * which is what the limit has to hold for (the real check stops at the first match).
 */
export async function walkSpf(
	domain: string,
	resolve: Resolve,
	opts: WalkOptions = {}
): Promise<SpfTree> {
	const checkTargets = opts.checkTargets ?? true;
	const maxQueries = opts.maxQueries ?? 60;
	const maxDepth = opts.maxDepth ?? 12;
	let queries = 0;
	let truncated = false;
	const seen = new Set<string>();

	async function ask(name: string, type: RrType): Promise<DnsReply | null> {
		if (queries >= maxQueries) {
			truncated = true;
			return null;
		}
		queries++;
		return resolve(name, type);
	}

	async function visit(
		name: string,
		via: SpfNode['via'],
		term: string | undefined,
		depth: number,
		path: string[]
	): Promise<SpfNode> {
		const d = name.toLowerCase().replace(/\.$/, '');
		const node: SpfNode = {
			domain: d,
			via,
			term,
			own: 0,
			total: 0,
			voids: 0,
			children: [],
			checks: [],
			findings: []
		};
		if (path.includes(d)) {
			node.error = `Loop: ${[...path, d].join(' > ')}. Receivers return permerror.`;
			return node;
		}
		if (depth > maxDepth) {
			node.error = 'Nested too deep, stopped here';
			truncated = true;
			return node;
		}
		seen.add(d);
		const r = await ask(d, 'TXT');
		if (!r) {
			node.error = 'Query limit of this tool reached, not looked up';
			return node;
		}
		if (r.error) {
			node.error = r.error;
			return node;
		}
		if (r.status !== 0 && r.status !== 3) {
			node.error = `DNS error ${r.status === 2 ? 'SERVFAIL' : `rcode ${r.status}`}: receivers return temperror`;
			return node;
		}
		if (isVoid(r) && via !== 'root') node.voids++;
		const spf = r.data.filter((t) => /^v=spf1(\s|$)/i.test(t.trim()));
		if (r.status === 3) {
			node.error = `${d} does not exist (NXDOMAIN)${via === 'root' ? '' : ': the include is a permerror'}`;
			return node;
		}
		if (!spf.length) {
			node.error =
				via === 'root'
					? `${d} has no SPF record`
					: `${d} has no SPF record: ${via === 'include' ? 'include' : 'redirect'} gives permerror`;
			return node;
		}
		if (spf.length > 1) {
			node.error = `${d} publishes ${spf.length} SPF records: receivers return permerror`;
			node.findings.push({ level: 'error', text: node.error });
		}
		node.record = spf[0];
		try {
			node.parsed = parseSpf(spf[0]);
		} catch (e) {
			node.error = (e as Error).message;
			return node;
		}
		const p = node.parsed;
		node.own = p.lookups;
		node.findings.push(...p.findings);
		const next = [...path, d];
		for (const t of p.terms) {
			if (!t.lookup || t.unreachable || t.error) continue;
			if (t.macro) {
				node.checks.push({
					term: t.raw,
					name: t.value ?? '',
					type: 'A',
					result: 'ok',
					detail: `Not resolved: ${macroNote}`
				});
				continue;
			}
			if (t.name === 'include') {
				node.children.push(await visit(t.value!, 'include', t.raw, depth + 1, next));
			} else if (t.kind === 'modifier' && t.name === 'redirect') {
				node.children.push(await visit(t.value!, 'redirect', t.raw, depth + 1, next));
			} else if (checkTargets && (t.name === 'a' || t.name === 'mx' || t.name === 'exists')) {
				const target = (t.value ?? d).replace(/\.$/, '');
				const type: RrType = t.name === 'mx' ? 'MX' : 'A';
				const res = await ask(target, type);
				if (!res) continue;
				let result: NodeCheck['result'] = 'ok';
				let detail = '';
				if (res.error) {
					result = 'error';
					detail = res.error;
				} else if (isVoid(res)) {
					if (t.name === 'a') {
						// A void a mechanism may still have AAAA records; ask before calling it void.
						const six = await ask(target, 'AAAA');
						if (six && !six.error && !isVoid(six)) {
							detail = `${six.data.length} AAAA`;
						} else {
							result = 'void';
							detail = res.status === 3 ? 'NXDOMAIN' : 'no A or AAAA records';
						}
					} else {
						result = 'void';
						detail = res.status === 3 ? 'NXDOMAIN' : `no ${type} records`;
					}
				} else {
					detail = `${res.data.length} ${type}`;
					if (t.name === 'mx' && res.data.length > 10)
						node.findings.push({
							level: 'error',
							text: `${t.raw}: ${target} has ${res.data.length} MX hosts, more than the 10 allowed (RFC 7208 4.6.4)`
						});
				}
				if (result === 'void') node.voids++;
				node.checks.push({ term: t.raw, name: target, type, result, detail });
			}
		}
		node.total = node.own + node.children.reduce((s, c) => s + c.total, 0);
		node.voids += node.children.reduce((s, c) => s + c.voids, 0);
		return node;
	}

	const root = await visit(domain, 'root', undefined, 0, []);
	const findings: Finding[] = [];
	if (root.total > LOOKUP_LIMIT)
		findings.push({
			level: 'error',
			text: `${root.total} DNS lookups, over the limit of ${LOOKUP_LIMIT}: receivers return permerror and SPF fails for everyone. Flatten or remove includes.`
		});
	else if (root.total >= 8)
		findings.push({
			level: 'warn',
			text: `${root.total} of ${LOOKUP_LIMIT} lookups used. One more provider include may break SPF.`
		});
	if (root.voids > VOID_LIMIT)
		findings.push({
			level: 'error',
			text: `${root.voids} void lookups, over the limit of ${VOID_LIMIT}: receivers may return permerror`
		});
	return { root, lookups: root.total, voids: root.voids, findings, queries, truncated };
}

/** Adapter from the shared DoH client. Every request is reported through onQuery. */
export function dohResolve(
	resolver: ResolverId,
	onQuery: (r: LookupResult) => void,
	fetchFn?: FetchFn
): Resolve {
	return async (name, type) => {
		const res = await lookup(resolver, { name, type }, fetchFn ? { fetchFn } : {});
		onQuery(res);
		if (res.error || !res.answer) return { status: -1, data: [], error: res.error ?? 'No answer' };
		const want = type;
		const data = res.answer.answer
			.filter((r) => r.typeName === want)
			.map((r) => (type === 'TXT' ? r.display : r.data));
		return { status: res.answer.status, data };
	};
}

/* ------------------------------------------------------------------ */
/* Input handling                                                      */
/* ------------------------------------------------------------------ */

export type InputKind = { kind: 'record'; record: string } | { kind: 'domain'; domain: string };

/** Decides whether the input is a record to explain or a domain to look up. */
export function classifyInput(input: string): InputKind | null {
	const t = input.trim();
	if (!t) return null;
	if (/^"?v=spf1/i.test(t)) return { kind: 'record', record: t };
	if (/\s/.test(t) || t.includes('=')) return { kind: 'record', record: t };
	return { kind: 'domain', domain: normaliseName(t) };
}

export function looksLikeSpf(input: string): number {
	return /^\s*"?v=spf1(\s|"|$)/i.test(input) ? 0.95 : 0;
}
