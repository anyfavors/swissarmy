/**
 * A small JSON parser (RFC 8259) that keeps the original text of every number and string.
 * Reformatting then never changes a value: 12345678901234567890 and 1.0 stay as written,
 * where JSON.parse plus JSON.stringify would round or rewrite them.
 */

export type JNode =
	| { t: 'o'; e: [string, JNode][] }
	| { t: 'a'; v: JNode[] }
	/** String, number, true, false or null, as written. */
	| { t: 'p'; raw: string };

export interface JsonStats {
	depth: number;
	keys: number;
	objects: number;
	arrays: number;
	duplicateKeys: number;
}

export class JsonError extends Error {
	constructor(
		message: string,
		public pos: number
	) {
		super(message);
	}
}

const WS = new Set([0x20, 0x09, 0x0a, 0x0d]);
const isDigit = (c: number) => c >= 0x30 && c <= 0x39;

class Parser {
	pos = 0;
	stats: JsonStats = { depth: 0, keys: 0, objects: 0, arrays: 0, duplicateKeys: 0 };
	constructor(private s: string) {}

	fail(msg: string, at = this.pos): never {
		throw new JsonError(msg, at);
	}

	ws() {
		const s = this.s;
		while (this.pos < s.length && WS.has(s.charCodeAt(this.pos))) this.pos++;
	}

	unexpected(context: string): never {
		const s = this.s;
		if (this.pos >= s.length) this.fail(`Unexpected end of input, ${context}`);
		const c = s[this.pos];
		if (c === "'") this.fail('Strings need double quotes, not single quotes');
		if (c === '/' && (s[this.pos + 1] === '/' || s[this.pos + 1] === '*'))
			this.fail('Comments are not allowed in JSON');
		const word = s.slice(this.pos).match(/^[A-Za-z_$][\w$]*/)?.[0];
		if (word && ['NaN', 'Infinity', 'undefined'].includes(word))
			this.fail(`${word} is not valid JSON`);
		this.fail(`Unexpected ${JSON.stringify(c)}, ${context}`);
	}

	value(depth: number): JNode {
		this.ws();
		const s = this.s;
		const c = s.charCodeAt(this.pos);
		if (c === 0x7b) return this.object(depth + 1);
		if (c === 0x5b) return this.array(depth + 1);
		if (c === 0x22) return { t: 'p', raw: this.string() };
		if (c === 0x2d || isDigit(c)) return { t: 'p', raw: this.number() };
		for (const lit of ['true', 'false', 'null']) {
			if (s.startsWith(lit, this.pos)) {
				this.pos += lit.length;
				return { t: 'p', raw: lit };
			}
		}
		if (c === 0x2b) this.fail('Numbers cannot start with +');
		if (c === 0x2e) this.fail('Numbers need a digit before the decimal point');
		return this.unexpected('expected a value');
	}

	object(depth: number): JNode {
		this.pos++;
		this.stats.objects++;
		if (depth > this.stats.depth) this.stats.depth = depth;
		const e: [string, JNode][] = [];
		const seen = new Set<string>();
		this.ws();
		if (this.s[this.pos] === '}') {
			this.pos++;
			return { t: 'o', e };
		}
		for (;;) {
			this.ws();
			if (this.s[this.pos] !== '"') {
				if (this.s[this.pos] === '}' && e.length) this.fail('Trailing comma before }');
				if (/[A-Za-z_$]/.test(this.s[this.pos] ?? ''))
					this.fail('Property names need double quotes');
				this.unexpected('expected a property name in double quotes');
			}
			const key = this.string();
			if (seen.has(key)) this.stats.duplicateKeys++;
			else seen.add(key);
			this.ws();
			if (this.s[this.pos] !== ':') this.unexpected('expected : after the property name');
			this.pos++;
			e.push([key, this.value(depth)]);
			this.stats.keys++;
			this.ws();
			const ch = this.s[this.pos];
			if (ch === ',') {
				this.pos++;
				continue;
			}
			if (ch === '}') {
				this.pos++;
				return { t: 'o', e };
			}
			if (ch === '"') this.fail('Missing comma between properties');
			this.unexpected('expected , or }');
		}
	}

	array(depth: number): JNode {
		this.pos++;
		this.stats.arrays++;
		if (depth > this.stats.depth) this.stats.depth = depth;
		const v: JNode[] = [];
		this.ws();
		if (this.s[this.pos] === ']') {
			this.pos++;
			return { t: 'a', v };
		}
		for (;;) {
			this.ws();
			if (this.s[this.pos] === ']' && v.length) this.fail('Trailing comma before ]');
			v.push(this.value(depth));
			this.ws();
			const ch = this.s[this.pos];
			if (ch === ',') {
				this.pos++;
				continue;
			}
			if (ch === ']') {
				this.pos++;
				return { t: 'a', v };
			}
			if (ch !== undefined && /["{[\d-]/.test(ch)) this.fail('Missing comma between array items');
			this.unexpected('expected , or ]');
		}
	}

	string(): string {
		const s = this.s;
		const start = this.pos;
		let i = start + 1;
		for (;;) {
			if (i >= s.length) this.fail('Unterminated string', start);
			const c = s.charCodeAt(i);
			if (c === 0x22) break;
			if (c < 0x20)
				this.fail(
					c === 0x0a ? 'Line break inside a string, use \\n' : 'Control character inside a string',
					i
				);
			if (c === 0x5c) {
				const n = s[i + 1];
				if (n === 'u') {
					if (!/^[0-9a-fA-F]{4}$/.test(s.slice(i + 2, i + 6)))
						this.fail('\\u must be followed by four hex digits', i);
					i += 6;
					continue;
				}
				if (n === undefined || !'"\\/bfnrt'.includes(n))
					this.fail(`Invalid escape \\${n ?? ''}`, i);
				i += 2;
				continue;
			}
			i++;
		}
		this.pos = i + 1;
		return s.slice(start, i + 1);
	}

	number(): string {
		const s = this.s;
		const start = this.pos;
		let i = start;
		if (s[i] === '-') i++;
		if (s[i] === '0') {
			i++;
			if (isDigit(s.charCodeAt(i))) this.fail('Leading zeros are not allowed', start);
		} else if (isDigit(s.charCodeAt(i))) {
			while (isDigit(s.charCodeAt(i))) i++;
		} else {
			this.pos = i;
			this.unexpected('expected a digit');
		}
		if (s[i] === '.') {
			i++;
			if (!isDigit(s.charCodeAt(i))) this.fail('Expected a digit after the decimal point', i);
			while (isDigit(s.charCodeAt(i))) i++;
		}
		if (s[i] === 'e' || s[i] === 'E') {
			i++;
			if (s[i] === '+' || s[i] === '-') i++;
			if (!isDigit(s.charCodeAt(i))) this.fail('Expected a digit in the exponent', i);
			while (isDigit(s.charCodeAt(i))) i++;
		}
		this.pos = i;
		return s.slice(start, i);
	}
}

export interface Parsed {
	root: JNode;
	stats: JsonStats;
}

export function parseJson(text: string): Parsed {
	const p = new Parser(text);
	try {
		if (text.charCodeAt(0) === 0xfeff) p.pos = 1;
		p.ws();
		if (p.pos >= text.length) p.fail('Empty input');
		const root = p.value(0);
		p.ws();
		if (p.pos < text.length) p.fail('Unexpected data after the end of the JSON value');
		return { root, stats: p.stats };
	} catch (e) {
		if (e instanceof JsonError) throw e;
		// Stack overflow: RangeError in V8 and WebKit, InternalError in Firefox.
		throw new JsonError('Nesting is too deep to process', p.pos);
	}
}

export type Indent = 2 | 4 | 'tab' | 'min';

function decodeKey(raw: string): string {
	return JSON.parse(raw) as string;
}

/** Serialises a node. Keys keep their original spelling; sorting compares decoded keys. */
export function stringify(root: JNode, indent: Indent = 2, sortKeys = false): string {
	const unit = indent === 'min' ? '' : indent === 'tab' ? '\t' : ' '.repeat(indent);
	const nl = indent === 'min' ? '' : '\n';
	const colon = indent === 'min' ? ':' : ': ';
	const out: string[] = [];
	const walk = (n: JNode, pad: string) => {
		if (n.t === 'p') {
			out.push(n.raw);
			return;
		}
		const inner = pad + unit;
		if (n.t === 'a') {
			if (!n.v.length) {
				out.push('[]');
				return;
			}
			out.push('[', nl);
			n.v.forEach((x, i) => {
				out.push(inner);
				walk(x, inner);
				out.push(i < n.v.length - 1 ? ',' : '', nl);
			});
			out.push(pad, ']');
			return;
		}
		if (!n.e.length) {
			out.push('{}');
			return;
		}
		let entries = n.e;
		if (sortKeys) {
			const keyed = entries.map((en) => [decodeKey(en[0]), en] as const);
			keyed.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
			entries = keyed.map((k) => k[1]);
		}
		out.push('{', nl);
		entries.forEach(([k, v], i) => {
			out.push(inner, k, colon);
			walk(v, inner);
			out.push(i < entries.length - 1 ? ',' : '', nl);
		});
		out.push(pad, '}');
	};
	walk(root, '');
	return out.join('');
}

export interface Located {
	line: number;
	col: number;
	excerpt: string;
	caret: string;
}

/** 1-based line and column of an offset, with the line around it and a caret line. */
export function locate(text: string, pos: number, width = 60): Located {
	const before = text.slice(0, pos);
	const line = (before.match(/\n/g)?.length ?? 0) + 1;
	const lineStart = before.lastIndexOf('\n') + 1;
	let lineEnd = text.indexOf('\n', lineStart);
	if (lineEnd < 0) lineEnd = text.length;
	const col = pos - lineStart + 1;
	const full = text.slice(lineStart, lineEnd).replace(/[\t\r]/g, ' ');
	let from = Math.max(0, col - 1 - Math.floor(width / 2));
	const to = Math.min(full.length, from + width);
	from = Math.max(0, Math.min(from, to - width));
	const lead = from > 0 ? '…' : '';
	const excerpt = lead + full.slice(from, to) + (to < full.length ? '…' : '');
	const caret = ' '.repeat(lead.length + col - 1 - from) + '^';
	return { line, col, excerpt, caret };
}

export function utf8Length(s: string): number {
	let n = 0;
	for (let i = 0; i < s.length; i++) {
		const c = s.charCodeAt(i);
		if (c < 0x80) n += 1;
		else if (c < 0x800) n += 2;
		else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
			n += 4;
			i++;
		} else n += 3;
	}
	return n;
}

export interface FormatResult {
	output: string;
	stats: JsonStats;
	sizeIn: number;
	sizeOut: number;
}

export function formatJson(text: string, indent: Indent = 2, sortKeys = false): FormatResult {
	const { root, stats } = parseJson(text);
	const output = stringify(root, indent, sortKeys);
	return { output, stats, sizeIn: utf8Length(text), sizeOut: utf8Length(output) };
}

export function looksLikeJson(s: string): number {
	const t = s.trim();
	if (!/^[{[]/.test(t)) return 0;
	try {
		JSON.parse(t);
		return 0.9;
	} catch {
		return 0;
	}
}
