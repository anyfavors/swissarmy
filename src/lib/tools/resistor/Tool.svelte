<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import Bands from './Bands.svelte';
	import {
		allowed,
		colour,
		colours,
		decodeBands,
		decodeSmd,
		encodeBands,
		encodeSmd,
		formatOhms,
		nearest,
		parseValue,
		roles,
		type BandCount,
		type Colour,
		type Series
	} from './logic';

	type Mode = 'bands' | 'value' | 'smd';
	let mode = $state<Mode>('bands');
	let count = $state<BandCount>(4);
	let picked = $state<Colour[]>(['yellow', 'violet', 'black', 'red', 'gold', 'brown']);
	let value = $state('4k7');
	let tol = $state<Colour>('gold');
	let tcr = $state<Colour>('brown');
	let smd = $state('472');
	let ready = false;

	const roleLabel = { digit: 'digit', mult: 'multiplier', tol: 'tolerance', tcr: 'tempco' };
	const seriesList: Series[] = ['E12', 'E24', 'E96'];

	const slots = $derived(roles(count).map((role, i) => ({ role, i })));

	/** picked[] holds digit 1 to 3, multiplier, tolerance and tempco at fixed positions 0 to 5. */
	const pos = (role: string, i: number) =>
		role === 'digit' ? i : role === 'mult' ? 3 : role === 'tol' ? 4 : 5;
	const bandAt = (role: string, i: number) => picked[pos(role, i)];
	function setBand(role: string, i: number, c: Colour) {
		const next = [...picked];
		next[pos(role, i)] = c;
		picked = next;
	}

	const bandList = $derived(slots.map((s) => bandAt(s.role, s.i)));

	const decoded = $derived.by(() => {
		try {
			return { d: decodeBands(bandList) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	const encoded = $derived.by(() => {
		if (!value.trim()) return null;
		try {
			const ohms = parseValue(value);
			const e = encodeBands(ohms, count, count === 3 ? 'none' : tol, tcr);
			return { ohms, e, smd: encodeSmd(ohms) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	const smdResult = $derived.by(() => {
		if (!smd.trim()) return null;
		try {
			return { s: decodeSmd(smd) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	const focusOhms = $derived(
		mode === 'bands' ? decoded.d?.ohms : mode === 'value' ? encoded?.ohms : smdResult?.s?.ohms
	);

	const near = $derived.by(() => {
		const x = focusOhms;
		if (!x || x <= 0) return [];
		return seriesList.map((s) => ({ s, n: nearest(x, s) }));
	});

	function useValue(ohms: number) {
		value = formatOhms(ohms).replace(' Ω', '').replace(' ', '');
		mode = 'value';
	}

	const tolOptions = allowed('tol');
	const tcrOptions = allowed('tcr');

	onMount(() => {
		const h = readHash();
		if (h.m === 'value' || h.m === 'smd' || h.m === 'bands') mode = h.m;
		const n = Number(h.n);
		if (n === 3 || n === 4 || n === 5 || n === 6) count = n;
		if (h.b) {
			const parts = h.b.split('-');
			if (parts.length === 6 && parts.every((p) => colours.some((c) => c.name === p)))
				picked = parts as Colour[];
		}
		if (h.v) value = h.v;
		if (h.t && tolOptions.some((c) => c.name === h.t)) tol = h.t as Colour;
		if (h.c && tcrOptions.some((c) => c.name === h.c)) tcr = h.c as Colour;
		if (h.s) smd = h.s;
		if (h.in) {
			if (/^(\d{3}|\d{2}[A-Z]|\d*R\d+)$/i.test(h.in.trim())) {
				smd = h.in;
				mode = 'smd';
			} else {
				value = h.in;
				mode = 'value';
			}
		}
		ready = true;
	});

	$effect(() => {
		const state = {
			m: mode === 'bands' ? undefined : mode,
			n: count === 4 ? undefined : String(count),
			b: mode === 'bands' ? picked.join('-') : undefined,
			v: mode === 'value' ? value : undefined,
			t: mode === 'value' && tol !== 'gold' ? tol : undefined,
			c: mode === 'value' && count === 6 && tcr !== 'brown' ? tcr : undefined,
			s: mode === 'smd' ? smd : undefined
		};
		if (ready) writeHash(state);
	});
</script>

<div class="row modes" role="group" aria-label="Mode">
	<button type="button" aria-pressed={mode === 'bands'} onclick={() => (mode = 'bands')}
		>Bands to value</button
	>
	<button type="button" aria-pressed={mode === 'value'} onclick={() => (mode = 'value')}
		>Value to bands</button
	>
	<button type="button" aria-pressed={mode === 'smd'} onclick={() => (mode = 'smd')}
		>SMD code</button
	>
</div>

{#if mode !== 'smd'}
	<div class="row counts" role="group" aria-label="Number of bands">
		<span class="label">Bands</span>
		{#each [3, 4, 5, 6] as const as n (n)}
			<button type="button" aria-pressed={count === n} onclick={() => (count = n)}>{n}</button>
		{/each}
	</div>
{/if}

{#if mode === 'bands'}
	<div class="pickers">
		{#each slots as s (s.i)}
			<div class="field">
				<label class="label" for="band-{s.i}">Band {s.i + 1}, {roleLabel[s.role]}</label>
				<select
					id="band-{s.i}"
					value={bandAt(s.role, s.i)}
					onchange={(e) =>
						setBand(s.role, s.i, (e.currentTarget as HTMLSelectElement).value as Colour)}
				>
					{#each allowed(s.role, s.i === 0) as c (c.name)}
						<option value={c.name}
							>{c.label}{s.role === 'digit'
								? ` ${c.digit}`
								: s.role === 'mult'
									? ` ×10^${c.mult}`
									: s.role === 'tol'
										? ` ±${c.tol}%`
										: ` ${c.tcr} ppm/K`}</option
						>
					{/each}
				</select>
			</div>
		{/each}
	</div>

	<Bands
		bands={bandList}
		title={`Resistor with bands ${bandList.map((b) => colour(b).label).join(', ')}`}
	/>

	{#if decoded.error}
		<p class="error" role="alert">{decoded.error}</p>
	{:else if decoded.d}
		{@const d = decoded.d}
		<p class="say">{formatOhms(d.ohms)} ±{d.tol}%{d.tcr ? `, ${d.tcr} ppm/K` : ''}</p>
		<dl class="readout">
			<div>
				<dt>Resistance</dt>
				<dd>{d.ohms} Ω</dd>
				<Copy value={String(d.ohms)} />
			</div>
			<div>
				<dt>Range</dt>
				<dd>{formatOhms(d.min)} to {formatOhms(d.max)}</dd>
			</div>
		</dl>
	{/if}
{:else if mode === 'value'}
	<div class="grid">
		<div class="field">
			<label class="label" for="r-val">Resistance</label>
			<input
				id="r-val"
				type="text"
				bind:value
				spellcheck="false"
				autocomplete="off"
				autocapitalize="off"
			/>
		</div>
		{#if count > 3}
			<div class="field">
				<label class="label" for="r-tol">Tolerance</label>
				<select id="r-tol" bind:value={tol}>
					{#each tolOptions as c (c.name)}
						<option value={c.name}>±{c.tol}% ({c.label})</option>
					{/each}
				</select>
			</div>
		{/if}
		{#if count === 6}
			<div class="field">
				<label class="label" for="r-tcr">Tempco</label>
				<select id="r-tcr" bind:value={tcr}>
					{#each tcrOptions as c (c.name)}
						<option value={c.name}>{c.tcr} ppm/K ({c.label})</option>
					{/each}
				</select>
			</div>
		{/if}
	</div>
	<p class="label hint">Accepts 4k7 · 4.7k · 4700 · 470R · 0R1 · 2M2</p>

	{#if encoded?.error}
		<p class="error" role="alert">{encoded.error}</p>
	{:else if encoded?.e}
		{@const e = encoded.e}
		<Bands
			bands={e.bands}
			title={`Resistor with bands ${e.bands.map((b) => colour(b).label).join(', ')}`}
		/>
		{#if !e.exact}
			<p class="error" role="alert">
				{formatOhms(encoded.ohms)} needs more digits than {count} bands give. The bands show {formatOhms(
					e.shown
				)}.
			</p>
		{/if}
		<dl class="readout">
			<div>
				<dt>Bands</dt>
				<dd>{e.bands.map((b) => colour(b).label).join(' ')}</dd>
				<Copy value={e.bands.map((b) => colour(b).label).join(' ')} />
			</div>
			<div>
				<dt>SMD 3-digit</dt>
				<dd>{encoded.smd.three ?? 'not possible'}</dd>
				<Copy value={encoded.smd.three ?? ''} />
			</div>
			<div>
				<dt>SMD 4-digit</dt>
				<dd>{encoded.smd.four ?? 'not possible'}</dd>
				<Copy value={encoded.smd.four ?? ''} />
			</div>
			<div>
				<dt>SMD EIA-96</dt>
				<dd>{encoded.smd.eia96 ?? 'not an E96 value'}</dd>
				<Copy value={encoded.smd.eia96 ?? ''} />
			</div>
		</dl>
	{/if}
{:else}
	<div class="field">
		<label class="label" for="r-smd">SMD marking</label>
		<input
			id="r-smd"
			type="text"
			bind:value={smd}
			spellcheck="false"
			autocomplete="off"
			autocapitalize="characters"
		/>
	</div>
	<p class="label hint">472 · 4702 · 4R7 · R47 · 01C · 68X</p>
	{#if smdResult?.error}
		<p class="error" role="alert">{smdResult.error}</p>
	{:else if smdResult?.s}
		{@const s = smdResult.s}
		<p class="say">{formatOhms(s.ohms)}</p>
		<dl class="readout">
			<div>
				<dt>Code system</dt>
				<dd>{s.system}</dd>
			</div>
			<div>
				<dt>Resistance</dt>
				<dd>{s.ohms} Ω</dd>
				<Copy value={String(s.ohms)} />
			</div>
			{#if s.alt}
				<div>
					<dt>Or, {s.alt.system}</dt>
					<dd>{formatOhms(s.alt.ohms)}</dd>
				</div>
			{/if}
		</dl>
		{#if s.ohms > 0}
			<p class="row act">
				<button type="button" onclick={() => useValue(s.ohms)}>Show colour bands</button>
			</p>
		{/if}
	{/if}
{/if}

{#if near.length}
	<h2 class="label sub">Nearest preferred values</h2>
	<div class="scroll">
		<table>
			<thead>
				<tr>
					<th scope="col">Series</th>
					<th scope="col">Below</th>
					<th scope="col">Above</th>
					<th scope="col">Nearest</th>
					<th scope="col">Error</th>
				</tr>
			</thead>
			<tbody>
				{#each near as r (r.s)}
					<tr>
						<th scope="row">{r.s}</th>
						<td class="mono">{formatOhms(r.n.below)}</td>
						<td class="mono">{formatOhms(r.n.above)}</td>
						<td class="mono strong">{formatOhms(r.n.nearest)}</td>
						<td class="mono" class:hit={r.n.error === 0}
							>{r.n.error === 0
								? 'exact'
								: `${r.n.error > 0 ? '+' : ''}${r.n.error.toFixed(2)}%`}</td
						>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<p class="note">
	Read from the end with the band closest to a lead. On 4-band parts the tolerance band, usually
	gold, sits apart. Grey is ±0.01% in IEC 60062:2016, older charts list ±0.05%. E12 parts are
	usually ±10%, E24 ±5%, E96 ±1%.
</p>
<p class="note">
	EIA-96 SMD codes are two digits for the E96 value plus a multiplier letter: Z ×0.001, Y or R
	×0.01, X or S ×0.1, A ×1, B or H ×10, C ×100, D ×1k, E ×10k, F ×100k. 01C is 100 × 100 = 10 kΩ.
</p>

<style>
	.modes,
	.counts {
		margin-bottom: 1rem;
	}
	.pickers,
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
		gap: 0.75rem 1rem;
		margin-bottom: 0.5rem;
	}
	.hint {
		margin: 0.35rem 0 0.5rem;
	}
	.say {
		font-size: 1.375rem;
		font-family: var(--font-mono);
		margin: 0.5rem 0 1rem;
		padding: 0.5rem 0.75rem;
		border-left: 4px solid var(--signal);
		background: var(--hilite);
		overflow-wrap: anywhere;
	}
	.error {
		margin: 0.5rem 0 1rem;
	}
	.act {
		margin: 1rem 0;
	}
	.sub {
		margin: 1.75rem 0 0.4rem;
	}
	.scroll {
		overflow-x: auto;
		margin-bottom: 1.5rem;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		border-top: 2px solid var(--rule);
		font-size: 0.9375rem;
	}
	th,
	td {
		text-align: left;
		padding: 0.45rem 0.75rem 0.45rem 0;
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
	.strong {
		font-weight: 700;
	}
	.hit {
		color: var(--signal);
	}
	.note {
		margin: 0 0 0.75rem;
	}
</style>
