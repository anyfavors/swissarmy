<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import { parseValue } from '../resistor/logic';
	import { fmt } from '../ohms-law/logic';
	import { DK_PSH_ESTIMATE, averageCurrent, humanHours, runtime, solar, whToAh } from './logic';

	type Unit = 'mAh' | 'Wh';
	type Draw = 'avg' | 'profile';
	let unit = $state<Unit>('mAh');
	let cap = $state('2000');
	let volts = $state('3.7');
	let derate = $state('80');
	let draw = $state<Draw>('profile');
	let avg = $state('5mA');
	let ia = $state('80mA');
	let ta = $state('2s');
	let isl = $state('15uA');
	let ts = $state('298s');

	let daily = $state('240');
	let psh = $state('1');
	let days = $state('3');
	let dod = $state('50');
	let sysV = $state('12');
	let eff = $state('75');
	let ready = false;

	const A = ['A', 'amp', 'amps'];
	const S = ['s', 'sec'];
	const num = (s: string, what: string) => {
		const t = s.trim().replace(',', '.').replace(/\s*%$/, '');
		if (!t) throw new Error(`Enter ${what}`);
		const v = Number(t);
		if (!Number.isFinite(v)) throw new Error(`"${s.trim()}" is not a number`);
		return v;
	};
	const qty = (s: string, u: string[], what: string) => {
		if (!s.trim()) throw new Error(`Enter ${what}`);
		return parseValue(s, u);
	};

	function run<T>(f: () => T): { ok?: T; error?: string } {
		try {
			return { ok: f() };
		} catch (e) {
			return { error: (e as Error).message };
		}
	}

	const life = $derived(
		run(() => {
			const c = num(cap, 'a capacity');
			const v = volts.trim() ? num(volts, 'a voltage') : undefined;
			const ah = unit === 'mAh' ? c / 1000 : whToAh(c, v ?? 0);
			const I =
				draw === 'avg'
					? qty(avg, A, 'an average current')
					: averageCurrent([
							{ current: qty(ia, A, 'the active current'), time: qty(ta, S, 'the active time') },
							{ current: qty(isl, A, 'the sleep current'), time: qty(ts, S, 'the sleep time') }
						]);
			const r = runtime(ah, I, num(derate, 'a derating factor') / 100, v);
			return { ...r, I, ah, v };
		})
	);

	const sol = $derived(
		run(() =>
			solar(
				num(daily, 'daily Wh'),
				num(psh, 'peak sun hours'),
				num(days, 'days of autonomy'),
				num(dod, 'depth of discharge') / 100,
				num(sysV, 'a system voltage'),
				num(eff, 'an efficiency') / 100
			)
		)
	);

	onMount(() => {
		const h = readHash();
		if (h.u === 'Wh') unit = 'Wh';
		if (h.cap) cap = h.cap;
		if (h.v !== undefined) volts = h.v;
		if (h.der) derate = h.der;
		if (h.dr === 'avg') draw = 'avg';
		if (h.avg) avg = h.avg;
		if (h.ia) ia = h.ia;
		if (h.ta) ta = h.ta;
		if (h.is) isl = h.is;
		if (h.ts) ts = h.ts;
		if (h.wh) daily = h.wh;
		if (h.psh) psh = h.psh;
		if (h.days) days = h.days;
		if (h.dod) dod = h.dod;
		if (h.sv) sysV = h.sv;
		if (h.eff) eff = h.eff;
		ready = true;
	});

	$effect(() => {
		const s = {
			u: unit === 'mAh' ? undefined : unit,
			cap,
			v: volts,
			der: derate,
			dr: draw === 'profile' ? undefined : draw,
			avg: draw === 'avg' ? avg : undefined,
			ia: draw === 'profile' ? ia : undefined,
			ta: draw === 'profile' ? ta : undefined,
			is: draw === 'profile' ? isl : undefined,
			ts: draw === 'profile' ? ts : undefined,
			wh: daily,
			psh,
			days,
			dod,
			sv: sysV,
			eff
		};
		if (ready) writeHash(s);
	});
</script>

<h2 class="label sub first">Battery life</h2>
<div class="row opts" role="group" aria-label="Capacity unit">
	<span class="label">Capacity in</span>
	{#each ['mAh', 'Wh'] as const as u (u)}
		<button type="button" aria-pressed={unit === u} onclick={() => (unit = u)}>{u}</button>
	{/each}
</div>
<div class="grid">
	<div class="field">
		<label class="label nt" for="bt-cap">Capacity {unit}</label>
		<input id="bt-cap" type="text" inputmode="decimal" bind:value={cap} autocomplete="off" />
	</div>
	<div class="field">
		<label class="label" for="bt-v">Nominal voltage V</label>
		<input id="bt-v" type="text" inputmode="decimal" bind:value={volts} autocomplete="off" />
	</div>
	<div class="field">
		<label class="label" for="bt-der">Usable capacity %</label>
		<input id="bt-der" type="text" inputmode="decimal" bind:value={derate} autocomplete="off" />
	</div>
</div>

<div class="row opts" role="group" aria-label="Load">
	<span class="label">Load</span>
	<button type="button" aria-pressed={draw === 'profile'} onclick={() => (draw = 'profile')}
		>Sleep and active</button
	>
	<button type="button" aria-pressed={draw === 'avg'} onclick={() => (draw = 'avg')}
		>Average current</button
	>
</div>
{#if draw === 'avg'}
	<div class="grid">
		<div class="field">
			<label class="label" for="bt-avg">Average current</label>
			<input id="bt-avg" type="text" bind:value={avg} spellcheck="false" autocomplete="off" />
		</div>
	</div>
{:else}
	<div class="grid">
		<div class="field">
			<label class="label" for="bt-ia">Active current</label>
			<input id="bt-ia" type="text" bind:value={ia} spellcheck="false" autocomplete="off" />
		</div>
		<div class="field">
			<label class="label" for="bt-ta">Active time per cycle</label>
			<input id="bt-ta" type="text" bind:value={ta} spellcheck="false" autocomplete="off" />
		</div>
		<div class="field">
			<label class="label" for="bt-is">Sleep current</label>
			<input id="bt-is" type="text" bind:value={isl} spellcheck="false" autocomplete="off" />
		</div>
		<div class="field">
			<label class="label" for="bt-ts">Sleep time per cycle</label>
			<input id="bt-ts" type="text" bind:value={ts} spellcheck="false" autocomplete="off" />
		</div>
	</div>
{/if}

{#if life.error}
	<p class="error" role="alert">{life.error}</p>
{:else if life.ok}
	{@const l = life.ok}
	<p class="say">{humanHours(l.hours)}</p>
	<dl class="readout">
		<div>
			<dt>Runtime</dt>
			<dd>{Number(l.hours.toPrecision(4))} h</dd>
			<Copy value={String(Number(l.hours.toPrecision(4)))} />
		</div>
		<div>
			<dt>Average current</dt>
			<dd>{fmt(l.I, 'A')}</dd>
		</div>
		<div>
			<dt>Capacity</dt>
			<dd>
				{fmt(l.ah, 'Ah')}{l.wh !== undefined ? `, ${Number(l.wh.toPrecision(4))} Wh` : ''}
			</dd>
		</div>
		<div>
			<dt>Usable after derating</dt>
			<dd>{fmt(l.usableAh, 'Ah')}</dd>
		</div>
		{#if l.v}
			<div>
				<dt>Average power</dt>
				<dd>{fmt(l.I * l.v, 'W')}</dd>
			</div>
		{/if}
	</dl>
{/if}
<p class="note">
	Units: 15uA, 80mA, 2s, 1ms. Usable capacity covers cold, ageing, the cutoff voltage and
	self-discharge; 70 to 85 % is a common planning figure. Coin cells and alkalines deliver far less
	than rated at high pulse currents, and self-discharge dominates when the average is a few µA.
</p>

<h2 class="label sub">Solar, off-grid</h2>
<div class="grid">
	<div class="field">
		<label class="label" for="so-wh">Daily use Wh</label>
		<input id="so-wh" type="text" inputmode="decimal" bind:value={daily} autocomplete="off" />
	</div>
	<div class="field">
		<label class="label" for="so-psh">Peak sun hours</label>
		<input id="so-psh" type="text" inputmode="decimal" bind:value={psh} autocomplete="off" />
	</div>
	<div class="field">
		<label class="label" for="so-days">Days of autonomy</label>
		<input id="so-days" type="text" inputmode="decimal" bind:value={days} autocomplete="off" />
	</div>
	<div class="field">
		<label class="label" for="so-dod">Depth of discharge %</label>
		<input id="so-dod" type="text" inputmode="decimal" bind:value={dod} autocomplete="off" />
	</div>
	<div class="field">
		<label class="label" for="so-v">System voltage V</label>
		<input id="so-v" type="text" inputmode="decimal" bind:value={sysV} autocomplete="off" />
	</div>
	<div class="field">
		<label class="label" for="so-eff">System efficiency %</label>
		<input id="so-eff" type="text" inputmode="decimal" bind:value={eff} autocomplete="off" />
	</div>
</div>
{#if sol.error}
	<p class="error" role="alert">{sol.error}</p>
{:else if sol.ok}
	{@const s = sol.ok}
	<p class="say">{Math.ceil(s.panelW)} W panel, {Math.ceil(s.batteryAh)} Ah at {sysV} V</p>
	<dl class="readout">
		<div>
			<dt>Panel, peak watts</dt>
			<dd>{Number(s.panelW.toPrecision(4))} W</dd>
			<Copy value={String(Math.ceil(s.panelW))} />
		</div>
		<div>
			<dt>Battery energy</dt>
			<dd>{Number(s.batteryWh.toPrecision(4))} Wh</dd>
		</div>
		<div>
			<dt>Battery capacity</dt>
			<dd>{Number(s.batteryAh.toPrecision(4))} Ah</dd>
			<Copy value={String(Math.ceil(s.batteryAh))} />
		</div>
	</dl>
{/if}
<p class="note">
	Panel W = daily Wh / (sun hours × efficiency). Battery Wh = daily Wh × days / depth of discharge.
	Peak sun hours are kWh/m² per day on the panel for the worst month you design for. For Denmark, as
	a rough estimate for a south-facing panel at 35 to 45°: winter about {DK_PSH_ESTIMATE.winter},
	summer about {DK_PSH_ESTIMATE.summer}, year average {DK_PSH_ESTIMATE.year}. These are estimates,
	not data; look up your site in PVGIS (EU Joint Research Centre). Depth of discharge: about 50 %
	for lead-acid, 80 % or more for LiFePO4.
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
	.first {
		margin-top: 0;
	}
	.note {
		margin: 0 0 1rem;
	}
	.nt {
		text-transform: none;
	}
</style>
