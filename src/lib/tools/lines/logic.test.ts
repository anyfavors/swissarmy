import { describe, expect, it } from 'vitest';
import {
	applyStep,
	countLines,
	numberLines,
	parseSteps,
	runPipeline,
	shuffle,
	sortLines,
	splitLines,
	uniqueLines,
	unescapeSep,
	wrapLine,
	randomInt
} from './logic';
import { ops } from './ops';

describe('lines: sort', () => {
	it('sorts alphabetically, ignoring case by default', () => {
		expect(sortLines(['b', 'A', 'a', 'C'], 'alpha')).toEqual(['A', 'a', 'b', 'C']);
	});

	it('puts æ ø å after z in Danish, and treats aa as å', () => {
		expect(sortLines(['å', 'z', 'ø', 'æ', 'a'], 'alpha', 'da')).toEqual(['a', 'z', 'æ', 'ø', 'å']);
		expect(sortLines(['Aarhus', 'Odense', 'Ålborg', 'Berlin'], 'alpha', 'da')).toEqual([
			'Berlin',
			'Odense',
			'Ålborg',
			'Aarhus'
		]);
		expect(sortLines(['å', 'z', 'a'], 'alpha', 'en')).toEqual(['a', 'å', 'z']);
	});

	it('natural sort orders numbers by value', () => {
		expect(sortLines(['file10', 'file2', 'file1'], 'alpha')).toEqual(['file1', 'file10', 'file2']);
		expect(sortLines(['file10', 'file2', 'file1'], 'natural')).toEqual([
			'file1',
			'file2',
			'file10'
		]);
	});

	it('sorts by length, then alphabetically, and reverses', () => {
		expect(sortLines(['ccc', 'a', 'bb', 'aa'], 'length')).toEqual(['a', 'aa', 'bb', 'ccc']);
		expect(sortLines(['a', 'c', 'b'], 'alpha', 'en', true)).toEqual(['c', 'b', 'a']);
	});
});

describe('lines: unique and count', () => {
	it('keeps the first or last occurrence', () => {
		expect(uniqueLines(['a', 'b', 'a', 'c'])).toEqual(['a', 'b', 'c']);
		expect(uniqueLines(['a', 'b', 'a', 'c'], false, 'last')).toEqual(['b', 'a', 'c']);
	});

	it('can ignore case', () => {
		expect(uniqueLines(['Apple', 'apple', 'APPLE'])).toHaveLength(3);
		expect(uniqueLines(['Apple', 'apple', 'APPLE'], true)).toEqual(['Apple']);
		expect(uniqueLines(['Apple', 'apple', 'APPLE'], true, 'last')).toEqual(['APPLE']);
	});

	it('counts duplicates, most frequent first', () => {
		expect(countLines(['b', 'a', 'b', 'c', 'b', 'a'])).toEqual([
			{ line: 'b', count: 3 },
			{ line: 'a', count: 2 },
			{ line: 'c', count: 1 }
		]);
		expect(runPipeline('x\ny\nx', [{ kind: 'count', ci: false }])).toBe('2\tx\n1\ty');
	});
});

describe('lines: transforms', () => {
	it('splits on any line ending, empty text has no lines', () => {
		expect(splitLines('a\r\nb\rc\nd')).toEqual(['a', 'b', 'c', 'd']);
		expect(splitLines('')).toEqual([]);
	});

	it('numbers lines with optional padding', () => {
		expect(numberLines(['a', 'b'], 1, '. ')).toEqual(['1. a', '2. b']);
		const ten = numberLines(Array(10).fill('x'), 1, ' ', true);
		expect(ten[0]).toBe(' 1 x');
		expect(ten[9]).toBe('10 x');
	});

	it('adds prefix and suffix, with escapes', () => {
		expect(applyStep(['a', 'b'], { kind: 'affix', prefix: "'", suffix: "'," })).toEqual([
			"'a',",
			"'b',"
		]);
		expect(unescapeSep('\\t|\\n|\\\\')).toBe('\t|\n|\\');
	});

	it('joins and splits', () => {
		expect(applyStep(['a', 'b', 'c'], { kind: 'join', sep: ', ' })).toEqual(['a, b, c']);
		expect(applyStep(['a', 'b'], { kind: 'join', sep: '\\t' })).toEqual(['a\tb']);
		expect(applyStep(['a;b', 'c'], { kind: 'split', sep: ';' })).toEqual(['a', 'b', 'c']);
		expect(() => applyStep(['a'], { kind: 'split', sep: '' })).toThrow(/separator/);
	});

	it('removes blank lines and trims', () => {
		expect(runPipeline('  a \n\n \t\nb', [{ kind: 'blank' }, { kind: 'trim' }])).toBe('a\nb');
	});

	it('wraps words at the width and cuts long words', () => {
		expect(wrapLine('the quick brown fox jumps', 10)).toEqual(['the quick', 'brown fox', 'jumps']);
		expect(wrapLine('abcdefghij klm', 4)).toEqual(['abcd', 'efgh', 'ij', 'klm']);
		expect(wrapLine('short', 80)).toEqual(['short']);
		expect(() => wrapLine('x', 0)).toThrow(/at least 1/);
	});

	it('shuffles with a supplied random source, keeping all items', () => {
		expect(shuffle([1, 2, 3, 4], () => 0)).toEqual([2, 3, 4, 1]);
		const s = shuffle([...'abcdefgh']);
		expect([...s].sort()).toEqual([...'abcdefgh']);
		for (let i = 0; i < 50; i++) {
			const r = randomInt(3);
			expect(r).toBeGreaterThanOrEqual(0);
			expect(r).toBeLessThan(3);
		}
	});

	it('runs a pipeline in order', () => {
		const steps = parseSteps(
			JSON.stringify([
				{ kind: 'trim' },
				{ kind: 'blank' },
				{ kind: 'unique', ci: true },
				{ kind: 'sort', mode: 'natural' },
				{ kind: 'number' }
			])
		);
		expect(runPipeline(' x10\nX10\n\nx2 ', steps)).toBe('1. x2\n2. x10');
	});

	it('drops malformed steps from the hash', () => {
		expect(parseSteps('nope')).toEqual([]);
		expect(parseSteps('[{"kind":"evil"},{"kind":"reverse"}]')).toEqual([{ kind: 'reverse' }]);
	});
});

describe('lines: ops', () => {
	const run = (id: string, s: string) => ops.find((o) => o.id === id)!.run(s);
	it('has the expected ops', () => {
		expect(run('lines.sort-natural', 'a10\na9')).toBe('a9\na10');
		expect(run('lines.number', 'a\nb')).toBe('1. a\n2. b');
		expect(run('lines.split-comma', 'a, b,c')).toBe('a\nb\nc');
		expect(run('lines.join-comma', 'a\nb')).toBe('a, b');
	});
});
