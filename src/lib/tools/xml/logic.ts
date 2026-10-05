/**
 * A small non-validating XML 1.0 parser (https://www.w3.org/TR/xml/, fifth edition) with
 * namespace checks (https://www.w3.org/TR/xml-names/). It checks well-formedness and keeps the
 * source text of every node so formatting never changes content.
 *
 * Entities are never expanded and nothing external is ever loaded: a DOCTYPE is shown as written,
 * and entity references stay as they are in the output.
 */

export class XmlError extends Error {
	constructor(
		message: string,
		public pos: number
	) {
		super(message);
	}
}

export interface Attr {
	name: string;
	/** Value as written, without the quotes. */
	raw: string;
	quote: '"' | "'";
}

export type XNode =
	| {
			t: 'el';
			name: string;
			attrs: Attr[];
			children: XNode[];
			selfClosing: boolean;
			pos: number;
			/** Source offsets of the content between the start and end tag. */
			innerStart: number;
			innerEnd: number;
	  }
	| { t: 'text'; raw: string; pos: number }
	| { t: 'cdata'; raw: string; pos: number }
	| { t: 'comment'; raw: string; pos: number }
	| { t: 'pi'; raw: string; target: string; pos: number }
	| { t: 'doctype'; raw: string; pos: number }
	| { t: 'decl'; raw: string; pos: number };

export type XElement = Extract<XNode, { t: 'el' }>;

export interface XmlStats {
	elements: number;
	attributes: number;
	depth: number;
	comments: number;
	/** Prefix to namespace URI, first declaration wins. '' is the default namespace. */
	namespaces: Map<string, string>;
	/** Entities declared in the internal DTD subset. */
	entities: string[];
	/** Entities declared with SYSTEM or PUBLIC: never fetched. */
	externalEntities: string[];
	/** Entity references that could not be checked because the DTD is external. */
	unchecked: string[];
}

export interface XmlDoc {
	nodes: XNode[];
	root: XElement;
	stats: XmlStats;
	src: string;
	doctype?: string;
}

const NAME_START =
	':A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\u{10000}-\\u{EFFFF}';
const NAME_CHAR = NAME_START + '\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040';
const NAME_RE = new RegExp(`[${NAME_START}][${NAME_CHAR}]*`, 'uy');
const FULL_NAME_RE = new RegExp(`^[${NAME_START}][${NAME_CHAR}]*$`, 'u');
/** Characters outside the XML Char production, including lone surrogates. */
const BAD_CHAR_RE = new RegExp(
	'[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\uFFFE\\uFFFF\\uD800-\\uDFFF]',
	'u'
);

const PREDEFINED = new Set(['lt', 'gt', 'amp', 'apos', 'quot']);
const isWs = (c: string | undefined) => c === ' ' || c === '\t' || c === '\n' || c === '\r';

export function isXmlName(s: string): boolean {
	return FULL_NAME_RE.test(s);
}

class Parser {
	pos = 0;
	stats: XmlStats = {
		elements: 0,
		attributes: 0,
		depth: 0,
		comments: 0,
		namespaces: new Map(),
		entities: [],
		externalEntities: [],
		unchecked: []
	};
	declared = new Set<string>();
	/** True when undeclared entities cannot be judged (external DTD or parameter entities). */
	dtdOpen = false;
	doctype?: string;

	constructor(private s: string) {}

	fail(msg: string, at = this.pos): never {
		throw new XmlError(msg, at);
	}

	name(what: string): string {
		NAME_RE.lastIndex = this.pos;
		const m = NAME_RE.exec(this.s);
		if (!m) {
			const c = this.s[this.pos];
			this.fail(
				c === undefined
					? `Unexpected end of input, expected ${what}`
					: `Expected ${what}, found ${JSON.stringify(c)}`
			);
		}
		this.pos += m[0].length;
		return m[0];
	}

	ws(): boolean {
		const start = this.pos;
		while (isWs(this.s[this.pos])) this.pos++;
		return this.pos > start;
	}

	expect(str: string, msg?: string) {
		if (!this.s.startsWith(str, this.pos)) this.fail(msg ?? `Expected ${str}`);
		this.pos += str.length;
	}

	/** Checks characters and references in text or an attribute value. */
	checkText(raw: string, at: number, inAttr: boolean) {
		const bad = BAD_CHAR_RE.exec(raw);
		if (bad) {
			const cp = bad[0].codePointAt(0)!;
			this.fail(
				`Character U+${cp.toString(16).toUpperCase().padStart(4, '0')} is not allowed in XML`,
				at + bad.index
			);
		}
		if (!inAttr) {
			const cd = raw.indexOf(']]>');
			if (cd >= 0) this.fail(']]> is not allowed in text, write ]]&gt;', at + cd);
		}
		let i = raw.indexOf('&');
		while (i >= 0) {
			const end = raw.indexOf(';', i);
			const ref = end < 0 ? '' : raw.slice(i + 1, end);
			if (end < 0 || !ref) this.fail('& must start an entity reference like &amp;', at + i);
			if (ref[0] === '#') {
				const hex = ref[1] === 'x';
				const digits = ref.slice(hex ? 2 : 1);
				if (!(hex ? /^[0-9a-fA-F]+$/ : /^[0-9]+$/).test(digits))
					this.fail(`Invalid character reference &${ref};`, at + i);
				const cp = parseInt(digits, hex ? 16 : 10);
				const ok =
					cp === 0x9 ||
					cp === 0xa ||
					cp === 0xd ||
					(cp >= 0x20 && cp <= 0xd7ff) ||
					(cp >= 0xe000 && cp <= 0xfffd) ||
					(cp >= 0x10000 && cp <= 0x10ffff);
				if (!ok) this.fail(`&${ref}; refers to a character not allowed in XML`, at + i);
			} else {
				if (!isXmlName(ref)) this.fail(`Invalid entity reference &${ref};`, at + i);
				if (!PREDEFINED.has(ref) && !this.declared.has(ref)) {
					if (this.dtdOpen) {
						if (!this.stats.unchecked.includes(ref)) this.stats.unchecked.push(ref);
					} else this.fail(`Undefined entity &${ref};`, at + i);
				}
			}
			i = raw.indexOf('&', end);
		}
		if (inAttr) {
			const lt = raw.indexOf('<');
			if (lt >= 0) this.fail('< is not allowed in an attribute value, write &lt;', at + lt);
		}
	}

	document(): XmlDoc {
		const s = this.s;
		const nodes: XNode[] = [];
		let root: XElement | undefined;
		if (s.charCodeAt(0) === 0xfeff) this.pos = 1;
		if (s.startsWith('<?xml', this.pos) && (isWs(s[this.pos + 5]) || s[this.pos + 5] === '?'))
			nodes.push(this.decl());
		for (;;) {
			this.ws();
			const start = this.pos;
			if (this.pos >= s.length) break;
			if (s[this.pos] !== '<')
				this.fail(root ? 'Text after the root element' : 'Text before the root element');
			if (s.startsWith('<!--', this.pos)) nodes.push(this.comment());
			else if (s.startsWith('<?', this.pos)) nodes.push(this.pi());
			else if (s.startsWith('<!DOCTYPE', this.pos)) {
				if (root) this.fail('DOCTYPE must come before the root element');
				if (this.doctype !== undefined) this.fail('Only one DOCTYPE is allowed');
				nodes.push(this.doctypeDecl());
			} else if (s.startsWith('<![CDATA[', this.pos)) this.fail('CDATA outside the root element');
			else if (s.startsWith('</', this.pos)) {
				this.pos += 2;
				const n = this.name('a tag name');
				this.fail(`Unexpected end tag </${n}>`, start);
			} else {
				if (root) this.fail('Only one root element is allowed');
				root = this.element(1, new Map([['xml', 'http://www.w3.org/XML/1998/namespace']]));
				nodes.push(root);
			}
		}
		if (!root) this.fail('No root element', s.length);
		return { nodes, root, stats: this.stats, src: s, doctype: this.doctype };
	}

	decl(): XNode {
		const start = this.pos;
		const end = this.s.indexOf('?>', start);
		if (end < 0) this.fail('Unterminated XML declaration', start);
		const raw = this.s.slice(start, end + 2);
		const body = raw.slice(5, -2);
		const re =
			/^\s+version\s*=\s*(["'])1\.[0-9]+\1(?:\s+encoding\s*=\s*(["'])[A-Za-z][A-Za-z0-9._-]*\2)?(?:\s+standalone\s*=\s*(["'])(?:yes|no)\3)?\s*$/;
		if (!re.test(body))
			this.fail(
				'Malformed XML declaration, expected version, then optional encoding and standalone',
				start
			);
		if (/standalone\s*=\s*["']yes/.test(body)) this.standalone = true;
		this.pos = end + 2;
		return { t: 'decl', raw, pos: start };
	}

	standalone = false;

	comment(): XNode {
		const start = this.pos;
		const end = this.s.indexOf('-->', start + 4);
		if (end < 0) this.fail('Unterminated comment, expected -->', start);
		const body = this.s.slice(start + 4, end);
		const dd = body.indexOf('--');
		if (dd >= 0) this.fail('-- is not allowed inside a comment', start + 4 + dd);
		if (body.endsWith('-')) this.fail('A comment cannot end with --->', end - 1);
		this.checkChars(body, start + 4);
		this.pos = end + 3;
		this.stats.comments++;
		return { t: 'comment', raw: this.s.slice(start, end + 3), pos: start };
	}

	checkChars(raw: string, at: number) {
		const bad = BAD_CHAR_RE.exec(raw);
		if (bad) {
			const cp = bad[0].codePointAt(0)!;
			this.fail(
				`Character U+${cp.toString(16).toUpperCase().padStart(4, '0')} is not allowed in XML`,
				at + bad.index
			);
		}
	}

	pi(): XNode {
		const start = this.pos;
		this.pos += 2;
		const target = this.name('a processing instruction target');
		if (target.toLowerCase() === 'xml')
			this.fail(
				target === 'xml'
					? 'The XML declaration is only allowed at the very start of the document'
					: `Processing instruction target ${target} is reserved`,
				start
			);
		const end = this.s.indexOf('?>', this.pos);
		if (end < 0) this.fail('Unterminated processing instruction, expected ?>', start);
		if (end > this.pos && !isWs(this.s[this.pos]))
			this.fail('Expected white space after the processing instruction target');
		this.checkChars(this.s.slice(this.pos, end), this.pos);
		this.pos = end + 2;
		return { t: 'pi', raw: this.s.slice(start, end + 2), target, pos: start };
	}

	quotedLiteral(what: string): string {
		const q = this.s[this.pos];
		if (q !== '"' && q !== "'") this.fail(`Expected a quoted ${what}`);
		const end = this.s.indexOf(q, this.pos + 1);
		if (end < 0) this.fail(`Unterminated ${what}`);
		const v = this.s.slice(this.pos + 1, end);
		this.pos = end + 1;
		return v;
	}

	doctypeDecl(): XNode {
		const s = this.s;
		const start = this.pos;
		this.pos += 9;
		if (!this.ws()) this.fail('Expected white space after <!DOCTYPE');
		this.name('the document element name');
		this.ws();
		if (s.startsWith('SYSTEM', this.pos)) {
			this.pos += 6;
			this.ws();
			this.quotedLiteral('system identifier');
			this.dtdOpen = true;
		} else if (s.startsWith('PUBLIC', this.pos)) {
			this.pos += 6;
			this.ws();
			this.quotedLiteral('public identifier');
			this.ws();
			this.quotedLiteral('system identifier');
			this.dtdOpen = true;
		}
		this.ws();
		if (s[this.pos] === '[') {
			this.pos++;
			this.internalSubset();
			this.ws();
		}
		if (s[this.pos] !== '>') this.fail('Expected > to close the DOCTYPE');
		this.pos++;
		if (this.standalone) this.dtdOpen = false;
		const raw = s.slice(start, this.pos);
		this.doctype = raw;
		return { t: 'doctype', raw, pos: start };
	}

	/** Skips the internal subset, recording entity declarations. Nothing is expanded. */
	internalSubset() {
		const s = this.s;
		for (;;) {
			this.ws();
			if (this.pos >= s.length) this.fail('Unterminated DOCTYPE internal subset');
			const c = s[this.pos];
			if (c === ']') {
				this.pos++;
				return;
			}
			if (s.startsWith('<!--', this.pos)) {
				this.comment();
				continue;
			}
			if (s.startsWith('<?', this.pos)) {
				this.pi();
				continue;
			}
			if (c === '%') {
				// Parameter entity reference: declarations we cannot see.
				const end = s.indexOf(';', this.pos);
				if (end < 0) this.fail('Unterminated parameter entity reference');
				this.pos = end + 1;
				this.dtdOpen = true;
				continue;
			}
			if (s.startsWith('<!ENTITY', this.pos)) {
				const declStart = this.pos;
				this.pos += 8;
				if (!this.ws()) this.fail('Expected white space after <!ENTITY');
				let param = false;
				if (s[this.pos] === '%') {
					param = true;
					this.pos++;
					this.ws();
				}
				const name = this.name('an entity name');
				this.ws();
				let external = false;
				if (s.startsWith('SYSTEM', this.pos) || s.startsWith('PUBLIC', this.pos)) {
					external = true;
					const pub = s.startsWith('PUBLIC', this.pos);
					this.pos += 6;
					this.ws();
					this.quotedLiteral('identifier');
					if (pub) {
						this.ws();
						this.quotedLiteral('system identifier');
					}
					this.ws();
					if (s.startsWith('NDATA', this.pos)) {
						this.pos += 5;
						this.ws();
						this.name('a notation name');
					}
				} else this.quotedLiteral('entity value');
				this.ws();
				if (s[this.pos] !== '>') this.fail('Expected > to close the ENTITY declaration', declStart);
				this.pos++;
				if (!param) {
					if (!this.declared.has(name)) {
						this.declared.add(name);
						this.stats.entities.push(name);
						if (external) this.stats.externalEntities.push(name);
					}
				}
				continue;
			}
			if (s.startsWith('<!', this.pos)) {
				// ELEMENT, ATTLIST, NOTATION: skip to the closing >, respecting quotes.
				const declStart = this.pos;
				this.pos += 2;
				while (this.pos < s.length && s[this.pos] !== '>') {
					if (s[this.pos] === '"' || s[this.pos] === "'") this.quotedLiteral('literal');
					else this.pos++;
				}
				if (this.pos >= s.length) this.fail('Unterminated declaration in the DOCTYPE', declStart);
				this.pos++;
				continue;
			}
			this.fail('Unexpected content in the DOCTYPE internal subset');
		}
	}

	element(depth: number, scope: Map<string, string>): XElement {
		const s = this.s;
		const start = this.pos;
		this.pos++;
		const name = this.name('an element name');
		this.stats.elements++;
		if (depth > this.stats.depth) this.stats.depth = depth;
		const attrs: Attr[] = [];
		const attrPos: number[] = [];
		const seen = new Set<string>();
		let selfClosing = false;
		for (;;) {
			const hadWs = this.ws();
			const c = s[this.pos];
			if (c === '>') {
				this.pos++;
				break;
			}
			if (c === '/' && s[this.pos + 1] === '>') {
				this.pos += 2;
				selfClosing = true;
				break;
			}
			if (c === undefined) this.fail(`Unterminated start tag <${name}`, start);
			if (!hadWs) this.fail('Expected white space between attributes');
			const aStart = this.pos;
			const an = this.name('an attribute name or >');
			if (seen.has(an)) this.fail(`Duplicate attribute ${an}`, aStart);
			seen.add(an);
			this.ws();
			if (s[this.pos] !== '=') this.fail(`Expected = after the attribute name ${an}`);
			this.pos++;
			this.ws();
			const q = s[this.pos];
			if (q !== '"' && q !== "'") this.fail('Attribute values must be in quotes');
			const vStart = this.pos + 1;
			const end = s.indexOf(q, vStart);
			if (end < 0) this.fail('Unterminated attribute value', this.pos);
			const raw = s.slice(vStart, end);
			this.checkText(raw, vStart, true);
			this.pos = end + 1;
			attrs.push({ name: an, raw, quote: q });
			attrPos.push(aStart);
		}
		this.stats.attributes += attrs.length;

		// Namespaces
		let local = scope;
		attrs.forEach((a, i) => {
			if (a.name === 'xmlns' || a.name.startsWith('xmlns:')) {
				const prefix = a.name === 'xmlns' ? '' : a.name.slice(6);
				if (prefix === 'xmlns') this.fail('The xmlns prefix cannot be declared', attrPos[i]);
				if (prefix && !a.raw)
					this.fail(`Namespace prefix ${prefix} cannot be undeclared in XML 1.0`, attrPos[i]);
				if (local === scope) local = new Map(scope);
				local.set(prefix, a.raw);
				if (!this.stats.namespaces.has(prefix) && a.raw) this.stats.namespaces.set(prefix, a.raw);
			}
		});
		const checkPrefix = (qname: string, at: number, isAttr: boolean) => {
			const parts = qname.split(':');
			if (parts.length > 2 || parts.some((p) => !p))
				this.fail(`${qname} is not a valid namespace-qualified name`, at);
			if (parts.length === 2) {
				const p = parts[0];
				if (isAttr && p === 'xmlns') return;
				if (!local.has(p)) this.fail(`Namespace prefix ${p} is not declared`, at);
			}
		};
		checkPrefix(name, start + 1, false);
		attrs.forEach((a, i) => checkPrefix(a.name, attrPos[i], true));

		const el: XElement = {
			t: 'el',
			name,
			attrs,
			children: [],
			selfClosing,
			pos: start,
			innerStart: this.pos,
			innerEnd: this.pos
		};
		if (selfClosing) return el;

		for (;;) {
			const tStart = this.pos;
			const lt = s.indexOf('<', this.pos);
			if (lt < 0) this.fail(`Element <${name}> is not closed`, start);
			if (lt > tStart) {
				const raw = s.slice(tStart, lt);
				this.checkText(raw, tStart, false);
				el.children.push({ t: 'text', raw, pos: tStart });
				this.pos = lt;
			}
			if (s.startsWith('</', this.pos)) {
				el.innerEnd = this.pos;
				const endPos = this.pos;
				this.pos += 2;
				const en = this.name('an end tag name');
				this.ws();
				if (s[this.pos] !== '>') this.fail(`Expected > to close </${en}`);
				this.pos++;
				if (en !== name) this.fail(`Expected </${name}>, found </${en}>`, endPos);
				return el;
			}
			if (s.startsWith('<!--', this.pos)) el.children.push(this.comment());
			else if (s.startsWith('<![CDATA[', this.pos)) {
				const cStart = this.pos;
				const end = s.indexOf(']]>', cStart + 9);
				if (end < 0) this.fail('Unterminated CDATA section, expected ]]>', cStart);
				this.checkChars(s.slice(cStart + 9, end), cStart + 9);
				this.pos = end + 3;
				el.children.push({ t: 'cdata', raw: s.slice(cStart, end + 3), pos: cStart });
			} else if (s.startsWith('<?', this.pos)) el.children.push(this.pi());
			else if (s.startsWith('<!DOCTYPE', this.pos))
				this.fail('DOCTYPE must come before the root element');
			else if (s.startsWith('<!', this.pos))
				this.fail('Unexpected <!, expected a comment or CDATA');
			else el.children.push(this.element(depth + 1, local));
		}
	}
}

export function parseXml(text: string): XmlDoc {
	const p = new Parser(text);
	try {
		return p.document();
	} catch (e) {
		if (e instanceof XmlError) throw e;
		throw new XmlError('Nesting is too deep to process', p.pos);
	}
}

// ---------- formatting ----------

export type XmlIndent = 2 | 4 | 'tab';

export interface FormatOptions {
	indent: XmlIndent;
	/** Put each attribute on its own line when a start tag gets longer than this. 0 = never. */
	wrap: number;
	keepComments: boolean;
}

const defaults: FormatOptions = { indent: 2, wrap: 100, keepComments: true };

const isBlank = (n: XNode) => n.t === 'text' && !/[^ \t\r\n]/.test(n.raw);

function preserves(el: XElement, inherited: boolean): boolean {
	const a = el.attrs.find((x) => x.name === 'xml:space');
	if (!a) return inherited;
	return a.raw === 'preserve';
}

/** Element content holds text that matters (non-blank text or CDATA). */
function hasText(el: XElement): boolean {
	return el.children.some((c) => (c.t === 'text' && !isBlank(c)) || c.t === 'cdata');
}

function startTag(el: XElement, pad: string, unit: string, wrap: number, close: string): string {
	const attrs = el.attrs.map((a) => `${a.name}=${a.quote}${a.raw}${a.quote}`);
	const one = `<${el.name}${attrs.map((a) => ' ' + a).join('')}${close}`;
	if (!wrap || attrs.length < 2 || pad.length + one.length <= wrap || one.includes('\n'))
		return one;
	return `<${el.name}\n${attrs.map((a) => pad + unit + a).join('\n')}${close === '/>' ? '\n' + pad + '/>' : '\n' + pad + '>'}`;
}

/** Pretty-prints XML. Text content is kept exactly; only blank text between elements changes. */
export function formatXml(text: string, opts: Partial<FormatOptions> = {}): string {
	const o = { ...defaults, ...opts };
	const doc = parseXml(text);
	const unit = o.indent === 'tab' ? '\t' : ' '.repeat(o.indent);
	const out: string[] = [];
	const src = doc.src;

	const walk = (n: XNode, pad: string, preserve: boolean) => {
		switch (n.t) {
			case 'text':
				if (!isBlank(n)) out.push(pad + n.raw);
				return;
			case 'comment':
				if (o.keepComments) out.push(pad + n.raw);
				return;
			case 'cdata':
			case 'pi':
			case 'doctype':
			case 'decl':
				out.push(pad + n.raw);
				return;
			case 'el': {
				const pre = preserves(n, preserve);
				if (n.selfClosing) {
					out.push(pad + startTag(n, pad, unit, o.wrap, '/>'));
					return;
				}
				const open = startTag(n, pad, unit, o.wrap, '>');
				const close = `</${n.name}>`;
				const kids = o.keepComments ? n.children : n.children.filter((c) => c.t !== 'comment');
				if (!kids.length || kids.every(isBlank)) {
					out.push(pad + open + (pre ? src.slice(n.innerStart, n.innerEnd) : '') + close);
					return;
				}
				if (pre || hasText(n)) {
					// Mixed or text content: written exactly as in the source.
					out.push(pad + open + src.slice(n.innerStart, n.innerEnd) + close);
					return;
				}
				out.push(pad + open);
				for (const c of kids) walk(c, pad + unit, pre);
				out.push(pad + close);
				return;
			}
		}
	};
	for (const n of doc.nodes) walk(n, '', false);
	return out.join('\n');
}

/** Removes blank text between elements and, optionally, comments. Text content is kept. */
export function minifyXml(text: string, opts: { keepComments?: boolean } = {}): string {
	const keep = opts.keepComments ?? false;
	const doc = parseXml(text);
	const src = doc.src;
	const out: string[] = [];
	const walk = (n: XNode, preserve: boolean) => {
		switch (n.t) {
			case 'text':
				if (!isBlank(n)) out.push(n.raw);
				return;
			case 'comment':
				if (keep) out.push(n.raw);
				return;
			case 'el': {
				const pre = preserves(n, preserve);
				const attrs = n.attrs.map((a) => ` ${a.name}=${a.quote}${a.raw}${a.quote}`).join('');
				if (n.selfClosing) {
					out.push(`<${n.name}${attrs}/>`);
					return;
				}
				out.push(`<${n.name}${attrs}>`);
				// Mixed or text content is kept exactly, comments included.
				if (pre || hasText(n)) out.push(src.slice(n.innerStart, n.innerEnd));
				else for (const c of n.children) walk(c, pre);
				out.push(`</${n.name}>`);
				return;
			}
			default:
				out.push(n.raw);
		}
	};
	for (const n of doc.nodes) walk(n, false);
	return out.join('');
}

// ---------- detection ----------

export function looksLikeXml(s: string): number {
	const t = s.trim();
	if (!t.startsWith('<') || !t.endsWith('>')) return 0;
	if (/^<\?xml\s/.test(t)) return 0.9;
	if (t.length > 50_000 || /^<!doctype\s+html|^<html[\s>]/i.test(t)) return 0;
	try {
		const d = parseXml(t);
		return d.root.name.toLowerCase() === 'html' ? 0 : 0.6;
	} catch {
		return 0;
	}
}
