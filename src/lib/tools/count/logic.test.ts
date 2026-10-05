import { describe, expect, it } from 'vitest';
import { countGraphemes, formatMinutes, smsInfo, stats, topWords, words } from './logic';

describe('count: stats', () => {
	it('counts the basics', () => {
		const t = 'Hello world. This is a test!\nSecond line here.\n\nNew paragraph?';
		const s = stats(t);
		expect(s.words).toBe(11);
		expect(s.sentences).toBe(4);
		expect(s.paragraphs).toBe(2);
		expect(s.lines).toBe(4);
		expect(s.codePoints).toBe(t.length);
		expect(s.codePointsNoSpace).toBe(t.replace(/\s/g, '').length);
		expect(s.longest).toBe('paragraph');
	});

	it('distinguishes code points, graphemes, UTF-16 units and UTF-8 bytes', () => {
		const t = 'Rød 👍🏽 e\u0301';
		const s = stats(t);
		expect(s.codePoints).toBe(9);
		expect(s.graphemes).toBe(7);
		expect(s.utf16Units).toBe(11);
		expect(s.utf8Bytes).toBe(2 + 1 + 1 + 1 + 4 + 4 + 1 + 1 + 2);
		expect(countGraphemes('👨\u200d👩\u200d👧')).toBe(1);
	});

	it('counts contractions and Danish words as one word', () => {
		expect(words("don't stop")).toEqual(["don't", 'stop']);
		expect(words('Rødgrød med fløde, på båden.', 'da')).toEqual([
			'Rødgrød',
			'med',
			'fløde',
			'på',
			'båden'
		]);
	});

	it('handles empty text', () => {
		const s = stats('');
		expect(s.words).toBe(0);
		expect(s.lines).toBe(0);
		expect(s.avgWordLength).toBe(0);
		expect(s.paragraphs).toBe(0);
	});

	it('estimates time at 230 and 130 words per minute', () => {
		const t = Array(460).fill('word').join(' ');
		expect(stats(t).readingMin).toBe(2);
		expect(formatMinutes(stats(t).speakingMin)).toBe('3 min 32 s');
		expect(formatMinutes(0.5)).toBe('30 s');
		expect(formatMinutes(2)).toBe('2 min');
	});
});

describe('count: top words', () => {
	it('counts case-insensitively and applies stopwords', () => {
		const t = 'The cat and the dog. The CAT sat.';
		expect(topWords(t, 2)).toEqual([
			{ word: 'the', count: 3 },
			{ word: 'cat', count: 2 }
		]);
		expect(topWords(t, 2, { stop: ['en'] })[0]).toEqual({ word: 'cat', count: 2 });
		expect(topWords('og hunden og katten og hunden', 1, { stop: ['da'] })).toEqual([
			{ word: 'hunden', count: 2 }
		]);
	});
});

describe('count: SMS (3GPP TS 23.038)', () => {
	it('fits 160 GSM-7 characters in one SMS, 161 needs two of 153', () => {
		expect(smsInfo('a'.repeat(160))).toMatchObject({
			encoding: 'GSM-7',
			segments: 1,
			remaining: 0
		});
		expect(smsInfo('a'.repeat(161))).toMatchObject({ segments: 2, perSegment: 153 });
		expect(smsInfo('a'.repeat(306)).segments).toBe(2);
		expect(smsInfo('a'.repeat(307)).segments).toBe(3);
	});

	it('Danish letters are in the GSM alphabet, extension characters cost two', () => {
		expect(smsInfo('Æble, øl og ål').encoding).toBe('GSM-7');
		expect(smsInfo('€').units).toBe(2);
		expect(smsInfo('{}[]~|^\\€').units).toBe(18);
		expect(smsInfo('€'.repeat(80)).segments).toBe(1);
		expect(smsInfo('€'.repeat(81)).segments).toBe(2);
	});

	it('does not split an escape pair across segments', () => {
		// 152 septets, then € (2) must move to segment two.
		const s = smsInfo('a'.repeat(152) + '€' + 'a'.repeat(10));
		expect(s.units).toBe(164);
		expect(s.segments).toBe(2);
		expect(s.remaining).toBe(153 - 12);
	});

	it('switches to UCS-2 for other characters: 70 and 67, emoji take 2 units', () => {
		expect(smsInfo('ç').encoding).toBe('UCS-2');
		expect(smsInfo('Ç').encoding).toBe('GSM-7');
		expect(smsInfo('ä'.repeat(69) + 'ś')).toMatchObject({
			encoding: 'UCS-2',
			segments: 1,
			remaining: 0
		});
		expect(smsInfo('ś'.repeat(71))).toMatchObject({ segments: 2, perSegment: 67 });
		expect(smsInfo('👍').units).toBe(2);
		expect(smsInfo('a'.repeat(68) + '👍').segments).toBe(1);
		// The surrogate pair does not fit in the 67 units left after 66, so it moves on.
		expect(smsInfo('a'.repeat(66) + '👍' + 'a'.repeat(5))).toMatchObject({
			segments: 2,
			remaining: 60
		});
		expect(smsInfo('Hej ś').nonGsm).toEqual(['ś']);
	});

	it('empty text needs no segments', () => {
		expect(smsInfo('').segments).toBe(0);
	});
});
