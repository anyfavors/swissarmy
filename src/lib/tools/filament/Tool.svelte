<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import { DIAMETERS, MATERIALS, cost, gramsPerMetre, gramsToMetres, metresToGrams } from './logic';

	type Dir = 'g' | 'm';
	let density = $state('1.24');
	const mat = $derived(MATERIALS.find((m) => String(m.density) === density.trim())?.id ?? 'custom');
	let dia = $state('1.75');
	let dir = $state<Dir>('g');
	let amount = $state('1000');
	let price = $state('200');
	let spool = $state('1000');
	let printG = $state('42');
	let ready = false;

	const num = (s: string, what: string) => {
		const t = s.trim().replace(',', '.');
		if (!t) throw new Error(`Enter ${what}`);
		const v = Number(t);
		if (!Number.isFinite(v)) throw new Error(`"${s.trim()}" is not a number`);
		return v;
	};

	function run<T>(f: () => T): { ok?: T; error?: string } {
		try {
			return { ok: f() };
		} catch (e) {
			return { error: (e as Error).message };
		}
	}

	function pick(id: string) {
		const m = MATERIALS.find((x) => x.id === id);
		if (m) density = String(m.density);
	}

	const conv = $derived(
		run(() => {
			const d = num(dia, 'a diameter');
			const rho = num(density, 'a density');
			const a = num(amount, dir === 'g' ? 'grams' : 'metres');
			const gpm = gramsPerMetre(d, rho);
			return dir === 'g'
				? { gpm, g: a, m: gramsToMetres(a, d, rho) }
				: { gpm, m: a, g: metresToGrams(a, d, rho) };
		})
	);

	const priced = $derived(
		run(() => {
			const gpm = conv.ok?.gpm;
			if (gpm === undefined) throw new Error('Fix the filament values first');
			return cost(
				num(price, 'a spool price'),
				num(spool, 'a spool weight'),
				num(printG, 'print grams'),
				gpm
			);
		})
	);

	const r = (x: number, p = 4) => String(Number(x.toPrecision(p)));

	onMount(() => {
		const h = readHash();
		if (h.rho) density = h.rho;
		if (h.d) dia = h.d;
		if (h.dir === 'm') dir = 'm';
		if (h.a) amount = h.a;
		if (h.p) price = h.p;
		if (h.sp) spool = h.sp;
		if (h.pg) printG = h.pg;
		ready = true;
	});

	$effect(() => {
		const s = {
			rho: density === '1.24' ? undefined : density,
			d: dia === '1.75' ? undefined : dia,
			dir: dir === 'g' ? undefined : dir,
			a: amount,
			p: price,
			sp: spool,
			pg: printG
		};
		if (ready) writeHash(s);
	});
</script>

<div class="row opts" role="group" aria-label="Material">
	<span class="label">Material</span>
	{#each MATERIALS as m (m.id)}
		<button type="button" aria-pressed={mat === m.id} onclick={() => pick(m.id)}>{m.name}</button>
	{/each}
</div>
<div class="row opts" role="group" aria-label="Diameter">
	<span class="label">Diameter</span>
	{#each DIAMETERS as d (d)}
		<button type="button" aria-pressed={dia === String(d)} onclick={() => (dia = String(d))}
			>{d} mm</button
		>
	{/each}
</div>

<div class="grid">
	<div class="field">
		<label class="label" for="fl-rho">Density g/cm³</label>
		<input id="fl-rho" type="text" inputmode="decimal" bind:value={density} autocomplete="off" />
	</div>
	<div class="field">
		<label class="label" for="fl-dia">Diameter mm</label>
		<input id="fl-dia" type="text" inputmode="decimal" bind:value={dia} autocomplete="off" />
	</div>
</div>

<div class="row opts" role="group" aria-label="Convert">
	<span class="label">Convert</span>
	<button type="button" aria-pressed={dir === 'g'} onclick={() => (dir = 'g')}
		>Grams to metres</button
	>
	<button type="button" aria-pressed={dir === 'm'} onclick={() => (dir = 'm')}
		>Metres to grams</button
	>
</div>
<div class="grid">
	<div class="field">
		<label class="label" for="fl-a">{dir === 'g' ? 'Grams' : 'Metres'}</label>
		<input id="fl-a" type="text" inputmode="decimal" bind:value={amount} autocomplete="off" />
	</div>
</div>

{#if conv.error}
	<p class="error" role="alert">{conv.error}</p>
{:else if conv.ok}
	{@const c = conv.ok}
	<p class="say">{r(c.g)} g = {r(c.m)} m</p>
	<dl class="readout">
		<div>
			<dt>Length</dt>
			<dd>{r(c.m)} m</dd>
			<Copy value={r(c.m)} />
		</div>
		<div>
			<dt>Mass</dt>
			<dd>{r(c.g)} g</dd>
			<Copy value={r(c.g)} />
		</div>
		<div>
			<dt>Per metre</dt>
			<dd>{r(c.gpm)} g/m</dd>
		</div>
		<div>
			<dt>Per kg</dt>
			<dd>{r(1000 / c.gpm)} m</dd>
		</div>
	</dl>
{/if}

<h2 class="label sub">Cost</h2>
<div class="grid">
	<div class="field">
		<label class="label" for="fl-p">Spool price</label>
		<input id="fl-p" type="text" inputmode="decimal" bind:value={price} autocomplete="off" />
	</div>
	<div class="field">
		<label class="label" for="fl-sp">Spool net weight g</label>
		<input id="fl-sp" type="text" inputmode="decimal" bind:value={spool} autocomplete="off" />
	</div>
	<div class="field">
		<label class="label" for="fl-pg">Print weight g</label>
		<input id="fl-pg" type="text" inputmode="decimal" bind:value={printG} autocomplete="off" />
	</div>
</div>
{#if priced.error}
	<p class="error" role="alert">{priced.error}</p>
{:else if priced.ok}
	{@const p = priced.ok}
	<dl class="readout">
		<div>
			<dt>Print</dt>
			<dd>{p.print.toFixed(2)}</dd>
			<Copy value={p.print.toFixed(2)} />
		</div>
		<div>
			<dt>Per gram</dt>
			<dd>{r(p.perGram)}</dd>
		</div>
		<div>
			<dt>Per metre</dt>
			<dd>{r(p.perMetre)}</dd>
		</div>
	</dl>
{/if}

<div class="scroll">
	<table>
		<caption class="label">Typical densities</caption>
		<thead>
			<tr
				><th scope="col">Material</th><th scope="col" class="nt">g/cm³</th><th
					scope="col"
					class="nt">m/kg 1.75</th
				><th scope="col" class="nt">m/kg 2.85</th></tr
			>
		</thead>
		<tbody>
			{#each MATERIALS as m (m.id)}
				<tr>
					<td>{m.name}</td>
					<td class="mono">{m.density}</td>
					<td class="mono">{Math.round(gramsToMetres(1000, 1.75, m.density))}</td>
					<td class="mono">{Math.round(gramsToMetres(1000, 2.85, m.density))}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
<p class="note">
	Mass = density × π (d/2)² × length. Densities are typical values; brands and blends (carbon, silk,
	glass fill) differ, so type the figure from the spool label if you have it. The slicer's weight
	estimate is the print weight to use. Price is in whatever currency you enter. Print time is not
	estimated here: it depends on the slicer settings and the machine.
</p>

<style>
	.opts {
		margin: 0 0 1rem;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
		gap: 0.75rem 1rem;
		margin-bottom: 1rem;
	}
	.say {
		font-size: 1.375rem;
		font-family: var(--font-mono);
		margin: 0 0 1rem;
		padding: 0.5rem 0.75rem;
		border-left: 4px solid var(--signal);
		background: var(--hilite);
		overflow-wrap: anywhere;
	}
	.readout {
		margin-bottom: 1.25rem;
	}
	.sub {
		margin: 1.75rem 0 0.75rem;
	}
	.scroll {
		overflow-x: auto;
		margin-bottom: 1.25rem;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		border-top: 2px solid var(--rule);
		font-size: 0.9375rem;
	}
	caption {
		text-align: left;
		padding-bottom: 0.4rem;
	}
	th,
	td {
		text-align: left;
		padding: 0.4rem 0.75rem 0.4rem 0;
		border-bottom: 1px solid var(--rule-soft);
		white-space: nowrap;
	}
	th {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-2);
		font-weight: 400;
	}
	.note {
		margin: 0 0 1rem;
	}
	.nt {
		text-transform: none;
	}
</style>
