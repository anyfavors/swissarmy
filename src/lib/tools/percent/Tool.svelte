<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		addVat,
		beforeChange,
		change,
		fmt as format,
		parseNumber,
		percentOf,
		plain as plainNum,
		removeVat,
		resize,
		simplify,
		vatShareOfGross,
		whatPercent,
		wholeFromPart
	} from './logic';

	type Out<T> = { v?: T; error?: string };

	let comma = $state(false);
	let f = $state({
		pa: '15',
		pb: '200',
		wa: '30',
		wb: '200',
		ca: '20',
		cb: '25',
		va: '100',
		vr: '25',
		ra: '30',
		rp: '15',
		rw: '1920',
		rh: '1080',
		nw: '1280',
		nh: '1080'
	});
	let ready = false;

	const n = (s: string) => parseNumber(s, comma);
	const fmt = (x: number) => format(x, comma);
	const plain = (x: number) => plainNum(x, comma);

	function run<T>(fn: () => T): Out<T> {
		try {
			return { v: fn() };
		} catch (e) {
			return { error: (e as Error).message };
		}
	}

	const pctOf = $derived(run(() => percentOf(n(f.pa), n(f.pb))));
	const what = $derived(run(() => whatPercent(n(f.wa), n(f.wb))));
	const chg = $derived(run(() => change(n(f.ca), n(f.cb))));
	const vat = $derived(
		run(() => {
			const amount = n(f.va);
			const rate = n(f.vr);
			return {
				add: addVat(amount, rate),
				remove: removeVat(amount, rate),
				share: vatShareOfGross(rate)
			};
		})
	);
	const rev = $derived(
		run(() => {
			const x = n(f.ra);
			const p = n(f.rp);
			return { whole: wholeFromPart(x, p), before: beforeChange(x, p), p };
		})
	);
	const ratio = $derived(run(() => simplify(n(f.rw), n(f.rh))));
	const newH = $derived(run(() => resize(n(f.rw), n(f.rh), n(f.nw))));
	const newW = $derived(run(() => resize(n(f.rw), n(f.rh), n(f.nh), true)));

	onMount(() => {
		const h = readHash();
		for (const k of Object.keys(f) as (keyof typeof f)[]) if (h[k] !== undefined) f[k] = h[k];
		if (h.dk === '1') comma = true;
		const m = h.in?.trim().match(/^(\d+(?:[.,]\d+)?)\s*[:x×]\s*(\d+(?:[.,]\d+)?)$/);
		if (m) {
			f.rw = m[1];
			f.rh = m[2];
		}
		ready = true;
	});

	$effect(() => {
		const state = { ...f, dk: comma ? '1' : undefined };
		if (ready) writeHash(state);
	});
</script>

<div class="row opts" role="group" aria-label="Number format">
	<span class="label">Decimal mark</span>
	<button type="button" aria-pressed={!comma} onclick={() => (comma = false)}>1,234.5</button>
	<button type="button" aria-pressed={comma} onclick={() => (comma = true)}>1.234,5</button>
</div>

<section aria-labelledby="pc-h1">
	<h2 class="label head" id="pc-h1">X % of Y</h2>
	<div class="pair">
		<div class="field">
			<label class="label" for="pc-pa">Percent</label>
			<input id="pc-pa" type="text" inputmode="decimal" bind:value={f.pa} autocomplete="off" />
		</div>
		<div class="field">
			<label class="label" for="pc-pb">Of</label>
			<input id="pc-pb" type="text" inputmode="decimal" bind:value={f.pb} autocomplete="off" />
		</div>
	</div>
	{#if pctOf.error}<p class="error" role="alert">{pctOf.error}</p>
	{:else if pctOf.v !== undefined}
		<dl class="readout">
			<div>
				<dt>{f.pa} % of {f.pb}</dt>
				<dd class="hl">{fmt(pctOf.v)}</dd>
				<Copy value={plain(pctOf.v)} />
			</div>
		</dl>
	{/if}
</section>

<section aria-labelledby="pc-h2">
	<h2 class="label head" id="pc-h2">X is what % of Y</h2>
	<div class="pair">
		<div class="field">
			<label class="label" for="pc-wa">Part</label>
			<input id="pc-wa" type="text" inputmode="decimal" bind:value={f.wa} autocomplete="off" />
		</div>
		<div class="field">
			<label class="label" for="pc-wb">Whole</label>
			<input id="pc-wb" type="text" inputmode="decimal" bind:value={f.wb} autocomplete="off" />
		</div>
	</div>
	{#if what.error}<p class="error" role="alert">{what.error}</p>
	{:else if what.v !== undefined}
		<dl class="readout">
			<div>
				<dt>{f.wa} of {f.wb}</dt>
				<dd class="hl">{fmt(what.v)} %</dd>
				<Copy value={plain(what.v)} />
			</div>
		</dl>
	{/if}
</section>

<section aria-labelledby="pc-h3">
	<h2 class="label head" id="pc-h3">Change from A to B</h2>
	<div class="pair">
		<div class="field">
			<label class="label" for="pc-ca">From A</label>
			<input id="pc-ca" type="text" inputmode="decimal" bind:value={f.ca} autocomplete="off" />
		</div>
		<div class="field">
			<label class="label" for="pc-cb">To B</label>
			<input id="pc-cb" type="text" inputmode="decimal" bind:value={f.cb} autocomplete="off" />
		</div>
	</div>
	{#if chg.error}<p class="error" role="alert">{chg.error}</p>
	{:else if chg.v}
		{@const c = chg.v}
		<dl class="readout">
			<div>
				<dt>Percent change</dt>
				<dd class="hl">
					{#if c.percent === null}undefined, A is 0{:else}{c.percent > 0 ? '+' : ''}{fmt(c.percent)} %{/if}
				</dd>
				<Copy value={c.percent === null ? '' : plain(c.percent)} />
			</div>
			<div>
				<dt>Difference</dt>
				<dd>{c.diff > 0 ? '+' : ''}{fmt(c.diff)}</dd>
				<Copy value={plain(c.diff)} />
			</div>
			<div>
				<dt>Factor B / A</dt>
				<dd>{c.factor === null ? 'undefined' : `× ${fmt(c.factor)}`}</dd>
			</div>
			<div>
				<dt>If A and B are rates</dt>
				<dd>
					{c.diff > 0 ? '+' : ''}{fmt(c.diff)} percentage points{#if c.percent !== null}, which is
						{c.percent > 0 ? '+' : ''}{fmt(c.percent)} percent{/if}
				</dd>
			</div>
		</dl>
		<p class="note">
			Percentage points are the plain difference between two percentages. A rate going from 20 % to
			25 % rises 5 percentage points (procentpoint), which is a 25 percent rise relative to where it
			started.
		</p>
	{/if}
</section>

<section aria-labelledby="pc-h4">
	<h2 class="label head" id="pc-h4">VAT (moms)</h2>
	<div class="pair">
		<div class="field">
			<label class="label" for="pc-va">Amount</label>
			<input id="pc-va" type="text" inputmode="decimal" bind:value={f.va} autocomplete="off" />
		</div>
		<div class="field">
			<label class="label" for="pc-vr">Rate %</label>
			<input id="pc-vr" type="text" inputmode="decimal" bind:value={f.vr} autocomplete="off" />
		</div>
	</div>
	<div class="row opts" role="group" aria-label="VAT rate preset">
		<button type="button" aria-pressed={f.vr === '25'} onclick={() => (f.vr = '25')}>DK 25 %</button
		>
	</div>
	{#if vat.error}<p class="error" role="alert">{vat.error}</p>
	{:else if vat.v}
		{@const v = vat.v}
		<div class="split">
			<section>
				<h3 class="label">Amount is excl. VAT</h3>
				<dl class="readout">
					<div>
						<dt>Excl. VAT</dt>
						<dd>{fmt(v.add.excl)}</dd>
					</div>
					<div>
						<dt>VAT</dt>
						<dd>{fmt(v.add.vat)}</dd>
						<Copy value={plain(v.add.vat)} />
					</div>
					<div>
						<dt>Incl. VAT</dt>
						<dd class="hl">{fmt(v.add.incl)}</dd>
						<Copy value={plain(v.add.incl)} />
					</div>
				</dl>
			</section>
			<section>
				<h3 class="label">Amount is incl. VAT</h3>
				<dl class="readout">
					<div>
						<dt>Incl. VAT</dt>
						<dd>{fmt(v.remove.incl)}</dd>
					</div>
					<div>
						<dt>VAT</dt>
						<dd>{fmt(v.remove.vat)}</dd>
						<Copy value={plain(v.remove.vat)} />
					</div>
					<div>
						<dt>Excl. VAT</dt>
						<dd class="hl">{fmt(v.remove.excl)}</dd>
						<Copy value={plain(v.remove.excl)} />
					</div>
				</dl>
			</section>
		</div>
		<p class="note">
			VAT is added on top of the net price, so taking it out again is not the same percentage: at {f.vr}
			% the VAT is {fmt(v.share)} % of the price including VAT. Danish moms is 25 %, so a fifth of a gross
			price is moms. Rounding to whole øre is left to you.
		</p>
	{/if}
</section>

<section aria-labelledby="pc-h5">
	<h2 class="label head" id="pc-h5">Reverse percentage</h2>
	<div class="pair">
		<div class="field">
			<label class="label" for="pc-ra">Value</label>
			<input id="pc-ra" type="text" inputmode="decimal" bind:value={f.ra} autocomplete="off" />
		</div>
		<div class="field">
			<label class="label" for="pc-rp">Percent</label>
			<input id="pc-rp" type="text" inputmode="decimal" bind:value={f.rp} autocomplete="off" />
		</div>
	</div>
	{#if rev.error}<p class="error" role="alert">{rev.error}</p>
	{:else if rev.v}
		{@const r = rev.v}
		<dl class="readout">
			<div>
				<dt>{f.ra} is {f.rp} % of</dt>
				<dd class="hl">{fmt(r.whole)}</dd>
				<Copy value={plain(r.whole)} />
			</div>
			<div>
				<dt>Before a {r.p >= 0 ? 'rise' : 'fall'} of {fmt(Math.abs(r.p))} %</dt>
				<dd class="hl">{fmt(r.before)}</dd>
				<Copy value={plain(r.before)} />
			</div>
		</dl>
	{/if}
</section>

<section aria-labelledby="pc-h6">
	<h2 class="label head" id="pc-h6">Ratio</h2>
	<div class="pair">
		<div class="field">
			<label class="label" for="pc-rw">Width or A</label>
			<input id="pc-rw" type="text" inputmode="decimal" bind:value={f.rw} autocomplete="off" />
		</div>
		<div class="field">
			<label class="label" for="pc-rh">Height or B</label>
			<input id="pc-rh" type="text" inputmode="decimal" bind:value={f.rh} autocomplete="off" />
		</div>
	</div>
	{#if ratio.error}<p class="error" role="alert">{ratio.error}</p>
	{:else if ratio.v}
		{@const r = ratio.v}
		<dl class="readout">
			<div>
				<dt>Simplest form</dt>
				<dd class="hl">{r.a}:{r.b}</dd>
				<Copy value={`${r.a}:${r.b}`} />
			</div>
			<div>
				<dt>As decimal</dt>
				<dd>{fmt(r.decimal)}:1</dd>
			</div>
			{#if r.near && !r.near.exact}
				<div>
					<dt>Close to</dt>
					<dd>{r.near.name} (not exact)</dd>
				</div>
			{/if}
		</dl>
		<h3 class="label head">Resize keeping {r.a}:{r.b}</h3>
		<div class="pair">
			<div class="field">
				<label class="label" for="pc-nw">New width</label>
				<input id="pc-nw" type="text" inputmode="decimal" bind:value={f.nw} autocomplete="off" />
			</div>
			<div class="field">
				<label class="label" for="pc-nh">New height</label>
				<input id="pc-nh" type="text" inputmode="decimal" bind:value={f.nh} autocomplete="off" />
			</div>
		</div>
		<dl class="readout">
			<div>
				<dt>Width {f.nw} gives height</dt>
				<dd>
					{#if newH.error}{newH.error}{:else if newH.v !== undefined}{fmt(
							newH.v
						)}{#if !Number.isInteger(newH.v)}<span class="muted">
								≈ {Math.round(newH.v)}</span
							>{/if}{/if}
				</dd>
				<Copy value={newH.v === undefined ? '' : plain(newH.v)} />
			</div>
			<div>
				<dt>Height {f.nh} gives width</dt>
				<dd>
					{#if newW.error}{newW.error}{:else if newW.v !== undefined}{fmt(
							newW.v
						)}{#if !Number.isInteger(newW.v)}<span class="muted">
								≈ {Math.round(newW.v)}</span
							>{/if}{/if}
				</dd>
				<Copy value={newW.v === undefined ? '' : plain(newW.v)} />
			</div>
		</dl>
	{/if}
</section>

<p class="note end">
	Numbers may use a decimal comma (12,5) or point (12.5). In the 1,234.5 setting a single comma is
	read as a decimal comma unless exactly three digits follow it, so 1,234 is one thousand two
	hundred and thirty-four. Pick 1.234,5 to read every comma as a decimal comma.
</p>

<style>
	.opts {
		margin-bottom: 0.5rem;
	}
	.head {
		margin: 1.75rem 0 0.5rem;
	}
	h3.head {
		margin-top: 1.25rem;
	}
	.pair {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
		gap: 0.75rem 1rem;
		margin-bottom: 0.75rem;
	}
	.split {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
		gap: 1rem 1.25rem;
		margin-bottom: 0.75rem;
	}
	.split h3 {
		margin: 0.5rem 0 0.4rem;
	}
	.readout {
		margin-bottom: 0.75rem;
	}
	.readout dt {
		overflow-wrap: anywhere;
	}
	.hl {
		color: var(--signal);
		font-weight: 700;
	}
	.muted {
		color: var(--ink-2);
		font-weight: 400;
	}
	.end {
		margin-top: 2rem;
	}
</style>
