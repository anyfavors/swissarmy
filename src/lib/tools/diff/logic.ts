/**
 * Line diff with Myers' O(ND) algorithm (linear-space "middle snake" variant, as in
 * E. Myers, "An O(ND) Difference Algorithm and Its Variations", 1986), then a second
 * word-level pass inside changed line pairs.
 */

export interface DiffOptions {
	/** Treat runs of whitespace as equal and ignore trailing whitespace (like diff -b). */
	ignoreWhitespace?: boolean;
	ignoreCase?: boolean;
	/** Ignore whitespace at the end of lines (like diff -Z). */
	ignoreTrailing?: boolean;
}

export type Op = { t: 'eq' | 'del' | 'ins'; a: number; b: number };

/**
 * Shortest edit script between two sequences of integers.
 * `a`/`b` in each op are indices into A/B (for inserts `a` is the position in A, and vice versa).
 */
export function myers(A: ArrayLike<number>, B: ArrayLike<number>): Op[] {
	const out: Op[] = [];
	const rec = (aLo: number, aHi: number, bLo: number, bHi: number) => {
		while (aLo < aHi && bLo < bHi && A[aLo] === B[bLo]) {
			out.push({ t: 'eq', a: aLo++, b: bLo++ });
		}
		let suffix = 0;
		while (aHi > aLo && bHi > bLo && A[aHi - 1] === B[bHi - 1]) {
			aHi--;
			bHi--;
			suffix++;
		}
		if (aLo === aHi) {
			for (let j = bLo; j < bHi; j++) out.push({ t: 'ins', a: aLo, b: j });
		} else if (bLo === bHi) {
			for (let i = aLo; i < aHi; i++) out.push({ t: 'del', a: i, b: bLo });
		} else {
			const split = middleSnake(A, aLo, aHi, B, bLo, bHi);
			if (split) {
				rec(aLo, aLo + split[0], bLo, bLo + split[1]);
				rec(aLo + split[0], aHi, bLo + split[1], bHi);
			} else {
				for (let i = aLo; i < aHi; i++) out.push({ t: 'del', a: i, b: bLo });
				for (let j = bLo; j < bHi; j++) out.push({ t: 'ins', a: aHi, b: j });
			}
		}
		for (let s = 0; s < suffix; s++) out.push({ t: 'eq', a: aHi + s, b: bHi + s });
	};
	rec(0, A.length, 0, B.length);
	return out;
}

/** Finds a point on an optimal path roughly in the middle, searching from both ends. */
function middleSnake(
	A: ArrayLike<number>,
	aLo: number,
	aHi: number,
	B: ArrayLike<number>,
	bLo: number,
	bHi: number
): [number, number] | null {
	const N = aHi - aLo;
	const M = bHi - bLo;
	const maxD = Math.ceil((N + M) / 2);
	const off = maxD;
	const len = 2 * maxD + 2;
	const v1 = new Int32Array(len).fill(-1);
	const v2 = new Int32Array(len).fill(-1);
	v1[off + 1] = 0;
	v2[off + 1] = 0;
	const delta = N - M;
	const front = delta % 2 !== 0;
	let k1start = 0;
	let k1end = 0;
	let k2start = 0;
	let k2end = 0;
	for (let d = 0; d < maxD; d++) {
		for (let k1 = -d + k1start; k1 <= d - k1end; k1 += 2) {
			const k1o = off + k1;
			let x1 = k1 === -d || (k1 !== d && v1[k1o - 1] < v1[k1o + 1]) ? v1[k1o + 1] : v1[k1o - 1] + 1;
			let y1 = x1 - k1;
			while (x1 < N && y1 < M && A[aLo + x1] === B[bLo + y1]) {
				x1++;
				y1++;
			}
			v1[k1o] = x1;
			if (x1 > N) k1end += 2;
			else if (y1 > M) k1start += 2;
			else if (front) {
				const k2o = off + delta - k1;
				if (k2o >= 0 && k2o < len && v2[k2o] !== -1 && x1 >= N - v2[k2o]) return [x1, y1];
			}
		}
		for (let k2 = -d + k2start; k2 <= d - k2end; k2 += 2) {
			const k2o = off + k2;
			let x2 = k2 === -d || (k2 !== d && v2[k2o - 1] < v2[k2o + 1]) ? v2[k2o + 1] : v2[k2o - 1] + 1;
			let y2 = x2 - k2;
			while (x2 < N && y2 < M && A[aHi - x2 - 1] === B[bHi - y2 - 1]) {
				x2++;
				y2++;
			}
			v2[k2o] = x2;
			if (x2 > N) k2end += 2;
			else if (y2 > M) k2start += 2;
			else if (!front) {
				const k1o = off + delta - k2;
				if (k1o >= 0 && k1o < len && v1[k1o] !== -1) {
					const x1 = v1[k1o];
					const y1 = off + x1 - k1o;
					if (x1 >= N - x2) return [x1, y1];
				}
			}
		}
	}
	return null;
}

/** Splits text into lines. A final newline does not start an extra empty line. */
export function splitLines(text: string): { lines: string[]; noEol: boolean } {
	if (text === '') return { lines: [], noEol: false };
	const lines = text.split(/\r\n|\n|\r/);
	const noEol = lines[lines.length - 1] !== '';
	if (!noEol) lines.pop();
	return { lines, noEol };
}

export function normalize(line: string, o: DiffOptions): string {
	let s = line;
	if (o.ignoreWhitespace) s = s.replace(/\s+/g, ' ').replace(/ $/, '');
	else if (o.ignoreTrailing) s = s.replace(/\s+$/, '');
	if (o.ignoreCase) s = s.toLowerCase();
	return s;
}

/** Maps strings to small integers so the diff compares numbers. */
function intern(lists: string[][]): number[][] {
	const ids = new Map<string, number>();
	return lists.map((l) =>
		l.map((s) => {
			let id = ids.get(s);
			if (id === undefined) ids.set(s, (id = ids.size));
			return id;
		})
	);
}

export interface Seg {
	text: string;
	changed: boolean;
}

export interface Row {
	kind: 'eq' | 'del' | 'ins';
	/** 1-based line numbers. */
	aNo?: number;
	bNo?: number;
	text: string;
	/** Word-level segments when this line is paired with a changed counterpart. */
	segs?: Seg[];
}

export interface DiffResult {
	rows: Row[];
	added: number;
	removed: number;
	unified: string;
	identical: boolean;
}

const TOKEN_RE = /\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu;

/** Word-level diff between two lines. Returns segments for each side. */
export function wordDiff(a: string, b: string, o: DiffOptions = {}): [Seg[], Seg[]] {
	const ta = a.match(TOKEN_RE) ?? [];
	const tb = b.match(TOKEN_RE) ?? [];
	if (ta.length + tb.length > 4000) {
		return [[{ text: a, changed: true }], [{ text: b, changed: true }]];
	}
	const key = (t: string) => {
		if (o.ignoreWhitespace && /^\s+$/.test(t)) return ' ';
		return o.ignoreCase ? t.toLowerCase() : t;
	};
	const [ia, ib] = intern([ta.map(key), tb.map(key)]);
	const ops = myers(ia, ib);
	const left: Seg[] = [];
	const right: Seg[] = [];
	const push = (arr: Seg[], text: string, changed: boolean) => {
		const last = arr[arr.length - 1];
		if (last && last.changed === changed) last.text += text;
		else arr.push({ text, changed });
	};
	for (const op of ops) {
		if (op.t === 'eq') {
			push(left, ta[op.a], false);
			push(right, tb[op.b], false);
		} else if (op.t === 'del') push(left, ta[op.a], true);
		else push(right, tb[op.b], true);
	}
	return [left, right];
}

export function diffText(
	original: string,
	changed: string,
	o: DiffOptions = {},
	names: [string, string] = ['original', 'changed']
): DiffResult {
	const A = splitLines(original);
	const B = splitLines(changed);
	const ignoreEol = o.ignoreWhitespace || o.ignoreTrailing;
	const keys = (s: { lines: string[]; noEol: boolean }) =>
		s.lines.map(
			(l, i) =>
				normalize(l, o) + (s.noEol && !ignoreEol && i === s.lines.length - 1 ? '\u0000' : '')
		);
	const [ia, ib] = intern([keys(A), keys(B)]);
	const ops = myers(ia, ib);

	const rows: Row[] = [];
	let added = 0;
	let removed = 0;
	for (let i = 0; i < ops.length;) {
		const op = ops[i];
		if (op.t === 'eq') {
			rows.push({ kind: 'eq', aNo: op.a + 1, bNo: op.b + 1, text: B.lines[op.b] });
			i++;
			continue;
		}
		const dels: Op[] = [];
		const ins: Op[] = [];
		while (i < ops.length && ops[i].t !== 'eq') {
			(ops[i].t === 'del' ? dels : ins).push(ops[i]);
			i++;
		}
		removed += dels.length;
		added += ins.length;
		const pairs = Math.min(dels.length, ins.length);
		const segsA: (Seg[] | undefined)[] = [];
		const segsB: (Seg[] | undefined)[] = [];
		for (let k = 0; k < pairs; k++) {
			const [l, r] = wordDiff(A.lines[dels[k].a], B.lines[ins[k].b], o);
			segsA.push(l);
			segsB.push(r);
		}
		dels.forEach((d, k) =>
			rows.push({ kind: 'del', aNo: d.a + 1, text: A.lines[d.a], segs: segsA[k] })
		);
		ins.forEach((d, k) =>
			rows.push({ kind: 'ins', bNo: d.b + 1, text: B.lines[d.b], segs: segsB[k] })
		);
	}
	return {
		rows,
		added,
		removed,
		identical: added === 0 && removed === 0,
		unified: unifiedDiff(ops, A, B, names)
	};
}

/** Unified diff text (diff -u format) with the given number of context lines. */
export function unifiedDiff(
	ops: Op[],
	A: { lines: string[]; noEol: boolean },
	B: { lines: string[]; noEol: boolean },
	names: [string, string],
	context = 3
): string {
	const changeIdx: number[] = [];
	ops.forEach((op, i) => op.t !== 'eq' && changeIdx.push(i));
	if (changeIdx.length === 0) return '';
	// Group changes whose gap of equal lines is at most 2 * context.
	const groups: [number, number][] = [];
	let start = changeIdx[0];
	let prev = start;
	for (const i of changeIdx.slice(1)) {
		if (i - prev - 1 > 2 * context) {
			groups.push([start, prev]);
			start = i;
		}
		prev = i;
	}
	groups.push([start, prev]);

	const out = [`--- ${names[0]}`, `+++ ${names[1]}`];
	const range = (startLine: number, count: number) => {
		// GNU diff: a count of 1 is omitted; an empty range names the line before it.
		if (count === 0) return `${startLine - 1},0`;
		return count === 1 ? `${startLine}` : `${startLine},${count}`;
	};
	for (const [g0, g1] of groups) {
		const from = Math.max(0, g0 - context);
		const to = Math.min(ops.length - 1, g1 + context);
		let aCount = 0;
		let bCount = 0;
		const body: string[] = [];
		for (let i = from; i <= to; i++) {
			const op = ops[i];
			if (op.t === 'eq') {
				aCount++;
				bCount++;
				body.push(` ${A.lines[op.a]}`);
				if (op.a === A.lines.length - 1 && A.noEol) {
					if (B.noEol) body.push('\\ No newline at end of file');
				}
			} else if (op.t === 'del') {
				aCount++;
				body.push(`-${A.lines[op.a]}`);
				if (op.a === A.lines.length - 1 && A.noEol) body.push('\\ No newline at end of file');
			} else {
				bCount++;
				body.push(`+${B.lines[op.b]}`);
				if (op.b === B.lines.length - 1 && B.noEol) body.push('\\ No newline at end of file');
			}
		}
		const first = ops[from];
		out.push(`@@ -${range(first.a + 1, aCount)} +${range(first.b + 1, bCount)} @@`, ...body);
	}
	return out.join('\n') + '\n';
}

/** Hides unchanged runs longer than 2 * context, keeping context lines around changes. */
export type ViewRow = Row | { kind: 'skip'; count: number };

export function collapse(rows: Row[], context = 3): ViewRow[] {
	const out: ViewRow[] = [];
	let i = 0;
	while (i < rows.length) {
		if (rows[i].kind !== 'eq') {
			out.push(rows[i++]);
			continue;
		}
		let j = i;
		while (j < rows.length && rows[j].kind === 'eq') j++;
		const lead = i === 0 ? 0 : context;
		const tail = j === rows.length ? 0 : context;
		if (j - i > lead + tail + 1) {
			out.push(...rows.slice(i, i + lead));
			out.push({ kind: 'skip', count: j - i - lead - tail });
			out.push(...rows.slice(j - tail, j));
		} else out.push(...rows.slice(i, j));
		i = j;
	}
	return out;
}

export interface SidePair {
	kind: 'eq' | 'change' | 'skip';
	left?: Row;
	right?: Row;
	count?: number;
}

/** Pairs deletions with insertions for the side-by-side view. */
export function sideBySide(rows: ViewRow[]): SidePair[] {
	const out: SidePair[] = [];
	for (let i = 0; i < rows.length;) {
		const r = rows[i];
		if (r.kind === 'skip') {
			out.push({ kind: 'skip', count: r.count });
			i++;
		} else if (r.kind === 'eq') {
			out.push({ kind: 'eq', left: r, right: r });
			i++;
		} else {
			const dels: Row[] = [];
			const ins: Row[] = [];
			while (i < rows.length && (rows[i].kind === 'del' || rows[i].kind === 'ins')) {
				const x = rows[i] as Row;
				(x.kind === 'del' ? dels : ins).push(x);
				i++;
			}
			for (let k = 0; k < Math.max(dels.length, ins.length); k++)
				out.push({ kind: 'change', left: dels[k], right: ins[k] });
		}
	}
	return out;
}
