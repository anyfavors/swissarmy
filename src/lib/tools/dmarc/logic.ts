/*
 * DMARC policy records.
 * Sources: RFC 7489 (DMARC), section 6.3 (tags) and 7.1 (external report destinations);
 * RFC 9091 (PSD DMARC, experimental) for np; DMARCbis (draft-ietf-dmarc-dmarcbis,
 * the successor to RFC 7489) for np, psd and t. Items only defined by DMARCbis are labelled.
 */

export type Policy = 'none' | 'quarantine' | 'reject';
export const policies: Policy[] = ['none', 'quarantine', 'reject'];

export interface TagInfo {
	tag: string;
	name: string;
	/** Where the tag is defined. */
	source: 'RFC 7489' | 'RFC 9091 / DMARCbis' | 'DMARCbis';
	defaultValue?: string;
	/** Removed by DMARCbis. */
	removedInBis?: boolean;
}

export const tagInfo: Record<string, TagInfo> = {
	v: { tag: 'v', name: 'Version', source: 'RFC 7489' },
	p: { tag: 'p', name: 'Policy for the domain', source: 'RFC 7489' },
	sp: { tag: 'sp', name: 'Policy for subdomains', source: 'RFC 7489' },
	np: {
		tag: 'np',
		name: 'Policy for non-existent subdomains',
		source: 'RFC 9091 / DMARCbis'
	},
	pct: {
		tag: 'pct',
		name: 'Percentage of failing mail the policy applies to',
		source: 'RFC 7489',
		defaultValue: '100',
		removedInBis: true
	},
	t: { tag: 't', name: 'Testing mode', source: 'DMARCbis', defaultValue: 'n' },
	psd: { tag: 'psd', name: 'Public suffix domain flag', source: 'DMARCbis', defaultValue: 'u' },
	rua: { tag: 'rua', name: 'Aggregate report addresses', source: 'RFC 7489' },
	ruf: { tag: 'ruf', name: 'Failure (forensic) report addresses', source: 'RFC 7489' },
	adkim: { tag: 'adkim', name: 'DKIM alignment mode', source: 'RFC 7489', defaultValue: 'r' },
	aspf: { tag: 'aspf', name: 'SPF alignment mode', source: 'RFC 7489', defaultValue: 'r' },
	fo: { tag: 'fo', name: 'Failure reporting options', source: 'RFC 7489', defaultValue: '0' },
	rf: {
		tag: 'rf',
		name: 'Failure report format',
		source: 'RFC 7489',
		defaultValue: 'afrf',
		removedInBis: true
	},
	ri: {
		tag: 'ri',
		name: 'Aggregate report interval (seconds)',
		source: 'RFC 7489',
		defaultValue: '86400',
		removedInBis: true
	}
};

/** Display order for builder output and explanations. */
export const tagOrder = [
	'v',
	'p',
	'sp',
	'np',
	'pct',
	't',
	'psd',
	'rua',
	'ruf',
	'adkim',
	'aspf',
	'fo',
	'rf',
	'ri'
];

export type Level = 'error' | 'warn' | 'info';
export interface Finding {
	level: Level;
	text: string;
}

export interface ReportUri {
	raw: string;
	address?: string;
	domain?: string;
	/** Size limit suffix, e.g. "10m". */
	limit?: string;
	error?: string;
}

export interface ParsedTag {
	tag: string;
	value: string;
	explain: string;
	info?: TagInfo;
	error?: string;
	uris?: ReportUri[];
}

export interface ParsedDmarc {
	tags: ParsedTag[];
	map: Record<string, string>;
	findings: Finding[];
	/** The policy a receiver acts on, after the defaults and fallbacks. */
	effective: {
		p: Policy | null;
		sp: Policy | null;
		np: Policy | null;
		pct: number;
		adkim: 's' | 'r';
		aspf: 's' | 'r';
	};
}

/* ------------------------------------------------------------------ */
/* Organisational domain (heuristic)                                   */
/* ------------------------------------------------------------------ */

/*
 * DMARC defines the organisational domain with the Public Suffix List. This site does not ship the
 * list, so the helper below is a heuristic: the last two labels, or the last three when the name
 * ends in a common second-level suffix under a two-letter country code (example.co.uk).
 */
const secondLevel = new Set([
	'ac',
	'co',
	'com',
	'edu',
	'gov',
	'net',
	'org',
	'or',
	'ne',
	'go',
	'gob',
	'mil',
	'nic',
	'ltd',
	'plc',
	'sch',
	'gen',
	'nom',
	'biz',
	'info'
]);

export function orgDomain(domain: string): string {
	const labels = domain.toLowerCase().replace(/\.$/, '').split('.').filter(Boolean);
	if (labels.length <= 2) return labels.join('.');
	const tld = labels[labels.length - 1];
	const sld = labels[labels.length - 2];
	const n = tld.length === 2 && secondLevel.has(sld) ? 3 : 2;
	return labels.slice(-n).join('.');
}

/** True when two domains share the organisational domain (relaxed alignment, heuristic). */
export function relaxedAligned(a: string, b: string): boolean {
	return orgDomain(a) === orgDomain(b);
}

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

function parseUris(value: string): ReportUri[] {
	return value
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean)
		.map((raw) => {
			// RFC 7489 6.2: a URI with an optional "!" size limit, e.g. mailto:a@b.example!10m
			const m = raw.match(/^(.*?)(?:!(\d+[kmgt]?))?$/i)!;
			const uri = m[1];
			const limit = m[2];
			const mail = uri.match(/^mailto:([^@\s]+)@([^@\s?]+)$/i);
			if (!mail) {
				if (/^mailto:/i.test(uri)) return { raw, limit, error: 'Not a valid mailto address' };
				return {
					raw,
					limit,
					error: 'Only mailto: URIs are used in practice; receivers may ignore other schemes'
				};
			}
			let address = `${mail[1]}@${mail[2]}`;
			try {
				address = decodeURIComponent(address);
			} catch {
				/* keep as is */
			}
			return { raw, address, domain: mail[2].toLowerCase(), limit };
		});
}

const policyWords: Record<Policy, string> = {
	none: 'take no action, only report',
	quarantine: 'treat failing mail as suspicious, usually deliver it to spam',
	reject: 'refuse failing mail during the SMTP transaction'
};

function explainTag(tag: string, value: string): { explain: string; error?: string } {
	const v = value.trim();
	switch (tag) {
		case 'v':
			return v === 'DMARC1'
				? { explain: 'Marks this TXT record as a DMARC policy.' }
				: { explain: 'Version tag.', error: 'Must be exactly DMARC1' };
		case 'p':
		case 'sp':
		case 'np': {
			const p = v.toLowerCase() as Policy;
			if (!policies.includes(p))
				return { explain: '', error: 'Must be none, quarantine or reject' };
			const who =
				tag === 'p'
					? 'Mail that fails DMARC for this domain'
					: tag === 'sp'
						? 'Failing mail from subdomains'
						: 'Failing mail from subdomains that do not exist in DNS';
			return { explain: `${who}: ${policyWords[p]}.` };
		}
		case 'pct': {
			if (!/^\d{1,3}$/.test(v) || Number(v) > 100)
				return { explain: '', error: 'Must be a whole number from 0 to 100' };
			return {
				explain:
					Number(v) === 100
						? 'The policy applies to all failing mail.'
						: `The policy applies to ${v}% of failing mail. The rest is handled one step softer (reject becomes quarantine, quarantine becomes none).`
			};
		}
		case 't':
			if (v === 'y')
				return {
					explain:
						'Testing mode: receivers should apply one step softer than p= (like pct=0 in RFC 7489).'
				};
			if (v === 'n') return { explain: 'Not in testing mode: apply the policy as published.' };
			return { explain: '', error: 'Must be y or n' };
		case 'psd':
			if (v === 'y') return { explain: 'This domain is a public suffix domain (like a TLD).' };
			if (v === 'n') return { explain: 'This is an organisational domain, not a public suffix.' };
			if (v === 'u') return { explain: 'Unknown: receivers work it out themselves (default).' };
			return { explain: '', error: 'Must be y, n or u' };
		case 'rua':
			return { explain: 'Daily XML summaries of who sends mail as this domain go here.' };
		case 'ruf':
			return {
				explain:
					'Copies or extracts of individual failing messages go here. Few large receivers send them, for privacy reasons.'
			};
		case 'adkim':
		case 'aspf': {
			const what = tag === 'adkim' ? 'the DKIM d= domain' : 'the envelope sender (SPF) domain';
			if (v === 's') return { explain: `Strict: ${what} must equal the From: domain exactly.` };
			if (v === 'r')
				return {
					explain: `Relaxed: ${what} may be any name under the same organisational domain as From:.`
				};
			return { explain: '', error: 'Must be r or s' };
		}
		case 'fo': {
			const parts = v.split(':').map((s) => s.trim());
			const words: Record<string, string> = {
				'0': 'report when both SPF and DKIM fail to give an aligned pass',
				'1': 'report when either SPF or DKIM fails',
				d: 'report every DKIM signature that fails to verify',
				s: 'report every SPF failure'
			};
			const bad = parts.filter((p) => !(p in words));
			if (bad.length) return { explain: '', error: `Unknown option ${bad.join(', ')}` };
			return {
				explain: `Failure reports: ${parts.map((p) => words[p]).join('; ')}. Only used with ruf=.`
			};
		}
		case 'rf': {
			const parts = v.split(':').map((s) => s.trim().toLowerCase());
			if (parts.some((p) => p !== 'afrf'))
				return {
					explain: 'Failure report format.',
					error: 'afrf (RFC 6591) is the only registered format'
				};
			return { explain: 'Failure reports in the Authentication Failure Reporting Format.' };
		}
		case 'ri': {
			if (!/^\d+$/.test(v)) return { explain: '', error: 'Must be a number of seconds' };
			const n = Number(v);
			const h = n / 3600;
			return {
				explain: `Asks for aggregate reports every ${n} s (${Number.isInteger(h) ? h : h.toFixed(1)} h). Receivers only have to support daily, most ignore other values.`
			};
		}
		default:
			return { explain: 'Unknown tag: receivers ignore it.' };
	}
}

/** Parses a DMARC TXT value. Accepts quoted TXT strings as copied from a zone file. */
export function parseDmarc(record: string, domain = ''): ParsedDmarc {
	let text = record.trim();
	if (text.startsWith('"')) text = unquote(text);
	const findings: Finding[] = [];
	if (!text) throw new Error('Paste a DMARC record, it starts with v=DMARC1');
	const pieces = text
		.split(';')
		.map((s) => s.trim())
		.filter(Boolean);
	const tags: ParsedTag[] = [];
	const map: Record<string, string> = {};
	for (const [i, piece] of pieces.entries()) {
		const eq = piece.indexOf('=');
		if (eq < 1) {
			findings.push({ level: 'error', text: `"${piece}" is not a tag=value pair` });
			continue;
		}
		const rawTag = piece.slice(0, eq).trim();
		const tag = rawTag.toLowerCase();
		const value = piece.slice(eq + 1).trim();
		if (i === 0 && tag !== 'v')
			throw new Error('A DMARC record must start with v=DMARC1, this one starts with ' + rawTag);
		if (tag in map) {
			findings.push({
				level: 'warn',
				text: `${tag}= appears twice; receivers may use either, or reject the record`
			});
			continue;
		}
		map[tag] = value;
		const ex = explainTag(tag, value);
		const t: ParsedTag = { tag, value, explain: ex.explain, error: ex.error, info: tagInfo[tag] };
		if (tag === 'rua' || tag === 'ruf') t.uris = parseUris(value);
		tags.push(t);
	}
	if (!tags.length || tags[0].tag !== 'v')
		throw new Error('A DMARC record must start with v=DMARC1');

	const pol = (s: string | undefined) =>
		s && policies.includes(s.toLowerCase() as Policy) ? (s.toLowerCase() as Policy) : null;
	let p = pol(map.p);
	if (!('p' in map)) {
		if (map.rua) {
			findings.push({
				level: 'error',
				text: 'No p= tag. Because rua= is valid, receivers treat the record as p=none (RFC 7489 6.6.3)'
			});
			p = 'none';
		} else {
			findings.push({
				level: 'error',
				text: 'No p= tag and no rua=: receivers ignore this record entirely'
			});
		}
	}
	const sp = pol(map.sp) ?? p;
	const np = pol(map.np) ?? sp;
	const pctOk = map.pct !== undefined && /^\d{1,3}$/.test(map.pct) && Number(map.pct) <= 100;
	const pct = pctOk ? Number(map.pct) : 100;
	const adkim = map.adkim === 's' ? 's' : 'r';
	const aspf = map.aspf === 's' ? 's' : 'r';

	for (const t of tags)
		if (t.error) findings.push({ level: 'error', text: `${t.tag}=: ${t.error}` });
	if (p === 'none')
		findings.push({
			level: 'warn',
			text: 'p=none only monitors. Fine while you read the reports and fix senders, but spoofed mail is still delivered. Plan the move to quarantine, then reject.'
		});
	if (pctOk && pct < 100 && p !== 'none')
		findings.push({
			level: 'warn',
			text: `pct=${pct}: only ${pct}% of failing mail gets p=${p}, the rest one step softer. Use it to ramp up, then remove it. DMARCbis drops pct in favour of t=y.`
		});
	if (p && sp && rank(sp) < rank(p))
		findings.push({
			level: 'warn',
			text: `Subdomains (sp=${sp}) are weaker than the domain (p=${p}). Spoofers can use any made-up subdomain.`
		});
	if (!map.rua)
		findings.push({
			level: 'warn',
			text: 'No rua=: you get no aggregate reports, so you cannot see who sends as your domain.'
		});
	if (map.fo && !map.ruf) findings.push({ level: 'info', text: 'fo= has no effect without ruf=.' });
	for (const t of tags)
		if (t.info?.removedInBis)
			findings.push({
				level: 'info',
				text: `${t.tag}= is removed in DMARCbis; receivers following the new spec ignore it.`
			});
		else if (!t.info)
			findings.push({ level: 'warn', text: `Unknown tag ${t.tag}=, receivers ignore it.` });

	for (const t of tags) {
		if (!t.uris) continue;
		for (const u of t.uris) {
			if (u.error) findings.push({ level: 'warn', text: `${t.tag}=: ${u.raw}: ${u.error}` });
			else if (domain && u.domain && !relaxedAligned(u.domain, domain))
				findings.push({
					level: 'warn',
					text: `${u.address} is outside ${domain}. Receivers only send there if ${u.domain} publishes TXT "v=DMARC1" at ${externalAuthName(domain, u.domain)} (RFC 7489 7.1). Report services usually set this up for you.`
				});
		}
	}

	return { tags, map, findings, effective: { p, sp, np, pct, adkim, aspf } };
}

function rank(p: Policy): number {
	return policies.indexOf(p);
}

/** Name of the record a third-party report receiver publishes to accept reports for a domain. */
export function externalAuthName(policyDomain: string, reportDomain: string): string {
	return `${policyDomain.replace(/\.$/, '')}._report._dmarc.${reportDomain.replace(/\.$/, '')}`;
}

/** Concatenates the strings of a quoted TXT value: `"v=DMARC1; " "p=none"`. */
function unquote(s: string): string {
	const parts = s.match(/"((?:[^"\\]|\\.)*)"/g);
	if (!parts) return s;
	return parts.map((p) => p.slice(1, -1).replace(/\\(.)/g, '$1')).join('');
}

/* ------------------------------------------------------------------ */
/* Builder                                                             */
/* ------------------------------------------------------------------ */

export interface DmarcFields {
	p: Policy;
	sp: '' | Policy;
	np: '' | Policy;
	pct: string;
	rua: string;
	ruf: string;
	adkim: 'r' | 's';
	aspf: 'r' | 's';
	fo: string[];
	ri: string;
}

export const defaultFields: DmarcFields = {
	p: 'none',
	sp: '',
	np: '',
	pct: '100',
	rua: '',
	ruf: '',
	adkim: 'r',
	aspf: 'r',
	fo: [],
	ri: ''
};

/** Turns a list of addresses (comma, space or newline separated) into mailto URIs. */
export function toUris(list: string): string {
	return list
		.split(/[\s,]+/)
		.map((s) => s.trim())
		.filter(Boolean)
		.map((s) => (/^mailto:/i.test(s) ? s : `mailto:${s}`))
		.join(',');
}

/** Builds the TXT value. Tags left at their default are omitted. */
export function buildDmarc(f: DmarcFields): string {
	const out = ['v=DMARC1', `p=${f.p}`];
	if (f.sp) out.push(`sp=${f.sp}`);
	if (f.np) out.push(`np=${f.np}`);
	const pct = f.pct.trim();
	if (pct && pct !== '100') {
		if (!/^\d{1,3}$/.test(pct) || Number(pct) > 100)
			throw new Error('pct must be a whole number from 0 to 100');
		out.push(`pct=${Number(pct)}`);
	}
	const rua = toUris(f.rua);
	if (rua) out.push(`rua=${rua}`);
	const ruf = toUris(f.ruf);
	if (ruf) out.push(`ruf=${ruf}`);
	if (f.adkim === 's') out.push('adkim=s');
	if (f.aspf === 's') out.push('aspf=s');
	const fo = f.fo.filter((x) => x !== '0');
	if (fo.length) out.push(`fo=${fo.join(':')}`);
	const ri = f.ri.trim();
	if (ri && ri !== '86400') {
		if (!/^\d+$/.test(ri)) throw new Error('ri must be a number of seconds');
		out.push(`ri=${ri}`);
	}
	return out.join('; ');
}

/** Fills builder fields from a parsed record, so a published record can be edited. */
export function fieldsFrom(parsed: ParsedDmarc): DmarcFields {
	const m = parsed.map;
	const pol = (s?: string): '' | Policy =>
		s && policies.includes(s.toLowerCase() as Policy) ? (s.toLowerCase() as Policy) : '';
	const strip = (s?: string) =>
		(s ?? '')
			.split(',')
			.map((x) => x.trim().replace(/^mailto:/i, ''))
			.filter(Boolean)
			.join(', ');
	return {
		p: pol(m.p) || 'none',
		sp: pol(m.sp),
		np: pol(m.np),
		pct: m.pct ?? '100',
		rua: strip(m.rua),
		ruf: strip(m.ruf),
		adkim: m.adkim === 's' ? 's' : 'r',
		aspf: m.aspf === 's' ? 's' : 'r',
		fo: (m.fo ?? '')
			.split(':')
			.map((s) => s.trim())
			.filter((s) => ['0', '1', 'd', 's'].includes(s)),
		ri: m.ri ?? ''
	};
}

/** The DNS name the record lives at. */
export function dmarcName(domain: string): string {
	const d = domain
		.trim()
		.replace(/^_dmarc\./i, '')
		.replace(/\.$/, '');
	return d ? `_dmarc.${d}` : '_dmarc.<domain>';
}

export function looksLikeDmarc(input: string): number {
	return /^\s*"?v=DMARC1\s*;/i.test(input) ? 0.95 : 0;
}
