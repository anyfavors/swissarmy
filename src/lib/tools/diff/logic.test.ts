import { describe, expect, it } from 'vitest';
import { gnuCases } from './fixtures';
import { collapse, diffText, myers, sideBySide, splitLines, wordDiff } from './logic';

/** Edit distance (number of inserts plus deletes) of an op list, and a check that it rebuilds B. */
function apply(a: number[], b: number[]) {
	const ops = myers(a, b);
	const rebuilt: number[] = [];
	const left: number[] = [];
	for (const op of ops) {
		if (op.t !== 'ins') left.push(a[op.a]);
		if (op.t !== 'del') rebuilt.push(op.t === 'eq' ? a[op.a] : b[op.b]);
		if (op.t === 'eq') expect(a[op.a]).toBe(b[op.b]);
	}
	expect(left).toEqual(a);
	expect(rebuilt).toEqual(b);
	return ops.filter((o) => o.t !== 'eq').length;
}

/** Reference LCS length by dynamic programming. */
function lcs(a: number[], b: number[]) {
	const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
	for (let i = 1; i <= a.length; i++)
		for (let j = 1; j <= b.length; j++)
			dp[i][j] =
				a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
	return dp[a.length][b.length];
}

describe('myers', () => {
	it('finds D = 5 for the paper example ABCABBA -> CBABAC', () => {
		const s = (x: string) => [...x].map((c) => c.charCodeAt(0));
		expect(apply(s('ABCABBA'), s('CBABAC'))).toBe(5);
	});

	it('handles empty inputs', () => {
		expect(apply([], [])).toBe(0);
		expect(apply([1, 2], [])).toBe(2);
		expect(apply([], [1, 2, 3])).toBe(3);
	});

	it('is minimal on random inputs (checked against a DP LCS)', () => {
		let seed = 42;
		const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff), seed / 0x7fffffff);
		for (let n = 0; n < 300; n++) {
			const a = Array.from({ length: Math.floor(rnd() * 30) }, () => Math.floor(rnd() * 4));
			const b = Array.from({ length: Math.floor(rnd() * 30) }, () => Math.floor(rnd() * 4));
			expect(apply(a, b)).toBe(a.length + b.length - 2 * lcs(a, b));
		}
	});

	it('diffs 5000 lines quickly', () => {
		const a = Array.from({ length: 5000 }, (_, i) => `line ${i} ${i % 7}`).join('\n');
		const b = a
			.split('\n')
			.map((l, i) => (i % 50 === 0 ? l + ' edited' : l))
			.filter((_, i) => i % 333 !== 1)
			.join('\n');
		const t = performance.now();
		const r = diffText(a, b);
		expect(performance.now() - t).toBeLessThan(2000);
		// Line 1000 is both edited and dropped.
		expect(r.removed).toBe(100 + 16 - 1);
		expect(r.added).toBe(99);
	});

	it('copes with two completely different 3000-line texts', () => {
		const a = Array.from({ length: 3000 }, (_, i) => `a${i}`).join('\n');
		const b = Array.from({ length: 3000 }, (_, i) => `b${i}`).join('\n');
		const r = diffText(a, b);
		expect([r.added, r.removed]).toEqual([3000, 3000]);
	});
});

describe('unified diff matches GNU diff -u', () => {
	it.each(Object.keys(gnuCases))('%s', (k) => {
		const c = gnuCases[k];
		expect(diffText(c.a, c.b).unified).toBe(c.u);
	});

	it('produces correct hunk headers', () => {
		const headers = (k: string) =>
			diffText(gnuCases[k].a, gnuCases[k].b)
				.unified.split('\n')
				.filter((l) => l.startsWith('@@'));
		expect(headers('multi')).toEqual(['@@ -1,5 +1,5 @@', '@@ -8,6 +8,7 @@', '@@ -15,6 +16,5 @@']);
		expect(headers('addEmpty')).toEqual(['@@ -0,0 +1,2 @@']);
		expect(headers('delAll')).toEqual(['@@ -1,2 +0,0 @@']);
		expect(headers('single')).toEqual(['@@ -1 +1 @@']);
	});

	it('is empty for identical input', () => {
		const r = diffText('a\nb\n', 'a\nb\n');
		expect(r.unified).toBe('');
		expect(r.identical).toBe(true);
	});
});

describe('options', () => {
	it('ignores whitespace changes', () => {
		expect(diffText('a  b\nc\n', 'a b \nc\n', { ignoreWhitespace: true }).identical).toBe(true);
		expect(diffText('a  b\n', 'a b\n').identical).toBe(false);
		expect(diffText('ab\n', 'a b\n', { ignoreWhitespace: true }).identical).toBe(false);
	});

	it('ignores trailing whitespace only', () => {
		expect(diffText('a \t\n', 'a\n', { ignoreTrailing: true }).identical).toBe(true);
		expect(diffText(' a\n', 'a\n', { ignoreTrailing: true }).identical).toBe(false);
	});

	it('ignores case', () => {
		expect(diffText('Hello\n', 'hELLO\n', { ignoreCase: true }).identical).toBe(true);
	});

	it('shows the changed text for equal lines under options', () => {
		const r = diffText('HELLO\n', 'hello\n', { ignoreCase: true });
		expect(r.rows[0]).toMatchObject({ kind: 'eq', text: 'hello' });
	});
});

describe('word level', () => {
	it('marks only the changed words', () => {
		const [l, r] = wordDiff('the quick brown fox', 'the quick red fox');
		expect(l).toEqual([
			{ text: 'the quick ', changed: false },
			{ text: 'brown', changed: true },
			{ text: ' fox', changed: false }
		]);
		expect(r.filter((s) => s.changed).map((s) => s.text)).toEqual(['red']);
	});

	it('pairs changed lines and leaves unpaired ones whole', () => {
		const r = diffText('a\nold one\nz\n', 'a\nnew one\nextra\nz\n');
		const del = r.rows.find((x) => x.kind === 'del')!;
		expect(del.segs).toEqual([
			{ text: 'old', changed: true },
			{ text: ' one', changed: false }
		]);
		const ins = r.rows.filter((x) => x.kind === 'ins');
		expect(ins[0].segs).toBeDefined();
		expect(ins[1].segs).toBeUndefined();
		expect([r.added, r.removed]).toEqual([2, 1]);
	});
});

describe('views', () => {
	it('splits lines and notes a missing final newline', () => {
		expect(splitLines('')).toEqual({ lines: [], noEol: false });
		expect(splitLines('a\r\nb\n')).toEqual({ lines: ['a', 'b'], noEol: false });
		expect(splitLines('a\nb')).toEqual({ lines: ['a', 'b'], noEol: true });
	});

	it('collapses long unchanged runs to context', () => {
		const a = Array.from({ length: 20 }, (_, i) => `${i}`).join('\n');
		const b = a.replace('10', 'ten');
		const v = collapse(diffText(a, b).rows);
		expect(v[0]).toEqual({ kind: 'skip', count: 7 });
		expect(v[v.length - 1]).toEqual({ kind: 'skip', count: 6 });
		expect(v.length).toBe(1 + 3 + 2 + 3 + 1);
	});

	it('pairs rows side by side', () => {
		const rows = diffText('a\nb\nc\n', 'a\nB\nX\nc\n').rows;
		const s = sideBySide(rows);
		expect(s.map((p) => [p.kind, p.left?.text, p.right?.text])).toEqual([
			['eq', 'a', 'a'],
			['change', 'b', 'B'],
			['change', undefined, 'X'],
			['eq', 'c', 'c']
		]);
	});
});
