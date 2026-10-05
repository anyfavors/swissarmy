/*
 * Grok: %{PATTERN:field:type} expanded to a regular expression, as in the Logstash grok filter
 * (https://www.elastic.co/guide/en/logstash/current/plugins-filters-grok.html). Grok patterns are
 * written for the Oniguruma engine; the few constructs JavaScript lacks are translated
 * (atomic groups, \A \z \Z, POSIX bracket classes) or reported.
 */
import { CORE_MAP } from './patterns';

export type Cast = 'int' | 'float';

export interface Capture {
	/** JavaScript group name used in the compiled expression. */
	group: string;
	/** Field name as written in the grok pattern. */
	field: string;
	cast?: Cast;
	/** The pattern name, or "regex" for an inline (?<name>...) capture. */
	pattern: string;
}

export interface Compiled {
	source: string;
	flags: string;
	captures: Capture[];
}

const MAX_DEPTH = 40;
const MAX_LENGTH = 200_000;

/** Reads "NAME regex" definitions, one per line, as in a Logstash patterns file. */
export function parsePatternFile(text: string): Record<string, string> {
	const out: Record<string, string> = {};
	text.split(/\r?\n/).forEach((l, i) => {
		const t = l.trim();
		if (!t || t.startsWith('#')) return;
		const m = /^(\w+)\s+(.+)$/.exec(t);
		if (!m) throw new Error(`Custom patterns line ${i + 1}: write NAME followed by the regex`);
		out[m[1]] = m[2];
	});
	return out;
}

const REF_RE = /%\{(\w+)(?::([^:}]+)(?::([^:}]+))?)?\}/g;

/** Expands %{...} references recursively. Returns Oniguruma-flavoured source. */
export function expand(
	grok: string,
	library: Record<string, string>
): { source: string; captures: Capture[] } {
	const captures: Capture[] = [];
	const go = (text: string, stack: string[]): string => {
		if (stack.length > MAX_DEPTH) throw new Error(`Patterns nest deeper than ${MAX_DEPTH} levels`);
		const named = renameInline(text, captures);
		const out = named.replace(REF_RE, (_all, name: string, field?: string, cast?: string) => {
			const def = library[name];
			if (def === undefined) throw new Error(`Unknown pattern %{${name}}`);
			if (stack.includes(name))
				throw new Error(`Pattern ${name} refers to itself: ${[...stack, name].join(' > ')}`);
			if (cast !== undefined && cast !== 'int' && cast !== 'float')
				throw new Error(`%{${name}:${field}:${cast}}: only :int and :float conversions exist`);
			// Reserve the group number before expanding, so outer fields come first.
			let cap: Capture | undefined;
			if (field) {
				cap = {
					group: `g${captures.length}`,
					field,
					cast: cast as Cast | undefined,
					pattern: name
				};
				captures.push(cap);
			}
			const inner = go(def, [...stack, name]);
			return cap ? `(?<${cap.group}>${inner})` : `(?:${inner})`;
		});
		if (out.length > MAX_LENGTH) throw new Error('The expanded expression is too long');
		return out;
	};
	return { source: go(grok, []), captures };
}

/** Renames Oniguruma named groups (?<field>...) to safe JavaScript group names. */
function renameInline(text: string, captures: Capture[]): string {
	let out = '';
	let inClass = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (c === '\\') {
			out += c + (text[i + 1] ?? '');
			i++;
			continue;
		}
		if (inClass) {
			if (c === ']') inClass = false;
			out += c;
			continue;
		}
		if (c === '[') {
			inClass = true;
			out += c;
			if (text[i + 1] === '^') out += text[++i];
			if (text[i + 1] === ']') out += text[++i];
			continue;
		}
		const m = c === '(' ? /^\(\?<([^=!>][^>]*)>/.exec(text.slice(i)) : null;
		if (m) {
			const cap: Capture = { group: `g${captures.length}`, field: m[1], pattern: 'regex' };
			captures.push(cap);
			out += `(?<${cap.group}>`;
			i += m[0].length - 1;
			continue;
		}
		out += c;
	}
	return out;
}

const POSIX: Record<string, string> = {
	alnum: 'A-Za-z0-9',
	alpha: 'A-Za-z',
	blank: ' \\t',
	cntrl: '\\x00-\\x1f\\x7f',
	digit: '0-9',
	graph: '\\x21-\\x7e',
	lower: 'a-z',
	print: '\\x20-\\x7e',
	punct: '!-\\/:-@\\[-`{-~',
	space: '\\s',
	upper: 'A-Z',
	word: '\\w',
	xdigit: '0-9A-Fa-f'
};

/**
 * Translates Oniguruma syntax to JavaScript: atomic groups become a lookahead plus a
 * back-reference (same matching, no backtracking into the group), \A \z \Z become ^ and $,
 * \h becomes a hex digit class, POSIX classes such as [[:alpha:]] are spelled out.
 */
export function toJavaScript(src: string): string {
	let n = 0;
	let i = 0;
	const fail = (msg: string): never => {
		throw new Error(msg);
	};
	const cls = (): string => {
		// At '[': copy a character class, flattening POSIX and nested classes.
		let out = '[';
		i++;
		if (src[i] === '^') out += src[i++];
		if (src[i] === ']') out += '\\' + src[i++];
		while (i < src.length && src[i] !== ']') {
			const c = src[i];
			if (c === '\\') {
				out += c + (src[i + 1] ?? '');
				i += 2;
				continue;
			}
			if (c === '[') {
				const p = /^\[:(\^?)(\w+):\]/.exec(src.slice(i));
				if (p) {
					if (p[1]) fail(`Negated POSIX class [:^${p[2]}:] is not supported`);
					const r = POSIX[p[2]];
					if (!r) fail(`Unknown POSIX class [:${p[2]}:]`);
					out += r;
					i += p[0].length;
					continue;
				}
				// A nested class: merge its members into this one.
				const inner = cls();
				if (inner.startsWith('[^')) fail('Negated nested character classes are not supported');
				out += inner.slice(1, -1);
				continue;
			}
			if (c === '&' && src[i + 1] === '&')
				fail('Character class intersection (&&) is not supported');
			out += c;
			i++;
		}
		if (src[i] !== ']') fail('Unterminated character class [');
		i++;
		return out + ']';
	};
	const seq = (inGroup: boolean): string => {
		let out = '';
		while (i < src.length) {
			const c = src[i];
			if (c === '\\') {
				const d = src[i + 1];
				if (d === undefined) fail('Pattern ends with a lone backslash');
				if (d === 'A') out += '^';
				else if (d === 'z' || d === 'Z') out += '$';
				else if (d === 'h') out += '[0-9A-Fa-f]';
				else if (d === 'H') out += '[^0-9A-Fa-f]';
				else out += c + d;
				i += 2;
				continue;
			}
			if (c === '[') {
				out += cls();
				continue;
			}
			if (c === ')') {
				if (!inGroup) fail('Unmatched )');
				return out;
			}
			if (c === '(') {
				if (src.startsWith('(?>', i)) {
					i += 3;
					const inner = seq(true);
					if (src[i] !== ')') fail('Unterminated group (?>');
					i++;
					const name = `a${n++}`;
					out += `(?:(?=(?<${name}>${inner}))\\k<${name}>)`;
					continue;
				}
				const head = /^\((?:\?(?:<[=!]|<\w+>|[:=!]))?/.exec(src.slice(i))![0];
				if (/^\(\?[imsx-]+[:)]/.test(src.slice(i)))
					fail('Inline flags such as (?i) are only supported at the very start of the pattern');
				i += head.length;
				const inner = seq(true);
				if (src[i] !== ')') fail('Unterminated group (');
				i++;
				out += head + inner + ')';
				continue;
			}
			// Possessive quantifier: a++, a*+, a?+, a{2}+
			if (c === '+' && /(?:^|[^\\])[*+?}]$/.test(out))
				fail('Possessive quantifiers such as ++ and *+ are not supported in JavaScript');
			out += c;
			i++;
		}
		if (inGroup) fail('Unterminated group (');
		return out;
	};
	return seq(false);
}

/** Expands and translates a grok expression for the JavaScript engine. */
export function compile(grok: string, custom: Record<string, string> = {}): Compiled {
	let g = grok;
	let flags = '';
	const f = /^\(\?([imsx]+)\)/.exec(g);
	if (f) {
		if (f[1].includes('x')) throw new Error('The x (extended) flag is not supported');
		flags = [...new Set(f[1])].join('');
		g = g.slice(f[0].length);
	}
	if (!g) throw new Error('Enter a grok pattern, e.g. %{IP:client} %{WORD:method}');
	const { source, captures } = expand(g, { ...CORE_MAP, ...custom });
	const js = toJavaScript(source);
	try {
		new RegExp(js, flags);
	} catch (e) {
		throw new Error(`The expanded expression is not valid JavaScript: ${(e as Error).message}`);
	}
	return { source: js, flags, captures };
}

/* ---------- matching (runs in the worker) ---------- */

export interface FieldValue {
	field: string;
	value: string | number | (string | number)[];
	/** Character range of the (first) capture in the line. */
	start: number;
	end: number;
	pattern: string;
}

export interface LineResult {
	line: string;
	match: { start: number; end: number } | null;
	fields: FieldValue[];
}

export interface GrokRun {
	results: LineResult[];
	truncated: boolean;
	error?: string;
}

export const LINE_LIMIT = 500;

function castValue(v: string, cast?: Cast): string | number {
	if (cast === 'int') {
		// Logstash converts like Ruby's to_i: leading digits, else 0.
		const n = parseInt(v, 10);
		return Number.isNaN(n) ? 0 : n;
	}
	if (cast === 'float') {
		const n = parseFloat(v);
		return Number.isNaN(n) ? 0 : n;
	}
	return v;
}

/** Matches each line against the compiled expression (unanchored, first match, as grok does). */
export function runGrok(c: Compiled, text: string): GrokRun {
	let re: RegExp;
	try {
		re = new RegExp(c.source, c.flags + 'd');
	} catch (e) {
		return { results: [], truncated: false, error: (e as Error).message };
	}
	let lines = text.split(/\r?\n/);
	if (lines.length > 1 && lines.at(-1) === '') lines.pop();
	const truncated = lines.length > LINE_LIMIT;
	if (truncated) lines = lines.slice(0, LINE_LIMIT);
	const results = lines.map((line): LineResult => {
		const m = re.exec(line) as (RegExpExecArray & { indices?: RegExpIndicesArray }) | null;
		if (!m) return { line, match: null, fields: [] };
		const byField = new Map<string, FieldValue>();
		for (const cap of c.captures) {
			const v = m.groups?.[cap.group];
			if (v === undefined) continue;
			const range = m.indices?.groups?.[cap.group] ?? [m.index, m.index];
			const val = castValue(v, cap.cast);
			const prev = byField.get(cap.field);
			if (prev) prev.value = Array.isArray(prev.value) ? [...prev.value, val] : [prev.value, val];
			else
				byField.set(cap.field, {
					field: cap.field,
					value: val,
					start: range[0],
					end: range[1],
					pattern: cap.pattern
				});
		}
		return {
			line,
			match: { start: m.index, end: m.index + m[0].length },
			fields: [...byField.values()]
		};
	});
	return { results, truncated };
}

export interface Segment {
	text: string;
	kind: 'plain' | 'match' | 'field';
	field?: string;
}

/** Splits a line for highlighting: outside the match, matched text, and top-level field spans. */
export function segments(r: LineResult): Segment[] {
	if (!r.match) return [{ text: r.line, kind: 'plain' }];
	const out: Segment[] = [];
	const push = (a: number, b: number, kind: Segment['kind'], field?: string) => {
		if (b > a) out.push({ text: r.line.slice(a, b), kind, field });
	};
	push(0, r.match.start, 'plain');
	const spans = r.fields
		.filter((f) => f.end > f.start)
		.sort((a, b) => a.start - b.start || b.end - a.end);
	let pos = r.match.start;
	for (const s of spans) {
		if (s.start < pos) continue;
		push(pos, s.start, 'match');
		push(s.start, s.end, 'field', s.field);
		pos = s.end;
	}
	push(pos, r.match.end, 'match');
	push(r.match.end, r.line.length, 'plain');
	return out;
}

/** Front page intake: text that contains grok references. */
export function looksLikeGrok(s: string): number {
	const t = s.trim();
	if (t.length > 5000 || t.includes('\n')) return 0;
	return /%\{[A-Z][A-Z0-9_]*(?::[^}]+)?\}/.test(t) ? 0.9 : 0;
}
