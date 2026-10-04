<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import { refs } from './data';
	import {
		compare,
		conversions,
		findRef,
		findUnit,
		fmtNum,
		fmtPlain,
		formatSI,
		headlines,
		names,
		parseInput,
		quantities,
		quantityLabel,
		refsFor,
		refValue,
		reverse,
		rowText,
		stack,
		stackSentence,
		unitsFor,
		type Lang,
		type Parsed,
		type Ref,
		type RegionFilter
	} from './logic';

	let input = $state('3.5 km');
	let unit = $state('m');
	let region = $state<RegionFilter>('all');
	let lang = $state<Lang>('en');
	let stackId = $state('floppy');
	let revId = $state('football-pitch-length');
	let revAmount = $state('100');
	let now = $state(Date.now());
	let ready = false;

	const regions: { id: RegionFilter; label: string }[] = [
		{ id: 'all', label: 'All' },
		{ id: 'dk', label: 'Denmark' },
		{ id: 'intl', label: 'International' }
	];

	const parsed = $derived.by((): { p?: Parsed; error?: string } => {
		if (!input.trim()) return {};
		try {
			return { p: parseInput(input, unit) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	const q = $derived(parsed.p?.unit.q);

	const rows = $derived.by(() => {
		const p = parsed.p;
		if (!p) return [];
		return compare(p.si, refsFor(p.unit.q, region), now);
	});

	const heads = $derived(headlines(rows, lang, 3));

	const stackables = $derived(q ? refsFor(q, 'all').filter((r) => r.thickness) : []);
	const stackItem = $derived(stackables.find((r) => r.id === stackId) ?? stackables[0]);
	const stacked = $derived.by(() => {
		const p = parsed.p;
		if (!p || !stackItem) return null;
		const s = stack(p.si, stackItem, refsFor('length', region), now);
		return { s, sentence: stackSentence(s, stackItem, lang) };
	});

	const revRef = $derived(findRef(revId));
	const revResult = $derived.by((): { si?: number; error?: string } => {
		if (!revRef) return {};
		const n = Number(revAmount.trim().replace(',', '.'));
		if (!revAmount.trim()) return {};
		if (!Number.isFinite(n) || n <= 0) return { error: 'Enter an amount above zero.' };
		return { si: reverse(n, revRef, now) };
	});

	function count(ref: Ref, n: number): string {
		const nm = names(ref, 'en');
		const s = fmtNum(n);
		return `${s} ${s === '1' ? nm.one : nm.other}`;
	}

	function host(url: string): string {
		try {
			return new URL(url).hostname.replace(/^www\./, '');
		} catch {
			return url;
		}
	}

	onMount(() => {
		const h = readHash();
		if (h.in) input = h.in;
		if (h.u && findUnit(h.u)) unit = h.u;
		if (h.r === 'dk' || h.r === 'intl') region = h.r;
		if (h.hl === 'da') lang = 'da';
		if (h.st && findRef(h.st)) stackId = h.st;
		if (h.rr && findRef(h.rr)) revId = h.rr;
		if (h.rn) revAmount = h.rn;
		ready = true;
		const t = setInterval(() => (now = Date.now()), 60_000);
		return () => clearInterval(t);
	});

	$effect(() => {
		const state = {
			in: input,
			u: unit,
			r: region === 'all' ? undefined : region,
			hl: lang === 'da' ? 'da' : undefined,
			st: stackId,
			rr: revId,
			rn: revAmount
		};
		if (ready) writeHash(state);
	});
</script>

<div class="inputs">
	<div class="field">
		<label class="label" for="jn-in">Amount</label>
		<input id="jn-in" type="text" bind:value={input} spellcheck="false" autocomplete="off" />
	</div>
	<div class="field">
		<label class="label" for="jn-unit">Unit if none typed</label>
		<select id="jn-unit" bind:value={unit}>
			{#each quantities as qq (qq)}
				<optgroup label={quantityLabel[qq]}>
					{#each unitsFor(qq).filter((u) => u.pick) as u (u.sym)}
						<option value={u.sym}>{u.sym}</option>
					{/each}
				</optgroup>
			{/each}
		</select>
	</div>
</div>
<p class="label hint">Accepts 3.5 km · 1,474,560 B · 90 min · 2 t TNT · 25 mph · 3,5 km</p>

<div class="row opts" role="group" aria-label="Region">
	<span class="label">References</span>
	{#each regions as r (r.id)}
		<button type="button" aria-pressed={region === r.id} onclick={() => (region = r.id)}
			>{r.label}</button
		>
	{/each}
</div>

{#if parsed.error}
	<p class="error" role="alert">{parsed.error}</p>
{:else if parsed.p}
	{@const p = parsed.p}
	<p class="read">
		<span class="label">Read as</span>
		<span class="mono">{fmtPlain(p.value)} {p.unit.sym}</span>
		<span class="mono">= {formatSI(p.si, p.unit.q)}</span>
		<span class="label">{quantityLabel[p.unit.q]}</span>
	</p>

	{#if rows.length}
		<div class="row headhead">
			<h2 class="label">Headlines</h2>
			<div class="row" role="group" aria-label="Headline language">
				<button type="button" aria-pressed={lang === 'en'} onclick={() => (lang = 'en')}>EN</button>
				<button type="button" aria-pressed={lang === 'da'} onclick={() => (lang = 'da')}>DA</button>
			</div>
		</div>
		<dl class="readout heads" {lang}>
			{#each heads as h, i (i)}
				<div>
					<dt>{i + 1}</dt>
					<dd>{h}</dd>
					<Copy value={h} />
				</div>
			{/each}
		</dl>

		<h2 class="label sect">Compared with {rows.length} references</h2>
		<dl class="readout cmp">
			{#each rows as r (r.ref.id)}
				<div class:far={!r.readable}>
					<dt>{r.ref.name}</dt>
					<dd>
						<span class="val">{r.ref.approx ? '≈ ' : ''}{rowText(r.ratio, r.ref)}</span>
						<span class="src"
							>{r.ref.sourceNote}{r.ref.year ? ` (${r.ref.year})` : ''}. Value {r.ref.approx
								? '≈ '
								: ''}{formatSI(refValue(r.ref, now), r.ref.quantity)}.
							<a href={r.ref.source} rel="noopener noreferrer">{host(r.ref.source)}</a></span
						>
					</dd>
					<Copy value={rowText(r.ratio, r.ref)} />
				</div>
			{/each}
		</dl>
	{:else}
		<p class="note sect">No references for this quantity in the selected region.</p>
	{/if}

	{#if stackItem && stacked}
		<h2 class="label sect">Stack</h2>
		<div class="field narrow">
			<label class="label" for="jn-stack">Stack of</label>
			<select id="jn-stack" bind:value={stackId}>
				{#each stackables as s (s.id)}
					<option value={s.id}>{s.name}</option>
				{/each}
			</select>
		</div>
		<dl class="readout stackout">
			<div>
				<dt>Items needed</dt>
				<dd>{fmtPlain(stacked.s.count)}</dd>
				<Copy value={String(stacked.s.count)} />
			</div>
			<div>
				<dt>Stack height</dt>
				<dd>{formatSI(stacked.s.height, 'length')}</dd>
				<Copy value={formatSI(stacked.s.height, 'length')} />
			</div>
			<div>
				<dt>Headline</dt>
				<dd class="hl" {lang}>{stacked.sentence}</dd>
				<Copy value={stacked.sentence} />
			</div>
			{#each stacked.s.rows.slice(0, 4) as r (r.ref.id)}
				<div>
					<dt>{r.ref.name}</dt>
					<dd>{r.ref.approx ? '≈ ' : ''}{rowText(r.ratio, r.ref)}</dd>
					<Copy value={rowText(r.ratio, r.ref)} />
				</div>
			{/each}
		</dl>
		<p class="note">
			{stackItem.thicknessNote}. Whole items only, so the last one may be part full.
		</p>
	{/if}
{/if}

<h2 class="label sect">Reverse</h2>
<div class="inputs">
	<div class="field">
		<label class="label" for="jn-rev-n">How many</label>
		<input
			id="jn-rev-n"
			type="text"
			inputmode="decimal"
			bind:value={revAmount}
			spellcheck="false"
			autocomplete="off"
		/>
	</div>
	<div class="field wide">
		<label class="label" for="jn-rev-ref">Of what</label>
		<select id="jn-rev-ref" bind:value={revId}>
			{#each quantities as qq (qq)}
				<optgroup label={quantityLabel[qq]}>
					{#each refs.filter((r) => r.quantity === qq) as r (r.id)}
						<option value={r.id}>{r.name}</option>
					{/each}
				</optgroup>
			{/each}
		</select>
	</div>
</div>
{#if revResult.error}
	<p class="error" role="alert">{revResult.error}</p>
{:else if revRef && revResult.si !== undefined}
	{@const n = Number(revAmount.trim().replace(',', '.'))}
	<p class="read">
		<span class="mono">{count(revRef, n)}</span>
		<span class="mono hl"
			>{revRef.approx ? '≈' : '='} {formatSI(revResult.si, revRef.quantity)}</span
		>
	</p>
	<dl class="readout">
		{#each conversions(revResult.si, revRef.quantity) as c (c.sym)}
			<div>
				<dt class="unit">{c.sym}</dt>
				<dd>{fmtPlain(c.value)}</dd>
				<Copy value={String(Number(c.value.toPrecision(10)))} />
			</div>
		{/each}
	</dl>
{/if}

<p class="note sect">
	For fun and orientation. Every number has a source, linked next to it; approximations are marked
	≈. Rows with a ratio between 0.5 and 10,000 come first, the rest are greyed. Long lists of
	decimals are rounded the way a newspaper would. Time since the Moon landing is counted live.
</p>

<style>
	.inputs {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
		gap: 1rem;
	}
	.hint {
		margin: 0.35rem 0 0;
		text-transform: none;
		letter-spacing: 0.02em;
	}
	.opts {
		margin: 1rem 0;
	}
	.read {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.75rem;
		align-items: baseline;
		margin: 1rem 0;
	}
	.headhead {
		justify-content: space-between;
		margin: 1.5rem 0 0.5rem;
	}
	.headhead h2 {
		margin: 0;
	}
	.sect {
		margin: 2rem 0 0.5rem;
	}
	.heads > div {
		grid-template-columns: 2rem 1fr auto;
	}
	.heads dt {
		grid-column: auto;
	}
	.heads dd {
		font-family: var(--font-body);
		font-size: 1.0625rem;
	}
	.cmp dt,
	.stackout dt,
	.unit {
		text-transform: none;
		letter-spacing: 0.02em;
	}
	.val {
		display: block;
		font-weight: 700;
	}
	.src {
		display: block;
		font-family: var(--font-body);
		font-size: 0.8125rem;
		color: var(--ink-2);
		margin-top: 0.15rem;
	}
	.far .val {
		font-weight: 400;
		color: var(--ink-2);
	}
	.hl {
		color: var(--signal);
		font-weight: 700;
	}
	.narrow {
		max-width: 28rem;
		margin-bottom: 0.75rem;
	}
	.wide {
		grid-column: span 2;
	}
	@media (max-width: 40rem) {
		.wide {
			grid-column: auto;
		}
		.heads > div {
			grid-template-columns: 1fr auto;
		}
		.heads dt {
			grid-column: 1 / -1;
		}
	}
</style>
