import { describe, expect, it } from 'vitest';
import {
	decodeCharset,
	decodeWords,
	domainToAscii,
	domainToUnicode,
	encodeWords,
	looksLikeMime,
	punycodeDecode,
	punycodeEncode,
	qpDecode,
	qpEncode
} from './logic';
import { ops } from './ops';

const utf8 = (b: Uint8Array) => new TextDecoder().decode(b);

describe('quoted-printable', () => {
	it('escapes = and non-ASCII, keeps inner spaces', () => {
		expect(qpEncode('a=b café')).toBe('a=3Db caf=C3=A9');
		expect(qpEncode('trailing \nnext\t')).toBe('trailing=20\r\nnext=09');
		expect(qpEncode('line1\nline2', '\n')).toBe('line1\nline2');
	});

	it('wraps at 76 with soft breaks, never inside an escape (same as Python quopri)', () => {
		const text = 'Grüße aus Köln, '.repeat(6) + ' end ';
		const want =
			'Gr=C3=BC=C3=9Fe aus K=C3=B6ln, Gr=C3=BC=C3=9Fe aus K=C3=B6ln, Gr=C3=BC=C3=\r\n' +
			'=9Fe aus K=C3=B6ln, Gr=C3=BC=C3=9Fe aus K=C3=B6ln, Gr=C3=BC=C3=9Fe aus K=C3=\r\n' +
			'=B6ln, Gr=C3=BC=C3=9Fe aus K=C3=B6ln,  end=20';
		const out = qpEncode(text);
		expect(out).toBe(want);
		for (const line of out.split('\r\n')) expect(line.length).toBeLessThanOrEqual(76);
		expect(utf8(qpDecode(out).bytes)).toBe(text);
	});

	it('lets a line of exactly 76 through without a soft break', () => {
		expect(qpEncode('x'.repeat(76))).toBe('x'.repeat(76));
		expect(qpEncode('x'.repeat(77))).toBe('x'.repeat(75) + '=\r\nxx');
	});

	it('decodes soft breaks, lower-case hex and transport whitespace', () => {
		expect(utf8(qpDecode('caf=c3=a9 =\r\nau lait   \r\nnext').bytes)).toBe('café au lait\nnext');
		const r = qpDecode('a=XYb=');
		expect(utf8(r.bytes)).toBe('a=XYb');
		expect(r.invalid).toEqual(['=XY']);
	});
});

describe('charsets', () => {
	const bytes = new Uint8Array([0x47, 0x72, 0xfc, 0x80, 0x9f]);
	it('decodes Latin-1 and Windows-1252 apart', () => {
		expect(decodeCharset(bytes, 'ISO-8859-1')).toBe('Grü\u0080\u009f');
		expect(decodeCharset(bytes, 'windows-1252')).toBe('Grü€Ÿ');
		expect(decodeCharset(new Uint8Array([0xc3, 0xa6]), 'UTF-8')).toBe('æ');
		expect(() => decodeCharset(bytes, 'x-made-up')).toThrow('Charset "x-made-up" is not supported');
	});
});

describe('RFC 2047 encoded-words', () => {
	it('decodes the RFC 2047 section 8 examples', () => {
		expect(decodeWords('=?US-ASCII?Q?Keith_Moore?= <moore@cs.utk.edu>').text).toBe(
			'Keith Moore <moore@cs.utk.edu>'
		);
		expect(decodeWords('=?ISO-8859-1?Q?Keld_J=F8rn_Simonsen?= <keld@dkuug.dk>').text).toBe(
			'Keld Jørn Simonsen <keld@dkuug.dk>'
		);
		expect(decodeWords('=?ISO-8859-1?Q?Andr=E9?= Pirard <PIRARD@vm1.ulg.ac.be>').text).toBe(
			'André Pirard <PIRARD@vm1.ulg.ac.be>'
		);
		expect(
			decodeWords(
				'=?ISO-8859-1?B?SWYgeW91IGNhbiByZWFkIHRoaXMgeW8=?=\r\n =?ISO-8859-2?B?dSB1bmRlcnN0YW5kIHRoZSBleGFtcGxlLg==?='
			).text
		).toBe('If you can read this you understand the example.');
		// Section 8 table: whitespace between encoded-words is dropped, around plain text it is kept.
		expect(decodeWords('(=?ISO-8859-1?Q?a?= b)').text).toBe('(a b)');
		expect(decodeWords('(=?ISO-8859-1?Q?a?= =?ISO-8859-1?Q?b?=)').text).toBe('(ab)');
		expect(decodeWords('(=?ISO-8859-1?Q?a?=\r\n    =?ISO-8859-1?Q?b?=)').text).toBe('(ab)');
		expect(decodeWords('(=?ISO-8859-1?Q?a_b?=)').text).toBe('(a b)');
	});

	it('joins a UTF-8 character split across two words', () => {
		const r = decodeWords('=?UTF-8?B?w6Y=?= =?UTF-8?Q?=C3?= =?UTF-8?Q?=B8?=');
		expect(r.text).toBe('æø');
		expect(r.words).toHaveLength(3);
	});

	it('reads the RFC 2231 language suffix', () => {
		expect(decodeWords('=?UTF-8*da?Q?bl=C3=A5b=C3=A6r?=').text).toBe('blåbær');
	});

	it('encodes B and Q words under 75 characters', () => {
		const text = 'Grüße aus Köln über Straße und Ärger mit Öl und Übermut';
		for (const e of ['B', 'Q'] as const) {
			const out = encodeWords(text, e);
			for (const w of out.split('\r\n ')) {
				expect(w.length).toBeLessThanOrEqual(75);
				expect(w).toMatch(new RegExp(`^=\\?UTF-8\\?${e}\\?`));
			}
			expect(decodeWords(out).text).toBe(text);
		}
		expect(encodeWords('Hi there', 'Q')).toBe('=?UTF-8?Q?Hi_there?=');
		expect(encodeWords('a=b?_', 'Q')).toBe('=?UTF-8?Q?a=3Db=3F=5F?=');
		expect(encodeWords('café', 'B')).toBe('=?UTF-8?B?Y2Fmw6k=?=');
		expect(encodeWords('café', 'Q', 'ISO-8859-1')).toBe('=?ISO-8859-1?Q?caf=E9?=');
		expect(() => encodeWords('€', 'Q', 'ISO-8859-1')).toThrow(/not in ISO-8859-1/);
		expect(encodeWords('')).toBe('');
	});

	it('does not split a character between words', () => {
		const out = encodeWords('😀'.repeat(30), 'B');
		for (const w of out.split('\r\n ')) expect(decodeWords(w).text).toMatch(/^(😀)+$/u);
	});

	it('reports bad Base64', () => {
		expect(() => decodeWords('=?UTF-8?B?w6$=?=')).toThrow(/Bad Base64/);
	});
});

describe('Punycode (RFC 3492 section 7.1)', () => {
	const vectors: [string, string, string][] = [
		['A Arabic (Egyptian)', 'ليهمابتكلموشعربي؟', 'egbpdaj6bu4bxfgehfvwxn'],
		['B Chinese (simplified)', '他们为什么不说中文', 'ihqwcrb4cv8a8dqg056pqjye'],
		['C Chinese (traditional)', '他們爲什麽不說中文', 'ihqwctvzc91f659drss3x8bo0yb'],
		['D Czech', 'Pročprostěnemluvíčesky', 'Proprostnemluvesky-uyb24dma41a'],
		['E Hebrew', 'למההםפשוטלאמדבריםעברית', '4dbcagdahymbxekheh6e0a7fei0b'],
		[
			'F Hindi (Devanagari)',
			'यहलोगहिन\u094dदीक\u094dयो\u0902नही\u0902बोलसकत\u0947ह\u0948\u0902',
			'i1baa7eci9glrd9b2ae1bj0hfcgg6iyaf8o0a1dig0cd'
		],
		[
			'G Japanese',
			'なぜみんな日本語を話してくれないのか',
			'n8jok5ay5dzabd5bym9f0cm5685rrjetr6pdxa'
		],
		[
			'H Korean',
			'세계의모든사람들이한국어를이해한다면얼마나좋을까',
			'989aomsvi5e83db1d2a355cv1e0vak1dwrv93d5xbh15a0dt30a5jpsd879ccm6fea98c'
		],
		['I Russian', 'почемужеонинеговорятпорусски', 'b1abfaaepdrnnbgefbadotcwatmq2g4l'],
		[
			'J Spanish',
			'PorquénopuedensimplementehablarenEspañol',
			'PorqunopuedensimplementehablarenEspaol-fmd56a'
		],
		[
			'K Vietnamese',
			'TạisaohọkhôngthểchỉnóitiếngViệt',
			'TisaohkhngthchnitingVit-kjcr8268qyxafd2f1b9g'
		],
		['L', '3年B組金八先生', '3B-ww4c5e180e575a65lsy2b'],
		['M', '安室奈美恵-with-SUPER-MONKEYS', '-with-SUPER-MONKEYS-pc58ag80a8qai00g7n9n'],
		['N', 'Hello-Another-Way-それぞれの場所', 'Hello-Another-Way--fc4qua05auwb3674vfr0b'],
		['O', 'ひとつ屋根の下2', '2-u9tlzr9756bt3uc0v'],
		['P', 'MajiでKoiする5秒前', 'MajiKoi5-783gue6qz075azm5e'],
		['Q', 'パフィーdeルンバ', 'de-jg4avhby1noc0d'],
		['R', 'そのスピードで', 'd9juau41awczczp'],
		['S', '-> $1.00 <-', '-> $1.00 <--']
	];
	it.each(vectors)('%s', (_, unicode, puny) => {
		expect(punycodeEncode(unicode)).toBe(puny);
		expect(punycodeDecode(puny)).toBe(unicode);
	});

	it('reads upper-case digits and rejects garbage', () => {
		expect(punycodeDecode('EGBPDAJ6BU4BXFGEHFVWXN')).toBe('ليهمابتكلموشعربي؟');
		expect(() => punycodeDecode('egbpdaj6bu4bxfgehfvwx!')).toThrow(/not a Punycode digit/);
		expect(() => punycodeDecode('z')).toThrow(/ends in the middle/);
		expect(() => punycodeDecode('ü-abc')).toThrow(/cannot appear/);
	});
});

describe('IDNA domains', () => {
	it('converts per label', () => {
		expect(domainToAscii('bücher.example')).toBe('xn--bcher-kva.example');
		expect(domainToAscii('Bücher.Example')).toBe('xn--bcher-kva.example');
		expect(domainToAscii('mañana.com')).toBe('xn--maana-pta.com');
		expect(domainToAscii('例え\u3002テスト')).toBe('xn--r8jz45g.xn--zckzah');
		expect(domainToAscii('jørn@blåbær.dk')).toBe('jørn@xn--blbr-roah.dk');
		expect(domainToUnicode('xn--bcher-kva.example')).toBe('bücher.example');
		expect(domainToUnicode('XN--BCHER-KVA.example')).toBe('bücher.example');
		expect(domainToUnicode('jørn@xn--blbr-roah.dk')).toBe('jørn@blåbær.dk');
	});

	it('normalises to NFC before encoding', () => {
		expect(domainToAscii('bu\u0308cher.example')).toBe('xn--bcher-kva.example');
	});

	it('names the bad label', () => {
		expect(() => domainToUnicode('ok.xn--a!b.com')).toThrow(/Label "xn--a!b"/);
		expect(() => domainToAscii('ü'.repeat(60) + '.de')).toThrow(/over 63/);
	});
});

describe('intake and ops', () => {
	it('recognises encoded-words and xn-- domains', () => {
		expect(looksLikeMime('Subject: =?UTF-8?B?w6Y=?=')).toBe(0.85);
		expect(looksLikeMime('=?utf-8?q?hi?=')).toBe(0.85);
		expect(looksLikeMime('xn--bcher-kva.example')).toBe(0.7);
		expect(looksLikeMime('example.com')).toBe(0);
		expect(looksLikeMime('hello')).toBe(0);
	});
	it('runs through the chain', () => {
		const run = (id: string, s: string) => ops.find((o) => o.id === id)!.run(s);
		expect(run('mime.qp-decode', 'caf=C3=A9')).toBe('café');
		expect(run('mime.words-decode', run('mime.words-q', 'blåbær') as string)).toBe('blåbær');
		expect(run('mime.idn-unicode', 'xn--bcher-kva.example')).toBe('bücher.example');
	});
});
