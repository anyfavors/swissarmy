/**
 * YAML to JSON and back, for the subset of YAML 1.2 (https://yaml.org/spec/1.2.2/) used in
 * configuration files: block and flow collections, all scalar styles, block scalars with
 * chomping and indentation indicators, comments, anchors, aliases, merge keys (<<) and
 * multiple documents. Scalars resolve with the 1.2 core schema (spec section 10.3).
 *
 * Constructs that have no faithful JSON form (custom tags, complex keys, recursive aliases)
 * are reported with line and column instead of being guessed at.
 */
import { parseJson, stringify, type Indent, type JNode } from '../json/logic';

export class YamlError extends Error {
	constructor(
		message: string,
		public pos: number
	) {
		super(message);
	}
}

/** Parsed YAML node. Aliases point at the same object as their anchor. */
export type YNode =
	| { k: 'map'; entries: [YScalar, YNode][]; pos: number; tag?: string }
	| { k: 'seq'; items: YNode[]; pos: number; tag?: string }
	| YScalar;

export interface YScalar {
	k: 'scalar';
	value: string;
	style: 'plain' | 'single' | 'double' | 'literal' | 'folded';
	pos: number;
	tag?: string;
}

export interface Warning {
	pos: number;
	message: string;
}

const isBreak = (c: string | undefined) => c === '\n' || c === '\r';
const isWhite = (c: string | undefined) => c === ' ' || c === '\t';
const isBlankOrEnd = (c: string | undefined) =>
	c === undefined || c === ' ' || c === '\t' || isBreak(c);
const FLOW_IND = ',[]{}';

/** Standard tags this converter understands, as secondary handle (!!) names. */
const KNOWN_TAGS = new Set(['str', 'int', 'float', 'bool', 'null', 'map', 'seq']);

class Parser {
	pos = 0;
	anchors = new Map<string, YNode | 'pending'>();

	constructor(private s: string) {}

	fail(msg: string, at = this.pos): never {
		throw new YamlError(msg, at);
	}

	peek(): string | undefined {
		return this.s[this.pos];
	}

	/** Column (0-based) of an offset. */
	col(at = this.pos): number {
		let i = at;
		while (i > 0 && !isBreak(this.s[i - 1])) i--;
		return at - i;
	}

	lineStart(at = this.pos): number {
		let i = at;
		while (i > 0 && !isBreak(this.s[i - 1])) i--;
		return i;
	}

	skipBreak() {
		if (this.s[this.pos] === '\r' && this.s[this.pos + 1] === '\n') this.pos += 2;
		else if (isBreak(this.s[this.pos])) this.pos++;
	}

	/** Skips spaces and tabs, then a comment, on the current line. */
	skipInline() {
		while (isWhite(this.peek())) this.pos++;
		if (this.peek() === '#' && (this.pos === 0 || isBlankOrEnd(this.s[this.pos - 1])))
			while (this.peek() !== undefined && !isBreak(this.peek())) this.pos++;
	}

	/**
	 * Moves to the next content character, across blank and comment lines.
	 * Returns false at the end of input. Tabs used as indentation are an error.
	 */
	skipToContent(): boolean {
		for (;;) {
			this.skipInline();
			if (this.peek() === undefined) return false;
			if (isBreak(this.peek())) {
				this.skipBreak();
				while (this.peek() === ' ') this.pos++;
				if (this.peek() === '\t') {
					let j = this.pos;
					while (isWhite(this.s[j])) j++;
					const next = this.s[j];
					if (next !== undefined && !isBreak(next) && next !== '#')
						this.fail('Tab used for indentation, YAML only allows spaces', this.pos);
				}
				continue;
			}
			return true;
		}
	}

	/** At a document marker (--- or ...) at the start of a line. */
	atDocMarker(at = this.pos): boolean {
		if (this.col(at) !== 0) return false;
		const m = this.s.slice(at, at + 3);
		return (m === '---' || m === '...') && isBlankOrEnd(this.s[at + 3]);
	}

	// ---------- documents ----------

	stream(): { docs: YNode[]; version?: string } {
		const docs: YNode[] = [];
		let version: string | undefined;
		for (;;) {
			let explicit = false;
			// Directives
			for (;;) {
				if (!this.skipToContent()) break;
				if (this.peek() === '%' && this.col() === 0) {
					const line = this.restOfLine();
					const m = /^%YAML\s+(\d+\.\d+)/.exec(line);
					if (m) version = m[1];
					else if (line.startsWith('%TAG'))
						this.fail('%TAG directives are not supported, custom tags have no JSON form');
					this.pos += line.length;
					continue;
				}
				break;
			}
			if (this.peek() === undefined) break;
			if (this.atDocMarker() && this.s.startsWith('---', this.pos)) {
				this.pos += 3;
				explicit = true;
			} else if (this.atDocMarker() && this.s.startsWith('...', this.pos)) {
				this.pos += 3;
				continue;
			}
			this.anchors = new Map();
			if (!explicit && this.col() !== 0)
				this.fail('A document at the top level must start in column 1');
			const doc = this.blockNodeAfterIndicator(-1, true);
			docs.push(doc);
			if (!this.skipToContent()) break;
			if (this.atDocMarker()) {
				if (this.s.startsWith('...', this.pos)) this.pos += 3;
				continue;
			}
			this.fail(
				this.col() === 0
					? 'Unexpected content, expected a new document (---) or the end'
					: 'Bad indentation, this line does not line up with anything above'
			);
		}
		return { docs, version };
	}

	restOfLine(): string {
		let j = this.pos;
		while (j < this.s.length && !isBreak(this.s[j])) j++;
		return this.s.slice(this.pos, j);
	}

	// ---------- properties ----------

	props(): { anchor?: string; tag?: string; pos: number } {
		const out: { anchor?: string; tag?: string; pos: number } = { pos: this.pos };
		for (;;) {
			if (this.peek() === '&') {
				if (out.anchor !== undefined) this.fail('Two anchors on one node');
				const start = this.pos;
				this.pos++;
				const name = this.name();
				if (!name) this.fail('Anchor needs a name after &', start);
				out.anchor = name;
			} else if (this.peek() === '!') {
				if (out.tag !== undefined) this.fail('Two tags on one node');
				out.tag = this.tag();
			} else break;
			while (isWhite(this.peek())) this.pos++;
		}
		return out;
	}

	name(): string {
		const start = this.pos;
		while (!isBlankOrEnd(this.peek()) && !FLOW_IND.includes(this.peek()!)) this.pos++;
		return this.s.slice(start, this.pos);
	}

	tag(): string {
		const start = this.pos;
		let raw: string;
		if (this.s[this.pos + 1] === '<') {
			const end = this.s.indexOf('>', this.pos);
			if (end < 0) this.fail('Unterminated verbatim tag');
			raw = this.s.slice(this.pos, end + 1);
			this.pos = end + 1;
		} else {
			while (!isBlankOrEnd(this.peek()) && !FLOW_IND.includes(this.peek()!)) this.pos++;
			raw = this.s.slice(start, this.pos);
		}
		if (raw === '!') return '!';
		let name: string | undefined;
		if (raw.startsWith('!!')) name = raw.slice(2);
		else if (raw.startsWith('!<tag:yaml.org,2002:')) name = raw.slice(20, -1);
		if (name && KNOWN_TAGS.has(name)) return name;
		if (
			name === 'binary' ||
			name === 'timestamp' ||
			name === 'set' ||
			name === 'omap' ||
			name === 'pairs'
		)
			this.fail(`Tag ${raw} is not supported, it has no JSON equivalent`, start);
		this.fail(
			`Custom tag ${raw} is not supported (for example CloudFormation !Ref or Ansible !vault), it has no JSON equivalent`,
			start
		);
	}

	anchorStart(anchor: string | undefined) {
		if (anchor !== undefined) this.anchors.set(anchor, 'pending');
	}

	anchorEnd(anchor: string | undefined, node: YNode): YNode {
		if (anchor !== undefined) this.anchors.set(anchor, node);
		return node;
	}

	alias(): YNode {
		const start = this.pos;
		this.pos++;
		const name = this.name();
		if (!name) this.fail('Alias needs a name after *', start);
		const n = this.anchors.get(name);
		if (n === undefined)
			this.fail(`Alias *${name} refers to an anchor that is not defined above`, start);
		if (n === 'pending')
			this.fail(
				`Alias *${name} refers to the node that contains it, this cannot be represented in JSON`,
				start
			);
		return n;
	}

	// ---------- block structure ----------

	/**
	 * Parses the node that follows an indicator (a key's colon, a dash, or ---), with the parent
	 * at indentation `parent`. `seqSameIndent` allows a block sequence at the parent's column,
	 * which YAML permits for the value of a mapping key.
	 */
	blockNodeAfterIndicator(parent: number, seqSameIndent: boolean): YNode {
		while (isWhite(this.peek())) this.pos++;
		const p = this.props();
		this.skipInline();
		if (this.peek() !== undefined && !isBreak(this.peek())) {
			// Content on the same line.
			return this.inlineStart(parent, p, false);
		}
		// Content on following lines, or empty.
		const save = this.pos;
		if (!this.skipToContent() || this.atDocMarker()) {
			this.pos = save;
			return this.finishEmpty(p);
		}
		const c = this.col();
		const isSeq = this.peek() === '-' && isBlankOrEnd(this.s[this.pos + 1]);
		if (c > parent || (seqSameIndent && isSeq && c === parent)) {
			if (isSeq && p.anchor === undefined && p.tag === undefined) return this.blockSeq(c);
			if (isSeq) {
				this.anchorStart(p.anchor);
				const n = this.blockSeq(c);
				return this.anchorEnd(p.anchor, this.applyTag(n, p.tag, p.pos));
			}
			// Properties may also sit on their own line above the node.
			if (
				(this.peek() === '&' || this.peek() === '!') &&
				p.anchor === undefined &&
				p.tag === undefined
			) {
				const p2 = this.props();
				this.skipInline();
				if (this.peek() === undefined || isBreak(this.peek())) {
					return this.blockNodeAfterIndicatorWithProps(parent, p2);
				}
				return this.inlineStart(parent, p2, true);
			}
			return this.inlineStart(parent, p, true);
		}
		this.pos = save;
		return this.finishEmpty(p);
	}

	blockNodeAfterIndicatorWithProps(
		parent: number,
		p: { anchor?: string; tag?: string; pos: number }
	): YNode {
		const save = this.pos;
		if (!this.skipToContent() || this.atDocMarker() || this.col() <= parent) {
			this.pos = save;
			return this.finishEmpty(p);
		}
		this.anchorStart(p.anchor);
		const n = this.inlineStart(parent, { pos: p.pos }, true);
		return this.anchorEnd(p.anchor, this.applyTag(n, p.tag, p.pos));
	}

	finishEmpty(p: { anchor?: string; tag?: string; pos: number }): YNode {
		const n: YScalar = { k: 'scalar', value: '', style: 'plain', pos: p.pos };
		return this.anchorEnd(p.anchor, this.applyTag(n, p.tag, p.pos));
	}

	/**
	 * Node starting at the current position. `ownLine` is true when it is the first thing on its
	 * line, which allows a block mapping or sequence to start here.
	 */
	inlineStart(
		parent: number,
		p: { anchor?: string; tag?: string; pos: number },
		ownLine: boolean
	): YNode {
		const c = this.peek();
		const start = this.pos;
		if (c === '*') {
			if (p.anchor !== undefined || p.tag !== undefined)
				this.fail('An alias cannot have an anchor or a tag');
			const n = this.alias();
			this.skipInline();
			if (this.peek() === ':' && isBlankOrEnd(this.s[this.pos + 1]))
				this.fail('Aliases as mapping keys are not supported', start);
			return n;
		}
		if (
			(p.anchor !== undefined || p.tag !== undefined) &&
			!/[\r\n]/.test(this.s.slice(p.pos, start)) &&
			c !== '[' &&
			c !== '{' &&
			this.implicitKeyAhead()
		) {
			// "&a key: value": the properties belong to the first key, not the mapping.
			if (!this.compactAllowed(p.pos))
				this.fail('A mapping cannot start on the same line as another key, check the indentation');
			this.pos = p.pos;
			return this.blockMap(this.col());
		}
		this.anchorStart(p.anchor);
		let node: YNode;
		if (c === '|' || c === '>') {
			node = this.blockScalar(parent);
		} else if (c === '-' && isBlankOrEnd(this.s[this.pos + 1])) {
			if (!ownLine && !this.compactAllowed(start))
				this.fail('A sequence cannot start on the same line as a mapping key');
			node = this.blockSeq(this.col());
		} else if (c === '?' && isBlankOrEnd(this.s[this.pos + 1])) {
			this.fail('Complex mapping keys (?) are not supported, JSON keys must be strings');
		} else if (this.implicitKeyAhead()) {
			if (!ownLine && !this.compactAllowed(start))
				this.fail('A mapping cannot start on the same line as another key, check the indentation');
			node = this.blockMap(this.col());
		} else if (c === '[' || c === '{') {
			node = this.flowCollection();
			this.endOfValue();
		} else if (c === '"' || c === "'") {
			node = this.quoted(parent);
			this.skipInline();
			this.checkNoValueAfter(start);
			this.endOfValue();
		} else {
			node = this.plain(parent);
		}
		return this.anchorEnd(p.anchor, this.applyTag(node, p.tag, p.pos));
	}

	/** A block collection may start on a line after "- " (compact notation). */
	compactAllowed(at: number): boolean {
		// Directly after "- " of a sequence entry, possibly with properties between.
		for (let j = this.lineStart(at); j < at; j++) {
			const ch = this.s[j];
			if (ch === ' ') continue;
			if (ch === '-' && isWhite(this.s[j + 1])) continue;
			if (ch === '&' || ch === '!') {
				while (j < at && !isWhite(this.s[j])) j++;
				continue;
			}
			return false;
		}
		return true;
	}

	endOfValue() {
		this.skipInline();
		if (this.peek() !== undefined && !isBreak(this.peek()))
			this.fail('Unexpected text after the value, quote the whole value or start a new line');
	}

	checkNoValueAfter(start: number) {
		if (this.peek() === ':' && isBlankOrEnd(this.s[this.pos + 1]))
			this.fail('Mapping values are not allowed here, check the indentation', start);
	}

	/** Looks ahead on the current line for "key:" followed by a space or line end. */
	implicitKeyAhead(): boolean {
		const s = this.s;
		let i = this.pos;
		const c = s[i];
		if (c === '"' || c === "'") {
			i++;
			for (;;) {
				if (i >= s.length) return false;
				if (s[i] === c) {
					if (c === "'" && s[i + 1] === "'") {
						i += 2;
						continue;
					}
					break;
				}
				if (c === '"' && s[i] === '\\') i++;
				if (isBreak(s[i])) return false;
				i++;
			}
			i++;
			while (isWhite(s[i])) i++;
			return s[i] === ':' && isBlankOrEnd(s[i + 1]);
		}
		if (c === '[' || c === '{') {
			// A flow collection followed by ':' is a complex key.
			let depth = 0;
			for (; i < s.length && !isBreak(s[i]); i++) {
				if (s[i] === '[' || s[i] === '{') depth++;
				else if (s[i] === ']' || s[i] === '}') {
					depth--;
					if (depth === 0) {
						let j = i + 1;
						while (isWhite(s[j])) j++;
						if (s[j] === ':' && isBlankOrEnd(s[j + 1]))
							this.fail('Complex mapping keys are not supported, JSON keys must be strings');
						return false;
					}
				}
			}
			return false;
		}
		for (; i < s.length && !isBreak(s[i]); i++) {
			if (s[i] === ':' && isBlankOrEnd(s[i + 1])) return true;
			if (s[i] === '#' && isWhite(s[i - 1])) return false;
		}
		return false;
	}

	blockSeq(indent: number): YNode {
		const node: YNode = { k: 'seq', items: [], pos: this.pos };
		for (;;) {
			if (!(this.peek() === '-' && isBlankOrEnd(this.s[this.pos + 1])))
				this.fail('Expected a sequence entry (- ) at this indentation');
			this.pos++;
			node.items.push(this.blockNodeAfterIndicator(indent, false));
			const save = this.pos;
			if (!this.skipToContent() || this.atDocMarker()) {
				this.pos = save;
				return node;
			}
			const c = this.col();
			if (c < indent) {
				this.pos = save;
				return node;
			}
			if (c > indent) this.fail('Bad indentation of a sequence entry');
			if (!(this.peek() === '-' && isBlankOrEnd(this.s[this.pos + 1]))) {
				// Same column but not "- ": belongs to the parent mapping.
				this.pos = save;
				return node;
			}
		}
	}

	blockMap(indent: number): YNode {
		const node: YNode = { k: 'map', entries: [], pos: this.pos };
		const seen = new Map<string, number>();
		for (;;) {
			const keyPos = this.pos;
			const kp = this.props();
			if (kp.anchor !== undefined || kp.tag !== undefined) {
				if (kp.tag && kp.tag !== 'str' && kp.tag !== '!')
					this.fail('Only string keys are supported', kp.pos);
			}
			let key: YScalar;
			if (this.peek() === '"' || this.peek() === "'") {
				key = this.quoted(indent, true);
			} else if (this.peek() === '?' && isBlankOrEnd(this.s[this.pos + 1])) {
				this.fail('Complex mapping keys (?) are not supported, JSON keys must be strings');
			} else if (this.peek() === '[' || this.peek() === '{') {
				this.fail('Complex mapping keys are not supported, JSON keys must be strings');
			} else if (this.peek() === '*') {
				this.fail('Aliases as mapping keys are not supported');
			} else if (this.peek() === '-' && isBlankOrEnd(this.s[this.pos + 1])) {
				this.fail('Expected a mapping key, found a sequence entry; check the indentation');
			} else {
				key = this.plainKey();
			}
			if (kp.tag) key.tag = 'str';
			if (kp.anchor !== undefined) this.anchors.set(kp.anchor, key);
			while (isWhite(this.peek())) this.pos++;
			if (this.peek() !== ':') this.fail('Expected : after the mapping key');
			this.pos++;
			const k = key.value;
			if (seen.has(k) && k !== '<<') this.fail(`Duplicate key "${k}"`, keyPos);
			seen.set(k, keyPos);
			const value = this.blockNodeAfterIndicator(indent, true);
			node.entries.push([key, value]);
			const save = this.pos;
			if (!this.skipToContent() || this.atDocMarker()) {
				this.pos = save;
				return node;
			}
			const c = this.col();
			if (c < indent) {
				this.pos = save;
				return node;
			}
			if (c > indent) this.fail('Bad indentation of a mapping entry');
			if (this.peek() === '-' && isBlankOrEnd(this.s[this.pos + 1]))
				this.fail('Expected a mapping key, found a sequence entry; check the indentation');
		}
	}

	plainKey(): YScalar {
		const s = this.s;
		const start = this.pos;
		this.checkPlainStart(false);
		let i = this.pos;
		while (i < s.length && !isBreak(s[i])) {
			if (s[i] === ':' && isBlankOrEnd(s[i + 1])) break;
			i++;
		}
		let end = i;
		while (end > start && isWhite(s[end - 1])) end--;
		this.pos = end;
		const v = s.slice(start, end);
		if (v.length > 1024) this.fail('Implicit keys are limited to 1024 characters', start);
		return { k: 'scalar', value: v, style: 'plain', pos: start };
	}

	checkPlainStart(flow: boolean) {
		const c = this.peek();
		const n = this.s[this.pos + 1];
		if (c === undefined) this.fail('Unexpected end of input');
		if (c === '@' || c === '`')
			this.fail(`${c} is reserved in YAML and cannot start a plain value, quote it`);
		if (c === '-' || c === '?' || c === ':') {
			if (isBlankOrEnd(n) || (flow && FLOW_IND.includes(n!)))
				this.fail(`Unexpected ${c}, quote the value if it is text`);
			return;
		}
		if (',[]{}#&*!|>\'"%'.includes(c)) this.fail(`Unexpected ${c}, quote the value if it is text`);
	}

	/** Plain scalar in block context, possibly spanning lines. */
	plain(parent: number): YScalar {
		const s = this.s;
		const start = this.pos;
		this.checkPlainStart(false);
		let lines = 0;
		let blankRun = 0;
		let out = '';
		for (;;) {
			// One line of the scalar.
			const ls = this.pos;
			let i = ls;
			while (i < s.length && !isBreak(s[i])) {
				if (s[i] === ':' && isBlankOrEnd(s[i + 1]))
					this.fail(
						'Mapping values are not allowed here, check the indentation or quote the value',
						i
					);
				if (s[i] === '#' && isWhite(s[i - 1])) break;
				i++;
			}
			let e = i;
			while (e > ls && isWhite(s[e - 1])) e--;
			const text = s.slice(ls, e);
			if (lines === 0) out = text;
			else out += blankRun ? '\n'.repeat(blankRun) + text : ' ' + text;
			lines++;
			this.pos = e;
			if (s[i] === '#') {
				this.pos = i;
				break;
			}
			// Look for a continuation line.
			let j = i;
			let blanks = 0;
			let next = -1;
			while (j < s.length) {
				if (s[j] === '\r' && s[j + 1] === '\n') j += 2;
				else if (isBreak(s[j])) j++;
				else break;
				let k = j;
				while (isWhite(s[k])) k++;
				if (k >= s.length) break;
				if (isBreak(s[k])) {
					blanks++;
					j = k;
					continue;
				}
				next = k;
				break;
			}
			if (next < 0) break;
			const ind = this.indentOf(next);
			if (ind <= parent || s[next] === '#' || this.atDocMarker(this.lineStart(next))) break;
			blankRun = blanks;
			this.pos = next;
		}
		return { k: 'scalar', value: out, style: 'plain', pos: start };
	}

	indentOf(at: number): number {
		let i = this.lineStart(at);
		let n = 0;
		while (this.s[i] === ' ') {
			i++;
			n++;
		}
		return n;
	}

	// ---------- quoted scalars ----------

	quoted(parent: number, key = false): YScalar {
		const s = this.s;
		const q = this.peek()!;
		const start = this.pos;
		this.pos++;
		let out = '';
		let seg = '';
		const flushLine = () => {
			out += seg.replace(/[ \t]+$/, '');
			seg = '';
		};
		for (;;) {
			const c = s[this.pos];
			if (c === undefined)
				this.fail(`Unterminated ${q === '"' ? 'double' : 'single'}-quoted string`, start);
			if (c === q) {
				if (q === "'" && s[this.pos + 1] === "'") {
					seg += "'";
					this.pos += 2;
					continue;
				}
				this.pos++;
				break;
			}
			if (q === '"' && c === '\\') {
				const n = s[this.pos + 1];
				if (isBreak(n)) {
					// Escaped line break: join without a space, drop leading white space.
					out += seg;
					seg = '';
					this.pos++;
					this.skipBreak();
					while (isWhite(s[this.pos])) this.pos++;
					continue;
				}
				seg += this.escape();
				continue;
			}
			if (isBreak(c)) {
				if (key) this.fail('Implicit keys must be on a single line', start);
				flushLine();
				let breaks = 0;
				while (isBreak(s[this.pos]) || isWhite(s[this.pos])) {
					if (isBreak(s[this.pos])) {
						this.skipBreak();
						breaks++;
					} else this.pos++;
				}
				if (this.atDocMarker(this.lineStart()))
					this.fail('Document marker inside a quoted string', this.pos);
				if (s[this.pos] !== undefined && this.col() <= parent && s[this.pos] !== q) {
					if (s.indexOf(q, this.pos) < 0)
						this.fail(`Unterminated ${q === '"' ? 'double' : 'single'}-quoted string`, start);
					this.fail('Continuation line of a quoted string is not indented enough');
				}
				out += breaks > 1 ? '\n'.repeat(breaks - 1) : ' ';
				continue;
			}
			seg += c;
			this.pos++;
		}
		out += seg;
		return { k: 'scalar', value: out, style: q === '"' ? 'double' : 'single', pos: start };
	}

	escape(): string {
		const s = this.s;
		const at = this.pos;
		const n = s[this.pos + 1];
		this.pos += 2;
		const simple: Record<string, string> = {
			'0': '\0',
			a: '\x07',
			b: '\b',
			t: '\t',
			'\t': '\t',
			n: '\n',
			v: '\v',
			f: '\f',
			r: '\r',
			e: '\x1b',
			' ': ' ',
			'"': '"',
			'/': '/',
			'\\': '\\',
			N: '\u0085',
			_: '\u00a0',
			L: '\u2028',
			P: '\u2029'
		};
		if (n !== undefined && n in simple) return simple[n];
		const len = n === 'x' ? 2 : n === 'u' ? 4 : n === 'U' ? 8 : 0;
		if (len) {
			const hex = s.slice(this.pos, this.pos + len);
			if (!new RegExp(`^[0-9a-fA-F]{${len}}$`).test(hex))
				this.fail(`\\${n} must be followed by ${len} hex digits`, at);
			this.pos += len;
			const cp = parseInt(hex, 16);
			if (cp > 0x10ffff) this.fail('Escape is beyond the Unicode range', at);
			return String.fromCodePoint(cp);
		}
		this.fail(`Invalid escape \\${n ?? ''}`, at);
	}

	// ---------- block scalars ----------

	blockScalar(parent: number): YScalar {
		const s = this.s;
		const start = this.pos;
		const folded = s[this.pos] === '>';
		this.pos++;
		let chomp: 'clip' | 'strip' | 'keep' = 'clip';
		let explicit = 0;
		for (let k = 0; k < 2; k++) {
			const c = s[this.pos];
			if (c === '-' || c === '+') {
				chomp = c === '-' ? 'strip' : 'keep';
				this.pos++;
			} else if (c !== undefined && c >= '1' && c <= '9') {
				explicit = Number(c);
				this.pos++;
			}
		}
		if (s[this.pos] === '0') this.fail('Indentation indicator must be 1 to 9');
		const hdrEnd = this.pos;
		while (isWhite(s[this.pos])) this.pos++;
		if (s[this.pos] === '#' && this.pos > hdrEnd) {
			while (s[this.pos] !== undefined && !isBreak(s[this.pos])) this.pos++;
		}
		if (s[this.pos] !== undefined && !isBreak(s[this.pos]))
			this.fail('Unexpected text after the block scalar header, content starts on the next line');

		// Collect lines. `indent` is the content indentation, -1 until the first content line.
		let indent = explicit ? Math.max(parent, 0) + explicit : -1;
		const lines: string[] = [];
		let maxEmptyIndent = 0;
		while (this.pos < s.length) {
			const lineBegin = this.pos;
			this.skipBreak();
			const ls = this.pos;
			if (ls >= s.length) break;
			let i = ls;
			while (s[i] === ' ') i++;
			const sp = i - ls;
			let le = i;
			while (le < s.length && !isBreak(s[le])) le++;
			if (this.atDocMarker(ls)) {
				this.pos = lineBegin;
				break;
			}
			if (/^[ \t]*$/.test(s.slice(i, le))) {
				// Empty line, or only white space beyond the content indentation.
				if (indent < 0) maxEmptyIndent = Math.max(maxEmptyIndent, sp);
				lines.push(indent >= 0 && le - ls > indent ? s.slice(ls + indent, le) : '');
				this.pos = le;
				continue;
			}
			if (indent < 0) {
				if (sp <= parent) {
					this.pos = lineBegin;
					break;
				}
				if (sp < maxEmptyIndent)
					this.fail('A leading empty line has more spaces than the first content line', ls);
				indent = sp;
			}
			if (sp < indent) {
				this.pos = lineBegin;
				break;
			}
			lines.push(s.slice(ls + indent, le));
			this.pos = le;
		}
		// Split off trailing empty lines for chomping.
		let last = lines.length;
		while (last > 0 && lines[last - 1] === '') last--;
		const content = lines.slice(0, last);
		const trailing = lines.length - last;
		let text: string;
		if (!folded) text = content.join('\n');
		else {
			text = '';
			let prevMore = true;
			let empties = 0;
			let first = true;
			for (const l of content) {
				if (l === '') {
					empties++;
					continue;
				}
				const more = l[0] === ' ' || l[0] === '\t';
				if (first) text += '\n'.repeat(empties) + l;
				else if (!more && !prevMore) text += (empties ? '\n'.repeat(empties) : ' ') + l;
				else text += '\n' + '\n'.repeat(empties) + l;
				empties = 0;
				first = false;
				prevMore = more;
			}
		}
		if (content.length) {
			if (chomp === 'clip') text += '\n';
			else if (chomp === 'keep') text += '\n' + '\n'.repeat(trailing);
		} else if (chomp === 'keep') text = '\n'.repeat(trailing);
		return { k: 'scalar', value: text, style: folded ? 'folded' : 'literal', pos: start };
	}

	// ---------- flow collections ----------

	flowSkip() {
		for (;;) {
			while (isWhite(this.peek()) || isBreak(this.peek())) this.pos++;
			if (this.peek() === '#' && isBlankOrEnd(this.s[this.pos - 1]))
				while (this.peek() !== undefined && !isBreak(this.peek())) this.pos++;
			else break;
		}
		if (this.atDocMarker()) this.fail('Document marker inside a flow collection');
	}

	flowCollection(): YNode {
		const open = this.peek()!;
		const start = this.pos;
		const close = open === '[' ? ']' : '}';
		this.pos++;
		const seq: YNode[] = [];
		const map: [YScalar, YNode][] = [];
		const seen = new Set<string>();
		for (;;) {
			this.flowSkip();
			if (this.peek() === undefined)
				this.fail(`Unterminated flow collection, expected ${close}`, start);
			if (this.peek() === close) {
				this.pos++;
				break;
			}
			if (this.peek() === '?' && isBlankOrEnd(this.s[this.pos + 1]))
				this.fail('Complex mapping keys (?) are not supported');
			// Entry: node, optionally followed by ": value".
			const entryPos = this.pos;
			const keyNode = this.flowNode(true);
			this.flowSkip();
			let pair: [YNode, YNode] | null = null;
			if (this.peek() === ':') {
				const adjacentOk =
					isBlankOrEnd(this.s[this.pos + 1]) ||
					FLOW_IND.includes(this.s[this.pos + 1]) ||
					(keyNode.k === 'scalar' && keyNode.style !== 'plain');
				if (adjacentOk) {
					this.pos++;
					this.flowSkip();
					const v =
						this.peek() === ',' || this.peek() === close
							? emptyScalar(this.pos)
							: this.flowNode(false);
					pair = [keyNode, v];
				}
			} else if (open === '{') pair = [keyNode, emptyScalar(this.pos)];
			if (pair) {
				const [kn, v] = pair;
				if (kn.k !== 'scalar')
					this.fail('Complex mapping keys are not supported, JSON keys must be strings', entryPos);
				if (open === '{') {
					if (seen.has(kn.value) && kn.value !== '<<')
						this.fail(`Duplicate key "${kn.value}"`, entryPos);
					seen.add(kn.value);
					map.push([kn, v]);
				} else seq.push({ k: 'map', entries: [[kn, v]], pos: entryPos });
			} else {
				if (open === '{') this.fail('Expected : in a flow mapping', this.pos);
				seq.push(keyNode);
			}
			this.flowSkip();
			if (this.peek() === ',') {
				this.pos++;
				continue;
			}
			if (this.peek() === close) {
				this.pos++;
				break;
			}
			if (this.peek() === undefined)
				this.fail(`Unterminated flow collection, expected ${close}`, start);
			this.fail(`Expected , or ${close}`);
		}
		return open === '['
			? { k: 'seq', items: seq, pos: start }
			: { k: 'map', entries: map, pos: start };
	}

	flowNode(asKey: boolean): YNode {
		const p = this.props();
		this.flowSkip();
		if (this.peek() === '*') {
			if (p.anchor !== undefined || p.tag !== undefined)
				this.fail('An alias cannot have an anchor or a tag');
			return this.alias();
		}
		this.anchorStart(p.anchor);
		let n: YNode;
		const c = this.peek();
		if (c === '[' || c === '{') n = this.flowCollection();
		else if (c === '"' || c === "'") n = this.quoted(-1);
		else if (c === ',' || c === ']' || c === '}' || (c === ':' && asKey)) n = emptyScalar(this.pos);
		else n = this.flowPlain();
		return this.anchorEnd(p.anchor, this.applyTag(n, p.tag, p.pos));
	}

	flowPlain(): YScalar {
		const s = this.s;
		const start = this.pos;
		this.checkPlainStart(true);
		let out = '';
		let i = this.pos;
		let lineStartAt = i;
		let pendingBreaks = 0;
		for (;;) {
			const c = s[i];
			if (c === undefined) break;
			if (c === ':' && (isBlankOrEnd(s[i + 1]) || FLOW_IND.includes(s[i + 1]))) break;
			if (FLOW_IND.includes(c)) break;
			if (c === '#' && isWhite(s[i - 1])) break;
			if (isBreak(c)) {
				const text = s.slice(lineStartAt, i).trim();
				if (text) {
					out += (out ? (pendingBreaks > 1 ? '\n'.repeat(pendingBreaks - 1) : ' ') : '') + text;
					pendingBreaks = 0;
				}
				pendingBreaks++;
				if (c === '\r' && s[i + 1] === '\n') i++;
				i++;
				lineStartAt = i;
				continue;
			}
			i++;
		}
		const text = s.slice(lineStartAt, i).trim();
		if (text) out += (out ? (pendingBreaks > 1 ? '\n'.repeat(pendingBreaks - 1) : ' ') : '') + text;
		// Leave trailing whitespace and breaks for flowSkip.
		this.pos = i;
		while (this.pos > start && (isWhite(s[this.pos - 1]) || isBreak(s[this.pos - 1]))) this.pos--;
		return { k: 'scalar', value: out, style: 'plain', pos: start };
	}

	applyTag(n: YNode, tag: string | undefined, at: number): YNode {
		if (tag === undefined) return n;
		if (tag === 'map' && n.k !== 'map') this.fail('!!map on a value that is not a mapping', at);
		if (tag === 'seq' && n.k !== 'seq') this.fail('!!seq on a value that is not a sequence', at);
		if ((tag === 'map' || tag === 'seq') && n.k === 'scalar') this.fail(`!!${tag} on a scalar`, at);
		if (tag !== 'map' && tag !== 'seq' && n.k !== 'scalar')
			this.fail(`!!${tag} on a collection`, at);
		if (n.k === 'scalar' && tag !== 'map' && tag !== 'seq') return { ...n, tag };
		return n;
	}
}

function emptyScalar(pos: number): YScalar {
	return { k: 'scalar', value: '', style: 'plain', pos };
}

// ---------- resolving scalars (core schema) ----------

const NULL_RE = /^(?:~|null|Null|NULL|)$/;
const BOOL_RE = /^(?:true|True|TRUE|false|False|FALSE)$/;
const INT_RE = /^[-+]?[0-9]+$/;
const OCT_RE = /^0o[0-7]+$/;
const HEX_RE = /^0x[0-9a-fA-F]+$/;
const FLOAT_RE = /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)(?:[eE][-+]?[0-9]+)?$/;
const INF_RE = /^[-+]?\.(?:inf|Inf|INF)$/;
const NAN_RE = /^\.(?:nan|NaN|NAN)$/;

/** Values YAML 1.1 parsers read differently from 1.2. */
const BOOL11_RE = /^(?:y|Y|yes|Yes|YES|n|N|no|No|NO|on|On|ON|off|Off|OFF)$/;
const SEXAGESIMAL_RE = /^[-+]?[1-9][0-9_]*(?::[0-5]?[0-9])+(?:\.[0-9_]*)?$/;
const OCT11_RE = /^[-+]?0[0-7]+$/;
const DATE_RE =
	/^\d{4}-\d{1,2}-\d{1,2}(?:(?:[Tt]|[ \t]+)\d{1,2}:\d{2}:\d{2}(?:\.\d*)?(?:[ \t]*(?:Z|[-+]\d{1,2}(?::\d{2})?))?)?$/;

export type Resolved =
	| { type: 'null' }
	| { type: 'bool'; value: boolean }
	| { type: 'number'; json: string; special?: boolean }
	| { type: 'string'; value: string };

/** Turns a YAML number into JSON number text, keeping all digits. */
function numberJson(v: string): string {
	let t = v.startsWith('+') ? v.slice(1) : v;
	const neg = t.startsWith('-');
	if (neg) t = t.slice(1);
	if (t.startsWith('.')) t = '0' + t;
	t = t.replace(/^0+(?=\d)/, '');
	t = t.replace(/\.(?=[eE]|$)/, '.0');
	return (neg ? '-' : '') + t;
}

export function resolvePlain(v: string): Resolved {
	if (NULL_RE.test(v)) return { type: 'null' };
	if (BOOL_RE.test(v)) return { type: 'bool', value: v.toLowerCase() === 'true' };
	if (INT_RE.test(v)) return { type: 'number', json: numberJson(v) };
	if (OCT_RE.test(v)) return { type: 'number', json: BigInt('0o' + v.slice(2)).toString() };
	if (HEX_RE.test(v)) return { type: 'number', json: BigInt(v).toString() };
	if (FLOAT_RE.test(v)) return { type: 'number', json: numberJson(v) };
	if (INF_RE.test(v) || NAN_RE.test(v)) return { type: 'number', json: 'null', special: true };
	return { type: 'string', value: v };
}

/** Message when a plain value means something else to a YAML 1.1 parser, or undefined. */
export function yaml11Difference(v: string): string | undefined {
	if (BOOL11_RE.test(v))
		return `${v} is the string "${v}" in YAML 1.2, but a boolean (${/^(?:y|yes|on)$/i.test(v)}) in YAML 1.1 parsers such as PyYAML and go-yaml v2. Quote it to be safe`;
	if (OCT11_RE.test(v))
		return `${v} is the decimal number ${numberJson(v)} in YAML 1.2, but octal ${parseInt(v, 8)} in YAML 1.1. Quote it or write 0o${v.replace(/^[-+]?0+/, '')}`;
	if (SEXAGESIMAL_RE.test(v))
		return `${v} is a string in YAML 1.2, but a base 60 number in YAML 1.1 (port mappings in docker-compose are a classic case). Quote it`;
	if (DATE_RE.test(v))
		return `${v} is a string in YAML 1.2, but YAML 1.1 parsers such as PyYAML turn it into a date`;
	return undefined;
}

// ---------- to JSON ----------

const MAX_NODES = 1_000_000;

export interface YamlToJson {
	json: string;
	documents: number;
	warnings: Warning[];
}

interface ConvertCtx {
	warnings: Warning[];
	count: number;
	cache: Map<YNode, JNode>;
	warned: Set<YNode>;
}

function convert(n: YNode, ctx: ConvertCtx): JNode {
	const cached = ctx.cache.get(n);
	if (cached) {
		ctx.count += sizeOf(cached);
		if (ctx.count > MAX_NODES)
			throw new YamlError(
				`Aliases expand to more than ${MAX_NODES.toLocaleString('en-GB')} values (a "billion laughs" document?), stopped`,
				n.pos
			);
		return cached;
	}
	ctx.count++;
	let out: JNode;
	if (n.k === 'scalar') out = scalarJson(n, ctx);
	else if (n.k === 'seq') out = { t: 'a', v: n.items.map((x) => convert(x, ctx)) };
	else out = mapJson(n, ctx);
	ctx.cache.set(n, out);
	return out;
}

const sizes = new WeakMap<JNode, number>();
function sizeOf(n: JNode): number {
	const c = sizes.get(n);
	if (c !== undefined) return c;
	let s = 1;
	if (n.t === 'a') for (const x of n.v) s += sizeOf(x);
	else if (n.t === 'o') for (const [, x] of n.e) s += sizeOf(x);
	sizes.set(n, s);
	return s;
}

function scalarJson(n: YScalar, ctx: ConvertCtx): JNode {
	const str = (v: string): JNode => ({ t: 'p', raw: JSON.stringify(v) });
	if (n.tag === 'str' || n.tag === '!') return str(n.value);
	if (n.style !== 'plain') {
		if (n.tag && n.tag !== 'str') return tagged(n, ctx);
		return str(n.value);
	}
	if (n.tag) return tagged(n, ctx);
	const r = resolvePlain(n.value);
	if (r.type === 'string') {
		const w = yaml11Difference(n.value);
		if (w && !ctx.warned.has(n)) {
			ctx.warned.add(n);
			ctx.warnings.push({ pos: n.pos, message: w });
		}
	}
	if (r.type === 'number' && !r.special) {
		const w = OCT11_RE.test(n.value) ? yaml11Difference(n.value) : undefined;
		if (w && !ctx.warned.has(n)) {
			ctx.warned.add(n);
			ctx.warnings.push({ pos: n.pos, message: w });
		}
	}
	return resolvedJson(r, n, ctx);
}

function resolvedJson(r: Resolved, n: YScalar, ctx: ConvertCtx): JNode {
	switch (r.type) {
		case 'null':
			return { t: 'p', raw: 'null' };
		case 'bool':
			return { t: 'p', raw: String(r.value) };
		case 'number':
			if (r.special && !ctx.warned.has(n)) {
				ctx.warned.add(n);
				ctx.warnings.push({ pos: n.pos, message: `${n.value} has no JSON form, written as null` });
			}
			return { t: 'p', raw: r.json };
		case 'string':
			return { t: 'p', raw: JSON.stringify(r.value) };
	}
}

function tagged(n: YScalar, ctx: ConvertCtx): JNode {
	const v = n.value.trim();
	const r = resolvePlain(v);
	const bad = (what: string): never => {
		throw new YamlError(`!!${n.tag} value ${JSON.stringify(n.value)} is not ${what}`, n.pos);
	};
	switch (n.tag) {
		case 'null':
			if (r.type !== 'null') bad('null');
			break;
		case 'bool':
			if (r.type !== 'bool') bad('a boolean');
			break;
		case 'int':
			if (!(INT_RE.test(v) || OCT_RE.test(v) || HEX_RE.test(v))) bad('an integer');
			break;
		case 'float':
			if (r.type !== 'number') bad('a number');
			break;
	}
	return resolvedJson(r, n, ctx);
}

function mapJson(n: Extract<YNode, { k: 'map' }>, ctx: ConvertCtx): JNode {
	const isMerge = (k: YScalar) => k.value === '<<' && k.style === 'plain' && !k.tag;
	const ownKeys = new Set<string>();
	for (const [k] of n.entries) if (!isMerge(k)) ownKeys.add(k.value);
	const out: [string, JNode][] = [];
	const have = new Set<string>();
	for (const [k, v] of n.entries) {
		if (!isMerge(k)) {
			have.add(k.value);
			out.push([JSON.stringify(k.value), convert(v, ctx)]);
			continue;
		}
		// Merge key (https://yaml.org/type/merge.html): keys of this mapping win, then earlier
		// mappings in a merge list win over later ones. Merged keys go where << stands.
		const sources = v.k === 'seq' ? v.items : [v];
		for (const src of sources) {
			if (src.k !== 'map')
				throw new YamlError('Merge key << needs a mapping or a list of mappings', src.pos);
			const j = convert(src, ctx);
			if (j.t !== 'o') continue;
			for (const [rk, rv] of j.e) {
				const key = JSON.parse(rk) as string;
				if (ownKeys.has(key) || have.has(key)) continue;
				have.add(key);
				out.push([rk, rv]);
			}
		}
	}
	return { t: 'o', e: out };
}

export function parseYaml(text: string): { docs: YNode[]; version?: string } {
	// A byte order mark is not part of the content; positions are shifted back for errors.
	const bom = text.charCodeAt(0) === 0xfeff ? 1 : 0;
	const p = new Parser(bom ? text.slice(1) : text);
	try {
		return p.stream();
	} catch (e) {
		if (e instanceof YamlError) throw new YamlError(e.message, e.pos + bom);
		throw new YamlError('Nesting is too deep to process', p.pos + bom);
	}
}

export interface ToJsonOptions {
	indent: Indent;
	/** With several documents: a JSON array of them, or only the first. */
	multi: 'array' | 'first';
}

export function yamlToJson(text: string, opts: Partial<ToJsonOptions> = {}): YamlToJson {
	const o: ToJsonOptions = { indent: 2, multi: 'array', ...opts };
	const { docs, version } = parseYaml(text);
	const ctx: ConvertCtx = { warnings: [], count: 0, cache: new Map(), warned: new Set() };
	if (version && version !== '1.2' && version !== '1.1')
		ctx.warnings.push({ pos: 0, message: `%YAML ${version} directive, read as 1.2` });
	if (version === '1.1')
		ctx.warnings.push({
			pos: 0,
			message: '%YAML 1.1 directive: values are still read with the 1.2 core schema'
		});
	if (!docs.length) return { json: 'null', documents: 0, warnings: ctx.warnings };
	let root: JNode;
	try {
		root =
			docs.length === 1 || o.multi === 'first'
				? convert(docs[0], ctx)
				: { t: 'a', v: docs.map((d) => convert(d, ctx)) };
	} catch (e) {
		if (e instanceof YamlError) throw e;
		throw new YamlError('Nesting is too deep to process', 0);
	}
	ctx.warnings.sort((a, b) => a.pos - b.pos);
	return { json: stringify(root, o.indent), documents: docs.length, warnings: ctx.warnings };
}

// ---------- JSON to YAML ----------

/** A string may be written plain only if a YAML 1.1 or 1.2 parser reads it back as the same string. */
export function needsQuotes(v: string): boolean {
	if (v === '') return true;
	if (/^[\s]|[\s]$/.test(v)) return true;
	if (/[\x00-\x1f\x7f\u0085\u2028\u2029\ufeff]/.test(v)) return true;
	if (resolvePlain(v).type !== 'string') return true;
	if (yaml11Difference(v)) return true;
	if (/^[-+]?(?:\.?\d|\.(?:inf|nan))/i.test(v) && /^[-+.\d_:eExXoObB]+$/i.test(v)) return true;
	if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(v)) return true;
	if (v === '<<' || v === '=') return true;
	if (/: |:$| #/.test(v)) return true;
	if (/^(?:---|\.\.\.)/.test(v)) return true;
	return false;
}

export function quoteString(v: string): string {
	if (!needsQuotes(v)) return v;
	if (/[\x00-\x1f\x7f\u0085\u2028\u2029\ufeff\\]/.test(v)) return JSON.stringify(v);
	return `'${v.replace(/'/g, "''")}'`;
}

/** Multi-line strings as literal blocks when that reads back exactly. */
function literalBlock(v: string, pad: string): string | null {
	if (!v.includes('\n')) return null;
	if (/[\x00-\x08\x0b-\x1f\x7f\u0085\u2028\u2029\ufeff]/.test(v)) return null;
	const body = v.replace(/\n+$/, '');
	const trailing = v.length - body.length;
	const lines = body.split('\n');
	if (lines.some((l) => /[ \t]$/.test(l) || (l !== '' && /^[ \t]*$/.test(l)))) return null;
	if (!body) return null;
	const chomp = trailing === 0 ? '-' : trailing === 1 ? '' : '+';
	const indicator = /^[ \t]/.test(lines[0]) ? '2' : '';
	const ind = pad + '  ';
	const out = lines.map((l) => (l ? ind + l : '')).join('\n');
	const extra = trailing > 1 ? '\n'.repeat(trailing - 1) : '';
	return `|${indicator}${chomp}\n${out}${extra}`;
}

export function jsonToYaml(text: string): string {
	const { root } = parseJson(text);
	return emitYaml(root);
}

export function emitYaml(root: JNode): string {
	const out: string[] = [];
	const scalar = (n: Extract<JNode, { t: 'p' }>, pad: string): string => {
		if (n.raw.startsWith('"')) {
			const v = JSON.parse(n.raw) as string;
			return literalBlock(v, pad) ?? quoteString(v);
		}
		return n.raw;
	};
	const key = (raw: string) => quoteString(JSON.parse(raw) as string);
	const isEmpty = (n: JNode) => (n.t === 'a' && !n.v.length) || (n.t === 'o' && !n.e.length);
	const inline = (n: JNode, pad: string): string | null => {
		if (n.t === 'p') return scalar(n, pad);
		if (n.t === 'a' && !n.v.length) return '[]';
		if (n.t === 'o' && !n.e.length) return '{}';
		return null;
	};

	/** Writes a collection whose first line continues the current line (after "- "). */
	const block = (n: JNode, pad: string, firstPrefix: string) => {
		if (n.t === 'o') {
			n.e.forEach(([k, v], i) => {
				const lead = i === 0 ? firstPrefix : pad;
				const s = inline(v, pad);
				if (s !== null) out.push(`${lead}${key(k)}: ${s}`);
				else {
					out.push(`${lead}${key(k)}:`);
					block(v, pad + '  ', pad + '  ');
				}
			});
		} else if (n.t === 'a') {
			n.v.forEach((v, i) => {
				const lead = (i === 0 ? firstPrefix : pad) + '- ';
				const s = inline(v, pad);
				if (s !== null) out.push(lead + s);
				else block(v, pad + '  ', lead);
			});
		}
	};
	const top = inline(root, '');
	if (top !== null && (root.t === 'p' || isEmpty(root))) return top + '\n';
	block(root, '', '');
	return out.join('\n') + '\n';
}

// ---------- detection ----------

/** Conservative: a document marker, or block keys with indented content, and it parses. */
export function looksLikeYaml(s: string): number {
	const t = s.trim();
	if (t.length < 8 || t.length > 20_000 || /^[{[<]/.test(t)) return 0;
	const marker = /^(?:---|%YAML)/.test(t);
	const nested = /^[A-Za-z_][\w.-]*:[ \t]*\r?\n[ \t]+(?:- |[A-Za-z_"'][^\n]*:)/m.test(t);
	if (!marker && !nested) return 0;
	try {
		const { docs } = parseYaml(t);
		if (!docs.length || docs[0].k === 'scalar') return 0;
		return marker ? 0.7 : 0.6;
	} catch {
		return 0;
	}
}
