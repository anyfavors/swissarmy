import { decodeEntities } from '../html-entities/logic';

/** One target syntax. `escape` returns a complete literal, quotes included where the syntax has them. */
export interface Flavour {
	id: string;
	label: string;
	escape: (s: string) => string;
	unescape: (s: string) => string;
	/** Something the escaped form cannot carry, or that the target usually rejects. */
	warn?: (s: string) => string | undefined;
}

const hex = (n: number, w: number) => n.toString(16).padStart(w, '0');

function isLoneSurrogate(s: string, i: number): boolean {
	const c = s.charCodeAt(i);
	if (c >= 0xd800 && c <= 0xdbff) {
		const n = s.charCodeAt(i + 1);
		return !(n >= 0xdc00 && n <= 0xdfff);
	}
	if (c >= 0xdc00 && c <= 0xdfff) {
		const p = s.charCodeAt(i - 1);
		return !(p >= 0xd800 && p <= 0xdbff);
	}
	return false;
}

/** Whitespace around a quoted literal is dropped; in a bare body it is content. */
function trimIfQuoted(s: string): string {
	return /^\s*["'`/\u2018-\u201e]/.test(s) ? s.trim() : s;
}

/** Removes one pair of matching outer quotes, if present. */
function unquote(s: string, quotes: string[]): string {
	for (const q of quotes)
		if (s.length >= 2 * q.length && s.startsWith(q) && s.endsWith(q))
			return s.slice(q.length, -q.length);
	return s;
}

// ---------------------------------------------------------------------------
// JSON (RFC 8259)

function jsonEscape(s: string): string {
	return JSON.stringify(s);
}

function jsonUnescape(s: string): string {
	const t = trimIfQuoted(s);
	const body = t.startsWith('"') && t.endsWith('"') && t.length >= 2 ? t : `"${t}"`;
	try {
		return JSON.parse(body) as string;
	} catch {
		const raw = body.match(/[\x00-\x1f]/);
		if (raw)
			throw new Error(
				`Raw control character U+${hex(raw[0].charCodeAt(0), 4).toUpperCase()} is not allowed in a JSON string`
			);
		throw new Error('Not a valid JSON string literal');
	}
}

// ---------------------------------------------------------------------------
// Backslash escapes, shared by JavaScript, C/Java and Python.

interface BackslashRules {
	name: string;
	simple: Record<string, string>;
	/** \x: exactly 2 digits, or C style greedy. */
	x: 'two' | 'greedy';
	octal: boolean;
	u4: boolean;
	uBrace: boolean;
	U8: boolean;
	/** \x and octal are raw bytes, decoded as UTF-8 (C). */
	bytes: boolean;
	/** What an unknown escape does. */
	unknown: 'char' | 'keep' | 'error';
	lineContinuation: boolean;
}

function unbackslash(s: string, r: BackslashRules): string {
	let out = '';
	let pending: number[] = [];
	const flush = () => {
		if (pending.length) {
			const bytes = new Uint8Array(pending);
			try {
				out += new TextDecoder('utf-8', { fatal: true }).decode(bytes);
			} catch {
				throw new Error('Byte escapes do not form valid UTF-8');
			}
			pending = [];
		}
	};
	const cp = (n: number, src: string) => {
		if (n > 0x10ffff) throw new Error(`${src} is beyond U+10FFFF`);
		flush();
		out += String.fromCodePoint(n);
	};
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (c !== '\\') {
			flush();
			out += c;
			continue;
		}
		const e = s[++i];
		if (e === undefined) throw new Error('Ends with a lone backslash');
		if (e in r.simple) {
			flush();
			out += r.simple[e];
		} else if (r.lineContinuation && (e === '\n' || e === '\r')) {
			if (e === '\r' && s[i + 1] === '\n') i++;
		} else if (r.octal && /[0-7]/.test(e)) {
			const m = s.slice(i).match(/^[0-7]{1,3}/)![0];
			const n = parseInt(m, 8);
			if (n > 255) throw new Error(`Octal escape \\${m} is above 377`);
			i += m.length - 1;
			if (r.bytes) pending.push(n);
			else cp(n, `\\${m}`);
		} else if (e === 'x') {
			const m = s.slice(i + 1).match(r.x === 'two' ? /^[0-9a-fA-F]{2}/ : /^[0-9a-fA-F]+/);
			if (!m) throw new Error(`\\x needs hex digits at position ${i}`);
			const n = parseInt(m[0], 16);
			if (n > 255) throw new Error(`\\x${m[0]} is larger than a byte`);
			i += m[0].length;
			if (r.bytes) pending.push(n);
			else cp(n, `\\x${m[0]}`);
		} else if (e === 'u' && r.uBrace && s[i + 1] === '{') {
			const m = s.slice(i + 2).match(/^([0-9a-fA-F]{1,6})\}/);
			if (!m) throw new Error(`Malformed \\u{...} at position ${i}`);
			cp(parseInt(m[1], 16), `\\u{${m[1]}}`);
			i += m[0].length + 1;
		} else if (e === 'u' && r.u4) {
			const m = s.slice(i + 1).match(/^[0-9a-fA-F]{4}/);
			if (!m) throw new Error(`\\u needs 4 hex digits at position ${i}`);
			flush();
			// A UTF-16 code unit: surrogate pairs join up by themselves in a JS string.
			out += String.fromCharCode(parseInt(m[0], 16));
			i += 4;
		} else if (e === 'U' && r.U8) {
			const m = s.slice(i + 1).match(/^[0-9a-fA-F]{8}/);
			if (!m) throw new Error(`\\U needs 8 hex digits at position ${i}`);
			cp(parseInt(m[0], 16), `\\U${m[0]}`);
			i += 8;
		} else if (r.unknown === 'char') {
			flush();
			out += e;
		} else if (r.unknown === 'keep') {
			flush();
			out += '\\' + e;
		} else throw new Error(`\\${e} is not a ${r.name} escape`);
	}
	flush();
	return out;
}

// ---------------------------------------------------------------------------
// JavaScript

function jsEscape(s: string): string {
	let out = '';
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		const n = s.charCodeAt(i);
		const simple: Record<string, string> = {
			'\\': '\\\\',
			'"': '\\"',
			'\n': '\\n',
			'\r': '\\r',
			'\t': '\\t',
			'\b': '\\b',
			'\f': '\\f',
			'\v': '\\v'
		};
		if (c in simple) out += simple[c];
		// \0 followed by a digit would read as an octal escape.
		else if (n === 0) out += /[0-9]/.test(s[i + 1] ?? '') ? '\\x00' : '\\0';
		else if (n < 0x20 || n === 0x7f) out += '\\x' + hex(n, 2);
		else if (n === 0x2028 || n === 0x2029 || isLoneSurrogate(s, i)) out += '\\u' + hex(n, 4);
		else out += c;
	}
	return `"${out}"`;
}

const jsRules: BackslashRules = {
	name: 'JavaScript',
	simple: { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v' },
	x: 'two',
	octal: true,
	u4: true,
	uBrace: true,
	U8: false,
	bytes: false,
	unknown: 'char',
	lineContinuation: true
};

function jsUnescape(s: string): string {
	return unbackslash(unquote(trimIfQuoted(s), ['"', "'", '`']), jsRules);
}

// ---------------------------------------------------------------------------
// C and Java: the common subset. Control characters become 3-digit octal, valid in both.

function cEscape(s: string): string {
	let out = '';
	for (const c of s) {
		const n = c.codePointAt(0)!;
		const simple: Record<string, string> = {
			'\\': '\\\\',
			'"': '\\"',
			'\n': '\\n',
			'\r': '\\r',
			'\t': '\\t',
			'\b': '\\b',
			'\f': '\\f'
		};
		if (c in simple) out += simple[c];
		else if (n < 0x20 || n === 0x7f) out += '\\' + n.toString(8).padStart(3, '0');
		else out += c;
	}
	return `"${out}"`;
}

const cRules: BackslashRules = {
	name: 'C or Java',
	simple: {
		n: '\n',
		r: '\r',
		t: '\t',
		b: '\b',
		f: '\f',
		a: '\x07',
		v: '\v',
		'\\': '\\',
		'"': '"',
		"'": "'",
		'?': '?'
	},
	x: 'greedy',
	octal: true,
	u4: true,
	uBrace: false,
	U8: true,
	bytes: true,
	unknown: 'error',
	lineContinuation: true
};

function cUnescape(s: string): string {
	return unbackslash(unquote(trimIfQuoted(s), ['"']), cRules);
}

// ---------------------------------------------------------------------------
// Python: the same escapes repr() uses.

// Python's str.isprintable() is false for these categories, space excepted.
const PY_NONPRINT = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{Zs}]/u;

function pyEscape(s: string): string {
	const q = s.includes("'") && !s.includes('"') ? '"' : "'";
	let out = '';
	for (let i = 0; i < s.length; i++) {
		const n = s.codePointAt(i)!;
		const c = String.fromCodePoint(n);
		if (n > 0xffff) i++;
		if (c === '\\') out += '\\\\';
		else if (c === q) out += '\\' + q;
		else if (c === '\n') out += '\\n';
		else if (c === '\r') out += '\\r';
		else if (c === '\t') out += '\\t';
		else if (c !== ' ' && PY_NONPRINT.test(c)) {
			if (n <= 0xff) out += '\\x' + hex(n, 2);
			else if (n <= 0xffff) out += '\\u' + hex(n, 4);
			else out += '\\U' + hex(n, 8);
		} else out += c;
	}
	return q + out + q;
}

const pyRules: BackslashRules = {
	name: 'Python',
	simple: {
		n: '\n',
		r: '\r',
		t: '\t',
		b: '\b',
		f: '\f',
		a: '\x07',
		v: '\v',
		'\\': '\\',
		'"': '"',
		"'": "'"
	},
	x: 'two',
	octal: true,
	u4: true,
	uBrace: false,
	U8: true,
	bytes: false,
	unknown: 'keep',
	lineContinuation: true
};

function pyUnescape(s: string): string {
	const t = trimIfQuoted(s);
	if (/\\N\{/.test(t)) throw new Error('\\N{name} escapes are not supported here');
	return unbackslash(unquote(t, ['"""', "'''", '"', "'"]), pyRules);
}

// ---------------------------------------------------------------------------
// SQL: standard single-quoted literal, quotes doubled.

function sqlUnescape(s: string): string {
	const body = unquote(trimIfQuoted(s), ["'"]);
	if (body.replace(/''/g, '').includes("'")) throw new Error('Single quote that is not doubled');
	return body.replace(/''/g, "'");
}

// ---------------------------------------------------------------------------
// POSIX shell: one single-quoted word, ' written as '\''.

function shellEscape(s: string): string {
	return `'${s.replace(/'/g, "'\\''")}'`;
}

/** Reads one shell word: single quotes, double quotes and backslashes. Expansions are refused. */
function shellUnescape(s: string): string {
	const t = s.trim();
	let out = '';
	let i = 0;
	while (i < t.length) {
		const c = t[i];
		if (c === "'") {
			const end = t.indexOf("'", i + 1);
			if (end < 0) throw new Error('Unclosed single quote');
			out += t.slice(i + 1, end);
			i = end + 1;
		} else if (c === '"') {
			i++;
			for (;;) {
				if (i >= t.length) throw new Error('Unclosed double quote');
				const d = t[i];
				if (d === '"') break;
				if (d === '\\' && i + 1 < t.length && '$`"\\\n'.includes(t[i + 1])) {
					if (t[i + 1] !== '\n') out += t[i + 1];
					i += 2;
					continue;
				}
				if (d === '$' || d === '`')
					throw new Error(`${d} inside double quotes expands, the result depends on the shell`);
				out += d;
				i++;
			}
			i++;
		} else if (c === '\\') {
			if (i + 1 >= t.length) throw new Error('Ends with a lone backslash');
			if (t[i + 1] !== '\n') out += t[i + 1];
			i += 2;
		} else if (/\s/.test(c)) {
			throw new Error('Unquoted whitespace: this is more than one word');
		} else if ('$`'.includes(c)) {
			throw new Error(`Unquoted ${c} expands, the result depends on the shell`);
		} else {
			out += c;
			i++;
		}
	}
	return out;
}

// ---------------------------------------------------------------------------
// PowerShell. It also treats typographic quotes as quote characters
// (about_Quoting_Rules), so those are doubled or escaped too.

const PS_SINGLE = /['\u2018\u2019\u201a\u201b]/;
const PS_SINGLE_ALL = /['\u2018\u2019\u201a\u201b]/g;
const PS_SINGLE_PAIR = /(['\u2018\u2019\u201a\u201b])\1/g;
const PS_DOUBLE = /["\u201c\u201d\u201e]/;

function psSingleEscape(s: string): string {
	return `'${s.replace(PS_SINGLE_ALL, (q) => q + q)}'`;
}

function psSingleUnescape(s: string): string {
	let t = trimIfQuoted(s);
	if (t.length >= 2 && PS_SINGLE.test(t[0]) && PS_SINGLE.test(t[t.length - 1])) t = t.slice(1, -1);
	if (PS_SINGLE.test(t.replace(PS_SINGLE_PAIR, '')))
		throw new Error('Single quote that is not doubled');
	return t.replace(PS_SINGLE_PAIR, '$1');
}

const PS_CTRL: Record<string, string> = {
	'\0': '`0',
	'\x07': '`a',
	'\b': '`b',
	'\x1b': '`e',
	'\f': '`f',
	'\n': '`n',
	'\r': '`r',
	'\t': '`t',
	'\v': '`v'
};

function psDoubleEscape(s: string): string {
	let out = '';
	for (const c of s) {
		const n = c.codePointAt(0)!;
		if (c in PS_CTRL) out += PS_CTRL[c];
		else if (c === '`' || c === '$' || PS_DOUBLE.test(c)) out += '`' + c;
		else if (n < 0x20 || n === 0x7f) out += '`u{' + n.toString(16) + '}';
		else out += c;
	}
	return `"${out}"`;
}

function psDoubleUnescape(s: string): string {
	let t = trimIfQuoted(s);
	if (t.length >= 2 && PS_DOUBLE.test(t[0]) && PS_DOUBLE.test(t[t.length - 1])) t = t.slice(1, -1);
	const back = Object.fromEntries(Object.entries(PS_CTRL).map(([k, v]) => [v[1], k]));
	let out = '';
	for (let i = 0; i < t.length; i++) {
		const c = t[i];
		if (c === '`') {
			const e = t[++i];
			if (e === undefined) throw new Error('Ends with a lone backtick');
			if (e in back) out += back[e];
			else if (e === 'u' && t[i + 1] === '{') {
				const m = t.slice(i + 2).match(/^([0-9a-fA-F]{1,6})\}/);
				if (!m || parseInt(m[1], 16) > 0x10ffff) throw new Error('Malformed `u{...}');
				out += String.fromCodePoint(parseInt(m[1], 16));
				i += m[0].length + 1;
			} else out += e;
		} else if (PS_DOUBLE.test(c) && PS_DOUBLE.test(t[i + 1] ?? '')) {
			out += c;
			i++;
		} else if (c === '$') {
			throw new Error('Unescaped $ starts a variable, the result depends on the session');
		} else if (PS_DOUBLE.test(c)) {
			throw new Error('Double quote that is not escaped');
		} else out += c;
	}
	return out;
}

// ---------------------------------------------------------------------------
// CSV field (RFC 4180): quoted when it holds a comma, quote or line break.

function csvEscape(s: string): string {
	return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvUnescape(s: string): string {
	if (!s.startsWith('"')) {
		if (s.includes('"')) throw new Error('A quote in an unquoted field');
		return s;
	}
	if (s.length < 2 || !s.endsWith('"')) throw new Error('Unclosed quoted field');
	const body = s.slice(1, -1);
	if (/"/.test(body.replace(/""/g, '')))
		throw new Error('Quote inside the field that is not doubled');
	return body.replace(/""/g, '"');
}

// ---------------------------------------------------------------------------
// Regex literal, JavaScript syntax: matches the text exactly.

function regexEscape(s: string): string {
	const body = s.replace(/[.*+?^${}()|[\]\\/\n\r\t\u2028\u2029]/g, (c) => {
		const map: Record<string, string> = {
			'\n': '\\n',
			'\r': '\\r',
			'\t': '\\t',
			'\u2028': '\\u2028',
			'\u2029': '\\u2029'
		};
		return map[c] ?? '\\' + c;
	});
	return `/${body}/`;
}

function regexUnescape(s: string): string {
	let t = trimIfQuoted(s);
	const lit = t.match(/^\/([\s\S]*)\/[a-z]*$/);
	if (lit) t = lit[1];
	let out = '';
	for (let i = 0; i < t.length; i++) {
		const c = t[i];
		if (c === '\\') {
			const e = t[++i];
			if (e === undefined) throw new Error('Ends with a lone backslash');
			const ctrl: Record<string, string> = {
				n: '\n',
				r: '\r',
				t: '\t',
				v: '\v',
				f: '\f',
				'0': '\0'
			};
			if (e in ctrl && !(e === '0' && /[0-9]/.test(t[i + 1] ?? ''))) out += ctrl[e];
			else if (e === 'x' && /^[0-9a-fA-F]{2}/.test(t.slice(i + 1))) {
				out += String.fromCharCode(parseInt(t.slice(i + 1, i + 3), 16));
				i += 2;
			} else if (e === 'u' && /^[0-9a-fA-F]{4}/.test(t.slice(i + 1))) {
				out += String.fromCharCode(parseInt(t.slice(i + 1, i + 5), 16));
				i += 4;
			} else if (e === 'u' && /^\{[0-9a-fA-F]{1,6}\}/.test(t.slice(i + 1))) {
				const m = t.slice(i + 2).match(/^[0-9a-fA-F]+/)![0];
				out += String.fromCodePoint(parseInt(m, 16));
				i += m.length + 2;
			} else if (/[a-zA-Z0-9]/.test(e))
				throw new Error(`\\${e} is a pattern, not a literal character`);
			else out += e;
		} else if ('.*+?^$()[]{}|'.includes(c)) {
			throw new Error(`Unescaped ${c} is a regex operator, so this is not a plain literal`);
		} else out += c;
	}
	return out;
}

// ---------------------------------------------------------------------------
// HTML attribute and XML

function htmlAttrEscape(s: string): string {
	return `"${s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)}"`;
}

function htmlAttrUnescape(s: string): string {
	const r = decodeEntities(unquote(trimIfQuoted(s), ['"', "'"]));
	if (r.unknown.length) throw new Error(`Unknown entity ${r.unknown[0]}`);
	return r.text;
}

// XML 1.0 section 2.2: characters not allowed even as references.
const XML_BAD =
	/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

function xmlEscape(s: string): string {
	return s
		.replace(XML_BAD, '')
		.replace(
			/[&<>"'\r]/g,
			(c) =>
				({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;', '\r': '&#xD;' })[
					c
				]!
		);
}

function xmlUnescape(s: string): string {
	const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
	return s.replace(/&([^;\s&]*);?/g, (m, body: string) => {
		if (!m.endsWith(';'))
			throw new Error(`"${m}" is not a complete reference, & must be written &amp;`);
		if (body in named) return named[body];
		const num = body.match(/^#(?:x([0-9a-fA-F]+)|([0-9]+))$/);
		if (num) {
			const n = num[1] ? parseInt(num[1], 16) : parseInt(num[2], 10);
			if (n > 0x10ffff || n === 0) throw new Error(`${m} is not a valid character`);
			return String.fromCodePoint(n);
		}
		throw new Error(`${m} is not one of the five predefined XML entities`);
	});
}

// ---------------------------------------------------------------------------

const hasNul = (s: string) => s.includes('\0');

export const flavours: Flavour[] = [
	{ id: 'json', label: 'JSON string', escape: jsonEscape, unescape: jsonUnescape },
	{ id: 'js', label: 'JavaScript', escape: jsEscape, unescape: jsUnescape },
	{ id: 'c', label: 'C / Java', escape: cEscape, unescape: cUnescape },
	{ id: 'python', label: 'Python', escape: pyEscape, unescape: pyUnescape },
	{
		id: 'sql',
		label: 'SQL',
		escape: (s) => `'${s.replace(/'/g, "''")}'`,
		unescape: sqlUnescape,
		warn: (s) => (hasNul(s) ? 'Most databases reject NUL in text values' : undefined)
	},
	{
		id: 'shell',
		label: 'POSIX shell',
		escape: shellEscape,
		unescape: shellUnescape,
		warn: (s) => (hasNul(s) ? 'A shell argument cannot contain NUL, it ends the string' : undefined)
	},
	{ id: 'ps', label: "PowerShell '...'", escape: psSingleEscape, unescape: psSingleUnescape },
	{ id: 'ps-dq', label: 'PowerShell "..."', escape: psDoubleEscape, unescape: psDoubleUnescape },
	{ id: 'csv', label: 'CSV field', escape: csvEscape, unescape: csvUnescape },
	{ id: 'regex', label: 'Regex literal', escape: regexEscape, unescape: regexUnescape },
	{ id: 'html', label: 'HTML attribute', escape: htmlAttrEscape, unescape: htmlAttrUnescape },
	{
		id: 'xml',
		label: 'XML',
		escape: xmlEscape,
		unescape: xmlUnescape,
		warn: (s) => {
			XML_BAD.lastIndex = 0;
			const bad = XML_BAD.test(s);
			XML_BAD.lastIndex = 0;
			return bad
				? 'Control characters other than tab, LF and CR are not allowed in XML 1.0, they were dropped'
				: undefined;
		}
	}
];

export function flavour(id: string): Flavour {
	const f = flavours.find((x) => x.id === id);
	if (!f) throw new Error(`Unknown escaping "${id}"`);
	return f;
}
