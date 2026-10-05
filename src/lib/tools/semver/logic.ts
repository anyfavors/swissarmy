/**
 * Semantic Versioning 2.0.0 (https://semver.org/spec/v2.0.0.html) and npm range syntax
 * as implemented by node-semver (https://github.com/npm/node-semver#ranges).
 */

export interface SemVer {
	major: number;
	minor: number;
	patch: number;
	prerelease: (string | number)[];
	build: string[];
	/** Normalised, without build metadata: 1.2.3-beta.1 */
	version: string;
	raw: string;
}

// Official regex from semver.org, numbers limited to safe integers below.
const SEMVER =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

function num(s: string, what: string): number {
	const n = Number(s);
	if (!Number.isSafeInteger(n)) throw new Error(`${what} ${s} is too large`);
	return n;
}

function explainInvalid(t: string): string {
	if (!/^\d+\.\d+\.\d+/.test(t)) {
		if (/^\d+(\.\d+)?$/.test(t)) return `"${t}" needs three parts: MAJOR.MINOR.PATCH`;
		return `"${t}" does not start with MAJOR.MINOR.PATCH`;
	}
	if (/^(\d+\.)*0\d/.test(t) || /\.0\d/.test(t.split(/[-+]/)[0]))
		return `"${t}": numbers must not have leading zeros`;
	const pre = t.match(/^\d+\.\d+\.\d+-([^+]*)/)?.[1];
	if (pre !== undefined) {
		if (pre === '' || pre.split('.').some((p) => p === ''))
			return `"${t}": empty pre-release identifier`;
		if (pre.split('.').some((p) => /^0\d+$/.test(p)))
			return `"${t}": numeric pre-release identifiers must not have leading zeros`;
	}
	if (/[^0-9A-Za-z.+-]/.test(t)) return `"${t}": only 0-9 A-Z a-z - . + are allowed`;
	return `"${t}" is not a valid SemVer 2.0.0 version`;
}

/** Strict SemVer 2.0.0. A leading v or = is accepted, as npm does. */
export function parse(input: string): SemVer {
	const raw = input.trim();
	const t = raw.replace(/^[=v]+\s*/, '');
	const m = t.match(SEMVER);
	if (!m) throw new Error(explainInvalid(t));
	const prerelease = m[4]
		? m[4].split('.').map((id) => (/^\d+$/.test(id) ? num(id, 'Identifier') : id))
		: [];
	const v = {
		major: num(m[1], 'Major'),
		minor: num(m[2], 'Minor'),
		patch: num(m[3], 'Patch'),
		prerelease,
		build: m[5] ? m[5].split('.') : [],
		version: '',
		raw
	};
	v.version = format(v);
	return v;
}

export function tryParse(input: string): SemVer | null {
	try {
		return parse(input);
	} catch {
		return null;
	}
}

function format(v: Pick<SemVer, 'major' | 'minor' | 'patch' | 'prerelease'>): string {
	const core = `${v.major}.${v.minor}.${v.patch}`;
	return v.prerelease.length ? `${core}-${v.prerelease.join('.')}` : core;
}

function cmpId(a: string | number, b: string | number): number {
	const an = typeof a === 'number';
	const bn = typeof b === 'number';
	if (an && bn) return a < b ? -1 : a > b ? 1 : 0;
	if (an) return -1; // numeric identifiers have lower precedence than alphanumeric
	if (bn) return 1;
	return a < b ? -1 : a > b ? 1 : 0; // ASCII sort order
}

/** Precedence per SemVer 2.0.0 §11. Build metadata is ignored. */
export function compare(a: SemVer, b: SemVer): number {
	for (const k of ['major', 'minor', 'patch'] as const) {
		if (a[k] !== b[k]) return a[k] < b[k] ? -1 : 1;
	}
	const ap = a.prerelease;
	const bp = b.prerelease;
	if (!ap.length && !bp.length) return 0;
	if (!ap.length) return 1; // a release ranks above its pre-releases
	if (!bp.length) return -1;
	for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
		if (i >= ap.length) return -1; // shorter set ranks lower when all before are equal
		if (i >= bp.length) return 1;
		const c = cmpId(ap[i], bp[i]);
		if (c) return c;
	}
	return 0;
}

export function sort(list: SemVer[]): SemVer[] {
	return [...list].sort(compare);
}

/* ------------------------------------------------------------------ ranges */

export type Op = '>' | '>=' | '<' | '<=' | '=';

export interface Comparator {
	op: Op;
	v: SemVer;
}

/** A range is a union (||) of sets; a version must satisfy every comparator in one set. */
export type ComparatorSet = Comparator[];

export interface Range {
	sets: ComparatorSet[];
	/** node-semver style normalised form: >=1.2.3 <2.0.0-0 || ... */
	text: string;
	raw: string;
}

const XR =
	/^[vV=]*\s*(\d+|[xX*])(?:\.(\d+|[xX*])(?:\.(\d+|[xX*])(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?)?)?$/;

interface Partial {
	M?: number;
	m?: number;
	p?: number;
	pre: string;
}

const isX = (s: string | undefined) => s === undefined || /^[xX*]$/.test(s);

function partial(s: string): Partial {
	if (s === '' || s === '*' || /^[xX]$/.test(s)) return { pre: '' };
	const m = s.match(XR);
	if (!m) throw new Error(`"${s}" is not a version or partial version`);
	const p: Partial = { pre: m[4] ? `-${m[4]}` : '' };
	if (!isX(m[1])) p.M = num(m[1], 'Major');
	if (p.M !== undefined && !isX(m[2])) p.m = num(m[2], 'Minor');
	if (p.m !== undefined && !isX(m[3])) p.p = num(m[3], 'Patch');
	if (p.pre && p.p === undefined) throw new Error(`"${s}": a pre-release needs a full version`);
	return p;
}

const v = (s: string) => parse(s);
const c = (op: Op, s: string): Comparator => ({ op, v: v(s) });

function tilde(p: Partial): Comparator[] {
	if (p.M === undefined) return [];
	if (p.m === undefined) return [c('>=', `${p.M}.0.0`), c('<', `${p.M + 1}.0.0-0`)];
	if (p.p === undefined) return [c('>=', `${p.M}.${p.m}.0`), c('<', `${p.M}.${p.m + 1}.0-0`)];
	return [c('>=', `${p.M}.${p.m}.${p.p}${p.pre}`), c('<', `${p.M}.${p.m + 1}.0-0`)];
}

function caret(p: Partial): Comparator[] {
	const { M, m, p: pp, pre } = p;
	if (M === undefined) return [];
	if (m === undefined) return [c('>=', `${M}.0.0`), c('<', `${M + 1}.0.0-0`)];
	if (pp === undefined) {
		if (M === 0) return [c('>=', `0.${m}.0`), c('<', `0.${m + 1}.0-0`)];
		return [c('>=', `${M}.${m}.0`), c('<', `${M + 1}.0.0-0`)];
	}
	const lo = c('>=', `${M}.${m}.${pp}${pre}`);
	if (M === 0) {
		if (m === 0) return [lo, c('<', `0.0.${pp + 1}-0`)];
		return [lo, c('<', `0.${m + 1}.0-0`)];
	}
	return [lo, c('<', `${M + 1}.0.0-0`)];
}

function primitive(op: string, p: Partial): Comparator[] {
	const { M, m, p: pp, pre } = p;
	const full = pp !== undefined;
	if (op === '' || op === '=') {
		if (M === undefined) return [];
		if (full) return [c('=', `${M}.${m}.${pp}${pre}`)];
		return tilde(p);
	}
	if (M === undefined) {
		// >* and <=* match anything; <* and >=*... node-semver: <* and >* match nothing
		if (op === '<' || op === '>') return [c('<', '0.0.0-0')];
		return [];
	}
	if (full) return [c(op as Op, `${M}.${m}.${pp}${pre}`)];
	if (op === '>') {
		if (m === undefined) return [c('>=', `${M + 1}.0.0`)];
		return [c('>=', `${M}.${m + 1}.0`)];
	}
	if (op === '>=') return [c('>=', `${M}.${m ?? 0}.0`)];
	if (op === '<') return [c('<', `${M}.${m ?? 0}.0-0`)];
	// <=
	if (m === undefined) return [c('<', `${M + 1}.0.0-0`)];
	return [c('<', `${M}.${m + 1}.0-0`)];
}

function hyphen(a: string, b: string): Comparator[] {
	const pa = partial(a);
	const pb = partial(b);
	const out: Comparator[] = [];
	if (pa.M !== undefined)
		out.push(c('>=', `${pa.M}.${pa.m ?? 0}.${pa.p ?? 0}${pa.p !== undefined ? pa.pre : ''}`));
	if (pb.M !== undefined) {
		if (pb.m === undefined) out.push(c('<', `${pb.M + 1}.0.0-0`));
		else if (pb.p === undefined) out.push(c('<', `${pb.M}.${pb.m + 1}.0-0`));
		else out.push(c('<=', `${pb.M}.${pb.m}.${pb.p}${pb.pre}`));
	}
	return out;
}

function parseSet(s: string): ComparatorSet {
	const t = s.trim();
	const h = t.match(/^(\S+)\s+-\s+(\S+)$/);
	if (h) return hyphen(h[1], h[2]);
	// glue operators to their versions: ">= 1.2.3" -> ">=1.2.3"
	const tokens = t
		.replace(/(\^|~>?|[<>]=?|=)\s+/g, '$1')
		.split(/\s+/)
		.filter(Boolean);
	const out: Comparator[] = [];
	for (const tok of tokens) {
		const m = tok.match(/^(\^|~>?|[<>]=?|=)?(.*)$/)!;
		const op = m[1] ?? '';
		if (/^[<>=^~]/.test(m[2])) throw new Error(`"${tok}" has two operators`);
		const p = partial(m[2]);
		if (op === '^') out.push(...caret(p));
		else if (op === '~' || op === '~>') out.push(...tilde(p));
		else out.push(...primitive(op, p));
	}
	return out;
}

function compText(cmp: Comparator): string {
	return `${cmp.op === '=' ? '' : cmp.op}${cmp.v.version}`;
}

export function parseRange(input: string): Range {
	const raw = input.trim();
	if (/\|\|\s*$|^\s*\|\|/.test(raw)) throw new Error('Empty side of ||');
	const sets = raw.split('||').map(parseSet);
	const text = sets.map((s) => (s.length ? s.map(compText).join(' ') : '>=0.0.0')).join(' || ');
	return { sets, text, raw };
}

function test(cmp: Comparator, x: SemVer): boolean {
	const r = compare(x, cmp.v);
	switch (cmp.op) {
		case '>':
			return r > 0;
		case '>=':
			return r >= 0;
		case '<':
			return r < 0;
		case '<=':
			return r <= 0;
		default:
			return r === 0;
	}
}

/**
 * node-semver semantics: a pre-release version only matches a set if some comparator in that
 * set has a pre-release on the same MAJOR.MINOR.PATCH (unless includePrerelease).
 */
export function satisfies(x: SemVer, range: Range, includePrerelease = false): boolean {
	return range.sets.some((set) => {
		if (!set.every((cmp) => test(cmp, x))) return false;
		if (!x.prerelease.length || includePrerelease) return true;
		return set.some(
			(cmp) =>
				cmp.v.prerelease.length > 0 &&
				cmp.v.major === x.major &&
				cmp.v.minor === x.minor &&
				cmp.v.patch === x.patch
		);
	});
}

/* ---------------------------------------------------------- explanations */

function describe(cmp: Comparator): string {
	const ver = cmp.v.version;
	const isFloor = cmp.v.prerelease.length === 1 && cmp.v.prerelease[0] === 0;
	const base = `${cmp.v.major}.${cmp.v.minor}.${cmp.v.patch}`;
	switch (cmp.op) {
		case '>=':
			return `at least ${ver}`;
		case '>':
			return `above ${ver}`;
		case '<':
			return isFloor ? `below ${base}, no ${base} pre-releases` : `below ${ver}`;
		case '<=':
			return `at most ${ver}`;
		default:
			return `exactly ${ver}`;
	}
}

/** One sentence per || alternative. */
export function explainRange(r: Range): string[] {
	return r.sets.map((set) => {
		if (!set.length) return 'Any version (pre-releases excluded)';
		if (set.length === 1 && set[0].op === '<' && set[0].v.version === '0.0.0-0')
			return 'Nothing matches';
		const parts = set.map(describe);
		const s = parts.join(' and ');
		return s.charAt(0).toUpperCase() + s.slice(1);
	});
}

/** Pre-release note for a range, if any comparator carries one. */
export function prereleaseNote(r: Range): string | null {
	const tuples = new Set<string>();
	for (const set of r.sets)
		for (const cmp of set)
			if (cmp.v.prerelease.length && !(cmp.v.prerelease.length === 1 && cmp.v.prerelease[0] === 0))
				tuples.add(`${cmp.v.major}.${cmp.v.minor}.${cmp.v.patch}`);
	if (!tuples.size) return 'Pre-release versions such as 1.2.3-beta never match this range.';
	return `Pre-releases match only on ${[...tuples].join(', ')}.`;
}

export interface Checked {
	input: string;
	v?: SemVer;
	error?: string;
	ok?: boolean;
}

/** Splits a pasted list on newlines, commas and whitespace, parses and sorts it. */
export function checkList(text: string, range: Range | null): Checked[] {
	const items = text
		.split(/[\s,]+/)
		.map((s) => s.trim())
		.filter(Boolean);
	const out: Checked[] = items.map((input) => {
		try {
			const v = parse(input);
			return { input, v, ok: range ? satisfies(v, range) : undefined };
		} catch (e) {
			return { input, error: (e as Error).message };
		}
	});
	return out.sort((a, b) => {
		if (a.v && b.v) return compare(a.v, b.v);
		return a.v ? -1 : b.v ? 1 : 0;
	});
}

export function maxSatisfying(list: Checked[]): SemVer | null {
	const ok = list.filter((c) => c.ok && c.v).map((c) => c.v!);
	return ok.length ? sort(ok)[ok.length - 1] : null;
}

/** Next versions per SemVer rules: a pre-release bumps to its release first. */
export function increments(x: SemVer): { major: string; minor: string; patch: string } {
	const pre = x.prerelease.length > 0;
	return {
		major: pre && x.minor === 0 && x.patch === 0 ? `${x.major}.0.0` : `${x.major + 1}.0.0`,
		minor: pre && x.patch === 0 ? `${x.major}.${x.minor}.0` : `${x.major}.${x.minor + 1}.0`,
		patch: pre ? `${x.major}.${x.minor}.${x.patch}` : `${x.major}.${x.minor}.${x.patch + 1}`
	};
}

export { looksLikeSemver } from './detect';
