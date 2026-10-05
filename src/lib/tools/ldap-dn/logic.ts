/*
 * LDAP distinguished names and search filters.
 * RFC 4514: string representation of DNs (section 2.4 escaping, section 3 parsing).
 * RFC 4515: string representation of search filters (section 3, value escaping).
 * RFC 2253 (obsoleted by 4514) also allowed ";" between RDNs and RFC 1779 quoted values;
 * both are accepted when reading, with a note.
 */

export interface Ava {
	type: string;
	/** Decoded value. For #hex values this is the hex string itself. */
	value: string;
	/** Value as written. */
	raw: string;
	/** Value was given as #hex (BER encoding). */
	hex?: boolean;
}

export type Rdn = Ava[];

export interface ParsedDn {
	rdns: Rdn[];
	notes: string[];
}

const hexRe = /^[0-9a-fA-F]{2}$/;
const specials = '"+,;<>\\ #=';

function decodeUtf8(bytes: number[]): string {
	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
	} catch {
		throw new Error('Hex escapes do not form valid UTF-8');
	}
}

/**
 * Parses a DN. Lenient about spaces around separators (common in hand-written DNs and accepted by
 * Active Directory). Throws with the position of the problem.
 */
export function parseDn(input: string): ParsedDn {
	const s = input.trim();
	const notes: string[] = [];
	if (!s) return { rdns: [], notes };
	const rdns: Rdn[] = [];
	let i = 0;
	let rdn: Rdn = [];
	const err = (msg: string) => new Error(`${msg} at position ${i + 1}`);
	const skipSpaces = () => {
		while (s[i] === ' ') i++;
	};

	while (i <= s.length) {
		skipSpaces();
		// attribute type
		const tStart = i;
		while (i < s.length && /[A-Za-z0-9.-]/.test(s[i])) i++;
		const type = s.slice(tStart, i);
		if (!type)
			throw err(
				i >= s.length
					? 'Missing attribute after separator'
					: `Expected an attribute type, found "${s[i]}"`
			);
		if (!/^([A-Za-z][A-Za-z0-9-]*|\d+(\.\d+)*)$/.test(type))
			throw err(`"${type}" is not a valid attribute type`);
		if (/^\d/.test(type) && !/^\d+(\.\d+)+$/.test(type))
			throw err(`"${type}" is not a valid numeric OID`);
		skipSpaces();
		if (s[i] !== '=') throw err(`Expected "=" after ${type}`);
		i++;
		skipSpaces();
		// value
		const vStart = i;
		let value = '';
		let hex = false;
		if (s[i] === '#') {
			i++;
			const h = i;
			while (i < s.length && /[0-9a-fA-F]/.test(s[i])) i++;
			const digits = s.slice(h, i);
			if (!digits || digits.length % 2)
				throw err('A #hex value needs an even number of hex digits');
			value = '#' + digits.toLowerCase();
			hex = true;
		} else if (s[i] === '"') {
			i++;
			while (i < s.length && s[i] !== '"') {
				if (s[i] === '\\' && i + 1 < s.length) i++;
				value += s[i];
				i++;
			}
			if (s[i] !== '"') throw err('Unterminated quoted value');
			i++;
			if (!notes.includes('quoted')) notes.push('quoted');
		} else {
			let bytes: number[] = [];
			let trailingSpaces = 0;
			const flush = () => {
				if (bytes.length) {
					value += decodeUtf8(bytes);
					bytes = [];
				}
			};
			while (i < s.length && !',+;'.includes(s[i])) {
				const c = s[i];
				if (c === '\\') {
					const pair = s.slice(i + 1, i + 3);
					if (hexRe.test(pair)) {
						bytes.push(parseInt(pair, 16));
						i += 3;
					} else if (i + 1 < s.length && specials.includes(s[i + 1])) {
						flush();
						value += s[i + 1];
						i += 2;
					} else if (i + 1 >= s.length) {
						throw err('Backslash at the end of the value');
					} else {
						throw err(`"\\${s[i + 1]}" is not a valid escape`);
					}
					trailingSpaces = 0;
					continue;
				}
				flush();
				if (c === '"' || c === '<' || c === '>')
					throw err(`Character ${c} must be escaped as \\${c}`);
				value += c;
				trailingSpaces = c === ' ' ? trailingSpaces + 1 : 0;
				i++;
			}
			flush();
			// unescaped trailing spaces are not part of the value
			if (trailingSpaces) value = value.slice(0, -trailingSpaces);
		}
		const raw = s.slice(vStart, i).trim();
		skipSpaces();
		rdn.push({ type, value, raw, hex: hex || undefined });
		if (i >= s.length) {
			rdns.push(rdn);
			break;
		}
		const sep = s[i];
		if (sep === '+') {
			i++;
			continue;
		}
		if (sep === ',' || sep === ';') {
			if (sep === ';' && !notes.includes('semicolon')) notes.push('semicolon');
			rdns.push(rdn);
			rdn = [];
			i++;
			if (i >= s.length || !s.slice(i).trim()) throw err('Missing RDN after separator');
			continue;
		}
		throw err(`Unexpected "${sep}"`);
	}
	return {
		rdns,
		notes: notes.map((n) =>
			n === 'quoted'
				? 'Quoted values are the old RFC 1779 form, RFC 4514 uses backslash escapes.'
				: 'Semicolons between RDNs are the old RFC 2253 form, use commas.'
		)
	};
}

/** Escapes an attribute value for use in a DN (RFC 4514 section 2.4). */
export function escapeDnValue(v: string): string {
	let out = '';
	const chars = Array.from(v);
	chars.forEach((c, i) => {
		if (c === '\0') out += '\\00';
		else if ('"+,;<>\\'.includes(c)) out += '\\' + c;
		else if (i === 0 && (c === '#' || c === ' ')) out += '\\' + c;
		else if (i === chars.length - 1 && c === ' ') out += '\\ ';
		else out += c;
	});
	return out;
}

/** Reverses DN escaping for a single value (backslash plus special character or two hex digits). */
export function unescapeDnValue(v: string): string {
	let out = '';
	let bytes: number[] = [];
	const flush = () => {
		if (bytes.length) out += decodeUtf8(bytes);
		bytes = [];
	};
	for (let i = 0; i < v.length; i++) {
		if (v[i] === '\\') {
			const pair = v.slice(i + 1, i + 3);
			if (hexRe.test(pair)) {
				bytes.push(parseInt(pair, 16));
				i += 2;
				continue;
			}
			if (i + 1 >= v.length) throw new Error('Backslash at the end of the value');
			flush();
			out += v[i + 1];
			i++;
			continue;
		}
		flush();
		out += v[i];
	}
	flush();
	return out;
}

/**
 * Escapes a value for an LDAP search filter (RFC 4515 section 3): * ( ) \ and NUL become \2a \28
 * \29 \5c \00. With `nonAscii`, other bytes outside ASCII are written as UTF-8 hex escapes too.
 */
export function escapeFilterValue(v: string, nonAscii = false): string {
	let out = '';
	for (const c of v) {
		if (c === '*') out += '\\2a';
		else if (c === '(') out += '\\28';
		else if (c === ')') out += '\\29';
		else if (c === '\\') out += '\\5c';
		else if (c === '\0') out += '\\00';
		else if (nonAscii && c.codePointAt(0)! > 0x7f)
			for (const b of new TextEncoder().encode(c)) out += '\\' + b.toString(16).padStart(2, '0');
		else out += c;
	}
	return out;
}

/** Decodes \XX escapes of a filter value. A backslash not followed by two hex digits is an error. */
export function unescapeFilterValue(v: string): string {
	let out = '';
	let bytes: number[] = [];
	const flush = () => {
		if (bytes.length) out += decodeUtf8(bytes);
		bytes = [];
	};
	for (let i = 0; i < v.length; i++) {
		if (v[i] === '\\') {
			const pair = v.slice(i + 1, i + 3);
			if (!hexRe.test(pair))
				throw new Error(`Filter escapes are a backslash and two hex digits, found "\\${pair}"`);
			bytes.push(parseInt(pair, 16));
			i += 2;
			continue;
		}
		flush();
		out += v[i];
	}
	flush();
	return out;
}

/** Writes a DN back in RFC 4514 form: no spaces around separators, minimal escaping. */
export function formatDn(rdns: Rdn[]): string {
	return rdns
		.map((r) => r.map((a) => `${a.type}=${a.hex ? a.value : escapeDnValue(a.value)}`).join('+'))
		.join(',');
}

/* ------------------------------------------------------------------ */
/* Canonical name (Active Directory canonicalName)                     */
/* ------------------------------------------------------------------ */

const escapeCanonical = (v: string) => v.replace(/\\/g, '\\\\').replace(/\//g, '\\/');

/**
 * CN=John Smith,OU=Staff,DC=corp,DC=example,DC=com -> corp.example.com/Staff/John Smith.
 * The trailing DC components form the domain, the rest is listed from the top down.
 * A "/" inside a name is written as "\/", as AD does.
 */
export function toCanonical(dn: string): string {
	const { rdns } = parseDn(dn);
	if (!rdns.length) throw new Error('Enter a DN');
	let k = rdns.length;
	while (k > 0 && rdns[k - 1].length === 1 && rdns[k - 1][0].type.toLowerCase() === 'dc') k--;
	const dcs = rdns.slice(k).map((r) => r[0].value);
	if (!dcs.length) throw new Error('The DN has no DC= components, so there is no domain part');
	const rest = rdns
		.slice(0, k)
		.reverse()
		.map((r) => {
			if (r.length > 1) throw new Error('Multi-valued RDNs (with +) have no canonical name form');
			return escapeCanonical(r[0].value);
		});
	return [dcs.join('.'), ...rest].join('/');
}

/**
 * Containers that exist directly under an AD domain as CN= objects, not OUs (default domain
 * partition objects). Domain Controllers is an OU and is not in this list.
 */
export const builtinContainers = [
	'Builtin',
	'Computers',
	'ForeignSecurityPrincipals',
	'Infrastructure',
	'Keys',
	'LostAndFound',
	'Managed Service Accounts',
	'NTDS Quotas',
	'Program Data',
	'System',
	'TPM Devices',
	'Users'
];

function splitCanonical(s: string): string[] {
	const parts: string[] = [];
	let cur = '';
	for (let i = 0; i < s.length; i++) {
		if (s[i] === '\\' && i + 1 < s.length) {
			cur += s[i + 1];
			i++;
		} else if (s[i] === '/') {
			parts.push(cur);
			cur = '';
		} else cur += s[i];
	}
	parts.push(cur);
	return parts;
}

/**
 * corp.example.com/Staff/John Smith -> CN=John Smith,OU=Staff,DC=corp,DC=example,DC=com.
 * The canonical form does not say which parts are OUs: the last part becomes CN, the default
 * containers directly under the domain (Users, Computers ...) become CN, everything else OU.
 */
export function fromCanonical(canonical: string, leaf: 'CN' | 'OU' = 'CN'): string {
	const s = canonical.trim().replace(/\/$/, '');
	if (!s) throw new Error('Enter a canonical name such as example.com/Users/Jane');
	const parts = splitCanonical(s);
	const domain = parts[0];
	if (!domain || !/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*$/.test(domain))
		throw new Error(`"${domain}" is not a domain name`);
	const path = parts.slice(1);
	if (path.some((p) => !p)) throw new Error('Empty path element: check for two slashes in a row');
	const rdns = path.map((p, i) => {
		const isLeaf = i === path.length - 1;
		let type = 'OU';
		if (isLeaf) type = leaf;
		else if (i === 0 && builtinContainers.some((c) => c.toLowerCase() === p.toLowerCase()))
			type = 'CN';
		return `${type}=${escapeDnValue(p)}`;
	});
	return [...rdns.reverse(), ...domain.split('.').map((d) => `DC=${d}`)].join(',');
}

/* ------------------------------------------------------------------ */
/* Filter builder                                                      */
/* ------------------------------------------------------------------ */

export type FilterOp =
	'equals' | 'present' | 'contains' | 'starts' | 'ends' | 'gte' | 'lte' | 'approx';

export const filterOps: { id: FilterOp; label: string }[] = [
	{ id: 'equals', label: 'equals' },
	{ id: 'contains', label: 'contains' },
	{ id: 'starts', label: 'starts with' },
	{ id: 'ends', label: 'ends with' },
	{ id: 'present', label: 'is present' },
	{ id: 'gte', label: '>=' },
	{ id: 'lte', label: '<=' },
	{ id: 'approx', label: '~= (approx)' }
];

export interface Condition {
	attr: string;
	op: FilterOp;
	value: string;
	not?: boolean;
}

/** Builds one filter item with the value escaped, so user input cannot change the filter. */
export function buildItem(c: Condition): string {
	const attr = c.attr.trim();
	if (!attr) throw new Error('Attribute name is empty');
	if (!/^([A-Za-z][A-Za-z0-9-]*|\d+(\.\d+)+)(;[A-Za-z0-9-]+)*$/.test(attr))
		throw new Error(`"${attr}" is not a valid attribute name`);
	const v = escapeFilterValue(c.value);
	let item: string;
	switch (c.op) {
		case 'present':
			item = `(${attr}=*)`;
			break;
		case 'contains':
			item = `(${attr}=*${v}*)`;
			break;
		case 'starts':
			item = `(${attr}=${v}*)`;
			break;
		case 'ends':
			item = `(${attr}=*${v})`;
			break;
		case 'gte':
			item = `(${attr}>=${v})`;
			break;
		case 'lte':
			item = `(${attr}<=${v})`;
			break;
		case 'approx':
			item = `(${attr}~=${v})`;
			break;
		default:
			item = `(${attr}=${v})`;
	}
	return c.not ? `(!${item})` : item;
}

export function buildFilter(conds: Condition[], combine: '&' | '|'): string {
	const items = conds.filter((c) => c.attr.trim()).map(buildItem);
	if (!items.length) throw new Error('Add at least one condition');
	return items.length === 1 ? items[0] : `(${combine}${items.join('')})`;
}

/* ------------------------------------------------------------------ */
/* Detection                                                           */
/* ------------------------------------------------------------------ */

const knownTypes = /^(cn|ou|dc|o|c|l|st|street|uid|mail|serialnumber|e)$/i;

export function looksLikeDn(input: string): number {
	const t = input.trim();
	if (t.length < 7 || t.length > 2000 || /\n/.test(t)) return 0;
	if (!/^[A-Za-z]+\s*=/.test(t)) return 0;
	try {
		const { rdns } = parseDn(t);
		if (rdns.length < 2) return 0;
		if (!rdns.every((r) => r.every((a) => knownTypes.test(a.type)))) return 0;
		return 0.85;
	} catch {
		return 0;
	}
}
