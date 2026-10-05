import { describe, expect, it } from 'vitest';
import {
	category,
	charName,
	clean,
	hasUnbalancedBidi,
	inspect,
	normalisationDiff,
	stripInvisible,
	summarise,
	utf16Units,
	utf8Bytes
} from './logic';
import { looksSuspicious } from './detect';
import { ops } from './ops';

describe('unicode: names', () => {
	it('names ASCII, controls and Latin-1', () => {
		expect(charName(0x41)).toBe('LATIN CAPITAL LETTER A');
		expect(charName(0x7a)).toBe('LATIN SMALL LETTER Z');
		expect(charName(0x37)).toBe('DIGIT SEVEN');
		expect(charName(0x2d)).toBe('HYPHEN-MINUS');
		expect(charName(0x0a)).toBe('<control> LINE FEED');
		expect(charName(0x85)).toBe('<control> NEXT LINE');
		expect(charName(0xe5)).toBe('LATIN SMALL LETTER A WITH RING ABOVE');
		expect(charName(0xc6)).toBe('LATIN CAPITAL LETTER AE');
		expect(charName(0xf8)).toBe('LATIN SMALL LETTER O WITH STROKE');
		expect(charName(0xff)).toBe('LATIN SMALL LETTER Y WITH DIAERESIS');
		expect(charName(0x178)).toBe('LATIN CAPITAL LETTER Y WITH DIAERESIS');
		expect(charName(0x151)).toBe('LATIN SMALL LETTER O WITH DOUBLE ACUTE');
	});

	it('names invisible, bidi and space characters', () => {
		expect(charName(0x200b)).toBe('ZERO WIDTH SPACE');
		expect(charName(0x202e)).toBe('RIGHT-TO-LEFT OVERRIDE');
		expect(charName(0x2067)).toBe('RIGHT-TO-LEFT ISOLATE');
		expect(charName(0xfeff)).toBe('ZERO WIDTH NO-BREAK SPACE');
		expect(charName(0xfe0f)).toBe('VARIATION SELECTOR-16');
		expect(charName(0xe0100)).toBe('VARIATION SELECTOR-17');
		expect(charName(0xe0041)).toBe('TAG LATIN CAPITAL LETTER A');
	});

	it('computes names for Greek, Cyrillic, Hangul, CJK and fullwidth', () => {
		expect(charName(0x3bf)).toBe('GREEK SMALL LETTER OMICRON');
		expect(charName(0x39b)).toBe('GREEK CAPITAL LETTER LAMDA');
		expect(charName(0x3a2)).toBeUndefined();
		expect(charName(0x430)).toBe('CYRILLIC SMALL LETTER A');
		expect(charName(0x44f)).toBe('CYRILLIC SMALL LETTER YA');
		expect(charName(0xd55c)).toBe('HANGUL SYLLABLE HAN');
		expect(charName(0xac00)).toBe('HANGUL SYLLABLE GA');
		expect(charName(0xd7a3)).toBe('HANGUL SYLLABLE HIH');
		expect(charName(0x4e2d)).toBe('CJK UNIFIED IDEOGRAPH-4E2D');
		expect(charName(0xff21)).toBe('FULLWIDTH LATIN CAPITAL LETTER A');
		expect(charName(0x1f600)).toBeUndefined();
	});
});

describe('unicode: code points', () => {
	it('gives UTF-8 and UTF-16 (RFC 3629 examples)', () => {
		expect(utf8Bytes('A')).toBe('41');
		expect(utf8Bytes('ø')).toBe('C3 B8');
		expect(utf8Bytes('€')).toBe('E2 82 AC');
		expect(utf8Bytes('한')).toBe('ED 95 9C');
		expect(utf8Bytes('😀')).toBe('F0 9F 98 80');
		expect(utf16Units('😀')).toBe('D83D DE00');
		expect(utf16Units('ø')).toBe('00F8');
	});

	it('reads the general category', () => {
		expect(category('A')).toBe('Lu');
		expect(category('ø')).toBe('Ll');
		expect(category('\u0301')).toBe('Mn');
		expect(category('\u200b')).toBe('Cf');
		expect(category('\u00a0')).toBe('Zs');
		expect(category('€')).toBe('Sc');
		expect(category('\ud800')).toBe('Cs');
		expect(category('\u{e000}')).toBe('Co');
	});

	it('groups code points into grapheme clusters', () => {
		const r = inspect('e\u0301👍🏽x');
		expect(r.map((c) => c.g)).toEqual([0, 0, 1, 1, 2]);
		expect(r.map((c) => c.hex)).toEqual(['U+0065', 'U+0301', 'U+1F44D', 'U+1F3FD', 'U+0078']);
	});

	it('flags bidi, invisible, spaces and look-alikes', () => {
		const r = inspect('a\u202eb\u200bc\u00a0раypal');
		const flags = r.filter((c) => c.flag).map((c) => [c.hex, c.flag, c.looksLike]);
		expect(flags).toEqual([
			['U+202E', 'bidi', undefined],
			['U+200B', 'invisible', undefined],
			['U+00A0', 'space', undefined],
			['U+0440', 'confusable', 'p'],
			['U+0430', 'confusable', 'a']
		]);
	});

	it('treats ZWJ and VS16 inside an emoji as part of it', () => {
		const family = '👨\u200d👩\u200d👧';
		const r = inspect(family);
		expect(r.filter((c) => c.flag === 'invisible').every((c) => c.inEmoji)).toBe(true);
		expect(summarise(family).invisible).toBe(0);
		expect(stripInvisible(family)).toBe(family);
		expect(stripInvisible('❤\ufe0f')).toBe('❤\ufe0f');
		expect(stripInvisible('ab\u200dc')).toBe('abc');
	});
});

describe('unicode: Trojan Source (CVE-2021-42574)', () => {
	// The "commenting out" example from trojansource.codes: an RLO inside a comment.
	const src = '/* begin admins only \u202e\u2066 if (isAdmin) { \u2069 \u2066 */';

	it('counts bidi controls and spots unterminated ones', () => {
		const s = summarise(src);
		expect(s.bidi).toBe(4);
		expect(s.unbalancedBidi).toBe(true);
		expect(hasUnbalancedBidi('a\u2067b\u2069c')).toBe(false);
		expect(hasUnbalancedBidi('a\u202eb\u202cc')).toBe(false);
		expect(hasUnbalancedBidi('a\u202eb\nc\u202c')).toBe(true);
	});

	it('cleans them out', () => {
		expect(clean(src)).toBe('/* begin admins only  if (isAdmin) {   */');
	});

	it('is picked up by detect', () => {
		expect(looksSuspicious(src)).toBeGreaterThan(0.8);
		expect(looksSuspicious('zero\u200bwidth')).toBeGreaterThan(0.5);
		expect(looksSuspicious('plain text, æøå')).toBe(0);
	});
});

describe('unicode: confusables', () => {
	it('finds mixed-script words and replaces look-alikes', () => {
		const t = 'Log in at раypal.com or аррӏе.com';
		const s = summarise(t);
		expect(s.mixedWords).toEqual(['раypal']);
		expect(s.confusables).toBe(7);
		expect(clean(t)).toBe('Log in at paypal.com or apple.com');
	});

	it('leaves look-alikes alone when asked', () => {
		expect(clean('Привет', { invisible: true, confusables: false, spaces: true })).toBe('Привет');
	});

	it('turns odd spaces into plain ones', () => {
		expect(clean('a\u00a0b\u2009c\u3000d')).toBe('a b c d');
		expect(clean('a\u00a0b', { invisible: true, confusables: true, spaces: false })).toBe(
			'a\u00a0b'
		);
	});
});

describe('unicode: normalisation (UAX #15)', () => {
	it('composes and decomposes', () => {
		const d = normalisationDiff('e\u0301 e\u0301 x', 'NFC');
		expect(d.output).toBe('é é x');
		expect(d.changes).toEqual([
			{ from: 'e\u0301', to: 'é', fromHex: 'U+0065 U+0301', toHex: 'U+00E9', count: 2 }
		]);
		expect(normalisationDiff('Å', 'NFD').changes[0].toHex).toBe('U+0041 U+030A');
	});

	it('NFKC folds compatibility characters', () => {
		expect(normalisationDiff('ﬁle ①', 'NFKC').output).toBe('file 1');
		expect(normalisationDiff('Ｈｅｌｌｏ', 'NFKC').output).toBe('Hello');
		expect(normalisationDiff('ﬁ', 'NFC').changes).toEqual([]);
		// Ångström sign is a singleton: even NFC replaces it.
		expect(normalisationDiff('Å', 'NFC').output).toBe('Å');
	});
});

describe('unicode: ops', () => {
	const run = (id: string, s: string) => ops.find((o) => o.id === id)!.run(s);
	it('runs', () => {
		expect(run('unicode.nfc', 'e\u0301')).toBe('é');
		expect(run('unicode.nfkc', 'ﬁ')).toBe('fi');
		expect(run('unicode.strip-invisible', '\ufeffa\u200bb\u202e')).toBe('ab');
	});
});
