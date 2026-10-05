/**
 * Reads a table pasted from a spreadsheet (tab separated, as Excel, Google Sheets and Numbers
 * put on the clipboard), a Markdown pipe table, an HTML <table> or CSV, and writes it out again
 * in another format. Delimited text goes through the CSV parser of the csv tool.
 */
import {
	detectHeader,
	looksNumeric,
	parseCsv,
	quoteField,
	rowsToJson,
	rowsToMarkdown,
	writeCsv,
	type Delimiter
} from '../csv/logic';
import { decodeEntities } from '../html-entities/logic';

export type Align = 'l' | 'c' | 'r' | '';
export type SourceFormat = 'tsv' | 'csv' | 'markdown' | 'html';
export type OutputFormat = 'markdown' | 'html' | 'ascii' | 'unicode' | 'csv' | 'tsv' | 'json';

export interface Table {
	rows: string[][];
	header: boolean;
	/** Column alignment read from a Markdown separator row, if any. */
	align?: Align[];
	format: SourceFormat;
	delimiter?: Delimiter;
}

const MD_SEP = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;

export function detectFormat(text: string): SourceFormat {
	if (/<table[\s>]/i.test(text)) return 'html';
	const lines = text
		.trim()
		.split(/\r?\n/)
		.filter((l) => l.trim());
	if (
		lines.length >= 2 &&
		lines[0].includes('|') &&
		MD_SEP.test(lines[1]) &&
		lines[1].includes('-')
	)
		return 'markdown';
	const p = parseCsv(text.slice(0, 64 * 1024));
	return p.delimiter === '\t' ? 'tsv' : 'csv';
}

/** Splits a Markdown table row on unescaped pipes. */
function splitMdRow(line: string): string[] {
	let t = line.trim();
	if (t.startsWith('|')) t = t.slice(1);
	if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1);
	const cells: string[] = [];
	let cur = '';
	for (let i = 0; i < t.length; i++) {
		const c = t[i];
		if (c === '\\' && t[i + 1] === '|') {
			cur += '|';
			i++;
		} else if (c === '|') {
			cells.push(cur);
			cur = '';
		} else cur += c;
	}
	cells.push(cur);
	return cells.map((c) => c.trim().replace(/<br\s*\/?>/gi, '\n'));
}

export function parseMarkdownTable(text: string): Table {
	const lines = text.split(/\r?\n/).filter((l) => l.trim());
	const sepAt = lines.findIndex((l, i) => i > 0 && MD_SEP.test(l) && l.includes('-'));
	if (sepAt < 1) throw new Error('No Markdown table found: expected a header row and a |---| row');
	const head = splitMdRow(lines[sepAt - 1]);
	const align = splitMdRow(lines[sepAt]).map((c): Align => {
		const l = c.startsWith(':');
		const r = c.endsWith(':');
		return l && r ? 'c' : r ? 'r' : l ? 'l' : '';
	});
	const body: string[][] = [];
	for (const l of lines.slice(sepAt + 1)) {
		if (!l.includes('|')) break;
		body.push(splitMdRow(l));
	}
	return { rows: [head, ...body], header: true, align, format: 'markdown' };
}

/** Reads the first <table>. Tags inside cells are dropped, <br> becomes a line break. */
export function parseHtmlTable(text: string): Table {
	const start = text.search(/<table[\s>]/i);
	if (start < 0) throw new Error('No <table> found');
	const rows: string[][] = [];
	let row: string[] | null = null;
	let cell: string | null = null;
	let span = 1;
	let headerCells = 0;
	let firstRowCells = 0;
	let inThead = false;
	let theadRows = 0;
	const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
	re.lastIndex = start;
	let last = start;
	let depth = 0;
	const closeCell = () => {
		if (row && cell !== null) {
			// \x00 marks a <br> or block end; other white space collapses as in HTML.
			const flat = cell
				.replace(/[ \t\r\n]+/g, ' ')
				.replace(/ ?\x00 ?/g, '\x00')
				.replace(/^\x00+|\x00+$/g, '')
				.replace(/\x00/g, '\n');
			const v = decodeEntities(flat)
				.text.replace(/\u00a0/g, ' ')
				.trim();
			row.push(v);
			for (let k = 1; k < span; k++) row.push('');
		}
		cell = null;
	};
	const closeRow = () => {
		closeCell();
		if (row) {
			if (rows.length === 0) firstRowCells = row.length;
			rows.push(row);
			if (inThead) theadRows++;
		}
		row = null;
	};
	for (let m = re.exec(text); m; m = re.exec(text)) {
		if (cell !== null) cell += text.slice(last, m.index);
		last = re.lastIndex;
		if (!m[2]) continue;
		const closing = m[1] === '/';
		const tag = m[2].toLowerCase();
		if (tag === 'table') {
			if (closing) {
				depth--;
				if (depth === 0) break;
			} else depth++;
			if (depth > 1) throw new Error('Nested tables are not supported');
			continue;
		}
		if (tag === 'thead') inThead = !closing;
		else if (tag === 'tr') {
			closeRow();
			if (!closing) row = [];
		} else if (tag === 'td' || tag === 'th') {
			closeCell();
			if (!closing) {
				if (!row) row = [];
				cell = '';
				const cs = /colspan\s*=\s*["']?(\d+)/i.exec(m[3]);
				span = cs ? Math.min(Number(cs[1]), 100) : 1;
				if (tag === 'th' && rows.length === 0) headerCells++;
			}
		} else if (tag === 'br' && cell !== null) cell += '\x00';
		else if ((tag === 'p' || tag === 'div' || tag === 'li') && closing && cell !== null)
			cell += '\x00';
	}
	closeRow();
	if (!rows.length) throw new Error('The table has no rows');
	const header = theadRows > 0 || (headerCells > 0 && headerCells === firstRowCells);
	return { rows, header, format: 'html' };
}

export function readTable(text: string, format: SourceFormat | 'auto' = 'auto'): Table {
	const f = format === 'auto' ? detectFormat(text) : format;
	if (f === 'markdown') return parseMarkdownTable(text);
	if (f === 'html') return parseHtmlTable(text);
	const p = parseCsv(text, f === 'tsv' ? '\t' : 'auto');
	if (!p.rows.length) throw new Error('No rows found');
	return { rows: p.rows, header: detectHeader(p.rows), format: f, delimiter: p.delimiter };
}

function width(rows: string[][]): number {
	return rows.reduce((m, r) => Math.max(m, r.length), 0);
}

/** Right for numeric columns, otherwise left (written as no alignment in Markdown). */
export function autoAlign(rows: string[][], header: boolean): Align[] {
	const body = header ? rows.slice(1) : rows;
	return Array.from({ length: width(rows) }, (_, i) => {
		const vals = body.map((r) => (r[i] ?? '').trim()).filter(Boolean);
		return vals.length && vals.every(looksNumeric) ? 'r' : '';
	});
}

const esc = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function toHtml(rows: string[][], header: boolean, align: Align[]): string {
	const w = width(rows);
	const cell = (tag: string, v: string, i: number) => {
		const a = align[i];
		const style =
			a === 'r' ? ' style="text-align: right"' : a === 'c' ? ' style="text-align: center"' : '';
		return `<${tag}${style}>${esc(v).replace(/\r?\n/g, '<br>')}</${tag}>`;
	};
	const tr = (r: string[], tag: string, pad: string) =>
		`${pad}<tr>\n${Array.from({ length: w }, (_, i) => `${pad}  ${cell(tag, r[i] ?? '', i)}`).join('\n')}\n${pad}</tr>`;
	const out = ['<table>'];
	const body = header ? rows.slice(1) : rows;
	if (header && rows.length) out.push('  <thead>', tr(rows[0], 'th', '    '), '  </thead>');
	if (body.length) out.push('  <tbody>', ...body.map((r) => tr(r, 'td', '    ')), '  </tbody>');
	out.push('</table>');
	return out.join('\n');
}

/** Display width in code points. East Asian wide characters count as one, so they may misalign. */
const len = (s: string) => [...s].length;

export function toBox(rows: string[][], header: boolean, align: Align[], unicode: boolean): string {
	const w = width(rows);
	if (!w) return '';
	const g = unicode
		? {
				h: '─',
				v: '│',
				tl: '┌',
				tm: '┬',
				tr: '┐',
				ml: '├',
				mm: '┼',
				mr: '┤',
				bl: '└',
				bm: '┴',
				br: '┘',
				H: '═',
				Hl: '╞',
				Hm: '╪',
				Hr: '╡'
			}
		: {
				h: '-',
				v: '|',
				tl: '+',
				tm: '+',
				tr: '+',
				ml: '+',
				mm: '+',
				mr: '+',
				bl: '+',
				bm: '+',
				br: '+',
				H: '=',
				Hl: '+',
				Hm: '+',
				Hr: '+'
			};
	const cells = rows.map((r) =>
		Array.from({ length: w }, (_, i) => (r[i] ?? '').replace(/\t/g, ' ').split(/\r?\n/))
	);
	const cw = Array.from({ length: w }, (_, i) =>
		cells.reduce((m, r) => r[i].reduce((mm, l) => Math.max(mm, len(l)), m), 1)
	);
	const rule = (l: string, m: string, r: string, h: string) =>
		l + cw.map((n) => h.repeat(n + 2)).join(m) + r;
	const pad = (v: string, i: number) => {
		const gap = cw[i] - len(v);
		if (align[i] === 'r') return ' '.repeat(gap) + v;
		if (align[i] === 'c')
			return ' '.repeat(Math.floor(gap / 2)) + v + ' '.repeat(Math.ceil(gap / 2));
		return v + ' '.repeat(gap);
	};
	const lines = (r: string[][]) => {
		const h = Math.max(...r.map((c) => c.length));
		return Array.from(
			{ length: h },
			(_, k) => g.v + r.map((c, i) => ` ${pad(c[k] ?? '', i)} `).join(g.v) + g.v
		);
	};
	const out = [rule(g.tl, g.tm, g.tr, g.h)];
	cells.forEach((r, i) => {
		out.push(...lines(r));
		if (i === 0 && header && cells.length > 1) out.push(rule(g.Hl, g.Hm, g.Hr, g.H));
	});
	out.push(rule(g.bl, g.bm, g.br, g.h));
	return out.join('\n');
}

export interface ConvertOptions {
	header: boolean;
	/** Alignment per column; defaults to the source alignment, else numeric columns right. */
	align?: Align[];
}

export function convertTable(
	t: Table,
	to: OutputFormat,
	opts: Partial<ConvertOptions> = {}
): string {
	const header = opts.header ?? t.header;
	const align = opts.align ?? t.align ?? autoAlign(t.rows, header);
	switch (to) {
		case 'markdown':
			return rowsToMarkdown(t.rows, header, align);
		case 'html':
			return toHtml(t.rows, header, align);
		case 'ascii':
			return toBox(t.rows, header, align, false);
		case 'unicode':
			return toBox(t.rows, header, align, true);
		case 'csv':
			return writeCsv(t.rows);
		case 'tsv':
			// Same quoting as Excel uses on the clipboard: only cells with tabs, quotes or line breaks.
			return t.rows.map((r) => r.map((v) => quoteField(v, '\t')).join('\t')).join('\n');
		case 'json':
			return rowsToJson(t.rows, { header, shape: header ? 'objects' : 'arrays' });
	}
}

/** Conservative: an HTML table, a Markdown table, or several lines with the same number of tabs. */
export function looksLikeTable(s: string): number {
	const t = s.trim();
	if (/^<table[\s>]/i.test(t) && /<\/table>\s*$/i.test(t)) return 0.7;
	const lines = t.slice(0, 4000).split(/\r?\n/).slice(0, 6);
	if (
		lines.length >= 2 &&
		lines[0].includes('|') &&
		MD_SEP.test(lines[1]) &&
		lines[1].includes('-')
	)
		return 0.7;
	if (lines.length >= 2) {
		const counts = lines.map((l) => l.split('\t').length - 1);
		if (counts[0] >= 1 && counts.every((c) => c === counts[0])) return 0.5;
	}
	return 0;
}
