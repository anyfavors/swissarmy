import { describe, expect, it } from 'vitest';
import {
	CsvError,
	compareCells,
	detectDelimiter,
	detectHeader,
	headerNames,
	jsonToCsv,
	jsonToRows,
	looksLikeCsv,
	parseCsv,
	quoteField,
	rowsToJson,
	rowsToMarkdown,
	usesDecimalComma,
	writeCsv
} from './logic';
import { ops } from './ops';

describe('csv: RFC 4180 parsing', () => {
	it('parses the RFC 4180 section 2 examples', () => {
		// 2.1 and 2.2: CRLF separated, final line break optional
		expect(parseCsv('aaa,bbb,ccc\r\nzzz,yyy,xxx\r\n').rows).toEqual([
			['aaa', 'bbb', 'ccc'],
			['zzz', 'yyy', 'xxx']
		]);
		expect(parseCsv('aaa,bbb,ccc\r\nzzz,yyy,xxx').rows).toHaveLength(2);
		// 2.5: quoted fields
		expect(parseCsv('"aaa","bbb","ccc"\r\nzzz,yyy,xxx').rows[0]).toEqual(['aaa', 'bbb', 'ccc']);
		// 2.6: line breaks, quotes and commas inside quotes
		expect(parseCsv('"aaa","b\r\nbb","ccc"\r\nzzz,yyy,xxx').rows).toEqual([
			['aaa', 'b\r\nbb', 'ccc'],
			['zzz', 'yyy', 'xxx']
		]);
		// 2.7: doubled quotes
		expect(parseCsv('"aaa","b""bb","ccc"').rows).toEqual([['aaa', 'b"bb', 'ccc']]);
	});

	it('reports the line ending and strips a BOM', () => {
		const p = parseCsv('\uFEFFname,age\nAda,36\n');
		expect(p.bom).toBe(true);
		expect(p.eol).toBe('LF');
		expect(p.rows[0][0]).toBe('name');
		expect(parseCsv('a,b\r\n1,2').eol).toBe('CRLF');
		expect(parseCsv('a,b\r1,2').rows).toEqual([
			['a', 'b'],
			['1', '2']
		]);
	});

	it('keeps empty fields and skips empty lines', () => {
		const p = parseCsv('a,,c\n\n,,\n"",x\n');
		expect(p.rows).toEqual([
			['a', '', 'c'],
			['', '', ''],
			['', 'x']
		]);
		expect(p.blank).toBe(1);
		expect(p.ragged).toBe(1);
	});

	it('keeps a trailing empty field', () => {
		expect(parseCsv('a,b,\n1,2,').rows).toEqual([
			['a', 'b', ''],
			['1', '2', '']
		]);
	});

	it('reads stray quotes in unquoted fields as text', () => {
		const p = parseCsv('size,note\n5" disk,ok');
		expect(p.rows[1]).toEqual(['5" disk', 'ok']);
		expect(p.strayQuotes).toBe(1);
	});

	it('fails on an unterminated quote with its position', () => {
		const text = 'a,b\n1,"open\n2,3';
		expect(() => parseCsv(text)).toThrow(CsvError);
		try {
			parseCsv(text);
		} catch (e) {
			expect((e as CsvError).pos).toBe(6);
			expect((e as CsvError).message).toBe('Unterminated quoted field');
		}
	});

	it('handles empty input', () => {
		expect(parseCsv('').rows).toEqual([]);
		expect(parseCsv('\uFEFF').rows).toEqual([]);
	});

	it('parses a large file quickly', () => {
		const line = '12345,"Doe, Jane",jane@example.com,2024-01-01,"note with ""quotes"""\n';
		const big = 'id,name,email,date,note\n' + line.repeat(150_000);
		const t = performance.now();
		const p = parseCsv(big);
		expect(p.rows).toHaveLength(150_001);
		expect(p.rows[1][4]).toBe('note with "quotes"');
		expect(performance.now() - t).toBeLessThan(3000);
	});
});

describe('csv: detection', () => {
	it('finds the delimiter', () => {
		expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',');
		expect(detectDelimiter('navn;beløb\nKaffe;12,50\nTe;9,00')).toBe(';');
		expect(detectDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t');
		expect(detectDelimiter('a|b\n1|2')).toBe('|');
		// Commas inside quotes do not count
		expect(detectDelimiter('"x, y";z\n"1, 2";3')).toBe(';');
	});

	it('guesses a header row', () => {
		expect(
			detectHeader([
				['name', 'age'],
				['Ada', '36']
			])
		).toBe(true);
		expect(
			detectHeader([
				['1', '2'],
				['3', '4']
			])
		).toBe(false);
		expect(
			detectHeader([
				['Ada', '36'],
				['Bob', '41']
			])
		).toBe(false);
		expect(
			detectHeader([
				['a', 'a'],
				['x', 'y']
			])
		).toBe(false);
		expect(
			detectHeader([
				['', 'b'],
				['x', 'y']
			])
		).toBe(false);
	});

	it('spots Danish decimal commas', () => {
		const p = parseCsv('vare;pris\nKaffe;12,50\nTe;1.234,00');
		expect(usesDecimalComma(p.rows, p.delimiter)).toBe(true);
		expect(usesDecimalComma([['1.5']], ';')).toBe(false);
		expect(usesDecimalComma([['1,5']], ',')).toBe(false);
	});

	it('names blank and repeated header cells', () => {
		expect(headerNames(['id', '', 'id', 'id'], 5)).toEqual([
			'id',
			'column 2',
			'id_2',
			'id_3',
			'column 5'
		]);
	});

	it('detects CSV conservatively', () => {
		expect(looksLikeCsv('a,b,c\n1,2,3\n4,5,6')).toBe(0.5);
		expect(looksLikeCsv('a;b\n1;2\n3;4')).toBe(0.5);
		expect(looksLikeCsv('hello, world')).toBe(0);
		expect(looksLikeCsv('{"a":1}')).toBe(0);
		expect(looksLikeCsv('one line, two\nanother line\nthird, line, here')).toBe(0);
	});
});

describe('csv: to JSON', () => {
	const rows = parseCsv(
		'id,name,zip,active,score\n1,Ada,0800,true,\n12345678901234567890,"Bob ""B""",2100,FALSE,1.50'
	).rows;

	it('makes an array of objects with types', () => {
		expect(rowsToJson(rows, { indent: 'min' })).toBe(
			'[{"id":1,"name":"Ada","zip":"0800","active":true,"score":null},' +
				'{"id":12345678901234567890,"name":"Bob \\"B\\"","zip":2100,"active":false,"score":1.50}]'
		);
	});

	it('keeps everything as strings when asked', () => {
		expect(rowsToJson(rows.slice(0, 2), { indent: 'min', types: false })).toBe(
			'[{"id":"1","name":"Ada","zip":"0800","active":"true","score":""}]'
		);
	});

	it('makes arrays of arrays', () => {
		expect(
			rowsToJson(
				[
					['a', 'b'],
					['1', 'x']
				],
				{ shape: 'arrays', indent: 'min' }
			)
		).toBe('[["a","b"],[1,"x"]]');
		expect(rowsToJson([['1', '2']], { shape: 'arrays', header: false, indent: 'min' })).toBe(
			'[[1,2]]'
		);
	});

	it('reads decimal commas when asked', () => {
		expect(
			rowsToJson(
				[
					['vare', 'pris'],
					['Kaffe', '1.234,50'],
					['Te', '9,5'],
					['x', '1.5']
				],
				{ indent: 'min', decimalComma: true }
			)
		).toBe('[{"vare":"Kaffe","pris":1234.50},{"vare":"Te","pris":9.5},{"vare":"x","pris":"1.5"}]');
	});

	it('names columns without a header and fills short rows', () => {
		expect(rowsToJson([['a', 'b'], ['c']], { header: false, indent: 'min', types: false })).toBe(
			'[{"column 1":"a","column 2":"b"},{"column 1":"c","column 2":""}]'
		);
	});

	it('pretty-prints with 2 spaces by default', () => {
		expect(rowsToJson([['a'], ['1']])).toBe('[\n  {\n    "a": 1\n  }\n]');
	});
});

describe('csv: from JSON', () => {
	it('flattens nested objects with dot paths', () => {
		const json = JSON.stringify([
			{ id: 1, name: 'Ada', address: { city: 'London', zip: 'N1' }, tags: ['a', 'b'] },
			{ id: 2, name: 'Bob, Jr.', address: { city: 'Aarhus' }, extra: null }
		]);
		const r = jsonToRows(json);
		expect(r.shape).toBe('objects');
		expect(r.nested).toBe(true);
		expect(writeCsv(r.rows)).toBe(
			'id,name,address.city,address.zip,tags,extra\n' +
				'1,Ada,London,N1,"[""a"",""b""]",\n' +
				'2,"Bob, Jr.",Aarhus,,,'
		);
	});

	it('can index arrays instead', () => {
		expect(jsonToCsv('[{"tags":["a","b"]},{"tags":["c"]}]', { arrays: 'index' })).toBe(
			'tags.0,tags.1\na,b\nc,'
		);
	});

	it('keeps big numbers exactly', () => {
		expect(jsonToCsv('[{"n":12345678901234567890,"f":1.10}]')).toBe(
			'n,f\n12345678901234567890,1.10'
		);
	});

	it('handles arrays of arrays, values and a single object', () => {
		expect(jsonToCsv('[["a","b"],[1,null]]')).toBe('a,b\n1,');
		expect(jsonToCsv('[1,"two",true]')).toBe('value\n1\ntwo\ntrue');
		expect(jsonToCsv('{"a":1,"b":{"c":2}}')).toBe('a,b.c\n1,2');
	});

	it('writes with other delimiters and CRLF', () => {
		expect(jsonToCsv('[{"a":"x;y","b":2}]', { delimiter: ';', eol: '\r\n' })).toBe(
			'a;b\r\n"x;y";2'
		);
	});

	it('rejects scalars, empty arrays and invalid JSON', () => {
		expect(() => jsonToCsv('42')).toThrow('Expected a JSON array or object');
		expect(() => jsonToCsv('[]')).toThrow('empty');
		expect(() => jsonToCsv('[{"a":1},]')).toThrow('Trailing comma');
	});

	it('quotes only when needed', () => {
		expect(quoteField('plain', ',')).toBe('plain');
		expect(quoteField('a,b', ',')).toBe('"a,b"');
		expect(quoteField('say "hi"', ',')).toBe('"say ""hi"""');
		expect(quoteField('two\nlines', ',')).toBe('"two\nlines"');
		expect(quoteField(' pad', ',')).toBe('" pad"');
		expect(quoteField('a,b', ';')).toBe('a,b');
		expect(quoteField('x', ',', true)).toBe('"x"');
	});

	it('round-trips through parse and write', () => {
		const rows = [
			['a', 'b "q"', 'c,d'],
			['multi\nline', '', ' x ']
		];
		expect(parseCsv(writeCsv(rows)).rows).toEqual(rows);
		expect(parseCsv(writeCsv(rows, { delimiter: '\t' }), '\t').rows).toEqual(rows);
	});
});

describe('csv: Markdown', () => {
	it('makes an aligned table and escapes pipes', () => {
		expect(
			rowsToMarkdown(
				[
					['name', 'amount'],
					['a|b', '10'],
					['line\nbreak', '2.5']
				],
				true
			)
		).toBe(
			[
				'| name          | amount |',
				'| ------------- | -----: |',
				'| a\\|b          |     10 |',
				'| line<br>break |    2.5 |'
			].join('\n')
		);
	});

	it('uses generic column names without a header', () => {
		expect(rowsToMarkdown([['x', 'y']], false)).toBe(
			'| Column 1 | Column 2 |\n| -------- | -------- |\n| x        | y        |'
		);
	});
});

describe('csv: sorting', () => {
	it('sorts numbers numerically and text by locale', () => {
		const c = new Intl.Collator('en', { numeric: true });
		const v = ['10', '9', 'b', 'a', '1,5', '-2'];
		expect([...v].sort((a, b) => compareCells(a, b, c))).toEqual([
			'-2',
			'1,5',
			'9',
			'10',
			'a',
			'b'
		]);
	});
});

describe('csv: chain ops', () => {
	const get = (id: string) => ops.find((o) => o.id === id)!;

	it('has ids prefixed with the tool id', () => {
		for (const o of ops) expect(o.id.startsWith('csv.')).toBe(true);
	});

	it('converts both ways', async () => {
		expect(await get('csv.to-json').run('a;b\n1;x\n')).toBe(
			'[\n  {\n    "a": 1,\n    "b": "x"\n  }\n]'
		);
		expect(await get('csv.from-json').run('[{"a":1}]')).toBe('a\n1');
		expect(await get('csv.to-markdown').run('a,b\nx,1')).toBe(
			'| a   |   b |\n| --- | --: |\n| x   |   1 |'
		);
	});

	it('throws readable errors', () => {
		expect(() => get('csv.to-json').run('')).toThrow('No CSV rows');
		expect(() => get('csv.to-json').run('"open')).toThrow('Unterminated');
	});
});
