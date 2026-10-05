import { describe, expect, it } from 'vitest';
import { cp1252Byte, cp1252Decode } from './cp1252';
import {
	breakText,
	candidates,
	diagnose,
	fix,
	looksLikeMojibake,
	plausibility,
	repairOnce
} from './logic';
import { ops } from './ops';

describe('Windows-1252 table', () => {
	it('maps the 0x80 to 0x9F block (CP1252.TXT)', () => {
		const bytes = new Uint8Array(32).map((_, i) => 0x80 + i);
		const s = cp1252Decode(bytes);
		expect(s.codePointAt(0)).toBe(0x20ac);
		expect(s.codePointAt(0x92 - 0x80)).toBe(0x2019);
		expect(s.codePointAt(0x9f - 0x80)).toBe(0x0178);
		expect(s.codePointAt(0x81 - 0x80)).toBe(0x81);
		// Round trip for every byte.
		for (let b = 0; b < 256; b++)
			expect(cp1252Byte(cp1252Decode(new Uint8Array([b])).codePointAt(0)!)).toBe(b);
		expect(cp1252Byte(0x2192)).toBe(-1);
	});

	it('matches Python codecs cp1252 for the whole block', () => {
		// Node's TextDecoder reads windows-1252 as Latin-1, so the reference is Python's table.
		const python = [
			0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160,
			0x2039, 0x0152, 0x008d, 0x017d, 0x008f, 0x0090, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022,
			0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x009d, 0x017e, 0x0178
		];
		const bytes = new Uint8Array(32).map((_, i) => 0x80 + i);
		expect(Array.from(cp1252Decode(bytes), (c) => c.codePointAt(0))).toEqual(python);
	});
});

describe('repair', () => {
	it('fixes the classic cases', () => {
		expect(fix('Ã¦Ã¸Ã¥')).toBe('æøå');
		expect(fix('Itâ€™s')).toBe('It’s');
		expect(fix('â€œquotedâ€\u009d')).toBe('“quoted”');
		expect(fix('cafÃ©')).toBe('café');
		expect(fix('RÃ¸dgrÃ¸d med flÃ¸de')).toBe('Rødgrød med fløde');
		expect(fix('ðŸ˜€')).toBe('😀');
	});

	it('undoes double and triple encoding', () => {
		const twice = breakText(breakText('blåbær'));
		expect(twice).toBe('blÃƒÂ¥bÃƒÂ¦r');
		expect(fix(twice)).toBe('blåbær');
		expect(fix(breakText(breakText(breakText('Ærø'))))).toBe('Ærø');
	});

	it('leaves clean text and partly clean text alone', () => {
		expect(fix('plain ASCII')).toBe('plain ASCII');
		expect(fix('æøå')).toBe('æøå');
		expect(fix('→ cafÃ© ✓')).toBe('→ café ✓');
	});

	it('uses Latin-1 when the C1 bytes were kept as controls', () => {
		const broken = breakText('It’s', 'latin-1');
		expect(broken).toBe('Itâ\u0080\u0099s');
		expect(repairOnce(broken, 'latin-1')).toBe('It’s');
		expect(fix(broken)).toBe('It’s');
	});
});

describe('scoring and candidates', () => {
	it('scores clean text above mojibake', () => {
		expect(plausibility('hello')).toBe(1);
		expect(plausibility('æøå')).toBe(1);
		expect(plausibility('Ã¦Ã¸Ã¥')).toBe(0);
		expect(plausibility('a\ufffdb')).toBe(0);
	});

	it('lists the input and each distinct repair, best first', () => {
		const c = candidates('blÃƒÂ¥bÃƒÂ¦r');
		expect(c[0].text).toBe('blåbær');
		expect(c[0].passes).toBe(2);
		expect(c.some((x) => x.via === 'As pasted')).toBe(true);
		expect(new Set(c.map((x) => x.text)).size).toBe(c.length);
	});

	it('counts replacement characters as lost', () => {
		const d = diagnose('Bl\ufffdb\ufffdr');
		expect(d.lost).toBe(2);
		expect(d.best.text).toBe('Bl\ufffdb\ufffdr');
	});
});

describe('intake and ops', () => {
	it('claims clear mojibake only', () => {
		expect(looksLikeMojibake('RÃ¸dgrÃ¸d med flÃ¸de')).toBe(0.75);
		expect(looksLikeMojibake('Itâ€™s')).toBe(0.5);
		expect(looksLikeMojibake('Rødgrød')).toBe(0);
		expect(looksLikeMojibake('hello')).toBe(0);
	});
	it('runs through the chain', () => {
		const run = (id: string, s: string) => ops.find((o) => o.id === id)!.run(s);
		expect(run('mojibake.fix', run('mojibake.break', 'Ærø') as string)).toBe('Ærø');
	});
});
