<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		METALS,
		METRIC,
		SYSTEMS,
		areaFromDiameter,
		awgDiameter,
		awgName,
		awgTable,
		drop,
		minArea,
		ohmsPerKm,
		parseAwg,
		size,
		type Metal,
		type System
	} from './logic';

	type By = 'mm2' | 'awg' | 'dia';
	const bys: { id: By; label: string }[] = [
		{ id: 'mm2', label: 'mm²' },
		{ id: 'awg', label: 'AWG' },
		{ id: 'dia', label: 'Diameter' }
	];
	let by = $state<By>('mm2');
	let sizeIn = $state('2.5');
	let metal = $state<Metal>('cu');
	let temp = $state('20');
	let system = $state<System>('ac1');
	let length = $state('20');
	let current = $state('16');
	let supply = $state('230');
	let maxPct = $state('3');
	let ready = false;

	const n = (s: string) => {
		const t = s.trim().replace(',', '.');
		if (!t) return undefined;
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

	const tempC = $derived(run(() => n(temp) ?? 20));

	const sz = $derived(
		run(() => {
			let area: number;
			if (by === 'awg') area = areaFromDiameter(awgDiameter(parseAwg(sizeIn)));
			else {
				const v = n(sizeIn);
				if (v === undefined) throw new Error('Enter a size');
				area = by === 'mm2' ? v : areaFromDiameter(v);
			}
			const s = size(area);
			const t = tempC.ok ?? 20;
			return { s, rkm: ohmsPerKm(area, metal, t), t };
		})
	);

	const dr = $derived(
		run(() => {
			if (!sz.ok) throw new Error('Enter a valid size first');
			const L = n(length);
			const I = n(current);
			const V = n(supply);
			if (L === undefined || I === undefined || V === undefined)
				throw new Error('Enter length, current and supply voltage');
			return drop(system, L, I, sz.ok.s.area, V, metal, sz.ok.t);
		})
	);

	const need = $derived(
		run(() => {
			const L = n(length);
			const I = n(current);
			const V = n(supply);
			const p = n(maxPct);
			if (L === undefined || I === undefined || V === undefined || p === undefined)
				return undefined;
			return minArea(system, L, I, V, p, metal, tempC.ok ?? 20);
		})
	);

	const verdictText = {
		ok: 'Within 3 %, fine for lighting and other loads',
		'lighting-high': 'Over 3 %: too much for lighting, within 5 % for other loads',
		high: 'Over 5 %: use a larger cross-section or a shorter run'
	};

	const table = awgTable(-3, 30);
	const f3 = (x: number) => Number(x.toPrecision(4)).toString();

	function setSystem(s: System) {
		const defaults: Record<System, string> = { dc: '12', ac1: '230', ac3: '400' };
		if (Object.values(defaults).includes(supply.trim())) supply = defaults[s];
		system = s;
	}

	onMount(() => {
		const h = readHash();
		if (bys.some((b) => b.id === h.by)) by = h.by as By;
		if (h.size) sizeIn = h.size;
		if (h.mt === 'al') metal = 'al';
		if (h.t) temp = h.t;
		if (h.sys && h.sys in SYSTEMS) system = h.sys as System;
		if (h.l) length = h.l;
		if (h.i) current = h.i;
		if (h.v) supply = h.v;
		if (h.max) maxPct = h.max;
		ready = true;
	});

	$effect(() => {
		const s = {
			by: by === 'mm2' ? undefined : by,
			size: sizeIn,
			mt: metal === 'cu' ? undefined : metal,
			t: temp === '20' ? undefined : temp,
			sys: system,
			l: length,
			i: current,
			v: supply,
			max: maxPct === '3' ? undefined : maxPct
		};
		if (ready) writeHash(s);
	});
</script>

<div class="row opts" role="group" aria-label="Enter size as">
	<span class="label">Size as</span>
	{#each bys as b (b.id)}
		<button type="button" aria-pressed={by === b.id} onclick={() => (by = b.id)}>{b.label}</button>
	{/each}
</div>
<div class="row opts" role="group" aria-label="Conductor">
	<span class="label">Conductor</span>
	{#each Object.entries(METALS) as [id, m] (id)}
		<button type="button" aria-pressed={metal === id} onclick={() => (metal = id as Metal)}
			>{m.name}</button
		>
	{/each}
</div>

<div class="grid">
	<div class="field">
		<label class="label" for="w-size"
			>{by === 'mm2'
				? 'Cross-section mm²'
				: by === 'awg'
					? 'AWG (e.g. 12, 1/0)'
					: 'Diameter mm'}</label
		>
		<input id="w-size" type="text" bind:value={sizeIn} spellcheck="false" autocomplete="off" />
	</div>
	<div class="field">
		<label class="label" for="w-temp">Conductor temperature °C</label>
		<input id="w-temp" type="text" inputmode="decimal" bind:value={temp} autocomplete="off" />
	</div>
</div>

{#if sz.error}
	<p class="error" role="alert">{sz.error}</p>
{:else if tempC.error}
	<p class="error" role="alert">{tempC.error}</p>
{:else if sz.ok}
	{@const s = sz.ok.s}
	<dl class="readout">
		<div>
			<dt>Cross-section</dt>
			<dd>{f3(s.area)} mm²</dd>
			<Copy value={f3(s.area)} />
		</div>
		<div>
			<dt>Diameter, solid</dt>
			<dd>{f3(s.diameter)} mm</dd>
		</div>
		<div>
			<dt>AWG</dt>
			<dd>
				{s.awg.toFixed(2)}, nearest {awgName(s.awgNearest)}{s.awgUp !== s.awgNearest
					? `, ${awgName(s.awgUp)} or larger to not go under`
					: ''}
			</dd>
		</div>
		<div>
			<dt>IEC 60228 size</dt>
			<dd>
				nearest {s.metricNearest} mm²{s.metricUp !== undefined && s.metricUp !== s.metricNearest
					? `, ${s.metricUp} mm² to not go under`
					: ''}
			</dd>
		</div>
		<div>
			<dt>Resistance at {sz.ok.t} °C</dt>
			<dd>{f3(sz.ok.rkm)} Ω/km, {f3(sz.ok.rkm)} mΩ/m</dd>
			<Copy value={f3(sz.ok.rkm)} />
		</div>
	</dl>
{/if}

<h2 class="label sub">Voltage drop</h2>
<div class="row opts" role="group" aria-label="System">
	{#each Object.entries(SYSTEMS) as [id, s] (id)}
		<button type="button" aria-pressed={system === id} onclick={() => setSystem(id as System)}
			>{s.name}</button
		>
	{/each}
</div>
<div class="grid">
	<div class="field">
		<label class="label" for="w-len">Length one way, m</label>
		<input id="w-len" type="text" inputmode="decimal" bind:value={length} autocomplete="off" />
	</div>
	<div class="field">
		<label class="label" for="w-i">Current A</label>
		<input id="w-i" type="text" inputmode="decimal" bind:value={current} autocomplete="off" />
	</div>
	<div class="field">
		<label class="label" for="w-v">{system === 'ac3' ? 'Supply V, line to line' : 'Supply V'}</label
		>
		<input id="w-v" type="text" inputmode="decimal" bind:value={supply} autocomplete="off" />
	</div>
</div>

{#if dr.error}
	<p class="error" role="alert">{dr.error}</p>
{:else if dr.ok}
	{@const d = dr.ok}
	<p class="say" class:bad={d.verdict !== 'ok'}>
		{f3(d.volts)} V drop, {d.pct.toFixed(2)} %
	</p>
	<dl class="readout">
		<div>
			<dt>Drop</dt>
			<dd>{f3(d.volts)} V</dd>
			<Copy value={f3(d.volts)} />
		</div>
		<div>
			<dt>Percent of supply</dt>
			<dd>{d.pct.toFixed(2)} %</dd>
		</div>
		<div>
			<dt>Verdict</dt>
			<dd>{verdictText[d.verdict]}</dd>
		</div>
		<div>
			<dt>Voltage at load</dt>
			<dd>{f3(d.vLoad)} V</dd>
		</div>
		<div>
			<dt>Loss in cable</dt>
			<dd>{f3(d.watts)} W</dd>
		</div>
		<div>
			<dt>Counted as</dt>
			<dd>{SYSTEMS[system].factorText}</dd>
		</div>
	</dl>
{/if}

<div class="grid">
	<div class="field">
		<label class="label" for="w-max">Allowed drop %</label>
		<input id="w-max" type="text" inputmode="decimal" bind:value={maxPct} autocomplete="off" />
	</div>
</div>
{#if need.error}
	<p class="error" role="alert">{need.error}</p>
{:else if need.ok}
	<dl class="readout">
		<div>
			<dt>Minimum cross-section</dt>
			<dd>
				{f3(need.ok.exact)} mm², use {need.ok.standard !== undefined
					? `${need.ok.standard} mm²`
					: `more than ${METRIC[METRIC.length - 1]} mm² or parallel runs`}
			</dd>
		</div>
	</dl>
{/if}

<p class="note">
	Length is one way. DC and single-phase drop over both conductors, so the tool uses 2 × length.
	Three-phase uses √3 × length with the line-to-line voltage, for a balanced load. Resistance only:
	reactance and power factor are ignored, which is close for small cables. Copper is annealed
	copper, 1/58 Ω·mm²/m at 20 °C (IEC 60028); aluminium 0.028264 Ω·mm²/m (IEC 60889). A loaded PVC
	cable runs near 70 °C, about 20 % more resistance than at 20 °C.
</p>
<p class="note">
	Verdict uses the guide values in IEC 60364-5-52 Annex G (in Denmark DS/HD 60364-5-52): 3 % for
	lighting, 5 % for other loads, from the public supply. Current rating (ampacity) is not given
	here: it depends on installation method, grouping, insulation and ambient temperature, and is set
	by the installation standards, in Denmark and Europe the HD 60364 series. Ask an authorised
	electrician.
</p>

<details>
	<summary class="label">AWG table, copper at 20 °C</summary>
	<div class="scroll">
		<table>
			<thead>
				<tr
					><th scope="col">AWG</th><th scope="col">Ø mm</th><th scope="col">mm²</th><th scope="col"
						>Ω/km Cu</th
					></tr
				>
			</thead>
			<tbody>
				{#each table as r (r.n)}
					<tr>
						<td class="mono">{r.name}</td>
						<td class="mono">{r.d.toFixed(3)}</td>
						<td class="mono">{f3(r.a)}</td>
						<td class="mono">{f3(r.cu)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</details>

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
		border-left: 4px solid var(--rule);
		overflow-wrap: anywhere;
	}
	.say.bad {
		border-left-color: var(--signal);
		background: var(--hilite);
	}
	.readout {
		margin-bottom: 1.25rem;
	}
	.sub {
		margin: 1.75rem 0 0.75rem;
	}
	.note {
		margin: 0 0 1rem;
	}
	details {
		margin: 1rem 0;
	}
	summary {
		cursor: pointer;
		min-height: 2.75rem;
		display: flex;
		align-items: center;
	}
	.scroll {
		overflow-x: auto;
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
		padding: 0.35rem 0.75rem 0.35rem 0;
		border-bottom: 1px solid var(--rule-soft);
	}
	th {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-2);
		font-weight: 400;
	}
</style>
