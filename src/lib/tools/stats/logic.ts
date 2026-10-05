export interface Parsed {
	values: number[];
	/** Tokens that were not numbers, in order, so the reader can see what was dropped. */
	skipped: string[];
}

/**
 * Pulls numbers out of pasted text. Any run of spaces, tabs, new lines, semicolons and pipes
 * separates values, and so do commas unless `comma` is set.
 *
 * With `comma` (Danish style) the comma is the decimal mark. A dot is then read as a thousands
 * separator when the token also has a comma or looks like 1.234 or 1.234.567, else as a
 * decimal point.
 */
export function parseList(text: string, comma = false): Parsed {
	const values: number[] = [];
	const skipped: string[] = [];
	const tokens = text.split(comma ? /[\s;|]+/ : /[\s;,|]+/).filter(Boolean);
	for (const tok of tokens) {
		let t = tok.replace(/−/g, '-').replace(/%$/, '');
		if (comma) {
			if (t.includes(',') || /^[-+]?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
			t = t.replace(',', '.');
		}
		if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) {
			const v = Number(t);
			if (Number.isFinite(v)) {
				values.push(v);
				continue;
			}
		}
		skipped.push(tok);
	}
	return { values, skipped };
}

/** Neumaier compensated sum, exact to the last bit for most real data. */
export function sum(xs: number[]): number {
	let s = 0;
	let c = 0;
	for (const x of xs) {
		const t = s + x;
		c += Math.abs(s) >= Math.abs(x) ? s - t + x : x - t + s;
		s = t;
	}
	return s + c;
}

/** Welford's single pass mean and sum of squared deviations, stable for large offsets. */
export function welford(xs: number[]): { mean: number; m2: number } {
	let mean = 0;
	let m2 = 0;
	let k = 0;
	for (const x of xs) {
		k++;
		const d = x - mean;
		mean += d / k;
		m2 += d * (x - mean);
	}
	return { mean, m2 };
}

/**
 * Percentile by linear interpolation between closest ranks, the method of Excel PERCENTILE.INC,
 * numpy's default and R type 7: h = (n − 1) × p, then interpolate between x[floor h] and x[ceil h].
 * `sorted` must be in ascending order, p from 0 to 1.
 */
export function percentile(sorted: number[], p: number): number {
	if (!sorted.length) throw new Error('No values');
	if (p < 0 || p > 1) throw new Error('Percentile must be 0 to 100');
	const h = (sorted.length - 1) * p;
	const lo = Math.floor(h);
	const hi = Math.min(lo + 1, sorted.length - 1);
	return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

export interface Modes {
	values: number[];
	/** How often each mode appears. */
	count: number;
}

/** Most frequent values. Empty when no value repeats or every value appears equally often. */
export function modes(sorted: number[]): Modes {
	const counts = new Map<number, number>();
	for (const x of sorted) counts.set(x, (counts.get(x) ?? 0) + 1);
	let max = 0;
	for (const c of counts.values()) max = Math.max(max, c);
	const values = [...counts].filter(([, c]) => c === max).map(([v]) => v);
	if (max < 2 || (values.length === counts.size && counts.size > 1))
		return { values: [], count: max };
	return { values, count: max };
}

export interface Bucket {
	lo: number;
	hi: number;
	count: number;
	/** Bar length in block characters, 0 to `barWidth`. */
	bar: number;
}

const barWidth = 24;

/** Rounds a step up to 1, 2, 2.5 or 5 times a power of ten. */
function niceStep(raw: number): number {
	const p = 10 ** Math.floor(Math.log10(raw));
	for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= raw * (1 - 1e-12)) return m * p;
	return 10 * p;
}

const tidy = (x: number) => Number(x.toPrecision(12));

/**
 * Fixed width buckets. The number of buckets follows Sturges (log2 n + 1, at most 20), the width
 * is rounded up to a 1, 2, 2.5 or 5 step. Each bucket is [lo, hi), the last one also holds hi.
 */
export function histogram(sorted: number[]): Bucket[] {
	const n = sorted.length;
	if (!n) return [];
	const min = sorted[0];
	const max = sorted[n - 1];
	if (min === max) return [{ lo: min, hi: max, count: n, bar: barWidth }];
	const k = Math.min(20, Math.ceil(Math.log2(n)) + 1);
	const step = niceStep((max - min) / k);
	const start = tidy(Math.floor(min / step) * step);
	const buckets: Bucket[] = [];
	for (let lo = start; lo <= max; lo = tidy(lo + step))
		buckets.push({ lo, hi: tidy(lo + step), count: 0, bar: 0 });
	for (const x of sorted) {
		let i = Math.floor((x - start) / step);
		i = Math.max(0, Math.min(buckets.length - 1, i));
		// Guard against rounding at bucket edges.
		while (i > 0 && x < buckets[i].lo) i--;
		while (i < buckets.length - 1 && x >= buckets[i].hi) i++;
		buckets[i].count++;
	}
	const top = Math.max(...buckets.map((b) => b.count));
	for (const b of buckets)
		b.bar = b.count ? Math.max(1, Math.round((b.count / top) * barWidth)) : 0;
	return buckets;
}

export interface Summary {
	count: number;
	sum: number;
	min: number;
	max: number;
	range: number;
	mean: number;
	median: number;
	modes: Modes;
	/** Null with fewer than 2 values. */
	sampleVariance: number | null;
	sampleSd: number | null;
	populationVariance: number;
	populationSd: number;
	percentiles: { p: number; value: number }[];
	q1: number;
	q3: number;
	iqr: number;
	lowerFence: number;
	upperFence: number;
	outliers: number[];
	sorted: number[];
	histogram: Bucket[];
}

export function summarise(values: number[]): Summary {
	if (!values.length) throw new Error('No numbers found');
	const sorted = [...values].sort((a, b) => a - b);
	const n = sorted.length;
	const { mean, m2 } = welford(values);
	const q1 = percentile(sorted, 0.25);
	const q3 = percentile(sorted, 0.75);
	const iqr = q3 - q1;
	const lowerFence = q1 - 1.5 * iqr;
	const upperFence = q3 + 1.5 * iqr;
	const sampleVariance = n > 1 ? m2 / (n - 1) : null;
	return {
		count: n,
		sum: sum(values),
		min: sorted[0],
		max: sorted[n - 1],
		range: sorted[n - 1] - sorted[0],
		mean,
		median: percentile(sorted, 0.5),
		modes: modes(sorted),
		sampleVariance,
		sampleSd: sampleVariance === null ? null : Math.sqrt(sampleVariance),
		populationVariance: m2 / n,
		populationSd: Math.sqrt(m2 / n),
		percentiles: [0.5, 0.9, 0.95, 0.99].map((p) => ({ p: p * 100, value: percentile(sorted, p) })),
		q1,
		q3,
		iqr,
		lowerFence,
		upperFence,
		outliers: sorted.filter((x) => x < lowerFence || x > upperFence),
		sorted,
		histogram: histogram(sorted)
	};
}

export { barWidth };
