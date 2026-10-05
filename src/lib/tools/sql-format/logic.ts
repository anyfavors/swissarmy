/**
 * SQL formatter: a tokenizer and a rule-based layout, dialect-neutral (ANSI SQL plus the common
 * PostgreSQL, MySQL, SQLite and SQL Server quoting). It does not parse or validate the query.
 * String literals, quoted identifiers and comments are copied exactly.
 */

export type TokType =
	| 'word'
	| 'string'
	| 'ident'
	| 'number'
	| 'op'
	| 'open'
	| 'close'
	| 'comma'
	| 'semi'
	| 'dot'
	| 'param'
	| 'line-comment'
	| 'block-comment';

export interface Tok {
	type: TokType;
	text: string;
	pos: number;
	/** White space before the token in the source. */
	ws: boolean;
	/** A line break before the token in the source. */
	nl: boolean;
}

export class SqlError extends Error {
	constructor(
		message: string,
		public pos: number
	) {
		super(message);
	}
}

/**
 * Reserved and common keywords that are written in keyword case. Names that are often used as
 * column names (name, date, value, type, status, ...) are left out on purpose.
 */
export const KEYWORDS = new Set(
	`ADD ALL ALTER AND ANY ARRAY AS ASC BEGIN BETWEEN BY CASCADE CASE CAST CHECK COLLATE COLUMN COMMIT
	CONFLICT CONSTRAINT CREATE CROSS CURRENT CURRENT_DATE CURRENT_TIME CURRENT_TIMESTAMP DATABASE DEFAULT
	DELETE DESC DISTINCT DO DROP ELSE END ESCAPE EXCEPT EXISTS EXPLAIN FALSE FETCH FILTER FIRST FOLLOWING
	FOR FOREIGN FROM FULL FUNCTION GRANT GROUP HAVING IF ILIKE IN INDEX INNER INSERT INTERSECT INTERVAL INTO
	IS JOIN KEY LAST LATERAL LEFT LIKE LIMIT MATERIALIZED NATURAL NEXT NOT NOTHING NULL NULLS OFFSET ON ONLY OR
	ORDER OUTER OVER PARTITION PRECEDING PRIMARY PROCEDURE RANGE RECURSIVE REFERENCES REPLACE RETURNING
	REVOKE RIGHT ROLLBACK ROW ROWS SCHEMA SELECT SET SOME TABLE TEMPORARY THEN TO TOP TRANSACTION TRIGGER
	TRUE TRUNCATE UNBOUNDED UNION UNIQUE UPDATE USING VALUES VIEW WHEN WHERE WINDOW WITH`.split(/\s+/)
);

const OPS = [
	'->>',
	'#>>',
	'!~*',
	'<=>',
	'<>',
	'<=',
	'>=',
	'!=',
	'||',
	'::',
	'->',
	'#>',
	'=>',
	':=',
	'<<',
	'>>',
	'@>',
	'<@',
	'~*',
	'!~',
	'&&'
];

const isWordStart = (c: string) => /[A-Za-z_\u0080-￿]/.test(c);
const isWordChar = (c: string) => /[A-Za-z0-9_$\u0080-￿]/.test(c);
const isDigit = (c: string | undefined) => c !== undefined && c >= '0' && c <= '9';

export function tokenize(sql: string): Tok[] {
	const s = sql;
	const out: Tok[] = [];
	let i = s.charCodeAt(0) === 0xfeff ? 1 : 0;
	let ws = false;
	let nl = false;
	const push = (type: TokType, start: number, end: number) => {
		out.push({ type, text: s.slice(start, end), pos: start, ws, nl });
		ws = nl = false;
		i = end;
	};
	const until = (
		start: number,
		close: string,
		what: string,
		doubled: boolean,
		backslash = false
	) => {
		let j = start;
		for (;;) {
			const k = s.indexOf(close, j);
			if (k < 0) throw new SqlError(`Unterminated ${what}`, start - 1);
			if (backslash) {
				let b = 0;
				while (s[k - 1 - b] === '\\') b++;
				if (b % 2 === 1) {
					j = k + 1;
					continue;
				}
			}
			if (doubled && s.startsWith(close, k + close.length)) {
				j = k + close.length * 2;
				continue;
			}
			return k + close.length;
		}
	};
	const prevSignificant = () => {
		for (let k = out.length - 1; k >= 0; k--)
			if (out[k].type !== 'line-comment' && out[k].type !== 'block-comment') return out[k];
		return undefined;
	};

	while (i < s.length) {
		const c = s[i];
		const n = s[i + 1];
		if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f') {
			ws = true;
			if (c === '\n' || c === '\r') nl = true;
			i++;
			continue;
		}
		if (c === '-' && n === '-') {
			let e = s.indexOf('\n', i);
			if (e < 0) e = s.length;
			if (s[e - 1] === '\r') e--;
			push('line-comment', i, e);
			continue;
		}
		if (c === '/' && n === '*') {
			const e = s.indexOf('*/', i + 2);
			if (e < 0) throw new SqlError('Unterminated /* comment', i);
			push('block-comment', i, e + 2);
			continue;
		}
		if (c === "'") {
			push('string', i, until(i + 1, "'", 'string', true));
			continue;
		}
		// E'..' (backslash escapes), N'..', X'..', B'..' prefixes
		if (/[EeNnXxBb]/.test(c) && n === "'" && !(i > 0 && isWordChar(s[i - 1]))) {
			const bs = c === 'E' || c === 'e';
			push('string', i, until(i + 2, "'", 'string', true, bs));
			continue;
		}
		if (c === '"') {
			push('ident', i, until(i + 1, '"', 'quoted identifier', true));
			continue;
		}
		if (c === '`') {
			push('ident', i, until(i + 1, '`', 'quoted identifier', true));
			continue;
		}
		if (c === '[') {
			const p = prevSignificant();
			const subscript =
				p &&
				(p.type === 'ident' ||
					p.type === 'close' ||
					(p.type === 'word' && (!KEYWORDS.has(p.text.toUpperCase()) || /^array$/i.test(p.text))));
			if (!subscript) {
				push('ident', i, until(i + 1, ']', 'quoted identifier', true));
				continue;
			}
			push('open', i, i + 1);
			continue;
		}
		if (c === ']') {
			push('close', i, i + 1);
			continue;
		}
		if (c === '$') {
			const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(s.slice(i, i + 66));
			if (m) {
				const tag = m[0];
				const e = s.indexOf(tag, i + tag.length);
				if (e < 0) throw new SqlError('Unterminated dollar-quoted string', i);
				push('string', i, e + tag.length);
				continue;
			}
			if (isDigit(n)) {
				let e = i + 1;
				while (isDigit(s[e])) e++;
				push('param', i, e);
				continue;
			}
		}
		if (isDigit(c) || (c === '.' && isDigit(n))) {
			let e = i;
			if (c === '0' && (n === 'x' || n === 'X') && /[0-9a-fA-F]/.test(s[i + 2] ?? '')) {
				e = i + 2;
				while (/[0-9a-fA-F]/.test(s[e] ?? '')) e++;
			} else {
				while (isDigit(s[e])) e++;
				if (s[e] === '.') {
					e++;
					while (isDigit(s[e])) e++;
				}
				if (
					(s[e] === 'e' || s[e] === 'E') &&
					(isDigit(s[e + 1]) || (/[+-]/.test(s[e + 1] ?? '') && isDigit(s[e + 2])))
				) {
					e += 2;
					while (isDigit(s[e])) e++;
				}
			}
			push('number', i, e);
			continue;
		}
		if (isWordStart(c)) {
			let e = i + 1;
			while (e < s.length && isWordChar(s[e])) e++;
			push('word', i, e);
			continue;
		}
		if (
			(c === '@' || c === ':') &&
			n !== undefined &&
			(isWordStart(n) || (c === '@' && n === '@'))
		) {
			if (!(c === ':' && s[i - 1] === ':')) {
				let e = i + 1;
				while (s[e] === '@') e++;
				while (e < s.length && isWordChar(s[e])) e++;
				push('param', i, e);
				continue;
			}
		}
		if (c === '(') {
			push('open', i, i + 1);
			continue;
		}
		if (c === ')') {
			push('close', i, i + 1);
			continue;
		}
		if (c === ',') {
			push('comma', i, i + 1);
			continue;
		}
		if (c === ';') {
			push('semi', i, i + 1);
			continue;
		}
		if (c === '.') {
			push('dot', i, i + 1);
			continue;
		}
		if (c === '?') {
			push('param', i, i + 1);
			continue;
		}
		const op = OPS.find((o) => s.startsWith(o, i));
		if (op) {
			push('op', i, i + op.length);
			continue;
		}
		if ('+-*/%=<>!|&^~@#'.includes(c)) {
			push('op', i, i + 1);
			continue;
		}
		throw new SqlError(`Unexpected character ${JSON.stringify(c)}`, i);
	}
	return out;
}

export type KeywordCase = 'upper' | 'lower' | 'preserve';

export interface FormatOptions {
	indent: 2 | 4 | 'tab';
	keywordCase: KeywordCase;
}

const defaults: FormatOptions = { indent: 2, keywordCase: 'upper' };

/** Clauses that start a line and put their content on the following lines. */
const BLOCK = new Set([
	'SELECT',
	'FROM',
	'WHERE',
	'GROUP BY',
	'ORDER BY',
	'HAVING',
	'SET',
	'VALUES',
	'WITH',
	'RETURNING',
	'INSERT INTO',
	'UPDATE',
	'DELETE FROM',
	'WINDOW'
]);
/** Clauses that start a line and keep their content on it. */
const INLINE = new Set(['LIMIT', 'OFFSET', 'FETCH', 'ON CONFLICT']);
const SET_OPS = new Set(['UNION', 'UNION ALL', 'UNION DISTINCT', 'INTERSECT', 'EXCEPT', 'MINUS']);
/** Clauses whose top-level commas start a new line. */
const LISTS = new Set([
	'SELECT',
	'FROM',
	'GROUP BY',
	'ORDER BY',
	'SET',
	'VALUES',
	'WITH',
	'RETURNING',
	'WINDOW'
]);
/** Keywords followed by a space before "(", whatever the source did. */
const SPACE_BEFORE_PAREN = new Set([
	'AND',
	'OR',
	'NOT',
	'IN',
	'VALUES',
	'AS',
	'ON',
	'USING',
	'FROM',
	'JOIN',
	'WHERE',
	'SELECT',
	'EXISTS',
	'INTO',
	'THEN',
	'ELSE',
	'WHEN',
	'OVER',
	'TABLE',
	'BY',
	'HAVING',
	'SET',
	'RETURNING',
	'WITH',
	'ALL',
	'ANY',
	'SOME',
	'LATERAL',
	'FILTER',
	'UPDATE'
]);

interface Scope {
	base: number;
	depth: number;
	clause: string;
}

/** Formats SQL. Throws SqlError only for unterminated strings, identifiers or comments. */
export function formatSql(sql: string, opts: Partial<FormatOptions> = {}): string {
	const o = { ...defaults, ...opts };
	const unit = o.indent === 'tab' ? '\t' : ' '.repeat(o.indent);
	const toks = tokenize(sql);
	const lines: string[] = [];
	let cur = '';
	let curIndent = 0;
	let noSpace = false;

	const flush = () => {
		if (cur) lines.push(unit.repeat(curIndent) + cur.replace(/\s+$/, ''));
		cur = '';
	};
	const newline = (indent: number) => {
		flush();
		curIndent = indent;
	};
	const emit = (text: string, space: boolean) => {
		if (!cur) cur = text;
		else cur += (space && !noSpace ? ' ' : '') + text;
		noSpace = false;
	};
	const kw = (t: string) =>
		o.keywordCase === 'upper' ? t.toUpperCase() : o.keywordCase === 'lower' ? t.toLowerCase() : t;

	let scopes: Scope[] = [{ base: 0, depth: 0, clause: '' }];
	let parens: { sub: boolean; indent: number }[] = [];
	let cases: { indent: number; depth: number }[] = [];
	let between = false;
	let prev: Tok | undefined;
	let prevIsKeyword = false;

	const sig = (from: number): Tok | undefined => {
		for (let k = from; k < toks.length; k++)
			if (toks[k].type !== 'line-comment' && toks[k].type !== 'block-comment') return toks[k];
		return undefined;
	};
	const wordAt = (k: number) => {
		const t = toks[k];
		return t && t.type === 'word' ? t.text.toUpperCase() : '';
	};

	for (let i = 0; i < toks.length; i++) {
		const t = toks[i];
		const scope = scopes[scopes.length - 1];
		const atScope = parens.length === scope.depth;

		if (t.type === 'line-comment' || t.type === 'block-comment') {
			if (t.nl || !cur) newline(curIndent);
			emit(t.text, true);
			const next = toks[i + 1];
			if (t.type === 'line-comment' || (next && next.nl)) newline(curIndent);
			continue;
		}

		if (t.type === 'word' && !(prev && prev.type === 'dot')) {
			const U = t.text.toUpperCase();
			// Multi-word keywords, matched on the following words.
			let words = [t.text];
			let compound = U;
			const take = (n: number) => {
				for (let k = 1; k <= n; k++) words.push(toks[i + k].text);
				compound = words.map((w) => w.toUpperCase()).join(' ');
				i += n;
			};
			const w1 = wordAt(i + 1);
			const w2 = wordAt(i + 2);
			if ((U === 'GROUP' || U === 'ORDER' || U === 'PARTITION') && w1 === 'BY') take(1);
			else if (U === 'INSERT' && w1 === 'INTO') take(1);
			else if (U === 'DELETE' && w1 === 'FROM') take(1);
			else if (U === 'UNION' && (w1 === 'ALL' || w1 === 'DISTINCT')) take(1);
			else if (U === 'WITH' && w1 === 'RECURSIVE') take(1);
			else if (U === 'ON' && w1 === 'CONFLICT') take(1);
			else if (U === 'SELECT' && (w1 === 'DISTINCT' || w1 === 'ALL')) take(1);
			else if (U === 'JOIN') void 0;
			else if (['LEFT', 'RIGHT', 'FULL'].includes(U) && w1 === 'OUTER' && w2 === 'JOIN') take(2);
			else if (['LEFT', 'RIGHT', 'FULL', 'INNER', 'CROSS', 'NATURAL'].includes(U) && w1 === 'JOIN')
				take(1);
			else if (U === 'NATURAL' && ['LEFT', 'RIGHT', 'FULL', 'INNER'].includes(w1) && w2 === 'JOIN')
				take(2);
			else if ((U === 'CROSS' || U === 'OUTER') && w1 === 'APPLY') take(1);

			const isJoin = /\bJOIN$|\bAPPLY$/.test(compound);
			const head = compound.startsWith('SELECT')
				? 'SELECT'
				: compound === 'WITH RECURSIVE'
					? 'WITH'
					: compound;
			const text = words
				.map((w) => (KEYWORDS.has(w.toUpperCase()) || words.length > 1 ? kw(w) : w))
				.join(' ');
			const isKw = KEYWORDS.has(U) || words.length > 1;
			const P = prev?.type === 'word' ? prev.text.toUpperCase() : '';
			// Words that are clauses only in some positions.
			const notClause =
				(head === 'UPDATE' && (P === 'DO' || P === 'FOR')) ||
				(head === 'SET' && (P === 'DELETE' || P === 'UPDATE')) ||
				(head === 'FROM' && P === 'DISTINCT') ||
				(head === 'WITH' && !!prev && prev.type !== 'semi' && prev.type !== 'open');
			const inCase = cases.length > 0 && cases[cases.length - 1].depth === parens.length;

			if (atScope && BLOCK.has(head) && !notClause) {
				newline(scope.base);
				emit(text, true);
				newline(scope.base + 1);
				scope.clause = head;
				between = false;
			} else if (atScope && INLINE.has(head)) {
				newline(scope.base);
				emit(text, true);
				scope.clause = head;
			} else if (atScope && SET_OPS.has(head)) {
				newline(scope.base);
				emit(text, true);
				newline(scope.base);
				scope.clause = '';
			} else if (atScope && isJoin) {
				newline(scope.base + 1);
				emit(text, true);
				scope.clause = 'JOIN';
			} else if (
				atScope &&
				(U === 'AND' || U === 'OR') &&
				!(U === 'AND' && between) &&
				!inCase &&
				(scope.clause === 'WHERE' || scope.clause === 'HAVING' || scope.clause === 'JOIN')
			) {
				newline(scope.base + (scope.clause === 'JOIN' ? 2 : 1));
				emit(text, true);
			} else if (U === 'CASE') {
				emit(text, true);
				cases.push({ indent: curIndent, depth: parens.length });
			} else if (
				(U === 'WHEN' || U === 'ELSE') &&
				cases.length &&
				cases[cases.length - 1].depth === parens.length
			) {
				newline(cases[cases.length - 1].indent + 1);
				emit(text, true);
			} else if (U === 'END' && cases.length && cases[cases.length - 1].depth === parens.length) {
				newline(cases.pop()!.indent);
				emit(text, true);
			} else {
				if (U === 'BETWEEN') between = true;
				else if (U === 'AND' && between) between = false;
				emit(text, spaceBefore(prev, t));
			}
			prev = t;
			prevIsKeyword = isKw;
			continue;
		}

		switch (t.type) {
			case 'open': {
				const next = sig(i + 1);
				const sub =
					t.text === '(' &&
					!!next &&
					next.type === 'word' &&
					['SELECT', 'WITH'].includes(next.text.toUpperCase());
				let space = true;
				if (t.text === '[') space = false;
				else if (prev && (prev.type === 'word' || prev.type === 'ident' || prev.type === 'param')) {
					const P = prev.text.toUpperCase();
					space = (prevIsKeyword && SPACE_BEFORE_PAREN.has(P)) || t.ws;
				} else if (prev && (prev.type === 'open' || prev.type === 'dot')) space = false;
				emit(t.text, space);
				noSpace = true;
				parens.push({ sub, indent: curIndent });
				if (sub) scopes.push({ base: curIndent + 1, depth: parens.length, clause: '' });
				break;
			}
			case 'close': {
				const p = parens.pop();
				if (p?.sub) {
					scopes.pop();
					newline(p.indent);
					emit(t.text, false);
				} else emit(t.text, false);
				// Unclosed CASE inside the parentheses
				while (cases.length && cases[cases.length - 1].depth > parens.length) cases.pop();
				break;
			}
			case 'comma':
				emit(',', false);
				if (atScope && LISTS.has(scope.clause)) newline(scope.base + 1);
				break;
			case 'semi':
				emit(';', false);
				flush();
				scopes = [{ base: 0, depth: 0, clause: '' }];
				parens = [];
				cases = [];
				between = false;
				curIndent = 0;
				if (sig(i + 1)) lines.push('');
				break;
			case 'dot':
				emit('.', false);
				noSpace = true;
				break;
			case 'op': {
				const unary =
					(t.text === '-' || t.text === '+') &&
					(!prev ||
						prev.type === 'op' ||
						prev.type === 'open' ||
						prev.type === 'comma' ||
						(prev.type === 'word' && prevIsKeyword));
				if (t.text === '::') {
					emit('::', false);
					noSpace = true;
				} else {
					emit(t.text, true);
					if (unary) noSpace = true;
				}
				break;
			}
			default:
				emit(t.text, spaceBefore(prev, t));
		}
		prev = t;
		prevIsKeyword = false;
	}
	flush();
	// Drop a trailing empty line left by a final semicolon.
	while (lines.length && lines[lines.length - 1] === '') lines.pop();
	return lines.join('\n');
}

function spaceBefore(prev: Tok | undefined, t: Tok): boolean {
	if (!prev) return true;
	if (prev.type === 'open' || prev.type === 'dot') return false;
	if (prev.type === 'op' && prev.text === '::') return false;
	if (t.type === 'comma' || t.type === 'semi' || t.type === 'close' || t.type === 'dot')
		return false;
	return true;
}

/** One line: comments removed (optimizer hints like /*+ ... *\/ and /*! ... *\/ kept), single spaces. */
export function minifySql(sql: string): string {
	const toks = tokenize(sql).filter(
		(t) => t.type !== 'line-comment' && !(t.type === 'block-comment' && !/^\/\*[+!]/.test(t.text))
	);
	let out = '';
	let prev: Tok | undefined;
	let afterUnary = false;
	for (const t of toks) {
		const tight =
			!prev ||
			afterUnary ||
			prev.type === 'open' ||
			prev.type === 'dot' ||
			(prev.type === 'op' && prev.text === '::') ||
			t.type === 'comma' ||
			t.type === 'semi' ||
			t.type === 'close' ||
			t.type === 'dot' ||
			(t.type === 'op' && t.text === '::') ||
			(t.type === 'open' && !t.ws && prev.type !== 'op' && prev.type !== 'comma');
		out += (tight ? '' : ' ') + t.text;
		afterUnary =
			(t.text === '-' || t.text === '+') &&
			t.type === 'op' &&
			(!prev ||
				prev.type === 'op' ||
				prev.type === 'open' ||
				prev.type === 'comma' ||
				(prev.type === 'word' && KEYWORDS.has(prev.text.toUpperCase())));
		prev = t;
	}
	return out;
}

/** Conservative: starts with a statement keyword and has the matching second keyword. */
export function looksLikeSql(s: string): number {
	const t = s.trim().slice(0, 2000);
	if (/^select\s[\s\S]*\bfrom\s/i.test(t)) return 0.7;
	if (/^(?:insert\s+into|delete\s+from)\s/i.test(t)) return 0.7;
	if (/^update\s+\S+\s+set\s/i.test(t)) return 0.7;
	if (/^with\s+\w+\s+as\s*\(/i.test(t)) return 0.7;
	if (/^create\s+(?:or\s+replace\s+)?(?:table|view|index|unique\s+index)\s/i.test(t)) return 0.6;
	return 0;
}
