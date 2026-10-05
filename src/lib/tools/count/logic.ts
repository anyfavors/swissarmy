/** Text statistics. Word and sentence boundaries come from Intl.Segmenter (Unicode UAX #29). */

export interface Stats {
	codePoints: number;
	codePointsNoSpace: number;
	graphemes: number;
	words: number;
	sentences: number;
	paragraphs: number;
	lines: number;
	utf8Bytes: number;
	utf16Units: number;
	readingMin: number;
	speakingMin: number;
	longest: string;
	avgWordLength: number;
}

/** Words per minute used for the time estimates. Common rules of thumb, not measurements. */
export const READ_WPM = 230;
export const SPEAK_WPM = 130;

export function words(text: string, locale = 'en'): string[] {
	const seg = new Intl.Segmenter(locale, { granularity: 'word' });
	const out: string[] = [];
	for (const s of seg.segment(text)) if (s.isWordLike) out.push(s.segment);
	return out;
}

export function countGraphemes(text: string, locale = 'en'): number {
	let n = 0;
	for (const _ of new Intl.Segmenter(locale, { granularity: 'grapheme' }).segment(text)) n++;
	return n;
}

export function countSentences(text: string, locale = 'en'): number {
	let n = 0;
	for (const s of new Intl.Segmenter(locale, { granularity: 'sentence' }).segment(text))
		if (/[\p{L}\p{N}]/u.test(s.segment)) n++;
	return n;
}

export function stats(text: string, locale = 'en'): Stats {
	const w = words(text, locale);
	const lens = w.map((x) => Array.from(x).length);
	const longest = w.reduce((a, b) => (Array.from(b).length > Array.from(a).length ? b : a), '');
	return {
		codePoints: Array.from(text).length,
		codePointsNoSpace: Array.from(text.replace(/\s/g, '')).length,
		graphemes: countGraphemes(text, locale),
		words: w.length,
		sentences: countSentences(text, locale),
		paragraphs: text.split(/\r?\n\s*\r?\n/).filter((p) => p.trim()).length,
		lines: text === '' ? 0 : text.split(/\r\n|\r|\n/).length,
		utf8Bytes: new TextEncoder().encode(text).length,
		utf16Units: text.length,
		readingMin: w.length / READ_WPM,
		speakingMin: w.length / SPEAK_WPM,
		longest,
		avgWordLength: lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0
	};
}

/** Formats minutes as "45 s" or "3 min 20 s". */
export function formatMinutes(min: number): string {
	const s = Math.round(min * 60);
	if (s < 60) return `${s} s`;
	const m = Math.floor(s / 60);
	const r = s % 60;
	return r ? `${m} min ${r} s` : `${m} min`;
}

// Small, hand-picked stopword lists: the most common function words, not an exhaustive set.
export const stopwords: Record<'en' | 'da', Set<string>> = {
	en: new Set(
		"a about after all also am an and any are as at be been but by can could did do does for from had has have he her here him his how i if in into is it its it's just me more my no not of on one or our out so some than that the their them then there these they this to up us was we were what when which who will with would you your".split(
			' '
		)
	),
	da: new Set(
		'ad af alle alt andre at blev blive bliver da de dem den denne der deres det dette dig din dine disse du efter eller en end er et for fordi fra få gør ham han hans har havde have hende hendes her hos hun hvad hvis hvor i ikke ind jeg jer jo kan kun kunne man mange med meget men mig min mine mit mod når ned noget nogle nu og også om op os over på sig sin sine sit skal skulle som så til ud under var vi vil ville vores være været'.split(
			' '
		)
	)
};

export function topWords(
	text: string,
	n = 10,
	opts: { locale?: string; stop?: ('en' | 'da')[] } = {}
): { word: string; count: number }[] {
	const stop = (opts.stop ?? []).map((l) => stopwords[l]);
	const m = new Map<string, number>();
	for (const w of words(text, opts.locale)) {
		const k = w.toLocaleLowerCase(opts.locale);
		if (/^\p{N}+$/u.test(k)) continue;
		if (stop.some((s) => s.has(k))) continue;
		m.set(k, (m.get(k) ?? 0) + 1);
	}
	return [...m.entries()]
		.map(([word, count]) => ({ word, count }))
		.sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
		.slice(0, n);
}

/*
 * GSM 7-bit default alphabet and extension table, 3GPP TS 23.038 section 6.2.1.
 * Extension characters are sent as ESC + char and take two septets.
 */
const GSM_BASIC =
	'@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXT = '\f^{}\\[~]|€';
const basic = new Set(GSM_BASIC);
const ext = new Set(GSM_EXT);

export interface Sms {
	encoding: 'GSM-7' | 'UCS-2';
	/** Septets for GSM-7, UTF-16 code units for UCS-2. */
	units: number;
	segments: number;
	perSegment: number;
	/** Units left in the last segment. */
	remaining: number;
	/** Characters that forced UCS-2, at most 10. */
	nonGsm: string[];
}

/**
 * SMS length. A single message holds 160 GSM-7 septets or 70 UCS-2 units. Concatenated
 * messages lose 6 bytes to the user data header, leaving 153 septets or 67 units each.
 * Segments are filled greedily and an ESC pair or a surrogate pair is never split.
 */
export function smsInfo(text: string): Sms {
	const chars = Array.from(text);
	const nonGsm = [...new Set(chars.filter((c) => !basic.has(c) && !ext.has(c)))];
	const gsm = nonGsm.length === 0;
	const cost = (c: string) => (gsm ? (ext.has(c) ? 2 : 1) : c.length);
	const units = chars.reduce((n, c) => n + cost(c), 0);
	const single = gsm ? 160 : 70;
	const multi = gsm ? 153 : 67;
	if (units === 0) {
		return {
			encoding: gsm ? 'GSM-7' : 'UCS-2',
			units,
			segments: 0,
			perSegment: single,
			remaining: single,
			nonGsm
		};
	}
	if (units <= single) {
		return {
			encoding: gsm ? 'GSM-7' : 'UCS-2',
			units,
			segments: 1,
			perSegment: single,
			remaining: single - units,
			nonGsm: nonGsm.slice(0, 10)
		};
	}
	let segments = 1;
	let used = 0;
	for (const c of chars) {
		const k = cost(c);
		if (used + k > multi) {
			segments++;
			used = 0;
		}
		used += k;
	}
	return {
		encoding: gsm ? 'GSM-7' : 'UCS-2',
		units,
		segments,
		perSegment: multi,
		remaining: multi - used,
		nonGsm: nonGsm.slice(0, 10)
	};
}
