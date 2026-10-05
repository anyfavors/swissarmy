<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import { barWidth, parseList, summarise, type Summary } from './logic';

	let input = $state('12 15 11 18 14 13 15 16 42 15 12 17');
	let comma = $state(false);
	let ready = false;
	const shownMax = 500;

	const parsed = $derived(parseList(input, comma));
	const result = $derived.by((): { s?: Summary; error?: string } => {
		if (!input.trim()) return {};
		try {
			return { s: summarise(parsed.values) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	function fmt(x: number | null): string {
		if (x === null) return 'n/a, needs 2 values';
		const v = Number(x.toPrecision(12));
		if (v !== 0 && (Math.abs(v) >= 1e15 || Math.abs(v) < 1e-6)) {
			const e = v.toExponential(8).replace(/\.?0+e/, 'e');
			return comma ? e.replace('.', ',') : e;
		}
		return new Intl.NumberFormat(comma ? 'da-DK' : 'en-GB', { maximumFractionDigits: 10 }).format(
			v
		);
	}

	function plain(x: number | null): string {
		if (x === null) return '';
		const s = String(Number(x.toPrecision(15)));
		return comma ? s.replace('.', ',') : s;
	}

	const list = (xs: number[]) => xs.map(plain).join(comma ? '; ' : ', ');

	onMount(() => {
		const h = readHash();
		if (h.in !== undefined) input = h.in;
		if (h.dk === '1') comma = true;
		ready = true;
	});

	$effect(() => {
		const state = { in: input.length <= 4000 ? input : undefined, dk: comma ? '1' : undefined };
		if (ready) writeHash(state);
	});
</script>

<div class="field">
	<label class="label" for="st-in">Numbers</label>
	<textarea id="st-in" bind:value={input} spellcheck="false" autocomplete="off"></textarea>
</div>
<div class="row opts" role="group" aria-label="Decimal mark">
	<span class="label">Decimal mark</span>
	<button type="button" aria-pressed={!comma} onclick={() => (comma = false)}>Point, 1.5</button>
	<button type="button" aria-pressed={comma} onclick={() => (comma = true)}>Comma, 1,5</button>
</div>

{#if parsed.skipped.length}
	<p class="note warn">
		Skipped {parsed.skipped.length} non-numeric
		{parsed.skipped.length === 1 ? 'item' : 'items'}:
		<span class="mono"
			>{parsed.skipped.slice(0, 8).join('  ')}{parsed.skipped.length > 8 ? ' …' : ''}</span
		>
	</p>
{/if}

{#if result.error}
	<p class="error" role="alert">{result.error}</p>
{:else if result.s}
	{@const s = result.s}
	<div class="cols">
		<section>
			<h2 class="label head">Summary</h2>
			<dl class="readout">
				<div>
					<dt>Count</dt>
					<dd>{s.count}</dd>
				</div>
				<div>
					<dt>Sum</dt>
					<dd>{fmt(s.sum)}</dd>
					<Copy value={plain(s.sum)} />
				</div>
				<div>
					<dt>Mean</dt>
					<dd class="hl">{fmt(s.mean)}</dd>
					<Copy value={plain(s.mean)} />
				</div>
				<div>
					<dt>Median</dt>
					<dd class="hl">{fmt(s.median)}</dd>
					<Copy value={plain(s.median)} />
				</div>
				<div>
					<dt>Mode</dt>
					<dd>
						{#if s.modes.values.length}{s.modes.values.map(fmt).join(' · ')}
							<span class="muted">({s.modes.count}×)</span>
						{:else}none{s.modes.count > 1 ? ', all values tie' : ', no value repeats'}{/if}
					</dd>
				</div>
				<div>
					<dt>Min</dt>
					<dd>{fmt(s.min)}</dd>
				</div>
				<div>
					<dt>Max</dt>
					<dd>{fmt(s.max)}</dd>
				</div>
				<div>
					<dt>Range</dt>
					<dd>{fmt(s.range)}</dd>
				</div>
			</dl>
		</section>
		<section>
			<h2 class="label head">Spread</h2>
			<dl class="readout">
				<div>
					<dt>SD, sample (n − 1)</dt>
					<dd class="hl">{fmt(s.sampleSd)}</dd>
					<Copy value={plain(s.sampleSd)} />
				</div>
				<div>
					<dt>SD, population (n)</dt>
					<dd>{fmt(s.populationSd)}</dd>
					<Copy value={plain(s.populationSd)} />
				</div>
				<div>
					<dt>Variance, sample</dt>
					<dd>{fmt(s.sampleVariance)}</dd>
					<Copy value={plain(s.sampleVariance)} />
				</div>
				<div>
					<dt>Variance, population</dt>
					<dd>{fmt(s.populationVariance)}</dd>
					<Copy value={plain(s.populationVariance)} />
				</div>
				{#each s.percentiles as p (p.p)}
					<div>
						<dt>p{p.p}</dt>
						<dd>{fmt(p.value)}</dd>
						<Copy value={plain(p.value)} />
					</div>
				{/each}
				<div>
					<dt>Q1 · Q3</dt>
					<dd>{fmt(s.q1)} · {fmt(s.q3)}</dd>
				</div>
				<div>
					<dt>IQR</dt>
					<dd>{fmt(s.iqr)}</dd>
				</div>
			</dl>
		</section>
	</div>

	<h2 class="label head">Outliers, outside 1.5 × IQR</h2>
	<dl class="readout">
		<div>
			<dt>Fences</dt>
			<dd>{fmt(s.lowerFence)} to {fmt(s.upperFence)}</dd>
		</div>
		<div>
			<dt>Outliers ({s.outliers.length})</dt>
			<dd class:hl={s.outliers.length > 0}>
				{s.outliers.length ? s.outliers.slice(0, 50).map(fmt).join(' · ') : 'none'}{s.outliers
					.length > 50
					? ' …'
					: ''}
			</dd>
			<Copy value={list(s.outliers)} />
		</div>
	</dl>

	<h2 class="label head">Histogram</h2>
	<div class="hist mono" role="table" aria-label="Histogram, fixed width buckets">
		{#each s.histogram as b, i (i)}
			<div class="bucket" role="row">
				<span class="range" role="cell"
					>{b.lo === b.hi
						? fmt(b.lo)
						: `${fmt(b.lo)} ≤ x ${i === s.histogram.length - 1 ? '≤' : '<'} ${fmt(b.hi)}`}</span
				>
				<span class="bar" role="cell" aria-label={`${b.count} values`}
					>{'█'.repeat(b.bar)}<span class="rest">{'·'.repeat(barWidth - b.bar)}</span></span
				>
				<span class="n" role="cell">{b.count}</span>
			</div>
		{/each}
	</div>

	<h2 class="label head row between">
		<span>Sorted ({s.count})</span>
		<Copy value={list(s.sorted)} />
	</h2>
	<p class="sorted mono">
		{s.sorted.slice(0, shownMax).map(fmt).join('  ')}{s.count > shownMax
			? `  … ${s.count - shownMax} more`
			: ''}
	</p>
{/if}

<p class="note end">
	Percentiles and quartiles use linear interpolation between closest ranks, the same as Excel
	PERCENTILE.INC and QUARTILE.INC, numpy's default and R type 7. Mean and variance use Welford's
	single pass method and the sum is compensated, so large offsets do not eat the digits. Outliers
	are values beyond Q1 − 1.5 × IQR or Q3 + 1.5 × IQR (Tukey's fences). Histogram buckets are equal
	width, each one includes its lower edge and excludes its upper edge, except the last.
</p>

<style>
	.opts {
		margin: 0.75rem 0;
	}
	.warn {
		border-left-color: var(--signal);
		margin-bottom: 0.75rem;
		overflow-wrap: anywhere;
	}
	.cols {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
		gap: 0 1.5rem;
	}
	.head {
		margin: 1.5rem 0 0.5rem;
	}
	.between {
		justify-content: space-between;
	}
	.hl {
		color: var(--signal);
		font-weight: 700;
	}
	.muted {
		color: var(--ink-2);
	}
	.hist {
		border-top: 2px solid var(--rule);
		font-size: 0.875rem;
	}
	.bucket {
		display: grid;
		grid-template-columns: minmax(7rem, 14rem) 1fr 3.5rem;
		gap: 0.5rem;
		align-items: center;
		padding: 0.2rem 0;
		border-bottom: 1px solid var(--rule-soft);
	}
	.range {
		color: var(--ink-2);
		overflow-wrap: anywhere;
	}
	.bar {
		color: var(--ink);
		white-space: nowrap;
		overflow: hidden;
		letter-spacing: -0.05em;
	}
	.rest {
		color: var(--rule-soft);
	}
	.n {
		text-align: right;
	}
	@media (max-width: 40rem) {
		.bucket {
			grid-template-columns: 1fr 3rem;
		}
		.range {
			grid-column: 1 / -1;
		}
		.bar {
			font-size: 0.7rem;
		}
	}
	.sorted {
		margin: 0 0 1rem;
		overflow-wrap: anywhere;
		word-spacing: 0.3em;
		font-size: 0.875rem;
	}
	.end {
		margin-top: 1.5rem;
	}
</style>
