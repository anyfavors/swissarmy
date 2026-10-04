import { describe, expect, it } from 'vitest';
import { decodeEntities, encodeEntities, namedEntities } from './logic';

const d = (s: string) => decodeEntities(s).text;

describe('html-entities: table', () => {
	it('has the HTML 4 set plus apos', () => {
		expect(namedEntities.size).toBe(253);
	});

	it('maps anchors of each block correctly', () => {
		const spot: [string, number][] = [
			['nbsp', 0xa0],
			['iquest', 0xbf],
			['Agrave', 0xc0],
			['times', 0xd7],
			['szlig', 0xdf],
			['divide', 0xf7],
			['yuml', 0xff],
			['Alpha', 0x391],
			['Rho', 0x3a1],
			['Sigma', 0x3a3],
			['Omega', 0x3a9],
			['alpha', 0x3b1],
			['sigmaf', 0x3c2],
			['omega', 0x3c9],
			['euro', 0x20ac],
			['diams', 0x2666],
			['apos', 0x27]
		];
		for (const [n, cp] of spot) expect(namedEntities.get(n), n).toBe(cp);
	});
});

describe('html-entities: encode', () => {
	it('escapes the minimal set', () => {
		expect(encodeEntities(`<a href="x?a=1&b='2'">`)).toBe(
			'&lt;a href=&quot;x?a=1&amp;b=&#39;2&#39;&quot;&gt;'
		);
		expect(encodeEntities('Rødgrød')).toBe('Rødgrød');
	});

	it('optionally encodes non-ASCII as hex references, one per code point', () => {
		expect(encodeEntities('Rødgrød 🍓 <', true)).toBe('R&#xF8;dgr&#xF8;d &#x1F353; &lt;');
	});
});

describe('html-entities: decode', () => {
	it('decodes named references', () => {
		expect(d('&lt;p&gt;caf&eacute; &amp; cr&egrave;me&lt;/p&gt;')).toBe('<p>café & crème</p>');
		expect(d('&apos;&quot;&nbsp;&euro;&hellip;&Omega;&rang;')).toBe('\'" €…Ω⟩');
	});

	it('decodes decimal and hex references', () => {
		expect(d('&#65;&#x42;&#X43;&#128512;&#x1F353;')).toBe('ABC😀🍓');
		expect(d('&#65 &#x42')).toBe('A B');
	});

	it('maps C1 numeric references through Windows-1252', () => {
		expect(d('&#150;&#151;&#128;&#153;')).toBe('–—€™');
	});

	it('replaces invalid code points with U+FFFD', () => {
		expect(d('&#0;&#xD800;&#x110000;')).toBe('���');
	});

	it('leaves unknown names and bare ampersands alone', () => {
		const r = decodeEntities('A &bogus; B & C &amp D');
		expect(r.text).toBe('A &bogus; B & C &amp D');
		expect(r.unknown).toEqual(['&bogus;']);
		expect(r.count).toBe(0);
	});

	it('is case sensitive like HTML', () => {
		expect(d('&Eacute;&eacute;&AMP;')).toBe('Éé&AMP;');
	});

	it('round-trips', () => {
		const s = `<script>alert("x & y's")</script> æøå 🍓`;
		expect(d(encodeEntities(s))).toBe(s);
		expect(d(encodeEntities(s, true))).toBe(s);
	});

	it('does not double-decode', () => {
		expect(d('&amp;lt;')).toBe('&lt;');
	});
});
