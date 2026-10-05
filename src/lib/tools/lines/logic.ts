/** Line operations. Each step takes an array of lines and returns a new one. */

export type SortMode = 'alpha' | 'natural' | 'length';

export type Step =
	| { kind: 'sort'; mode: SortMode; locale: 'en' | 'da'; reverse: boolean; ci: boolean }
	| { kind: 'reverse' }
	| { kind: 'unique'; ci: boolean; keep: 'first' | 'last' }
	| { kind: 'blank' }
	| { kind: 'trim' }
	| { kind: 'affix'; prefix: string; suffix: string }
	| { kind: 'number'; start: number; sep: string; pad: boolean }
	| { kind: 'join'; sep: string }
	| { kind: 'split'; sep: string }
	| { kind: 'wrap'; width: number }
	| { kind: 'shuffle' }
	| { kind: 'count'; ci: boolean };

export type StepKind = Step['kind'];

export const stepKinds: { kind: StepKind; label: string }[] = [
	{ kind: 'sort', label: 'Sort' },
	{ kind: 'reverse', label: 'Reverse order' },
	{ kind: 'unique', label: 'Unique' },
	{ kind: 'blank', label: 'Remove blank lines' },
	{ kind: 'trim', label: 'Trim each line' },
	{ kind: 'affix', label: 'Add prefix and suffix' },
	{ kind: 'number', label: 'Number lines' },
	{ kind: 'join', label: 'Join with separator' },
	{ kind: 'split', label: 'Split by separator' },
	{ kind: 'wrap', label: 'Wrap at column' },
	{ kind: 'shuffle', label: 'Shuffle' },
	{ kind: 'count', label: 'Count duplicates' }
];

export function defaultStep(kind: StepKind): Step {
	switch (kind) {
		case 'sort':
			return { kind, mode: 'alpha', locale: 'en', reverse: false, ci: true };
		case 'unique':
			return { kind, ci: false, keep: 'first' };
		case 'affix':
			return { kind, prefix: '', suffix: '' };
		case 'number':
			return { kind, start: 1, sep: '. ', pad: false };
		case 'join':
			return { kind, sep: ', ' };
		case 'split':
			return { kind, sep: ',' };
		case 'wrap':
			return { kind, width: 80 };
		case 'count':
			return { kind, ci: false };
		default:
			return { kind } as Step;
	}
}

export const splitLines = (s: string): string[] => (s === '' ? [] : s.split(/\r\n|\r|\n/));

/** Turns the escapes \n, \t and \\ typed in a separator field into the real characters. */
export function unescapeSep(s: string): string {
	return s.replace(/\\([nt\\])/g, (_, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : '\\'));
}

export function sortLines(
	lines: string[],
	mode: SortMode,
	locale: 'en' | 'da' = 'en',
	reverse = false,
	ci = true
): string[] {
	const coll = new Intl.Collator(locale, {
		numeric: mode === 'natural',
		sensitivity: ci ? 'accent' : 'variant',
		caseFirst: 'upper'
	});
	// Tie-breaker keeps case-insensitive sorts deterministic.
	const tie = new Intl.Collator(locale, { numeric: mode === 'natural', caseFirst: 'upper' });
	const cmp =
		mode === 'length'
			? (a: string, b: string) =>
					Array.from(a).length - Array.from(b).length || coll.compare(a, b) || tie.compare(a, b)
			: (a: string, b: string) => coll.compare(a, b) || tie.compare(a, b);
	const out = [...lines].sort(cmp);
	return reverse ? out.reverse() : out;
}

export function uniqueLines(
	lines: string[],
	ci = false,
	keep: 'first' | 'last' = 'first'
): string[] {
	const key = (l: string) => (ci ? l.toLocaleLowerCase() : l);
	if (keep === 'first') {
		const seen = new Set<string>();
		return lines.filter((l) => {
			const k = key(l);
			if (seen.has(k)) return false;
			seen.add(k);
			return true;
		});
	}
	const last = new Map<string, number>();
	lines.forEach((l, i) => last.set(key(l), i));
	return lines.filter((l, i) => last.get(key(l)) === i);
}

export function numberLines(lines: string[], start = 1, sep = '. ', pad = false): string[] {
	const width = String(start + lines.length - 1).length;
	return lines.map((l, i) => {
		const n = String(start + i);
		return (pad ? n.padStart(width, ' ') : n) + sep + l;
	});
}

/** Word wrap at a column count (in code points). Words longer than the width are cut. */
export function wrapLine(line: string, width: number): string[] {
	if (width < 1) throw new Error('Wrap width must be at least 1');
	const len = (s: string) => Array.from(s).length;
	if (len(line) <= width) return [line];
	const out: string[] = [];
	let cur = '';
	for (const word of line.split(/\s+/).filter(Boolean)) {
		let w = word;
		while (len(w) > width) {
			if (cur) {
				out.push(cur);
				cur = '';
			}
			const cps = Array.from(w);
			out.push(cps.slice(0, width).join(''));
			w = cps.slice(width).join('');
		}
		if (!w) continue;
		if (!cur) cur = w;
		else if (len(cur) + 1 + len(w) <= width) cur += ' ' + w;
		else {
			out.push(cur);
			cur = w;
		}
	}
	if (cur) out.push(cur);
	return out;
}

/** Uniform random integer in [0, n) from crypto.getRandomValues, with rejection to avoid bias. */
export function randomInt(n: number): number {
	const limit = Math.floor(0x100000000 / n) * n;
	const buf = new Uint32Array(1);
	for (;;) {
		crypto.getRandomValues(buf);
		if (buf[0] < limit) return buf[0] % n;
	}
}

/** Fisher-Yates shuffle. */
export function shuffle<T>(items: T[], rand: (n: number) => number = randomInt): T[] {
	const a = [...items];
	for (let i = a.length - 1; i > 0; i--) {
		const j = rand(i + 1);
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

export interface CountRow {
	line: string;
	count: number;
}

/** Frequency table, most frequent first, ties in first-seen order. */
export function countLines(lines: string[], ci = false): CountRow[] {
	const m = new Map<string, CountRow>();
	for (const l of lines) {
		const k = ci ? l.toLocaleLowerCase() : l;
		const r = m.get(k);
		if (r) r.count++;
		else m.set(k, { line: l, count: 1 });
	}
	return [...m.values()].sort((a, b) => b.count - a.count);
}

export function formatCounts(rows: CountRow[]): string[] {
	const w = String(rows[0]?.count ?? 0).length;
	return rows.map((r) => `${String(r.count).padStart(w, ' ')}\t${r.line}`);
}

export function applyStep(lines: string[], step: Step): string[] {
	switch (step.kind) {
		case 'sort':
			return sortLines(lines, step.mode, step.locale, step.reverse, step.ci);
		case 'reverse':
			return [...lines].reverse();
		case 'unique':
			return uniqueLines(lines, step.ci, step.keep);
		case 'blank':
			return lines.filter((l) => l.trim() !== '');
		case 'trim':
			return lines.map((l) => l.trim());
		case 'affix':
			return lines.map((l) => unescapeSep(step.prefix) + l + unescapeSep(step.suffix));
		case 'number':
			return numberLines(lines, step.start, unescapeSep(step.sep), step.pad);
		case 'join':
			return lines.length ? [lines.join(unescapeSep(step.sep))] : [];
		case 'split': {
			const sep = unescapeSep(step.sep);
			if (!sep) throw new Error('Split needs a separator');
			return lines.flatMap((l) => l.split(sep));
		}
		case 'wrap':
			return lines.flatMap((l) => wrapLine(l, step.width));
		case 'shuffle':
			return shuffle(lines);
		case 'count':
			return formatCounts(countLines(lines, step.ci));
	}
}

export function runPipeline(text: string, steps: Step[]): string {
	let lines = splitLines(text);
	for (const s of steps) lines = applyStep(lines, s);
	return lines.join('\n');
}

const KINDS = new Set(stepKinds.map((k) => k.kind));

/** Reads a pipeline from the URL hash; anything malformed is dropped. */
export function parseSteps(json: string): Step[] {
	try {
		const raw = JSON.parse(json);
		if (!Array.isArray(raw)) return [];
		return raw
			.filter((s) => s && typeof s === 'object' && KINDS.has(s.kind))
			.map((s) => ({ ...defaultStep(s.kind), ...s }) as Step);
	} catch {
		return [];
	}
}
