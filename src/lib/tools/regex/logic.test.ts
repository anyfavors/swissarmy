import { describe, expect, it } from 'vitest';
import { explain, parseLiteral, runRegex, segments, supportsFlag } from './logic';

describe('runRegex', () => {
	it('finds all matches with g, with numbered and named groups', () => {
		const r = runRegex('(?<y>\\d{4})-(\\d{2})', 'g', 'a 2024-05 b 1999-12');
		expect(r.error).toBeUndefined();
		expect(r.groupCount).toBe(2);
		expect(r.groupNames).toEqual(['y']);
		expect(r.matches).toEqual([
			{ index: 2, end: 9, text: '2024-05', groups: ['2024', '05'], named: { y: '2024' } },
			{ index: 12, end: 19, text: '1999-12', groups: ['1999', '12'], named: { y: '1999' } }
		]);
	});

	it('returns only the first match without g', () => {
		expect(runRegex('a', '', 'aaa').matches).toHaveLength(1);
	});

	it('honours sticky without g', () => {
		expect(runRegex('b', 'y', 'ab').matches).toHaveLength(0);
		expect(runRegex('a', 'y', 'ab').matches).toHaveLength(1);
	});

	it('keeps unmatched optional groups as undefined', () => {
		const r = runRegex('(a)|(b)', 'g', 'b');
		expect(r.matches[0].groups).toEqual([undefined, 'b']);
	});

	it('steps over empty matches like matchAll', () => {
		const r = runRegex('x*', 'g', 'axb');
		expect(r.matches.map((m) => [m.index, m.text])).toEqual(
			[...'axb'.matchAll(/x*/g)].map((m) => [m.index, m[0]])
		);
		// Astral characters are one step in u mode.
		const u = runRegex('', 'gu', '😀');
		expect(u.matches.map((m) => m.index)).toEqual([0, 2]);
	});

	it('caps the match list', () => {
		const r = runRegex('.', 'g', 'abcdef', undefined, 3);
		expect(r.matches).toHaveLength(3);
		expect(r.truncated).toBe(true);
	});

	it('previews String.replace with $1, $<name> and $&', () => {
		expect(
			runRegex('(\\w+)@(?<host>\\w+)', 'g', 'me@home you@work', '$<host>:$1 [$&]').replaced
		).toBe('home:me [me@home] work:you [you@work]');
		expect(runRegex('o', '', 'foo', '0').replaced).toBe('f0o');
	});

	it('reports syntax errors from the engine', () => {
		const r = runRegex('(a', '', 'a');
		expect(r.error).toMatch(/Invalid regular expression/);
		expect(runRegex('a', 'gg', 'a').error).toMatch(/flags/);
	});

	it('knows the v flag on this runtime', () => {
		expect(typeof supportsFlag('v')).toBe('boolean');
		expect(supportsFlag('q')).toBe(false);
	});
});

describe('segments', () => {
	it('splits text around matches, marking empty matches', () => {
		const text = 'a1b22';
		const r = runRegex('\\d+', 'g', text);
		expect(segments(text, r.matches)).toEqual([
			{ text: 'a', match: -1 },
			{ text: '1', match: 0 },
			{ text: 'b', match: -1 },
			{ text: '22', match: 1 }
		]);
		const e = runRegex('^', 'gm', 'x\ny');
		expect(segments('x\ny', e.matches)).toEqual([
			{ text: '', match: 0, empty: true },
			{ text: 'x\n', match: -1 },
			{ text: '', match: 1, empty: true },
			{ text: 'y', match: -1 }
		]);
	});
});

describe('parseLiteral', () => {
	it('splits /pattern/flags', () => {
		expect(parseLiteral('/a\\/b/gi')).toEqual({ pattern: 'a\\/b', flags: 'gi' });
		expect(parseLiteral('abc')).toBeNull();
	});
});

describe('explain', () => {
	const texts = (p: string, f = '') => explain(p, f).map((t) => [t.src, t.text]);

	it('explains anchors, classes, quantifiers and literals', () => {
		expect(texts('^[a-z0-9_]+@ex\\.com$')).toEqual([
			['^', 'Assert start of the text'],
			['[a-z0-9_]', 'Match one of: "a" to "z", "0" to "9", "_"'],
			['+', 'Repeat the previous item one or more times, as many as possible (greedy)'],
			['@ex\\.com', 'Match the text "@ex.com"'],
			['$', 'Assert end of the text']
		]);
	});

	it('keeps the literal before a quantifier on its own', () => {
		expect(texts('abc?')).toEqual([
			['ab', 'Match the text "ab"'],
			['c', 'Match "c"'],
			['?', 'Repeat the previous item optional (zero or one time), as many as possible (greedy)']
		]);
	});

	it('explains lazy and counted quantifiers', () => {
		expect(texts('.*?')[1][1]).toBe(
			'Repeat the previous item zero or more times, as few as possible (lazy)'
		);
		expect(texts('a{3}')[1][1]).toBe('Repeat the previous item exactly 3 times');
		expect(texts('a{2,}')[1][1]).toMatch(/2 or more times, as many/);
		expect(texts('a{2,5}?')[1][1]).toMatch(/between 2 and 5 times, as few as possible \(lazy\)/);
	});

	it('explains groups and tracks depth and numbering', () => {
		const t = explain('(?<year>\\d+)(?:x|y)(z)');
		expect(t.map((x) => [x.src, x.depth])).toEqual([
			['(?<year>', 0],
			['\\d', 1],
			['+', 1],
			[')', 0],
			['(?:', 0],
			['x', 1],
			['|', 1],
			['y', 1],
			[')', 0],
			['(', 0],
			['z', 1],
			[')', 0]
		]);
		expect(t[0].text).toBe('Start capturing group #1 named "year"');
		expect(t[9].text).toBe('Start capturing group #2');
		expect(t[6].text).toBe('Or: try the alternative that follows');
	});

	it('explains lookarounds', () => {
		expect(
			texts('(?=a)(?!b)(?<=c)(?<!d)')
				.filter((x) => x[0] !== ')' && x[0].length > 1)
				.map((x) => x[1])
		).toEqual([
			'Start a lookahead: what follows must match',
			'Start a negative lookahead: what follows must not match',
			'Start a lookbehind: what precedes must match',
			'Start a negative lookbehind: what precedes must not match'
		]);
	});

	it('explains escapes and backreferences', () => {
		expect(texts('\\b\\w\\s\\D\\x41\\u{1F600}\\p{L}\\1\\k<n>\\t')).toEqual([
			['\\b', 'Assert a word boundary'],
			['\\w', 'Match a word character: letter, digit or _'],
			['\\s', 'Match whitespace (space, tab, line break and others)'],
			['\\D', 'Match any character except a digit'],
			['\\x41', 'Match the character U+0041'],
			['\\u{1F600}', 'Match the character U+1F600'],
			['\\p{L}', 'Match a character with the Unicode property L'],
			['\\1', 'Match the same text as group #1 matched'],
			['\\k<n>', 'Match the same text as group "n" matched'],
			['\\t', 'Match a tab']
		]);
	});

	it('explains negated classes with escapes and \\b inside a class', () => {
		expect(texts('[^\\d\\s-]')[0][1]).toBe(
			'Match any character except: a digit 0-9, whitespace (space, tab, line break and others), "-"'
		);
		expect(texts('[\\b]')[0][1]).toBe('Match one of: a backspace character');
		expect(texts('[]a]')[0][1]).toBe('Match one of: "]", "a"');
	});

	it('follows the m and s flags', () => {
		expect(texts('^.$', 'ms').map((x) => x[1])).toEqual([
			'Assert start of a line',
			'Match any character',
			'Assert end of a line'
		]);
		expect(texts('.')[0][1]).toBe('Match any character except a line break');
	});

	it('throws on structure it cannot follow', () => {
		expect(() => explain('(a')).toThrow(/Unterminated group/);
		expect(() => explain('a)')).toThrow(/Unmatched \)/);
		expect(() => explain('[a')).toThrow(/Unterminated character class/);
		expect(() => explain('*a')).toThrow(/Nothing to repeat/);
		expect(() => explain('a\\')).toThrow(/lone backslash/);
	});

	it('covers every source character exactly once', () => {
		for (const p of ['^(?:[A-Z]{2}\\d{2}) ?(\\w+?)$', 'a|b|(c(d)e)*', '\\/\\.\\$']) {
			expect(
				explain(p)
					.map((t) => t.src)
					.join('')
			).toBe(p);
		}
	});
});
