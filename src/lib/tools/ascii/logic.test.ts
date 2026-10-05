import { describe, expect, it } from 'vitest';
import { codepoint, rows, search } from './logic';

describe('table', () => {
	it('has 256 rows with consistent bases', () => {
		expect(rows).toHaveLength(256);
		for (const r of rows) {
			expect(parseInt(r.hex, 16)).toBe(r.code);
			expect(parseInt(r.oct, 8)).toBe(r.code);
			expect(parseInt(r.bin, 2)).toBe(r.code);
		}
	});
	it('names control codes', () => {
		expect(rows[0]).toMatchObject({ abbr: 'NUL', caret: '^@', escape: '\\0', glyph: '␀' });
		expect(rows[3]).toMatchObject({ abbr: 'ETX', caret: '^C', name: 'End of Text' });
		expect(rows[10]).toMatchObject({ abbr: 'LF', escape: '\\n', caret: '^J' });
		expect(rows[27]).toMatchObject({ abbr: 'ESC', caret: '^[', escape: '\\e' });
		expect(rows[31]).toMatchObject({ abbr: 'US', caret: '^_' });
		expect(rows[127]).toMatchObject({ abbr: 'DEL', caret: '^?' });
		expect(rows[0x85]).toMatchObject({ abbr: 'NEL' });
		expect(rows[0x9b]).toMatchObject({ abbr: 'CSI' });
	});
	it('names printable characters', () => {
		expect(rows[65].name).toBe('Latin Capital Letter A');
		expect(rows[97].name).toBe('Latin Small Letter A');
		expect(rows[48].name).toBe('Digit Zero');
		expect(rows[0xc5].name).toBe('Latin Capital Letter A with Ring Above');
		expect(rows[0xe6].name).toBe('Latin Small Letter AE');
		expect(rows[0xf8].name).toBe('Latin Small Letter O with Stroke');
		expect(rows[0xd7].name).toBe('Multiplication Sign');
		expect(rows[0xdf].name).toBe('Latin Small Letter Sharp S');
		expect(rows[0xa0].name).toBe('No-Break Space');
		expect(rows[0xbf].name).toBe('Inverted Question Mark');
	});
	it('gives UTF-8 bytes', () => {
		expect(rows[65].utf8).toBe('41');
		expect(rows[0xe5].utf8).toBe('C3 A5');
		expect(rows[0x80].utf8).toBe('C2 80');
	});
	it('has the Windows-1252 assignments from CP1252.TXT', () => {
		// Node's TextDecoder decodes windows-1252 as Latin-1, so check against the mapping table.
		const assigned = rows.slice(0x80, 0xa0).filter((r) => r.cp1252).length;
		expect(assigned).toBe(27);
		expect([0x81, 0x8d, 0x8f, 0x90, 0x9d].map((c) => rows[c].cp1252)).toEqual([
			null,
			null,
			null,
			null,
			null
		]);
		expect(rows[0x80].cp1252).toMatchObject({ char: '€', cp: 0x20ac, name: 'Euro Sign' });
		expect(rows[0x85].cp1252?.char).toBe('…');
		expect(rows[0x92].cp1252?.char).toBe('’');
		expect(rows[0x96].cp1252?.char).toBe('–');
		expect(rows[0x99].cp1252?.char).toBe('™');
		expect(rows[0x9f].cp1252?.char).toBe('Ÿ');
		expect(rows[0x83].cp1252?.cp).toBe(0x192);
		expect(rows[0x88].cp1252?.cp).toBe(0x2c6);
		expect(rows[0x98].cp1252?.cp).toBe(0x2dc);
	});
});

describe('search', () => {
	it('finds by number in any base', () => {
		expect(search('65').map((r) => r.code)).toEqual([65, 101]); // decimal 65 and hex 0x65
		expect(search('0x41').map((r) => r.code)).toEqual([65]);
		expect(search('U+00E5', 255).map((r) => r.code)).toEqual([0xe5]);
		expect(search('01000001').map((r) => r.code)).toEqual([65]);
	});
	it('finds by character, caret, escape and name', () => {
		expect(search('A').map((r) => r.code)).toEqual([65]);
		expect(search(' ').map((r) => r.code)).toEqual([32]);
		expect(search('^c').map((r) => r.code)).toEqual([3]);
		expect(search('\\n').map((r) => r.code)).toEqual([10]);
		expect(search('esc').map((r) => r.code)).toContain(27);
		expect(search('tilde', 127).map((r) => r.code)).toEqual([126]);
		expect(search('euro', 255).map((r) => r.code)).toEqual([0x80]);
		expect(search('€', 255).map((r) => r.code)).toEqual([0x80]);
	});
	it('limits to ASCII by default range', () => {
		expect(search('', 127)).toHaveLength(128);
		expect(search('diaeresis', 127)).toEqual([]);
	});
});
