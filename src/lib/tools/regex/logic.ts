/** Regex tester: matching (run inside a worker by the UI) and a token-level explainer. */

export const ALL_FLAGS = ['g', 'i', 'm', 's', 'u', 'v', 'y'] as const;
export type Flag = (typeof ALL_FLAGS)[number];

export const flagInfo: Record<Flag, string> = {
	g: 'global: find all matches',
	i: 'ignore case',
	m: 'multiline: ^ and $ match at line breaks',
	s: 'dotAll: . also matches line breaks',
	u: 'unicode: code points, \\p{...} escapes',
	v: 'unicodeSets: u plus set operations in classes',
	y: 'sticky: match only at lastIndex'
};

export function supportsFlag(f: string): boolean {
	try {
		new RegExp('', f);
		return true;
	} catch {
		return false;
	}
}

export interface Match {
	index: number;
	end: number;
	text: string;
	/** Numbered groups, 1-based in the UI; index 0 here is group 1. */
	groups: (string | undefined)[];
	named: Record<string, string | undefined>;
}

export interface RunResult {
	matches: Match[];
	/** True when the match list was cut at the limit. */
	truncated: boolean;
	replaced?: string;
	groupNames: string[];
	groupCount: number;
	error?: string;
}

export const MATCH_LIMIT = 1000;

function toMatch(m: RegExpExecArray): Match {
	return {
		index: m.index,
		end: m.index + m[0].length,
		text: m[0],
		groups: m.slice(1),
		named: m.groups ? { ...m.groups } : {}
	};
}

/** Number of capturing groups, found by matching the pattern against an empty alternative. */
function countGroups(source: string, flags: string): number {
	const probe = new RegExp(`${source}|`, flags.replace(/[gy]/g, ''));
	return (probe.exec('') as RegExpExecArray).length - 1;
}

export function runRegex(
	pattern: string,
	flags: string,
	text: string,
	replacement?: string,
	limit = MATCH_LIMIT
): RunResult {
	let re: RegExp;
	try {
		re = new RegExp(pattern, flags);
	} catch (e) {
		return {
			matches: [],
			truncated: false,
			groupNames: [],
			groupCount: 0,
			error: (e as Error).message
		};
	}
	const matches: Match[] = [];
	let truncated = false;
	if (re.global) {
		re.lastIndex = 0;
		let m: RegExpExecArray | null;
		while ((m = re.exec(text))) {
			if (matches.length >= limit) {
				truncated = true;
				break;
			}
			matches.push(toMatch(m));
			// Step past empty matches, by code point in u/v mode, as String.prototype.matchAll does.
			if (m[0] === '') {
				const cp = re.unicode || re.unicodeSets ? (text.codePointAt(re.lastIndex) ?? 0) : 0;
				re.lastIndex += cp > 0xffff ? 2 : 1;
			}
		}
	} else {
		const m = re.exec(text);
		if (m) matches.push(toMatch(m));
	}
	const groupCount = countGroups(pattern, flags);
	const names = new Set<string>();
	for (const m of pattern.matchAll(/\(\?<([^>=!]+)>/g)) names.add(m[1]);
	const out: RunResult = { matches, truncated, groupNames: [...names], groupCount };
	if (replacement !== undefined) {
		re.lastIndex = 0;
		out.replaced = text.replace(re, replacement);
	}
	return out;
}

export interface Segment {
	text: string;
	/** Index into the match list, or -1 for unmatched text. */
	match: number;
	/** Marks the position of a zero-length match. */
	empty?: boolean;
}

/** Splits text into unmatched and matched runs for highlighting. */
export function segments(text: string, matches: Match[]): Segment[] {
	const out: Segment[] = [];
	let pos = 0;
	matches.forEach((m, i) => {
		if (m.index < pos) return;
		if (m.index > pos) out.push({ text: text.slice(pos, m.index), match: -1 });
		if (m.end === m.index) out.push({ text: '', match: i, empty: true });
		else out.push({ text: text.slice(m.index, m.end), match: i });
		pos = m.end;
	});
	if (pos < text.length) out.push({ text: text.slice(pos), match: -1 });
	return out;
}

/** Parses "/pattern/flags" as pasted from source code. */
export function parseLiteral(s: string): { pattern: string; flags: string } | null {
	const m = s.match(/^\/((?:\\.|[^\\])+)\/([dgimsuvy]*)$/s);
	return m ? { pattern: m[1], flags: m[2].replace('d', '') } : null;
}

// ---------------------------------------------------------------------------
// Explainer
// ---------------------------------------------------------------------------

export interface Token {
	/** Source text of the token. */
	src: string;
	text: string;
	/** Nesting depth inside groups. */
	depth: number;
	kind: 'literal' | 'class' | 'escape' | 'quant' | 'anchor' | 'group' | 'alt' | 'backref';
}

const escapeText: Record<string, string> = {
	d: 'a digit 0-9',
	D: 'any character except a digit',
	w: 'a word character: letter, digit or _',
	W: 'any character except a word character',
	s: 'whitespace (space, tab, line break and others)',
	S: 'any character except whitespace',
	t: 'a tab',
	n: 'a line feed',
	r: 'a carriage return',
	f: 'a form feed',
	v: 'a vertical tab',
	'0': 'the NUL character'
};

function describeChar(c: string): string {
	if (c === ' ') return 'a space';
	return `"${c}"`;
}

/** Reads one escape at s[i] === '\\'. Returns [source, description, kind]. */
function readEscape(s: string, i: number, inClass: boolean): [string, string, Token['kind']] {
	const c = s[i + 1];
	if (c === undefined) throw new Error('Pattern ends with a lone backslash');
	if (c in escapeText) {
		if (c === '0' && /[0-9]/.test(s[i + 2] ?? ''))
			return [s.slice(i, i + 3), 'an octal escape', 'escape'];
		return [`\\${c}`, escapeText[c], 'escape'];
	}
	if (c === 'b')
		return [
			'\\b',
			inClass ? 'a backspace character' : 'a word boundary',
			inClass ? 'escape' : 'anchor'
		];
	if (c === 'B') return ['\\B', 'not a word boundary', 'anchor'];
	if (c === 'x') {
		const h = s.slice(i + 2, i + 4);
		if (/^[0-9a-fA-F]{2}$/.test(h))
			return [`\\x${h}`, `the character U+${h.toUpperCase().padStart(4, '0')}`, 'escape'];
	}
	if (c === 'u') {
		const br = s.slice(i + 2).match(/^\{([0-9a-fA-F]{1,6})\}/);
		if (br)
			return [`\\u${br[0]}`, `the character U+${br[1].toUpperCase().padStart(4, '0')}`, 'escape'];
		const h = s.slice(i + 2, i + 6);
		if (/^[0-9a-fA-F]{4}$/.test(h))
			return [`\\u${h}`, `the character U+${h.toUpperCase()}`, 'escape'];
	}
	if (c === 'c' && /[A-Za-z]/.test(s[i + 2] ?? ''))
		return [s.slice(i, i + 3), `the control character Ctrl-${s[i + 2].toUpperCase()}`, 'escape'];
	if (c === 'p' || c === 'P') {
		const m = s.slice(i + 2).match(/^\{([^}]*)\}/);
		if (m)
			return [
				`\\${c}${m[0]}`,
				`${c === 'P' ? 'any character without' : 'a character with'} the Unicode property ${m[1]}`,
				'escape'
			];
	}
	if (c === 'k' && !inClass) {
		const m = s.slice(i + 2).match(/^<([^>]+)>/);
		if (m) return [`\\k${m[0]}`, `the same text as group "${m[1]}" matched`, 'backref'];
	}
	if (/[1-9]/.test(c) && !inClass) {
		const m = s.slice(i + 1).match(/^[0-9]+/)!;
		return [`\\${m[0]}`, `the same text as group #${m[0]} matched`, 'backref'];
	}
	return [`\\${c}`, `a literal ${describeChar(c)}`, 'literal'];
}

function readClass(s: string, i: number): [string, string] {
	let j = i + 1;
	const negated = s[j] === '^';
	if (negated) j++;
	const items: string[] = [];
	let depth = 1;
	let first = true;
	while (j < s.length) {
		const c = s[j];
		if (c === ']' && !first) {
			depth--;
			if (depth === 0) break;
		}
		first = false;
		if (c === '[') {
			// Nested classes only exist in v mode; keep the description simple.
			depth++;
			items.push('a nested set');
			j++;
			continue;
		}
		let one: string;
		let len: number;
		if (c === '\\') {
			const [src, d] = readEscape(s, j, true);
			one = d;
			len = src.length;
		} else {
			one = describeChar(c);
			len = 1;
		}
		if (s[j + len] === '-' && s[j + len + 1] !== undefined && s[j + len + 1] !== ']') {
			const k = j + len + 1;
			let other: string;
			let olen: number;
			if (s[k] === '\\') {
				const [src, d] = readEscape(s, k, true);
				other = d;
				olen = src.length;
			} else {
				other = describeChar(s[k]);
				olen = 1;
			}
			items.push(`${one} to ${other}`);
			j = k + olen;
		} else {
			items.push(one);
			j += len;
		}
	}
	if (j >= s.length) throw new Error('Unterminated character class');
	const src = s.slice(i, j + 1);
	const list = items.length ? items.join(', ') : 'nothing';
	return [src, negated ? `any character except: ${list}` : `one of: ${list}`];
}

function quantText(q: string): string {
	const lazy = q.length > 1 && q.endsWith('?') && q !== '?';
	const base = lazy ? q.slice(0, -1) : q;
	let t: string;
	if (base === '*') t = 'zero or more times';
	else if (base === '+') t = 'one or more times';
	else if (base === '?') t = 'optional (zero or one time)';
	else {
		const m = base.match(/^\{(\d+)(,(\d*))?\}$/)!;
		if (!m[2]) t = `exactly ${m[1]} time${m[1] === '1' ? '' : 's'}`;
		else if (m[3] === '') t = `${m[1]} or more times`;
		else t = `between ${m[1]} and ${m[3]} times`;
	}
	if (base !== '?' && base.startsWith('{') && !base.includes(','))
		return `Repeat the previous item ${t}`;
	return `Repeat the previous item ${t}, ${lazy ? 'as few as possible (lazy)' : 'as many as possible (greedy)'}`;
}

const QUANT_RE = /^(?:[*+?]|\{\d+(?:,\d*)?\})\??/;

/** Splits a pattern into explained tokens. Throws on syntax it cannot follow. */
export function explain(pattern: string, flags = ''): Token[] {
	const out: Token[] = [];
	let depth = 0;
	let groupNo = 0;
	const dotAll = flags.includes('s');
	const multi = flags.includes('m');
	let i = 0;
	while (i < pattern.length) {
		const c = pattern[i];
		const push = (src: string, text: string, kind: Token['kind'], d = depth) => {
			out.push({ src, text, depth: d, kind });
			i += src.length;
		};
		if (c === '\\') {
			const [src, text, kind] = readEscape(pattern, i, false);
			push(
				src,
				kind === 'literal' ? `Match ${text.replace(/^a literal /, '')}` : `Match ${text}`,
				kind
			);
			if (kind === 'anchor') out[out.length - 1].text = `Assert ${text}`;
		} else if (c === '[') {
			const [src, text] = readClass(pattern, i);
			push(src, `Match ${text}`, 'class');
		} else if (c === '(') {
			const rest = pattern.slice(i);
			let m: RegExpMatchArray | null;
			if ((m = rest.match(/^\(\?<([A-Za-z_$][\w$]*)>/))) {
				groupNo++;
				push(m[0], `Start capturing group #${groupNo} named "${m[1]}"`, 'group');
			} else if (rest.startsWith('(?:')) push('(?:', 'Start a non-capturing group', 'group');
			else if (rest.startsWith('(?='))
				push('(?=', 'Start a lookahead: what follows must match', 'group');
			else if (rest.startsWith('(?!'))
				push('(?!', 'Start a negative lookahead: what follows must not match', 'group');
			else if (rest.startsWith('(?<='))
				push('(?<=', 'Start a lookbehind: what precedes must match', 'group');
			else if (rest.startsWith('(?<!'))
				push('(?<!', 'Start a negative lookbehind: what precedes must not match', 'group');
			else if ((m = rest.match(/^\(\?([ims]*)(?:-([ims]+))?:/)))
				push(
					m[0],
					`Start a group with flags${m[1] ? ` on: ${m[1]}` : ''}${m[2] ? ` off: ${m[2]}` : ''}`,
					'group'
				);
			else if (rest.startsWith('(?')) throw new Error(`Unknown group syntax at position ${i}`);
			else {
				groupNo++;
				push('(', `Start capturing group #${groupNo}`, 'group');
			}
			depth++;
		} else if (c === ')') {
			if (depth === 0) throw new Error(`Unmatched ) at position ${i}`);
			depth--;
			push(')', 'End of group', 'group');
		} else if (c === '|') push('|', 'Or: try the alternative that follows', 'alt');
		else if (c === '^')
			push('^', multi ? 'Assert start of a line' : 'Assert start of the text', 'anchor');
		else if (c === '$')
			push('$', multi ? 'Assert end of a line' : 'Assert end of the text', 'anchor');
		else if (c === '.')
			push(
				'.',
				dotAll ? 'Match any character' : 'Match any character except a line break',
				'class'
			);
		else {
			const q = pattern.slice(i).match(QUANT_RE);
			if (q) {
				if (
					!out.length ||
					out[out.length - 1].kind === 'alt' ||
					out[out.length - 1].src.startsWith('(')
				)
					throw new Error(`Nothing to repeat at position ${i}`);
				push(q[0], quantText(q[0]), 'quant');
			} else push(c, `Match ${describeChar(c)}`, 'literal');
		}
	}
	if (depth > 0) throw new Error('Unterminated group');
	return mergeLiterals(out);
}

/** Joins runs of plain literals into one token, keeping a literal before a quantifier separate. */
function mergeLiterals(tokens: Token[]): Token[] {
	const out: Token[] = [];
	let run = '';
	for (let k = 0; k < tokens.length; k++) {
		const t = tokens[k];
		const prev = out[out.length - 1];
		const mergeable = t.kind === 'literal' && tokens[k + 1]?.kind !== 'quant';
		if (mergeable && prev?.kind === 'literal' && run) {
			run += literalOf(t);
			out[out.length - 1] = { ...prev, src: prev.src + t.src, text: `Match the text "${run}"` };
		} else {
			out.push(t);
			run = mergeable ? literalOf(t) : '';
		}
	}
	return out;
}

function literalOf(t: Token): string {
	return t.src.startsWith('\\') ? t.src.slice(1) : t.src;
}
