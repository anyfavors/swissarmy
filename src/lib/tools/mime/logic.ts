import { base64ToBytes, bytesToBase64 } from '../base64/logic';
import { cp1252Decode, latin1Decode } from '../mojibake/cp1252';

const enc = new TextEncoder();
const hex2 = (b: number) => b.toString(16).toUpperCase().padStart(2, '0');

// ---------------------------------------------------------------------------
// Charsets

/**
 * Decodes bytes in a MIME charset. UTF-8, ISO-8859-1 and Windows-1252 are done here,
 * so they work everywhere; anything else goes to the browser's TextDecoder.
 * (TextDecoder reads the label "iso-8859-1" as Windows-1252, per the WHATWG Encoding standard.)
 */
export function decodeCharset(bytes: Uint8Array, charset: string): string {
	const c = charset.trim().toLowerCase().replace(/\*.*$/, '');
	if (c === 'utf-8' || c === 'utf8') return new TextDecoder('utf-8').decode(bytes);
	if (['us-ascii', 'ascii', 'iso-8859-1', 'iso8859-1', 'latin1', 'l1'].includes(c))
		return latin1Decode(bytes);
	if (c === 'windows-1252' || c === 'cp1252') return cp1252Decode(bytes);
	try {
		return new TextDecoder(c).decode(bytes);
	} catch {
		throw new Error(`Charset "${charset}" is not supported by this browser`);
	}
}

// ---------------------------------------------------------------------------
// Quoted-printable (RFC 2045 section 6.7)

const QP_MAX = 76;

/**
 * Encodes text as UTF-8 quoted-printable. Line breaks in the text stay hard line breaks;
 * longer lines get soft breaks (a trailing "=") so no line is over 76 characters.
 */
export function qpEncode(text: string, eol = '\r\n'): string {
	const lines = text.split(/\r\n|\r|\n/);
	const out: string[] = [];
	for (const line of lines) {
		const bytes = enc.encode(line);
		const tokens = Array.from(bytes, (b, i) => {
			const last = i === bytes.length - 1;
			if ((b === 0x20 || b === 0x09) && !last) return String.fromCharCode(b);
			if (b >= 33 && b <= 126 && b !== 61) return String.fromCharCode(b);
			return '=' + hex2(b);
		});
		let cur = '';
		tokens.forEach((t, i) => {
			const isLast = i === tokens.length - 1;
			const room = isLast ? QP_MAX : QP_MAX - 1;
			if (cur.length + t.length > room) {
				out.push(cur + '=');
				cur = '';
			}
			cur += t;
		});
		out.push(cur);
	}
	return out.join(eol);
}

export interface QpDecoded {
	bytes: Uint8Array;
	/** "=" sequences that are not a valid escape, kept as written. */
	invalid: string[];
}

export function qpDecode(input: string): QpDecoded {
	const lines = input.split(/\r\n|\r|\n/);
	const bytes: number[] = [];
	const invalid: string[] = [];
	lines.forEach((raw, n) => {
		// Trailing whitespace was added in transport and must be removed (RFC 2045 rule 3).
		let line = raw.replace(/[ \t]+$/, '');
		let soft = false;
		if (line.endsWith('=')) {
			soft = true;
			line = line.slice(0, -1);
		}
		for (let i = 0; i < line.length; i++) {
			const c = line[i];
			if (c === '=') {
				const h = line.slice(i + 1, i + 3);
				if (/^[0-9A-Fa-f]{2}$/.test(h)) {
					bytes.push(parseInt(h, 16));
					i += 2;
					continue;
				}
				invalid.push('=' + h);
			}
			bytes.push(...enc.encode(c));
		}
		if (!soft && n < lines.length - 1) bytes.push(0x0a);
	});
	return { bytes: new Uint8Array(bytes), invalid };
}

// ---------------------------------------------------------------------------
// RFC 2047 encoded-words: =?charset?B|Q?text?=

/** RFC 2047 section 2: an encoded-word is at most 75 characters. */
const WORD_MAX = 75;

/** Q encoding, safe in any header position (RFC 2047 section 5, rule 3). */
function qWord(bytes: Uint8Array): string {
	let s = '';
	for (const b of bytes) {
		if (b === 0x20) s += '_';
		else if (/[A-Za-z0-9!*+\-/]/.test(String.fromCharCode(b))) s += String.fromCharCode(b);
		else s += '=' + hex2(b);
	}
	return s;
}

export type WordEncoding = 'B' | 'Q';
export type WordCharset = 'UTF-8' | 'ISO-8859-1';

/**
 * Encodes a header value as encoded-words, split so none is over 75 characters and
 * no character is cut in half. Words are joined with `fold` (a line break and a space).
 */
export function encodeWords(
	text: string,
	encoding: WordEncoding = 'B',
	charset: WordCharset = 'UTF-8',
	fold = '\r\n '
): string {
	if (!text) return '';
	const prefix = `=?${charset}?${encoding}?`;
	const room = WORD_MAX - prefix.length - 2;
	const toBytes = (ch: string) => {
		if (charset === 'UTF-8') return enc.encode(ch);
		const cp = ch.codePointAt(0)!;
		if (cp > 0xff) throw new Error(`"${ch}" is not in ISO-8859-1, use UTF-8`);
		return new Uint8Array([cp]);
	};
	const size = (bytes: number[]) =>
		encoding === 'B' ? Math.ceil(bytes.length / 3) * 4 : qWord(new Uint8Array(bytes)).length;
	const words: number[][] = [];
	let cur: number[] = [];
	for (const ch of text) {
		const b = Array.from(toBytes(ch));
		if (cur.length && size([...cur, ...b]) > room) {
			words.push(cur);
			cur = [];
		}
		cur.push(...b);
	}
	words.push(cur);
	return words
		.map((w) => {
			const bytes = new Uint8Array(w);
			return prefix + (encoding === 'B' ? bytesToBase64(bytes) : qWord(bytes)) + '?=';
		})
		.join(fold);
}

export interface Word {
	charset: string;
	encoding: WordEncoding;
	text: string;
}

const WORD = /=\?([^?\s]+)\?([BbQq])\?([^?\s]*)\?=/g;

function wordBytes(encoding: string, body: string): Uint8Array {
	if (encoding.toUpperCase() === 'B') {
		try {
			return base64ToBytes(body);
		} catch (e) {
			throw new Error(`Bad Base64 in encoded-word: ${(e as Error).message}`);
		}
	}
	const out: number[] = [];
	for (let i = 0; i < body.length; i++) {
		const c = body[i];
		if (c === '_') out.push(0x20);
		else if (c === '=' && /^[0-9A-Fa-f]{2}$/.test(body.slice(i + 1, i + 3))) {
			out.push(parseInt(body.slice(i + 1, i + 3), 16));
			i += 2;
		} else out.push(c.charCodeAt(0) & 0xff);
	}
	return new Uint8Array(out);
}

/**
 * Decodes every encoded-word in a header value. Whitespace between two encoded-words
 * is dropped (RFC 2047 section 6.2). Adjacent words in the same charset are joined
 * before decoding, because many mailers split a UTF-8 character across two words.
 */
export function decodeWords(raw: string): { text: string; words: Word[] } {
	// Unfold header lines first.
	const input = raw.replace(/\r?\n[ \t]+/g, ' ');
	const words: Word[] = [];
	const parts: { text?: string; charset?: string; bytes?: number[] }[] = [];
	let last = 0;
	let prevWord = false;
	for (const m of input.matchAll(WORD)) {
		const gap = input.slice(last, m.index);
		if (!(prevWord && /^\s*$/.test(gap)) && gap) parts.push({ text: gap });
		const bytes = wordBytes(m[2], m[3]);
		const charset = m[1].replace(/\*.*$/, '');
		const tail = parts[parts.length - 1];
		if (
			prevWord &&
			tail?.bytes &&
			tail.charset?.toLowerCase() === charset.toLowerCase() &&
			/^\s*$/.test(gap)
		)
			tail.bytes.push(...bytes);
		else parts.push({ charset, bytes: Array.from(bytes) });
		words.push({
			charset,
			encoding: m[2].toUpperCase() as WordEncoding,
			text: decodeCharset(bytes, charset)
		});
		last = m.index + m[0].length;
		prevWord = true;
	}
	if (last < input.length) parts.push({ text: input.slice(last) });
	const text = parts
		.map((p) => (p.bytes ? decodeCharset(new Uint8Array(p.bytes), p.charset!) : p.text!))
		.join('');
	return { text, words };
}

// ---------------------------------------------------------------------------
// Punycode (RFC 3492) and IDNA labels

const BASE = 36;
const TMIN = 1;
const TMAX = 26;
const SKEW = 38;
const DAMP = 700;
const INITIAL_BIAS = 72;
const INITIAL_N = 128;

function adapt(delta: number, numPoints: number, first: boolean): number {
	delta = first ? Math.floor(delta / DAMP) : delta >> 1;
	delta += Math.floor(delta / numPoints);
	let k = 0;
	while (delta > ((BASE - TMIN) * TMAX) >> 1) {
		delta = Math.floor(delta / (BASE - TMIN));
		k += BASE;
	}
	return k + Math.floor(((BASE - TMIN + 1) * delta) / (delta + SKEW));
}

const digit = (d: number) => String.fromCharCode(d < 26 ? 97 + d : 22 + d);

function digitValue(c: number): number {
	if (c >= 48 && c <= 57) return c - 22;
	if (c >= 65 && c <= 90) return c - 65;
	if (c >= 97 && c <= 122) return c - 97;
	return BASE;
}

const MAXINT = 0x7fffffff;

/** RFC 3492 section 6.3. Basic code points keep their case. */
export function punycodeEncode(input: string): string {
	const cps = Array.from(input, (c) => c.codePointAt(0)!);
	let out = cps
		.filter((c) => c < 0x80)
		.map((c) => String.fromCharCode(c))
		.join('');
	const b = out.length;
	let h = b;
	if (b > 0) out += '-';
	let n = INITIAL_N;
	let delta = 0;
	let bias = INITIAL_BIAS;
	while (h < cps.length) {
		const m = Math.min(...cps.filter((c) => c >= n));
		if (m - n > Math.floor((MAXINT - delta) / (h + 1))) throw new Error('Punycode overflow');
		delta += (m - n) * (h + 1);
		n = m;
		for (const c of cps) {
			if (c < n && ++delta > MAXINT) throw new Error('Punycode overflow');
			if (c === n) {
				let q = delta;
				for (let k = BASE; ; k += BASE) {
					const t = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias;
					if (q < t) break;
					out += digit(t + ((q - t) % (BASE - t)));
					q = Math.floor((q - t) / (BASE - t));
				}
				out += digit(q);
				bias = adapt(delta, h + 1, h === b);
				delta = 0;
				h++;
			}
		}
		delta++;
		n++;
	}
	return out;
}

/** RFC 3492 section 6.2. */
export function punycodeDecode(input: string): string {
	const cut = input.lastIndexOf('-');
	const basic = cut > 0 ? input.slice(0, cut) : '';
	const out = Array.from(basic, (c) => {
		const cp = c.charCodeAt(0);
		if (cp >= 0x80) throw new Error(`"${c}" cannot appear in Punycode`);
		return cp;
	});
	let n = INITIAL_N;
	let bias = INITIAL_BIAS;
	let i = 0;
	for (let pos = cut > 0 ? cut + 1 : 0; pos < input.length;) {
		const oldi = i;
		let w = 1;
		for (let k = BASE; ; k += BASE) {
			if (pos >= input.length) throw new Error('Punycode ends in the middle of a number');
			const d = digitValue(input.charCodeAt(pos++));
			if (d >= BASE) throw new Error(`"${input[pos - 1]}" is not a Punycode digit`);
			if (d > Math.floor((MAXINT - i) / w)) throw new Error('Punycode overflow');
			i += d * w;
			const t = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias;
			if (d < t) break;
			if (w > Math.floor(MAXINT / (BASE - t))) throw new Error('Punycode overflow');
			w *= BASE - t;
		}
		bias = adapt(i - oldi, out.length + 1, oldi === 0);
		if (Math.floor(i / (out.length + 1)) > MAXINT - n) throw new Error('Punycode overflow');
		n += Math.floor(i / (out.length + 1));
		i %= out.length + 1;
		if (n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff))
			throw new Error('Punycode decodes to an invalid code point');
		out.splice(i, 0, n);
		i++;
	}
	return String.fromCodePoint(...out);
}

// Label separators that IDNA treats as a full stop (RFC 3490 section 3.1).
const DOTS = /[.\u3002\uff0e\uff61]/;

function splitDomain(input: string): { local: string; labels: string[] } {
	const s = input.trim();
	const at = s.lastIndexOf('@');
	return {
		local: at >= 0 ? s.slice(0, at + 1) : '',
		labels: (at >= 0 ? s.slice(at + 1) : s).split(DOTS)
	};
}

/**
 * Unicode domain to its ASCII form, one label at a time. Applies NFC and lower case
 * first; it does not run the full IDNA2008 / UTS 46 validity checks.
 * An email address keeps its local part as written.
 */
export function domainToAscii(input: string): string {
	const { local, labels } = splitDomain(input);
	return (
		local +
		labels
			.map((l) => {
				const norm = l.normalize('NFC').toLowerCase();
				if (!/[^\x00-\x7f]/.test(norm)) return norm;
				const out = 'xn--' + punycodeEncode(norm);
				if (out.length > 63) throw new Error(`Label "${l}" is over 63 characters once encoded`);
				return out;
			})
			.join('.')
	);
}

export function domainToUnicode(input: string): string {
	const { local, labels } = splitDomain(input);
	return (
		local +
		labels
			.map((l) => {
				if (!/^xn--/i.test(l)) return l;
				try {
					return punycodeDecode(l.slice(4).toLowerCase());
				} catch (e) {
					throw new Error(`Label "${l}": ${(e as Error).message}`);
				}
			})
			.join('.')
	);
}

/** A header value with encoded-words in it. */
export function looksLikeMime(s: string): number {
	const t = s.trim();
	if (/^(?:[^\n]*\s)?=\?[^?\s]+\?[BbQq]\?[^?\s]*\?=/.test(t) && t.length < 2000) return 0.85;
	if (/^(?:[a-z0-9-]+\.)*xn--[a-z0-9-]+(?:\.[a-z0-9-]+)*\.?$/i.test(t)) return 0.7;
	return 0;
}
