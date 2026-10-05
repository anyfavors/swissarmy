import { describe, expect, it } from 'vitest';
import {
	autoAlign,
	convertTable,
	detectFormat,
	looksLikeTable,
	parseHtmlTable,
	parseMarkdownTable,
	readTable,
	toBox
} from './logic';
import { ops } from './ops';

const excel = 'Name\tQty\tPrice\nApple\t3\t1.50\n"Pear\nWilliams"\t12\t0.75';

describe('table: reading', () => {
	it('detects the source format', () => {
		expect(detectFormat(excel)).toBe('tsv');
		expect(detectFormat('a,b\n1,2')).toBe('csv');
		expect(detectFormat('a;b\n1;2')).toBe('csv');
		expect(detectFormat('| a | b |\n|---|:-:|\n| 1 | 2 |')).toBe('markdown');
		expect(detectFormat('<p>x</p><table><tr><td>1</td></tr></table>')).toBe('html');
	});

	it('reads a spreadsheet paste, including quoted multi-line cells', () => {
		const t = readTable(excel);
		expect(t.rows).toEqual([
			['Name', 'Qty', 'Price'],
			['Apple', '3', '1.50'],
			['Pear\nWilliams', '12', '0.75']
		]);
		expect(t.header).toBe(true);
		expect(t.format).toBe('tsv');
	});

	it('reads a Markdown table with alignment and escaped pipes', () => {
		const t = parseMarkdownTable(
			'Intro text\n\n| Left | Center | Right |\n|:-----|:------:|------:|\n| a \\| b | x<br>y | 1 |\n| c | | 2 |\nAfter'
		);
		expect(t.rows).toEqual([
			['Left', 'Center', 'Right'],
			['a | b', 'x\ny', '1'],
			['c', '', '2']
		]);
		expect(t.align).toEqual(['l', 'c', 'r']);
	});

	it('reads Markdown tables without outer pipes', () => {
		expect(parseMarkdownTable('a | b\n--- | ---\n1 | 2').rows).toEqual([
			['a', 'b'],
			['1', '2']
		]);
	});

	it('reads an HTML table with thead, entities, br and colspan', () => {
		const t = parseHtmlTable(`<table class="x">
  <thead><tr><th>Name</th><th>Note</th><th>N</th></tr></thead>
  <tbody>
    <tr><td><b>Ada</b> &amp; co</td><td>line<br>two</td><td>1</td></tr>
    <tr><td colspan="2">wide &nbsp;cell</td><td>&#50;</td></tr>
    <!-- <tr><td>hidden</td></tr> -->
  </tbody>
</table><table><tr><td>second</td></tr></table>`);
		expect(t.header).toBe(true);
		expect(t.rows).toEqual([
			['Name', 'Note', 'N'],
			['Ada & co', 'line\ntwo', '1'],
			['wide  cell', '', '2']
		]);
	});

	it('treats a first row of th cells as the header', () => {
		expect(parseHtmlTable('<table><tr><th>a</th></tr><tr><td>1</td></tr></table>').header).toBe(
			true
		);
		expect(parseHtmlTable('<table><tr><td>a</td></tr><tr><td>1</td></tr></table>').header).toBe(
			false
		);
	});

	it('reports missing tables', () => {
		expect(() => parseMarkdownTable('| a |\n| b |')).toThrow('No Markdown table found');
		expect(() => parseHtmlTable('<table></table>')).toThrow('The table has no rows');
		expect(() => readTable('')).toThrow('No rows found');
	});
});

describe('table: writing', () => {
	const t = readTable(excel);

	it('writes Markdown with numeric columns right-aligned', () => {
		expect(convertTable(t, 'markdown')).toBe(
			[
				'| Name             | Qty | Price |',
				'| ---------------- | --: | ----: |',
				'| Apple            |   3 |  1.50 |',
				'| Pear<br>Williams |  12 |  0.75 |'
			].join('\n')
		);
	});

	it('keeps Markdown source alignment', () => {
		const md = '| a | b |\n|:-:|:--|\n| 1 | x |';
		expect(convertTable(readTable(md), 'markdown')).toBe(
			'|  a  | b   |\n| :-: | :-- |\n|  1  | x   |'
		);
	});

	it('writes HTML', () => {
		expect(convertTable(readTable('a\tb\n<x>\t2'), 'html')).toBe(
			[
				'<table>',
				'  <thead>',
				'    <tr>',
				'      <th>a</th>',
				'      <th style="text-align: right">b</th>',
				'    </tr>',
				'  </thead>',
				'  <tbody>',
				'    <tr>',
				'      <td>&lt;x&gt;</td>',
				'      <td style="text-align: right">2</td>',
				'    </tr>',
				'  </tbody>',
				'</table>'
			].join('\n')
		);
	});

	it('draws ASCII and Unicode boxes with multi-line cells', () => {
		expect(convertTable(t, 'ascii')).toBe(
			[
				'+----------+-----+-------+',
				'| Name     | Qty | Price |',
				'+==========+=====+=======+',
				'| Apple    |   3 |  1.50 |',
				'| Pear     |  12 |  0.75 |',
				'| Williams |     |       |',
				'+----------+-----+-------+'
			].join('\n')
		);
		expect(
			toBox(
				[
					['a', 'b'],
					['1', '2']
				],
				false,
				['', ''],
				true
			)
		).toBe(['┌───┬───┐', '│ a │ b │', '│ 1 │ 2 │', '└───┴───┘'].join('\n'));
	});

	it('writes CSV, TSV and JSON', () => {
		expect(convertTable(t, 'csv')).toBe('Name,Qty,Price\nApple,3,1.50\n"Pear\nWilliams",12,0.75');
		expect(convertTable(t, 'tsv')).toBe(excel);
		expect(JSON.parse(convertTable(t, 'json'))).toEqual([
			{ Name: 'Apple', Qty: 3, Price: 1.5 },
			{ Name: 'Pear\nWilliams', Qty: 12, Price: 0.75 }
		]);
		expect(JSON.parse(convertTable(t, 'json', { header: false }))[0]).toEqual([
			'Name',
			'Qty',
			'Price'
		]);
	});

	it('pads ragged rows', () => {
		expect(convertTable(readTable('a,b,c\n1'), 'markdown', { header: true })).toBe(
			'|   a | b   | c   |\n| --: | --- | --- |\n|   1 |     |     |'
		);
	});

	it('aligns numeric columns right', () => {
		expect(
			autoAlign(
				[
					['h', 'n'],
					['x', '1,5'],
					['y', '-2']
				],
				true
			)
		).toEqual(['', 'r']);
	});
});

describe('table: detection and ops', () => {
	it('detects tables conservatively', () => {
		expect(looksLikeTable('Name\tQty\nApple\t3\nPear\t12')).toBe(0.5);
		expect(looksLikeTable('| a | b |\n| --- | --- |')).toBe(0.7);
		expect(looksLikeTable('<table><tr><td>1</td></tr></table>')).toBe(0.7);
		expect(looksLikeTable('a,b\n1,2')).toBe(0);
		expect(looksLikeTable('just text')).toBe(0);
	});

	it('has an op per output', async () => {
		expect(ops.map((o) => o.id)).toEqual([
			'table.to-markdown',
			'table.to-html',
			'table.to-ascii',
			'table.to-unicode',
			'table.to-csv',
			'table.to-tsv',
			'table.to-json'
		]);
		expect(await ops[4].run('| a | b |\n|---|---|\n| 1 | 2 |')).toBe('a,b\n1,2');
		expect(() => ops[0].run('  ')).toThrow('No table in the input');
	});
});
