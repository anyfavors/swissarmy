/**
 * CSV per RFC 4180 (https://www.rfc-editor.org/rfc/rfc4180), with the usual real-world
 * extensions: other delimiters (; tab |), LF or CR line endings, a UTF-8 byte order mark,
 * and a lenient reading of stray quotes inside unquoted fields.
 */
import { parseJson, stringify, type Indent, type JNode } from '../json/logic';

export type Delimiter = ',' | ';' | '\t' | '|';
export const DELIMITERS: Delimiter[] = [',', ';', '\t', '|'];

export const delimiterName: Record<Delimiter, string> = {
	',': 'comma',
	';': 'semicolon',
	'\t': 'tab',
	'|': 'pipe'
};

export class CsvError extends Error {
	constructor(
		message: string,
		public pos: number
	) {
		super(message);
	}
}

export interface CsvParsed {
	rows: string[][];
	delimiter: Delimiter;
	/** Line ending found in the input, for information. */
	eol: 'CRLF' | 'LF' | 'CR' | 'none';
	bom: boolean;
	/** Rows whose field count differs from the first row. */
	ragged: number;
	/** Quotes found inside unquoted fields, kept as text. */
	strayQuotes: number;
	/** Empty lines skipped. */
	blank: number;
}

/**
 * Picks the delimiter that splits the first lines into the most consistent number of fields.
 * Quotes are respected, so commas inside "..." do not count.
 */
export function detectDelimiter(text: string): Delimiter {
	const sample = text.slice(0, 64 * 1024);
	let best: Delimiter = ',';
	let bestScore = -1;
	for (const d of DELIMITERS) {
		const counts = fieldCounts(sample, d, 30);
		if (!counts.length) continue;
		const first = counts[0];
		if (first < 2) continue;
		const same = counts.filter((c) => c === first).length / counts.length;
		// Consistency matters most, then the number of columns.
		const score = same * 1000 + Math.min(first, 100);
		if (score > bestScore) {
			bestScore = score;
			best = d;
		}
	}
	return best;
}

/** Fields per record for the first `max` records, quote-aware. The last partial record is dropped when the sample is cut. */
function fieldCounts(s: string, d: string, max: number): number[] {
	const out: number[] = [];
	let n = 1;
	let inQ = false;
	let fieldStart = true;
	let i = s.charCodeAt(0) === 0xfeff ? 1 : 0;
	const dc = d.charCodeAt(0);
	for (; i < s.length && out.length < max; i++) {
		const c = s.charCodeAt(i);
		if (inQ) {
			if (c === 0x22) {
				if (s.charCodeAt(i + 1) === 0x22) i++;
				else inQ = false;
			}
			continue;
		}
		if (c === 0x22 && fieldStart) {
			inQ = true;
			fieldStart = false;
		} else if (c === dc) {
			n++;
			fieldStart = true;
		} else if (c === 0x0a || c === 0x0d) {
			if (c === 0x0d && s.charCodeAt(i + 1) === 0x0a) i++;
			out.push(n);
			n = 1;
			fieldStart = true;
		} else fieldStart = false;
	}
	if (i >= s.length && out.length < max && !(n === 1 && fieldStart)) out.push(n);
	return out;
}

/** Parses CSV text. Throws CsvError for an unterminated quoted field. */
export function parseCsv(text: string, delimiter: Delimiter | 'auto' = 'auto'): CsvParsed {
	const bom = text.charCodeAt(0) === 0xfeff;
	const d: Delimiter = delimiter === 'auto' ? detectDelimiter(text) : delimiter;
	const dc = d.charCodeAt(0);
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let strayQuotes = 0;
	let eol: CsvParsed['eol'] = 'none';
	const s = text;
	const n = s.length;
	let i = bom ? 1 : 0;
	let atFieldStart = true;

	let quoted = false;
	let blank = 0;
	const endRow = () => {
		row.push(field);
		// Empty lines are skipped rather than read as a record with one empty field.
		if (row.length === 1 && field === '' && !quoted) blank++;
		else rows.push(row);
		quoted = false;
		row = [];
		field = '';
		atFieldStart = true;
	};

	while (i < n) {
		if (atFieldStart && s.charCodeAt(i) === 0x22) {
			// Quoted field.
			const start = i;
			i++;
			let chunkStart = i;
			for (;;) {
				const q = s.indexOf('"', i);
				if (q < 0) throw new CsvError('Unterminated quoted field', start);
				if (s.charCodeAt(q + 1) === 0x22) {
					field += s.slice(chunkStart, q + 1);
					i = q + 2;
					chunkStart = i;
					continue;
				}
				field += s.slice(chunkStart, q);
				i = q + 1;
				break;
			}
			// After the closing quote: delimiter, line break or end. Anything else is kept as text.
			atFieldStart = false;
			quoted = true;
			continue;
		}
		atFieldStart = false;
		// Unquoted run up to the next delimiter or line break.
		let j = i;
		while (j < n) {
			const c = s.charCodeAt(j);
			if (c === dc || c === 0x0a || c === 0x0d) break;
			if (c === 0x22) strayQuotes++;
			j++;
		}
		field += s.slice(i, j);
		if (j >= n) {
			i = j;
			break;
		}
		const c = s.charCodeAt(j);
		if (c === dc) {
			row.push(field);
			field = '';
			quoted = false;
			atFieldStart = true;
			i = j + 1;
			continue;
		}
		if (c === 0x0d && s.charCodeAt(j + 1) === 0x0a) {
			if (eol === 'none') eol = 'CRLF';
			i = j + 2;
		} else {
			if (eol === 'none') eol = c === 0x0d ? 'CR' : 'LF';
			i = j + 1;
		}
		endRow();
	}
	// A final line break does not start an empty record (RFC 4180 2.2).
	if (!atFieldStart || row.length || field) endRow();

	const width = rows[0]?.length ?? 0;
	let ragged = 0;
	for (const r of rows) if (r.length !== width) ragged++;
	return { rows, delimiter: d, eol, bom, ragged, strayQuotes, blank };
}

const NUM = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
/** Danish/German style: 1.234,56 or 1234,56 or 12,5. */
const NUM_COMMA = /^-?(?:0|[1-9]\d{0,2}(?:\.\d{3})+|[1-9]\d*)(?:,\d+)?$/;
const looksNumeric = (s: string) => NUM.test(s.trim()) || NUM_COMMA.test(s.trim());

/**
 * Guesses whether the first row is a header: every cell filled in, all different, none numeric,
 * and at least one column where the data below is numeric or the first row stands out.
 */
export function detectHeader(rows: string[][]): boolean {
	if (rows.length < 2)
		return rows.length === 1 && rows[0].every((c) => c.trim() && !looksNumeric(c));
	const first = rows[0];
	if (first.some((c) => !c.trim() || looksNumeric(c))) return false;
	if (new Set(first.map((c) => c.trim())).size !== first.length) return false;
	const body = rows.slice(1, 51);
	for (let col = 0; col < first.length; col++) {
		const vals = body.map((r) => r[col] ?? '').filter((v) => v.trim());
		if (vals.length && vals.every(looksNumeric)) return true;
		if (vals.length && !vals.includes(first[col])) {
			// Header word longer or shorter than every value is a weak hint; uniqueness is a stronger one.
			if (vals.every((v) => v.length !== first[col].length)) return true;
		}
	}
	return !body.some((r) => r.every((v, i) => v === first[i]));
}

/** True when the data uses decimal commas (1,5 or 1.234,56), as Danish and German Excel export. */
export function usesDecimalComma(rows: string[][], delimiter: Delimiter): boolean {
	if (delimiter === ',') return false;
	let comma = 0;
	let dot = 0;
	for (const r of rows.slice(0, 200))
		for (const v of r) {
			const t = v.trim();
			if (/^-?\d+,\d+$/.test(t) || /^-?\d{1,3}(?:\.\d{3})+,\d+$/.test(t)) comma++;
			else if (/^-?\d+\.\d+$/.test(t) && !/^-?\d{1,3}\.\d{3}$/.test(t)) dot++;
		}
	return comma > 0 && comma >= dot;
}

/** Column names for a header row: blanks become "column N", repeats get a suffix. */
export function headerNames(first: string[], width: number): string[] {
	const seen = new Map<string, number>();
	const out: string[] = [];
	for (let i = 0; i < width; i++) {
		let name = (first[i] ?? '').trim() || `column ${i + 1}`;
		const k = seen.get(name) ?? 0;
		seen.set(name, k + 1);
		if (k) name = `${name}_${k + 1}`;
		out.push(name);
	}
	return out;
}

export interface ToJsonOptions {
	header: boolean;
	shape: 'objects' | 'arrays';
	/** Turn numbers, true/false and empty cells into JSON numbers, booleans and null. */
	types: boolean;
	/** Read 1.234,56 as 1234.56 (only with types). */
	decimalComma: boolean;
	indent: Indent;
}

const defaultJson: ToJsonOptions = {
	header: true,
	shape: 'objects',
	types: true,
	decimalComma: false,
	indent: 2
};

type JPrim = Extract<JNode, { t: 'p' }>;
const str = (s: string): JPrim => ({ t: 'p', raw: JSON.stringify(s) });

/** A cell as a JSON value. Numbers keep their digits exactly; leading zeros stay text (zip codes, ids). */
export function cellValue(v: string, types: boolean, decimalComma: boolean): JPrim {
	if (!types) return str(v);
	const t = v.trim();
	if (t === '') return { t: 'p', raw: 'null' };
	if (t === 'true' || t === 'false' || t === 'TRUE' || t === 'FALSE')
		return { t: 'p', raw: t.toLowerCase() };
	if (decimalComma) {
		if (NUM_COMMA.test(t)) return { t: 'p', raw: t.replace(/\./g, '').replace(',', '.') };
		return str(v);
	}
	if (NUM.test(t)) return { t: 'p', raw: t };
	return str(v);
}

/**
 * JSON text for the rows, laid out exactly like JSON.stringify with the chosen indent.
 * Written directly as strings, since this runs on inputs of many megabytes.
 */
export function rowsToJson(rows: string[][], opts: Partial<ToJsonOptions> = {}): string {
	const o = { ...defaultJson, ...opts };
	const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
	const body = o.header ? rows.slice(1) : rows;
	const ind = o.indent;
	const min = ind === 'min';
	const unit = ind === 'min' ? '' : ind === 'tab' ? '\t' : ' '.repeat(ind);
	const nl = min ? '' : '\n';
	const colon = min ? ':' : ': ';
	const raw = (v: string) => cellValue(v, o.types, o.decimalComma).raw;
	const items: string[] = [];
	if (o.shape === 'objects') {
		const keys = headerNames(o.header ? (rows[0] ?? []) : [], width).map((k) => JSON.stringify(k));
		const pad2 = unit + unit;
		for (const r of body) {
			if (!keys.length) {
				items.push('{}');
				continue;
			}
			const parts = keys.map((k, i) => pad2 + k + colon + raw(r[i] ?? ''));
			items.push('{' + nl + parts.join(',' + nl) + nl + unit + '}');
		}
	} else {
		const all = o.header ? [rows[0] ?? [], ...body] : body;
		all.forEach((r, ri) => {
			if (!r.length) {
				items.push('[]');
				return;
			}
			const vals = r.map((c) => (o.header && ri === 0 ? JSON.stringify(c) : raw(c)));
			items.push('[' + nl + vals.map((v) => unit + unit + v).join(',' + nl) + nl + unit + ']');
		});
	}
	if (!items.length) return '[]';
	return '[' + nl + items.map((x) => unit + x).join(',' + nl) + nl + ']';
}

export interface WriteOptions {
	delimiter: Delimiter;
	eol: '\n' | '\r\n';
	/** Quote every field, not only those that need it. */
	quoteAll: boolean;
}

const defaultWrite: WriteOptions = { delimiter: ',', eol: '\n', quoteAll: false };

/** Quotes a field when it holds the delimiter, a quote, a line break or edge spaces. */
export function quoteField(v: string, d: string, all = false): string {
	if (
		all ||
		v.includes(d) ||
		v.includes('"') ||
		v.includes('\n') ||
		v.includes('\r') ||
		/^\s|\s$/.test(v)
	)
		return `"${v.replace(/"/g, '""')}"`;
	return v;
}

export function writeCsv(rows: string[][], opts: Partial<WriteOptions> = {}): string {
	const o = { ...defaultWrite, ...opts };
	return rows
		.map((r) => r.map((v) => quoteField(v, o.delimiter, o.quoteAll)).join(o.delimiter))
		.join(o.eol);
}

export interface FlattenOptions {
	/** How arrays inside records become cells: indexed columns (tags.0, tags.1) or JSON text. */
	arrays: 'index' | 'json';
}

export interface JsonToRows {
	rows: string[][];
	/** Shape that was read, for the explanation. */
	shape: 'objects' | 'arrays' | 'values' | 'object';
	nested: boolean;
}

function scalarText(n: JNode): string {
	if (n.t !== 'p') return stringify(n, 'min');
	if (n.raw === 'null') return '';
	if (n.raw.startsWith('"')) return JSON.parse(n.raw) as string;
	return n.raw;
}

function flattenInto(
	n: JNode,
	path: string,
	out: Map<string, string>,
	o: FlattenOptions,
	flags: { nested: boolean }
) {
	if (n.t === 'o' && n.e.length) {
		if (path) flags.nested = true;
		for (const [k, v] of n.e) {
			const key = JSON.parse(k) as string;
			flattenInto(v, path ? `${path}.${key}` : key, out, o, flags);
		}
		return;
	}
	if (n.t === 'a' && n.v.length && o.arrays === 'index') {
		flags.nested = true;
		n.v.forEach((v, i) => flattenInto(v, path ? `${path}.${i}` : String(i), out, o, flags));
		return;
	}
	if (n.t !== 'p') flags.nested = true;
	out.set(path || 'value', scalarText(n));
}

/**
 * Turns JSON into rows. An array of objects gives one row per object with the union of keys as
 * header (first-seen order); nested objects become dot paths (address.city).
 */
export function jsonToRows(text: string, opts: Partial<FlattenOptions> = {}): JsonToRows {
	const o: FlattenOptions = { arrays: 'json', ...opts };
	const { root } = parseJson(text);
	const flags = { nested: false };
	if (root.t === 'a' && root.v.length && root.v.every((v) => v.t === 'a')) {
		const rows = root.v.map((r) => (r.t === 'a' ? r.v.map(scalarText) : []));
		return {
			rows,
			shape: 'arrays',
			nested: root.v.some((r) => r.t === 'a' && r.v.some((x) => x.t !== 'p'))
		};
	}
	let records: JNode[];
	let shape: JsonToRows['shape'];
	if (root.t === 'a') {
		if (!root.v.length) throw new Error('The array is empty, nothing to convert');
		if (root.v.every((v) => v.t !== 'o')) {
			return {
				rows: [['value'], ...root.v.map((v) => [scalarText(v)])],
				shape: 'values',
				nested: false
			};
		}
		records = root.v;
		shape = 'objects';
	} else if (root.t === 'o') {
		records = [root];
		shape = 'object';
	} else throw new Error('Expected a JSON array or object, got a single value');

	const flat: Map<string, string>[] = [];
	const cols = new Map<string, true>();
	for (const r of records) {
		const m = new Map<string, string>();
		if (r.t === 'o') flattenInto(r, '', m, o, flags);
		else m.set('value', scalarText(r));
		for (const k of m.keys()) cols.set(k, true);
		flat.push(m);
	}
	const header = [...cols.keys()];
	const rows = [header, ...flat.map((m) => header.map((h) => m.get(h) ?? ''))];
	return { rows, shape, nested: flags.nested };
}

export function jsonToCsv(text: string, opts: Partial<FlattenOptions & WriteOptions> = {}): string {
	return writeCsv(jsonToRows(text, opts).rows, opts);
}

/** Markdown table. Pipes are escaped, line breaks become <br>, numeric columns align right. */
export function rowsToMarkdown(
	rows: string[][],
	header: boolean,
	align?: ('l' | 'c' | 'r' | '')[]
): string {
	if (!rows.length) return '';
	const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
	const head = header ? rows[0] : Array.from({ length: width }, (_, i) => `Column ${i + 1}`);
	const body = header ? rows.slice(1) : rows;
	const cell = (v: string) =>
		v
			.replace(/\\/g, '\\\\')
			.replace(/\|/g, '\\|')
			.replace(/\r\n|\r|\n/g, '<br>')
			.trim();
	const al =
		align ??
		Array.from({ length: width }, (_, i) => {
			const vals = body.map((r) => (r[i] ?? '').trim()).filter(Boolean);
			return vals.length && vals.every(looksNumeric) ? ('r' as const) : ('' as const);
		});
	const all = [head, ...body].map((r) => Array.from({ length: width }, (_, i) => cell(r[i] ?? '')));
	const w = Array.from({ length: width }, (_, i) =>
		all.reduce((m, r) => Math.max(m, [...r[i]].length), 3)
	);
	const pad = (v: string, i: number) => {
		const gap = w[i] - [...v].length;
		if (al[i] === 'r') return ' '.repeat(gap) + v;
		if (al[i] === 'c') return ' '.repeat(Math.floor(gap / 2)) + v + ' '.repeat(Math.ceil(gap / 2));
		return v + ' '.repeat(gap);
	};
	const line = (r: string[]) => `| ${r.map(pad).join(' | ')} |`;
	const sep = `| ${w
		.map((n, i) => {
			const a = al[i];
			if (a === 'r') return '-'.repeat(n - 1) + ':';
			if (a === 'c') return ':' + '-'.repeat(n - 2) + ':';
			if (a === 'l') return ':' + '-'.repeat(n - 1);
			return '-'.repeat(n);
		})
		.join(' | ')} |`;
	return [line(all[0]), sep, ...all.slice(1).map(line)].join('\n');
}

export { looksNumeric };

/** Compares two cells for sorting: numbers numerically (both notations), otherwise by locale. */
export function compareCells(a: string, b: string, collator: Intl.Collator): number {
	const na = toNumber(a);
	const nb = toNumber(b);
	if (na !== null && nb !== null) return na - nb;
	if (na !== null) return -1;
	if (nb !== null) return 1;
	return collator.compare(a, b);
}

function toNumber(v: string): number | null {
	const t = v.trim();
	if (NUM.test(t)) return Number(t);
	if (NUM_COMMA.test(t)) return Number(t.replace(/\./g, '').replace(',', '.'));
	return null;
}

/** Conservative guess for the intake field: several lines with the same number of , ; or tabs. */
export function looksLikeCsv(s: string): number {
	const t = s.trim();
	if (t.length < 5 || /^[{[<]/.test(t)) return 0;
	const lines = t.slice(0, 4000).split(/\r?\n/).slice(0, 6);
	if (lines.length < 3) return 0;
	for (const d of [',', ';']) {
		const counts = lines.map((l) => l.split(d).length - 1);
		if (counts[0] >= 1 && counts.every((c) => c === counts[0])) return 0.5;
	}
	return 0;
}
