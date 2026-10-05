<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import type { Series } from '../resistor/logic';
	import { astable, fmt, monostable, parsePct, parseValue, solveAstable, solveMono } from './logic';

	type Mode = 'astable' | 'solve' | 'mono';
	const modes: { id: Mode; label: string }[] = [
		{ id: 'astable', label: 'Astable' },
		{ id: 'solve', label: 'Pick parts' },
		{ id: 'mono', label: 'Monostable' }
	];
	const seriesList: Series[] = ['E12', 'E24', 'E96'];
	let mode = $state<Mode>('astable');

	let r1 = $state('1k');
	let r2 = $state('10k');
	let c = $state('10n');
	let diode = $state(false);

	let sf = $state('1k');
	let sd = $state('60');
	let sc = $state('100n');
	let series = $state<Series>('E24');

	let mr = $state('100k');
	let mc = $state('10u');
	let mt = $state('1');
	let ready = false;

	const R = ['ohm', 'ohms', 'Ω', 'Ω', 'R'];
	const F = ['F'];
	const num = (s: string, u: string[]) => (s.trim() ? parseValue(s, u) : undefined);

	function run<T>(f: () => T): { ok?: T; error?: string } {
		try {
			return { ok: f() };
		} catch (e) {
			return { error: (e as Error).message };
		}
	}

	const ast = $derived(
		run(() => {
			const a = num(r1, R);
			const b = num(r2, R);
			const cc = num(c, F);
			if (a === undefined || b === undefined || cc === undefined)
				throw new Error('Enter R1, R2 and C');
			return astable(a, b, cc, diode);
		})
	);

	const pick = $derived(
		run(() => {
			const f = num(sf, ['Hz']);
			const d = parsePct(sd);
			const cc = num(sc, F);
			if (f === undefined || d === undefined || cc === undefined)
				throw new Error('Enter frequency, duty and C');
			return solveAstable(f, d, cc, series);
		})
	);

	const mono = $derived(
		run(() => {
			const r = num(mr, R);
			const cc = num(mc, F);
			if (r === undefined || cc === undefined) throw new Error('Enter R and C');
			return monostable(r, cc);
		})
	);

	const monoSolve = $derived(
		run(() => {
			const t = num(mt, ['s']);
			const cc = num(mc, F);
			if (t === undefined || cc === undefined) return undefined;
			return solveMono(t, cc, series);
		})
	);

	const compact = (x: number) => fmt(x, '').replace(' ', '');

	function usePicked() {
		if (!pick.ok) return;
		r1 = compact(pick.ok.r1n);
		r2 = compact(pick.ok.r2n);
		c = sc;
		diode = pick.ok.diode;
		mode = 'astable';
	}

	onMount(() => {
		const h = readHash();
		if (modes.some((m) => m.id === h.m)) mode = h.m as Mode;
		if (h.r1) r1 = h.r1;
		if (h.r2) r2 = h.r2;
		if (h.c) c = h.c;
		if (h.d === '1') diode = true;
		if (h.f) sf = h.f;
		if (h.duty) sd = h.duty;
		if (h.sc) sc = h.sc;
		if (seriesList.includes(h.s as Series)) series = h.s as Series;
		if (h.mr) mr = h.mr;
		if (h.mc) mc = h.mc;
		if (h.mt) mt = h.mt;
		ready = true;
	});

	$effect(() => {
		const s: Record<string, string | undefined> = { m: mode === 'astable' ? undefined : mode };
		if (mode === 'astable') Object.assign(s, { r1, r2, c, d: diode ? '1' : undefined });
		if (mode === 'solve')
			Object.assign(s, { f: sf, duty: sd, sc, s: series === 'E24' ? undefined : series });
		if (mode === 'mono') Object.assign(s, { mr, mc, mt, s: series === 'E24' ? undefined : series });
		if (ready) writeHash(s);
	});
</script>

<div class="row modes" role="group" aria-label="Circuit">
	{#each modes as m (m.id)}
		<button type="button" aria-pressed={mode === m.id} onclick={() => (mode = m.id)}
			>{m.label}</button
		>
	{/each}
</div>

{#if mode === 'astable'}
	<div class="grid">
		<div class="field">
			<label class="label" for="t5-r1">R1 (Vcc to pin 7)</label>
			<input id="t5-r1" type="text" bind:value={r1} spellcheck="false" autocomplete="off" />
		</div>
		<div class="field">
			<label class="label" for="t5-r2">R2 (pin 7 to pins 2, 6)</label>
			<input id="t5-r2" type="text" bind:value={r2} spellcheck="false" autocomplete="off" />
		</div>
		<div class="field">
			<label class="label" for="t5-c">C (pins 2, 6 to ground)</label>
			<input id="t5-c" type="text" bind:value={c} spellcheck="false" autocomplete="off" />
		</div>
	</div>
	<div class="row opts">
		<button type="button" aria-pressed={diode} onclick={() => (diode = !diode)}
			>Diode across R2</button
		>
	</div>
	{#if ast.error}
		<p class="error" role="alert">{ast.error}</p>
	{:else if ast.ok}
		{@const a = ast.ok}
		<p class="say">{fmt(a.freq, 'Hz')}, {a.duty.toFixed(1)} % duty</p>
		<dl class="readout">
			<div>
				<dt>Frequency</dt>
				<dd>{fmt(a.freq, 'Hz')}</dd>
				<Copy value={String(a.freq)} />
			</div>
			<div>
				<dt>Duty cycle</dt>
				<dd>{a.duty.toFixed(2)} %</dd>
			</div>
			<div>
				<dt>High time</dt>
				<dd>{fmt(a.high, 's')}</dd>
			</div>
			<div>
				<dt>Low time</dt>
				<dd>{fmt(a.low, 's')}</dd>
			</div>
			<div>
				<dt>Period</dt>
				<dd>{fmt(a.period, 's')}</dd>
			</div>
		</dl>
	{/if}
	<ul class="formulas mono">
		<li>tH = 0.693 × ({diode ? 'R1' : 'R1 + R2'}) × C</li>
		<li>tL = 0.693 × R2 × C</li>
		<li>f = 1 / (tH + tL){diode ? '' : ' = 1.44 / ((R1 + 2 R2) × C)'}</li>
		<li>duty = tH / (tH + tL){diode ? '' : ' = (R1 + R2) / (R1 + 2 R2)'}</li>
	</ul>
	<p class="note">
		C charges through R1 and R2 but discharges through R2 only, so the plain circuit is always above
		50 % duty. A diode across R2 (anode at pin 7) bypasses R2 while charging, so tH depends on R1
		only and any duty is possible. The diode drop makes the real tH a little longer.
	</p>
{:else if mode === 'solve'}
	<div class="grid">
		<div class="field">
			<label class="label" for="t5-f">Frequency</label>
			<input id="t5-f" type="text" bind:value={sf} spellcheck="false" autocomplete="off" />
		</div>
		<div class="field">
			<label class="label" for="t5-d">Duty cycle %</label>
			<input id="t5-d" type="text" bind:value={sd} spellcheck="false" autocomplete="off" />
		</div>
		<div class="field">
			<label class="label" for="t5-sc">C (pick one you have)</label>
			<input id="t5-sc" type="text" bind:value={sc} spellcheck="false" autocomplete="off" />
		</div>
	</div>
	<div class="row opts" role="group" aria-label="Resistor series">
		<span class="label">Series</span>
		{#each seriesList as s (s)}
			<button type="button" aria-pressed={series === s} onclick={() => (series = s)}>{s}</button>
		{/each}
	</div>
	{#if pick.error}
		<p class="error" role="alert">{pick.error}</p>
	{:else if pick.ok}
		{@const p = pick.ok}
		<p class="say">
			R1 {fmt(p.r1n, 'Ω')}, R2 {fmt(p.r2n, 'Ω')}{p.diode ? ', diode across R2' : ''}
		</p>
		<dl class="readout">
			<div>
				<dt>R1 exact / {series}</dt>
				<dd>{fmt(p.r1, 'Ω')} / {fmt(p.r1n, 'Ω')}</dd>
				<Copy value={String(p.r1n)} />
			</div>
			<div>
				<dt>R2 exact / {series}</dt>
				<dd>{fmt(p.r2, 'Ω')} / {fmt(p.r2n, 'Ω')}</dd>
				<Copy value={String(p.r2n)} />
			</div>
			<div>
				<dt>Gives</dt>
				<dd>{fmt(p.actual.freq, 'Hz')}, {p.actual.duty.toFixed(1)} % duty</dd>
				<button type="button" class="use" onclick={usePicked}>Use</button>
			</div>
		</dl>
		{#each p.warnings as w (w)}
			<p class="note warn">{w}</p>
		{/each}
	{/if}
	<p class="note">
		R2 = tL / (0.693 C) and R1 = tH / (0.693 C) − R2, from tH = duty / f and tL = (1 − duty) / f.
		Keep R1 and R2 between about 1 kΩ and 1 MΩ; change C to get there. Capacitor tolerance (often 10
		% or worse) dominates the error.
	</p>
{:else}
	<div class="grid">
		<div class="field">
			<label class="label" for="t5-mr">R (Vcc to pins 6, 7)</label>
			<input id="t5-mr" type="text" bind:value={mr} spellcheck="false" autocomplete="off" />
		</div>
		<div class="field">
			<label class="label" for="t5-mc">C (pins 6, 7 to ground)</label>
			<input id="t5-mc" type="text" bind:value={mc} spellcheck="false" autocomplete="off" />
		</div>
	</div>
	{#if mono.error}
		<p class="error" role="alert">{mono.error}</p>
	{:else if mono.ok}
		<p class="say">tw = {fmt(mono.ok.width, 's')}</p>
		<dl class="readout">
			<div>
				<dt>Pulse width 1.1 RC</dt>
				<dd>{fmt(mono.ok.width, 's')}</dd>
				<Copy value={String(mono.ok.width)} />
			</div>
		</dl>
	{/if}

	<h2 class="label sub">R for a pulse width</h2>
	<div class="grid">
		<div class="field">
			<label class="label" for="t5-mt">Pulse width</label>
			<input id="t5-mt" type="text" bind:value={mt} spellcheck="false" autocomplete="off" />
		</div>
	</div>
	<div class="row opts" role="group" aria-label="Resistor series">
		<span class="label">Series</span>
		{#each seriesList as s (s)}
			<button type="button" aria-pressed={series === s} onclick={() => (series = s)}>{s}</button>
		{/each}
	</div>
	{#if monoSolve.error}
		<p class="error" role="alert">{monoSolve.error}</p>
	{:else if monoSolve.ok}
		{@const m = monoSolve.ok}
		<dl class="readout">
			<div>
				<dt>R exact / {series}</dt>
				<dd>{fmt(m.r, 'Ω')} / {fmt(m.rn, 'Ω')}</dd>
				<button type="button" class="use" onclick={() => (mr = compact(m.rn))}>Use</button>
			</div>
			<div>
				<dt>Gives</dt>
				<dd>{fmt(m.actual, 's')}</dd>
			</div>
		</dl>
	{/if}
	<p class="note">
		tw = 1.1 × R × C (exactly ln 3). A low pulse on pin 2 starts the timer. Keep the trigger shorter
		than tw, or couple it through a small capacitor.
	</p>
{/if}

<style>
	.modes {
		margin-bottom: 1.25rem;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
		gap: 0.75rem 1rem;
		margin-bottom: 1rem;
	}
	.opts {
		margin: 0 0 1rem;
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
	.use {
		min-height: 2.25rem;
		padding: 0.25rem 0.6rem;
		font-size: 0.6875rem;
	}
	.sub {
		margin: 1.75rem 0 0.75rem;
	}
	.formulas {
		list-style: none;
		padding: 0;
		margin: 0 0 1rem;
		font-size: 0.9375rem;
		overflow-wrap: anywhere;
	}
	.formulas li {
		padding: 0.15rem 0;
	}
	.warn {
		border-left-color: var(--signal);
		margin-bottom: 0.5rem;
	}
	.note {
		margin: 0 0 1rem;
	}
</style>
