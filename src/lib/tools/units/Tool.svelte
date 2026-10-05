<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		fmt,
		fromSi,
		mixed,
		parseQuantity,
		plain,
		quantities,
		table,
		temperatureWarning,
		type Parsed
	} from './logic';

	let input = $state('5 ft 11 in');
	let ready = false;

	const parsed = $derived.by((): { p?: Parsed; error?: string } => {
		if (!input.trim()) return {};
		try {
			return { p: parseQuantity(input) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	const rows = $derived(parsed.p ? table(parsed.p.quantity, parsed.p.si) : []);
	const mix = $derived(parsed.p ? mixed(parsed.p.quantity, parsed.p.si) : null);
	const warn = $derived(parsed.p ? temperatureWarning(parsed.p) : null);
	const inputUnits = $derived(new Set(parsed.p?.terms.map((t) => t.unit.id) ?? []));

	function choose(id: string) {
		const q = quantities.find((x) => x.id === id)!;
		if (parsed.p?.quantity.id === id) return;
		input = `1 ${q.defaultUnit}`;
	}

	onMount(() => {
		const h = readHash();
		if (h.in !== undefined) input = h.in;
		ready = true;
	});

	$effect(() => {
		const state = { in: input };
		if (ready) writeHash(state);
	});
</script>

<div class="field">
	<label class="label" for="un-in">Quantity</label>
	<input
		id="un-in"
		type="text"
		bind:value={input}
		spellcheck="false"
		autocomplete="off"
		aria-invalid={!!parsed.error}
		aria-describedby={parsed.error ? 'un-err' : 'un-hint'}
	/>
	<p class="label hint" id="un-hint">
		Accepts 5 ft 11 in · 72 °F · 3 mi to km · 1,5 kWh · 12°30′ · 100 Mbps · 2 lb 3 oz
	</p>
</div>

<div class="row opts" role="group" aria-label="Quantity">
	{#each quantities as q (q.id)}
		<button type="button" aria-pressed={parsed.p?.quantity.id === q.id} onclick={() => choose(q.id)}
			>{q.name}</button
		>
	{/each}
</div>

{#if parsed.error}
	<p class="error" id="un-err" role="alert">{parsed.error}</p>
{:else if parsed.p}
	{@const p = parsed.p}
	<p class="read">
		<span class="label">Read as</span>
		<span class="mono">{p.readAs}</span>
		<span class="label">{p.quantity.name}</span>
	</p>
	{#if warn}<p class="note warn">{warn}</p>{/if}
	{#if p.target}
		{@const v = fromSi(p.si, p.target)}
		<dl class="readout target">
			<div>
				<dt>{p.target.name}</dt>
				<dd class="hl">{fmt(v)} {p.target.symbol}</dd>
				<Copy value={plain(v)} />
			</div>
		</dl>
	{/if}
	{#if mix}
		<dl class="readout target">
			<div>
				<dt>Mixed</dt>
				<dd>{mix}</dd>
				<Copy value={mix} />
			</div>
		</dl>
	{/if}

	<h2 class="label head">All units of {p.quantity.name.toLowerCase()}</h2>
	<dl class="readout units">
		{#each rows as r (r.unit.id)}
			<div class:mark={inputUnits.has(r.unit.id) || p.target?.id === r.unit.id}>
				<dt>
					<span class="sym">{r.unit.symbol}</span>
					<span class="name"
						>{r.unit.name}{#if r.unit.def}<span class="def"> · {r.unit.def}</span>{/if}</span
					>
				</dt>
				<dd>{fmt(r.value)}</dd>
				<Copy value={plain(r.value)} />
			</div>
		{/each}
	</dl>
{/if}

<p class="note end">
	Definitions are exact where a standard fixes them: inch 25.4 mm and pound 0.45359237 kg (1959
	international agreement), US gallon 231 in³, imperial gallon 4.54609 L. Calorie means the
	thermochemical calorie, 4.184 J; kcal is the food Calorie. BTU is the International Table BTU,
	1055.05585262 J. hp is mechanical horsepower (550 ft·lbf/s), PS and hk are metric (75 kgf·m/s).
	mmHg and inHg are the conventional values. Plain gal, pt and fl oz are US; write imp gal for
	imperial. Temperatures convert as readings, not differences: a change of 1 °C is a change of 1.8
	°F. A comma between digits is a decimal comma.
</p>

<style>
	.hint {
		margin: 0;
		text-transform: none;
		letter-spacing: 0.02em;
		overflow-wrap: anywhere;
	}
	input[aria-invalid='true'] {
		border-color: var(--signal);
	}
	.opts {
		margin: 0.75rem 0;
	}
	.read {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.75rem;
		align-items: baseline;
		margin: 1rem 0 0.75rem;
		overflow-wrap: anywhere;
	}
	.warn {
		border-left-color: var(--signal);
		margin-bottom: 0.75rem;
	}
	.target {
		margin-bottom: 0.75rem;
	}
	.target dt {
		text-transform: none;
		letter-spacing: 0.02em;
	}
	.hl {
		color: var(--signal);
		font-weight: 700;
	}
	.head {
		margin: 1.5rem 0 0.5rem;
	}
	.units dt {
		text-transform: none;
		letter-spacing: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0 0.6rem;
		align-items: baseline;
	}
	.sym {
		color: var(--ink);
		font-size: 0.9375rem;
		font-weight: 700;
		min-width: 4.5rem;
	}
	.name {
		font-family: var(--font-body);
		font-size: 0.8125rem;
	}
	.def {
		color: var(--ink-2);
	}
	.units > div.mark {
		background: var(--hilite);
	}
	.units > div.mark dd {
		font-weight: 700;
	}
	.end {
		margin-top: 1.5rem;
	}
</style>
