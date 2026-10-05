import { charName } from './names';
import { confusables } from './confusables';

export { charName, confusables };

/** General Category, tested with Unicode property escapes so the browser's own data is used. */
export const categories: [string, string][] = [
	['Lu', 'Letter, uppercase'],
	['Ll', 'Letter, lowercase'],
	['Lt', 'Letter, titlecase'],
	['Lm', 'Letter, modifier'],
	['Lo', 'Letter, other'],
	['Mn', 'Mark, nonspacing'],
	['Mc', 'Mark, spacing combining'],
	['Me', 'Mark, enclosing'],
	['Nd', 'Number, decimal digit'],
	['Nl', 'Number, letter'],
	['No', 'Number, other'],
	['Pc', 'Punctuation, connector'],
	['Pd', 'Punctuation, dash'],
	['Ps', 'Punctuation, open'],
	['Pe', 'Punctuation, close'],
	['Pi', 'Punctuation, initial quote'],
	['Pf', 'Punctuation, final quote'],
	['Po', 'Punctuation, other'],
	['Sm', 'Symbol, math'],
	['Sc', 'Symbol, currency'],
	['Sk', 'Symbol, modifier'],
	['So', 'Symbol, other'],
	['Zs', 'Separator, space'],
	['Zl', 'Separator, line'],
	['Zp', 'Separator, paragraph'],
	['Cc', 'Other, control'],
	['Cf', 'Other, format'],
	['Cs', 'Other, surrogate'],
	['Co', 'Other, private use'],
	['Cn', 'Other, unassigned']
];
const catRes = categories.map(([c]) => [c, new RegExp(`^\\p{gc=${c}}$`, 'u')] as const);

export function category(ch: string): string {
	for (const [c, re] of catRes) if (re.test(ch)) return c;
	return 'Cn';
}

/** Bidirectional formatting characters, the Trojan Source set (CVE-2021-42574) plus marks. */
export const BIDI_CONTROLS = new Set([
	0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069
]);
export const BIDI_MARKS = new Set([0x200e, 0x200f, 0x061c]);

/** Characters that render as nothing or as blank, beyond ordinary space, tab and line breaks. */
const INVISIBLE_EXTRA = new Set([
	0x034f, 0x115f, 0x1160, 0x17b4, 0x17b5, 0x180e, 0x2800, 0x3164, 0xffa0, 0x1d159
]);

export type Flag = 'bidi' | 'invisible' | 'space' | 'control' | 'confusable';

export function flagOf(cp: number, ch: string, cat: string): Flag | undefined {
	if (BIDI_CONTROLS.has(cp) || BIDI_MARKS.has(cp)) return 'bidi';
	if (cp === 0x09 || cp === 0x0a || cp === 0x0d || cp === 0x20) return undefined;
	if (cat === 'Cc') return 'control';
	if (cat === 'Zs' || cat === 'Zl' || cat === 'Zp') return 'space';
	if (
		cat === 'Cf' ||
		INVISIBLE_EXTRA.has(cp) ||
		(cp >= 0xfe00 && cp <= 0xfe0f) ||
		(cp >= 0xe0100 && cp <= 0xe01ef) ||
		(cp >= 0x1d173 && cp <= 0x1d17a)
	)
		return 'invisible';
	if (confusables[ch]) return 'confusable';
	return undefined;
}

/** Short label used to make invisible characters visible. */
const SHORT: Record<number, string> = {
	0x00a0: 'NBSP',
	0x00ad: 'SHY',
	0x034f: 'CGJ',
	0x061c: 'ALM',
	0x180e: 'MVS',
	0x200b: 'ZWSP',
	0x200c: 'ZWNJ',
	0x200d: 'ZWJ',
	0x200e: 'LRM',
	0x200f: 'RLM',
	0x2028: 'LSEP',
	0x2029: 'PSEP',
	0x202a: 'LRE',
	0x202b: 'RLE',
	0x202c: 'PDF',
	0x202d: 'LRO',
	0x202e: 'RLO',
	0x202f: 'NNBSP',
	0x2060: 'WJ',
	0x2066: 'LRI',
	0x2067: 'RLI',
	0x2068: 'FSI',
	0x2069: 'PDI',
	0x3000: 'IDSP',
	0xfeff: 'BOM'
};

export function shortLabel(cp: number): string {
	if (SHORT[cp]) return SHORT[cp];
	if (cp >= 0xfe00 && cp <= 0xfe0f) return `VS${cp - 0xfe00 + 1}`;
	if (cp >= 0xe0100 && cp <= 0xe01ef) return `VS${cp - 0xe0100 + 17}`;
	if (cp >= 0xe0020 && cp <= 0xe007e) return `TAG ${String.fromCharCode(cp - 0xe0000)}`;
	return hex(cp);
}

export const hex = (cp: number) => 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');

export function utf8Bytes(ch: string): string {
	return Array.from(new TextEncoder().encode(ch), (b) =>
		b.toString(16).toUpperCase().padStart(2, '0')
	).join(' ');
}

export function utf16Units(ch: string): string {
	const out: string[] = [];
	for (let i = 0; i < ch.length; i++)
		out.push(ch.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0'));
	return out.join(' ');
}

export interface CodePoint {
	/** Index of the code point in the text. */
	i: number;
	/** Index of the grapheme cluster it belongs to. */
	g: number;
	cp: number;
	ch: string;
	hex: string;
	name?: string;
	cat: string;
	utf8: string;
	utf16: string;
	flag?: Flag;
	/** For confusables: the Latin letter it imitates. */
	looksLike?: string;
	/** True when it is part of an emoji sequence (ZWJ, VS16, tags in a flag), where it belongs. */
	inEmoji: boolean;
}

const PICTO = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

export function graphemes(text: string): string[] {
	return Array.from(
		new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(text),
		(s) => s.segment
	);
}

export function inspect(text: string, limit = Infinity): CodePoint[] {
	const out: CodePoint[] = [];
	let i = 0;
	let g = 0;
	for (const cluster of graphemes(text)) {
		const emoji = PICTO.test(cluster);
		for (const ch of cluster) {
			if (out.length >= limit) return out;
			const cp = ch.codePointAt(0)!;
			const cat = category(ch);
			const flag = flagOf(cp, ch, cat);
			out.push({
				i: i++,
				g,
				cp,
				ch,
				hex: hex(cp),
				name: charName(cp),
				cat,
				utf8: cat === 'Cs' ? 'lone surrogate, not encodable' : utf8Bytes(ch),
				utf16: utf16Units(ch),
				flag,
				looksLike: flag === 'confusable' ? confusables[ch] : undefined,
				inEmoji: emoji && (flag === 'invisible' || cp === 0x200d)
			});
		}
		g++;
	}
	return out;
}

export interface Summary {
	codePoints: number;
	graphemes: number;
	utf8Bytes: number;
	utf16Units: number;
	bidi: number;
	invisible: number;
	spaces: number;
	controls: number;
	confusables: number;
	/** Words that mix ASCII letters with look-alikes, the usual sign of a spoof. */
	mixedWords: string[];
	/** Bidi embeddings, overrides or isolates left open at the end of a line. */
	unbalancedBidi: boolean;
}

export function summarise(text: string, cps: CodePoint[] = inspect(text)): Summary {
	const count = (f: Flag) => cps.filter((c) => c.flag === f && !c.inEmoji).length;
	const mixedWords = [
		...new Set(
			(text.match(/[\p{L}\p{M}\p{N}_]+/gu) ?? []).filter(
				(w) => /[A-Za-z]/.test(w) && Array.from(w).some((c) => confusables[c] && /\p{L}/u.test(c))
			)
		)
	];
	return {
		codePoints: cps.length,
		graphemes: graphemes(text).length,
		utf8Bytes: new TextEncoder().encode(text).length,
		utf16Units: text.length,
		bidi: count('bidi'),
		invisible: count('invisible'),
		spaces: count('space'),
		controls: count('control'),
		confusables: count('confusable'),
		mixedWords,
		unbalancedBidi: hasUnbalancedBidi(text)
	};
}

/**
 * True when a line opens an embedding, override or isolate without closing it. That is what
 * lets a Trojan Source comment or string reorder the code after it.
 */
export function hasUnbalancedBidi(text: string): boolean {
	for (const line of text.split(/\r\n|\r|\n|\u2029/)) {
		let emb = 0;
		let iso = 0;
		for (const ch of line) {
			const cp = ch.codePointAt(0)!;
			if (cp >= 0x202a && cp <= 0x202e && cp !== 0x202c) emb++;
			else if (cp === 0x202c) emb = Math.max(0, emb - 1);
			else if (cp >= 0x2066 && cp <= 0x2068) iso++;
			else if (cp === 0x2069) iso = Math.max(0, iso - 1);
		}
		if (emb || iso) return true;
	}
	return false;
}

export interface CleanOptions {
	invisible: boolean;
	confusables: boolean;
	spaces: boolean;
}

/**
 * Removes bidi controls and invisible characters (keeping those inside emoji sequences),
 * optionally swaps look-alikes for the Latin letter and odd spaces for a plain space.
 */
export function clean(
	text: string,
	o: CleanOptions = { invisible: true, confusables: true, spaces: true }
): string {
	let out = '';
	for (const cluster of graphemes(text)) {
		const emoji = PICTO.test(cluster);
		for (const ch of cluster) {
			const cp = ch.codePointAt(0)!;
			const flag = flagOf(cp, ch, category(ch));
			if (flag === 'bidi' && o.invisible) continue;
			if (flag === 'invisible' && o.invisible && !(emoji && cp !== 0xfeff)) continue;
			if (flag === 'control' && o.invisible) continue;
			if (flag === 'space' && o.spaces) {
				out += cp === 0x2028 || cp === 0x2029 ? '\n' : ' ';
				continue;
			}
			if (flag === 'confusable' && o.confusables) {
				out += confusables[ch];
				continue;
			}
			out += ch;
		}
	}
	return out;
}

export const stripInvisible = (s: string) =>
	clean(s, { invisible: true, confusables: false, spaces: false });

export type Form = 'NFC' | 'NFD' | 'NFKC' | 'NFKD';
export const forms: Form[] = ['NFC', 'NFD', 'NFKC', 'NFKD'];

export interface NormChange {
	from: string;
	to: string;
	fromHex: string;
	toHex: string;
	count: number;
}

const cpsHex = (s: string) => Array.from(s, (c) => hex(c.codePointAt(0)!)).join(' ');

/**
 * What a normalisation form changes, grouped per grapheme cluster. Normalisation does not
 * reorder across cluster boundaries, so normalising each cluster on its own gives the same text.
 */
export function normalisationDiff(
	text: string,
	form: Form
): { output: string; changes: NormChange[] } {
	const output = text.normalize(form);
	const m = new Map<string, NormChange>();
	for (const g of graphemes(text)) {
		const n = g.normalize(form);
		if (n === g) continue;
		const r = m.get(g);
		if (r) r.count++;
		else m.set(g, { from: g, to: n, fromHex: cpsHex(g), toHex: cpsHex(n), count: 1 });
	}
	return { output, changes: [...m.values()] };
}
