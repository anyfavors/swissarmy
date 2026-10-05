import { describe, expect, it } from 'vitest';
import { flavour, flavours } from './logic';
import { ops } from './ops';

const esc = (id: string, s: string) => flavour(id).escape(s);
const un = (id: string, s: string) => flavour(id).unescape(s);

const tricky = [
	'',
	'plain',
	`it's "quoted"`,
	'back\\slash',
	'line1\nline2\r\nline3',
	'tab\there',
	'nul\0byte',
	'nul\x001digit',
	'Rødgrød 😀 ü',
	'$HOME `cmd` ${x}',
	'a,b;c|d',
	'ends with space ',
	'\u2028\u2029',
	'\x07\x1b\x7f'
];

describe('every flavour round trips', () => {
	for (const f of flavours) {
		const skip = (s: string) =>
			(f.id === 'xml' && /[\0\x07\x1b]/.test(s)) || (f.id === 'html' && s.includes('\0'));
		it.each(tricky.filter((s) => !skip(s)))(`${f.id}: %j`, (s) => {
			expect(f.unescape(f.escape(s))).toBe(s);
		});
	}
});

describe('JSON', () => {
	it('escapes as JSON.stringify', () => {
		expect(esc('json', 'a"b\n\0')).toBe('"a\\"b\\n\\u0000"');
	});
	it('unescapes with or without quotes', () => {
		expect(un('json', '"a\\u00e6\\n"')).toBe('a\u00e6\n');
		expect(un('json', 'a\\tb')).toBe('a\tb');
		expect(un('json', ' x ')).toBe(' x ');
		expect(() => un('json', '"a\nb"')).toThrow(/Raw control character U\+000A/);
		expect(() => un('json', '"\\q"')).toThrow(/Not a valid JSON/);
	});
});

describe('JavaScript', () => {
	it('escapes controls, separators and lone surrogates', () => {
		expect(esc('js', 'a\0b')).toBe('"a\\0b"');
		expect(esc('js', '\x001')).toBe('"\\x001"');
		expect(esc('js', '\x01\x7f')).toBe('"\\x01\\x7f"');
		expect(esc('js', '\u2028')).toBe('"\\u2028"');
		expect(esc('js', '\ud800x')).toBe('"\\ud800x"');
		expect(esc('js', '😀')).toBe('"😀"');
	});
	it('unescapes every JS form', () => {
		expect(un('js', `'it\\'s'`)).toBe("it's");
		expect(un('js', '"\\x41\\u0042\\u{1F600}\\103"')).toBe('AB😀C');
		expect(un('js', '"\\ud83d\\ude00"')).toBe('😀');
		expect(un('js', '"a\\\nb"')).toBe('ab');
		expect(un('js', '"\\q"')).toBe('q');
		expect(() => un('js', '"a\\"')).toThrow(/lone backslash/);
		expect(() => un('js', '"\\xZZ"')).toThrow(/\\x needs hex digits/);
		expect(() => un('js', '"\\u{110000}"')).toThrow(/beyond U\+10FFFF/);
	});
});

describe('C / Java', () => {
	it('uses 3-digit octal for controls', () => {
		expect(esc('c', 'a\0' + '1')).toBe('"a\\0001"');
		expect(esc('c', '\x1b[0m')).toBe('"\\033[0m"');
		expect(esc('c', 'æ')).toBe('"æ"');
	});
	it('reads byte escapes as UTF-8', () => {
		expect(un('c', '"\\xc3\\xa6"')).toBe('æ');
		expect(un('c', '"\\303\\246"')).toBe('æ');
		expect(un('c', '"\\u00e6\\U0001F600\\a\\?"')).toBe('æ😀\x07?');
		expect(() => un('c', '"\\xff"')).toThrow(/valid UTF-8/);
		expect(() => un('c', '"\\x123"')).toThrow(/larger than a byte/);
		expect(() => un('c', '"\\q"')).toThrow('\\q is not a C or Java escape');
	});
});

describe('Python', () => {
	it('matches repr()', () => {
		expect(esc('python', "it's")).toBe(`"it's"`);
		expect(esc('python', `it's "x"`)).toBe(`'it\\'s "x"'`);
		expect(esc('python', 'a\0\x7f\u00a0\u200b😀')).toBe("'a\\x00\\x7f\\xa0\\u200b😀'");
		expect(esc('python', 'æ')).toBe("'æ'");
	});
	it('unescapes and keeps unknown escapes', () => {
		expect(un('python', "'\\x41\\u00e6\\U0001F600\\101'")).toBe('Aæ😀A');
		expect(un('python', "'\\d'")).toBe('\\d');
		expect(un('python', '"""a"b"""')).toBe('a"b');
		expect(() => un('python', "'\\N{BULLET}'")).toThrow(/not supported/);
	});
});

describe('SQL', () => {
	it('doubles single quotes', () => {
		expect(esc('sql', "O'Brien")).toBe("'O''Brien'");
		expect(un('sql', "'O''Brien'")).toBe("O'Brien");
		expect(() => un('sql', "'O'Brien'")).toThrow(/not doubled/);
		expect(flavour('sql').warn!('a\0')).toMatch(/NUL/);
		expect(flavour('sql').warn!('a')).toBeUndefined();
	});
});

describe('POSIX shell', () => {
	it('single-quotes everything', () => {
		expect(esc('shell', "it's $HOME")).toBe(`'it'\\''s $HOME'`);
		expect(esc('shell', '')).toBe("''");
	});
	it('reads quoting', () => {
		expect(un('shell', `'it'\\''s'`)).toBe("it's");
		expect(un('shell', `"a \\"b\\" \\$c"`)).toBe('a "b" $c');
		expect(un('shell', 'a\\ b')).toBe('a b');
		expect(() => un('shell', 'a b')).toThrow(/more than one word/);
		expect(() => un('shell', '"$HOME"')).toThrow(/expands/);
		expect(() => un('shell', "'abc")).toThrow(/Unclosed single/);
	});
});

describe('PowerShell', () => {
	it('doubles single quotes, typographic ones too', () => {
		expect(esc('ps', "it's")).toBe("'it''s'");
		expect(esc('ps', 'it\u2019s')).toBe("'it\u2019\u2019s'");
		expect(un('ps', "'it''s'")).toBe("it's");
		expect(() => un('ps', "'it's'")).toThrow(/not doubled/);
	});
	it('uses backticks in double quotes', () => {
		expect(esc('ps-dq', 'a"b $x `c\n\0\x1b')).toBe('"a`"b `$x ``c`n`0`e"');
		expect(esc('ps-dq', '\x01')).toBe('"`u{1}"');
		expect(un('ps-dq', '"a`"b `$x ``c`n`u{1F600}"')).toBe('a"b $x `c\n😀');
		expect(un('ps-dq', '"say ""hi"""')).toBe('say "hi"');
		expect(() => un('ps-dq', '"$x"')).toThrow(/variable/);
	});
});

describe('CSV', () => {
	it('quotes only when needed', () => {
		expect(esc('csv', 'plain')).toBe('plain');
		expect(esc('csv', 'a,b')).toBe('"a,b"');
		expect(esc('csv', 'say "hi"')).toBe('"say ""hi"""');
		expect(esc('csv', 'a\nb')).toBe('"a\nb"');
		expect(un('csv', '"say ""hi"""')).toBe('say "hi"');
		expect(() => un('csv', '"a"b"')).toThrow(/not doubled/);
		expect(() => un('csv', 'a"b')).toThrow(/unquoted field/);
		expect(() => un('csv', '"ab')).toThrow(/Unclosed/);
	});
});

describe('Regex', () => {
	it('escapes metacharacters and slashes', () => {
		expect(esc('regex', 'a.b*c/d[e]')).toBe('/a\\.b\\*c\\/d\\[e\\]/');
		const re = new RegExp(esc('regex', '(1+1)=2? $5 ^_^ {x}|y\\').slice(1, -1));
		expect(re.test('(1+1)=2? $5 ^_^ {x}|y\\')).toBe(true);
		expect(un('regex', '/a\\.b/gi')).toBe('a.b');
		expect(() => un('regex', 'a.b')).toThrow(/Unescaped \. is a regex operator/);
		expect(() => un('regex', 'a\\d')).toThrow(/pattern/);
	});
});

describe('HTML attribute and XML', () => {
	it('escapes the five characters', () => {
		expect(esc('html', `<a href="x">it's & more</a>`)).toBe(
			'"&lt;a href=&quot;x&quot;&gt;it&#39;s &amp; more&lt;/a&gt;"'
		);
		expect(esc('xml', `<'&">\r`)).toBe('&lt;&apos;&amp;&quot;&gt;&#xD;');
		expect(un('html', '"&eacute;&#x41;&nbsp;"')).toBe('éA\u00a0');
		expect(() => un('html', '&bogus;')).toThrow(/Unknown entity/);
	});
	it('drops characters XML cannot carry and says so', () => {
		expect(esc('xml', 'a\0b\x1bc')).toBe('abc');
		expect(flavour('xml').warn!('a\0')).toMatch(/not allowed/);
		expect(flavour('xml').warn!('a\tb\n')).toBeUndefined();
	});
	it('unescapes only predefined entities', () => {
		expect(un('xml', '&lt;&#65;&#x1F600;&amp;')).toBe('<A😀&');
		expect(() => un('xml', '&nbsp;')).toThrow(/predefined/);
		expect(() => un('xml', 'a & b')).toThrow(/not a complete reference/);
		expect(() => un('xml', '&#0;')).toThrow(/not a valid character/);
	});
});

describe('ops', () => {
	it('has an escape and unescape per flavour', () => {
		expect(ops).toHaveLength(flavours.length * 2);
		expect(ops.find((o) => o.id === 'escape.sql')!.run("a'b")).toBe("'a''b'");
		expect(() => flavour('nope')).toThrow(/Unknown escaping/);
	});
});
