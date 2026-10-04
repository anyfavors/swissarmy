import { describe, expect, it } from 'vitest';
import { formatJson, JsonError, locate, looksLikeJson, parseJson, utf8Length } from './logic';

function errorOf(text: string): { msg: string; line: number; col: number } {
	try {
		parseJson(text);
	} catch (e) {
		if (!(e instanceof JsonError)) throw e;
		const l = locate(text, e.pos);
		return { msg: e.message, line: l.line, col: l.col };
	}
	throw new Error('expected a parse error');
}

describe('json: formatting', () => {
	const src = '{"b":[1,2,{"c":null}],"a":true,"e":{},"f":[]}';

	it('pretty-prints with 2 spaces like JSON.stringify', () => {
		expect(formatJson(src).output).toBe(JSON.stringify(JSON.parse(src), null, 2));
	});

	it('supports 4 spaces, tabs and minify', () => {
		expect(formatJson(src, 4).output).toBe(JSON.stringify(JSON.parse(src), null, 4));
		expect(formatJson(src, 'tab').output).toBe(JSON.stringify(JSON.parse(src), null, '\t'));
		expect(formatJson(JSON.stringify(JSON.parse(src), null, 2), 'min').output).toBe(src);
	});

	it('sorts keys recursively', () => {
		expect(formatJson('{"b":1,"a":{"z":1,"y":2},"\\u0041":0}', 'min', true).output).toBe(
			'{"\\u0041":0,"a":{"y":2,"z":1},"b":1}'
		);
	});

	it('keeps numbers and escapes exactly as written', () => {
		const s = '[12345678901234567890,1.0,1e400,-0,"\\u00e6\\/"]';
		expect(formatJson(s, 'min').output).toBe(s);
	});

	it('handles scalars and whitespace at the top level', () => {
		expect(formatJson('  "x"  ').output).toBe('"x"');
		expect(formatJson('\uFEFF{"a":1}', 'min').output).toBe('{"a":1}');
	});
});

describe('json: stats', () => {
	it('counts depth, keys, objects and arrays', () => {
		const r = formatJson('{"a":[1,{"b":[[]]}],"c":{"d":1,"d":2}}');
		expect(r.stats).toEqual({ depth: 5, keys: 5, objects: 3, arrays: 3, duplicateKeys: 1 });
		expect(formatJson('1').stats.depth).toBe(0);
	});

	it('measures size in UTF-8 bytes', () => {
		expect(utf8Length('æ🍓a')).toBe(2 + 4 + 1);
		const r = formatJson('{ "a" : 1 }', 'min');
		expect(r.sizeIn).toBe(11);
		expect(r.sizeOut).toBe(7);
	});
});

describe('json: errors with line and column', () => {
	it('reports trailing commas', () => {
		expect(errorOf('{\n  "a": 1,\n}')).toEqual({
			msg: 'Trailing comma before }',
			line: 3,
			col: 1
		});
		expect(errorOf('[1,2,]').msg).toBe('Trailing comma before ]');
	});

	it('reports single quotes, bare keys, comments and NaN', () => {
		expect(errorOf("{'a':1}").msg).toMatch(/double quotes, not single/);
		expect(errorOf('{a:1}').msg).toMatch(/Property names need double quotes/);
		expect(errorOf('[1, // x\n2]').msg).toMatch(/Comments/);
		expect(errorOf('[NaN]').msg).toBe('NaN is not valid JSON');
	});

	it('reports number problems', () => {
		expect(errorOf('[01]').msg).toMatch(/Leading zeros/);
		expect(errorOf('[1.]').msg).toMatch(/after the decimal point/);
		expect(errorOf('[+1]').msg).toMatch(/cannot start with \+/);
		expect(errorOf('[1e]').msg).toMatch(/exponent/);
	});

	it('reports string problems', () => {
		expect(errorOf('["a\nb"]')).toMatchObject({
			msg: 'Line break inside a string, use \\n',
			line: 1,
			col: 4
		});
		expect(errorOf('["\\x"]').msg).toBe('Invalid escape \\x');
		expect(errorOf('["\\u12"]').msg).toMatch(/four hex digits/);
		expect(errorOf('{"a": "b').msg).toBe('Unterminated string');
	});

	it('reports structure problems', () => {
		expect(errorOf('{"a":1 "b":2}').msg).toBe('Missing comma between properties');
		expect(errorOf('[1 2]').msg).toBe('Missing comma between array items');
		expect(errorOf('{"a" 1}').msg).toMatch(/expected : after/);
		expect(errorOf('{"a":1}}')).toMatchObject({
			msg: 'Unexpected data after the end of the JSON value',
			col: 8
		});
		expect(errorOf('[1,').msg).toMatch(/Unexpected end of input/);
		expect(errorOf('   ').msg).toBe('Empty input');
	});

	it('reports nesting too deep instead of crashing', () => {
		expect(errorOf('['.repeat(200000)).msg).toMatch(/too deep/);
	});
});

describe('json: locate', () => {
	it('builds an excerpt with a caret', () => {
		const l = locate('{\n  "a": x\n}', 9);
		expect(l).toMatchObject({ line: 2, col: 8 });
		expect(l.excerpt).toBe('  "a": x');
		expect(l.caret).toBe('       ^');
	});

	it('windows long lines', () => {
		const text = 'a'.repeat(200) + 'X' + 'b'.repeat(200);
		const l = locate(text, 200, 40);
		expect(l.excerpt.startsWith('…')).toBe(true);
		expect(l.excerpt.endsWith('…')).toBe(true);
		expect(l.excerpt[l.caret.length - 1]).toBe('X');
	});
});

describe('json: large input', () => {
	it('formats a few MB quickly', () => {
		const big = JSON.stringify(
			Array.from({ length: 40000 }, (_, i) => ({
				id: i,
				name: `item ${i}`,
				tags: ['a', 'b'],
				v: i / 3
			}))
		);
		expect(big.length).toBeGreaterThan(2_000_000);
		const t = performance.now();
		const r = formatJson(big, 2, true);
		expect(performance.now() - t).toBeLessThan(2000);
		expect(JSON.parse(r.output)).toHaveLength(40000);
	});
});

describe('json: detect', () => {
	it('claims objects and arrays that parse', () => {
		expect(looksLikeJson(' {"a":1} ')).toBe(0.9);
		expect(looksLikeJson('[1,2]')).toBe(0.9);
		expect(looksLikeJson('{a:1}')).toBe(0);
		expect(looksLikeJson('"str"')).toBe(0);
		expect(looksLikeJson('42')).toBe(0);
	});
});
