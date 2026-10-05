<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import { nearest } from '../resistor/logic';
	import { bestPairs, combine, divider, fmt, idealR2, ledResistor, parseQty, solve } from './logic';

	type Mode = 'virp' | 'div' | 'led' | 'combo';
	const modes: { id: Mode; label: string }[] = [
		{ id: 'virp', label: 'V I R P' },
		{ id: 'div', label: 'Divider' },
		{ id: 'led', label: 'LED resistor' },
		{ id: 'combo', label: 'Series / parallel' }
	];
	let mode = $state<Mode>('virp');

	let v = $state('12');
	let i = $state('');
	let r = $state('');
	let p = $state('6');

	let dVin = $state('5');
	let dR1 = $state('10k');
	let dR2 = $state('20k');
	let dTarget = $state('3.3');

	let lVs = $state('5');
	let lVf = $state('2');
	let lIf = $state('20mA');
	let lN = $state('1');

	let list = $state('10k\n10k\n4k7');
	let ready = false;

	function run<T>(f: () => T): { ok?: T; error?: string } {
		try {
			return { ok: f() };
		} catch (e) {
			return { error: (e as Error).message };
		}
	}

	const virp = $derived(
		run(() =>
			solve({
				V: parseQty(v, 'V'),
				I: parseQty(i, 'A'),
				R: parseQty(r, 'R'),
				P: parseQty(p, 'W')
			})
		)
	);

	const div = $derived(
		run(() => {
			const vin = parseQty(dVin, 'V');
			const r1 = parseQty(dR1, 'R');
			const r2 = parseQty(dR2, 'R');
			if (vin === undefined || r1 === undefined || r2 === undefined)
				throw new Error('Enter Vin, R1 and R2');
			return divider(vin, r1, r2);
		})
	);

	const pick = $derived(
		run(() => {
			const vin = parseQty(dVin, 'V');
			const t = parseQty(dTarget, 'V');
			const r1 = parseQty(dR1, 'R');
			if (vin === undefined || t === undefined) throw new Error('Enter Vin and a target Vout');
			const ideal = r1 !== undefined && r1 > 0 ? idealR2(vin, t, r1) : undefined;
			return {
				ideal,
				near: ideal ? nearest(ideal, 'E24') : undefined,
				pairs: bestPairs(vin, t),
				vin,
				r1
			};
		})
	);

	const led = $derived(
		run(() => {
			const vs = parseQty(lVs, 'V');
			const vf = parseQty(lVf, 'V');
			const cur = parseQty(lIf, 'A');
			if (vs === undefined || vf === undefined || cur === undefined)
				throw new Error('Enter supply, forward voltage and current');
			return ledResistor(vs, vf, cur, Number(lN || '1'));
		})
	);

	const combo = $derived(run(() => combine(list)));

	onMount(() => {
		const h = readHash();
		if (modes.some((m) => m.id === h.m)) mode = h.m as Mode;
		if (h.v !== undefined || h.i !== undefined || h.r !== undefined || h.p !== undefined) {
			v = h.v ?? '';
			i = h.i ?? '';
			r = h.r ?? '';
			p = h.p ?? '';
		}
		if (h.vin) dVin = h.vin;
		if (h.r1) dR1 = h.r1;
		if (h.r2) dR2 = h.r2;
		if (h.vt) dTarget = h.vt;
		if (h.vs) lVs = h.vs;
		if (h.vf) lVf = h.vf;
		if (h.if) lIf = h.if;
		if (h.n) lN = h.n;
		if (h.list) list = h.list;
		if (h.in) {
			list = h.in;
			mode = 'combo';
		}
		ready = true;
	});

	$effect(() => {
		const s: Record<string, string | undefined> = { m: mode === 'virp' ? undefined : mode };
		if (mode === 'virp') Object.assign(s, { v: v || undefined, i, r, p });
		if (mode === 'div') Object.assign(s, { vin: dVin, r1: dR1, r2: dR2, vt: dTarget });
		if (mode === 'led')
			Object.assign(s, { vs: lVs, vf: lVf, if: lIf, n: lN === '1' ? undefined : lN });
		if (mode === 'combo') s.list = list;
		if (ready) writeHash(s);
	});

	const sign = (x: number) => (x > 0 ? '+' : '') + x.toFixed(2) + '%';
</script>

<div class="row modes" role="group" aria-label="Calculator">
	{#each modes as m (m.id)}
		<button type="button" aria-pressed={mode === m.id} onclick={() => (mode = m.id)}
			>{m.label}</button
		>
	{/each}
</div>

{#if mode === 'virp'}
	<div class="grid">
		<div class="field">
			<label class="label" for="ol-v">Voltage V</label>
			<input id="ol-v" type="text" bind:value={v} spellcheck="false" autocomplete="off" />
		</div>
		<div class="field">
			<label class="label" for="ol-i">Current I</label>
			<input id="ol-i" type="text" bind:value={i} spellcheck="false" autocomplete="off" />
		</div>
		<div class="field">
			<label class="label" for="ol-r">Resistance R</label>
			<input id="ol-r" type="text" bind:value={r} spellcheck="false" autocomplete="off" />
		</div>
		<div class="field">
			<label class="label" for="ol-p">Power P</label>
			<input id="ol-p" type="text" bind:value={p} spellcheck="false" autocomplete="off" />
		</div>
	</div>
	<p class="row act">
		<span class="label">Fill any two · 12V · 20mA · 4k7 · 0.25W</span>
		<button type="button" onclick={() => ((v = ''), (i = ''), (r = ''), (p = ''))}>Clear</button>
	</p>
	{#if virp.error}
		<p class="error" role="alert">{virp.error}</p>
	{:else if virp.ok}
		{@const o = virp.ok}
		<dl class="readout">
			<div>
				<dt>Voltage</dt>
				<dd>{fmt(o.V, 'V')}</dd>
				<Copy value={String(o.V)} />
			</div>
			<div>
				<dt>Current</dt>
				<dd>{fmt(o.I, 'A')}</dd>
				<Copy value={String(o.I)} />
			</div>
			<div>
				<dt>Resistance</dt>
				<dd>{fmt(o.R, 'Ω')}</dd>
				<Copy value={String(o.R)} />
			</div>
			<div>
				<dt>Power</dt>
				<dd>{fmt(o.P, 'W')}</dd>
				<Copy value={String(o.P)} />
			</div>
		</dl>
	{/if}
	<p class="note">V = I × R and P = V × I, so P = I² × R = V² / R. Values are DC or RMS.</p>
{:else if mode === 'div'}
	<div class="grid">
		<div class="field">
			<label class="label" for="dv-vin">Vin</label>
			<input id="dv-vin" type="text" bind:value={dVin} spellcheck="false" autocomplete="off" />
		</div>
		<div class="field">
			<label class="label" for="dv-r1">R1 (top)</label>
			<input id="dv-r1" type="text" bind:value={dR1} spellcheck="false" autocomplete="off" />
		</div>
		<div class="field">
			<label class="label" for="dv-r2">R2 (bottom)</label>
			<input id="dv-r2" type="text" bind:value={dR2} spellcheck="false" autocomplete="off" />
		</div>
	</div>
	{#if div.error}
		<p class="error" role="alert">{div.error}</p>
	{:else if div.ok}
		{@const d = div.ok}
		<p class="say">Vout = {fmt(d.vout, 'V')}</p>
		<dl class="readout">
			<div>
				<dt>Vout</dt>
				<dd>{fmt(d.vout, 'V')}</dd>
				<Copy value={String(d.vout)} />
			</div>
			<div>
				<dt>Current</dt>
				<dd>{fmt(d.current, 'A')}</dd>
			</div>
			<div>
				<dt>Power R1 / R2</dt>
				<dd>{fmt(d.p1, 'W')} / {fmt(d.p2, 'W')}</dd>
			</div>
			<div>
				<dt>Output resistance</dt>
				<dd>{fmt(d.rout, 'Ω')}</dd>
			</div>
		</dl>
	{/if}

	<h2 class="label sub">Pick R2 for a target</h2>
	<div class="grid">
		<div class="field">
			<label class="label" for="dv-t">Target Vout</label>
			<input id="dv-t" type="text" bind:value={dTarget} spellcheck="false" autocomplete="off" />
		</div>
	</div>
	{#if pick.error}
		<p class="error" role="alert">{pick.error}</p>
	{:else if pick.ok}
		{@const k = pick.ok}
		<dl class="readout">
			{#if k.ideal && k.near && k.r1}
				<div>
					<dt>Ideal R2 for R1 {fmt(k.r1, 'Ω')}</dt>
					<dd>{fmt(k.ideal, 'Ω')}</dd>
				</div>
				<div>
					<dt>Nearest E24</dt>
					<dd>
						{fmt(k.near.nearest, 'Ω')}, Vout {fmt(divider(k.vin, k.r1, k.near.nearest).vout, 'V')}
					</dd>
					<button
						type="button"
						class="use"
						onclick={() => (dR2 = fmt(k.near!.nearest, '').replace(' ', ''))}>Use</button
					>
				</div>
			{/if}
		</dl>
		<div class="scroll">
			<table>
				<caption class="label">Best E24 pairs, R1 from 1 kΩ to 100 kΩ</caption>
				<thead>
					<tr
						><th scope="col">R1</th><th scope="col">R2</th><th scope="col">Vout</th><th scope="col"
							>Error</th
						></tr
					>
				</thead>
				<tbody>
					{#each k.pairs as q (q.r1 + '/' + q.r2)}
						<tr>
							<td class="mono">{fmt(q.r1, 'Ω')}</td>
							<td class="mono">{fmt(q.r2, 'Ω')}</td>
							<td class="mono">{fmt(q.vout, 'V')}</td>
							<td class="mono">{q.error === 0 ? 'exact' : sign(q.error)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
	<p class="note">
		Vout = Vin × R2 / (R1 + R2) with no load. A load in parallel with R2 pulls Vout down; keep the
		load at least 10 times the output resistance, or buffer it.
	</p>
{:else if mode === 'led'}
	<div class="grid">
		<div class="field">
			<label class="label" for="led-vs">Supply</label>
			<input id="led-vs" type="text" bind:value={lVs} spellcheck="false" autocomplete="off" />
		</div>
		<div class="field">
			<label class="label" for="led-vf">LED forward voltage</label>
			<input id="led-vf" type="text" bind:value={lVf} spellcheck="false" autocomplete="off" />
		</div>
		<div class="field">
			<label class="label" for="led-if">LED current</label>
			<input id="led-if" type="text" bind:value={lIf} spellcheck="false" autocomplete="off" />
		</div>
		<div class="field">
			<label class="label" for="led-n">LEDs in series</label>
			<input id="led-n" type="text" inputmode="numeric" bind:value={lN} autocomplete="off" />
		</div>
	</div>
	{#if led.error}
		<p class="error" role="alert">{led.error}</p>
	{:else if led.ok}
		{@const l = led.ok}
		<p class="say">{fmt(l.chosen, 'Ω')}, {l.rating ? `${l.rating} W or more` : 'over 10 W'}</p>
		<dl class="readout">
			<div>
				<dt>Exact value</dt>
				<dd>{fmt(l.ideal, 'Ω')}</dd>
			</div>
			<div>
				<dt>Next E24 up</dt>
				<dd>{fmt(l.chosen, 'Ω')}</dd>
				<Copy value={String(l.chosen)} />
			</div>
			<div>
				<dt>Actual current</dt>
				<dd>{fmt(l.current, 'A')}</dd>
			</div>
			<div>
				<dt>Resistor power</dt>
				<dd>{fmt(l.power, 'W')}</dd>
			</div>
			<div>
				<dt>Rating, 2× margin</dt>
				<dd>{l.rating ? `${l.rating} W` : 'over 10 W, use a constant current driver'}</dd>
			</div>
			<div>
				<dt>Power per LED</dt>
				<dd>{fmt(l.ledPower, 'W')}</dd>
			</div>
		</dl>
	{/if}
	<p class="note">
		R = (Vsupply − n × Vf) / I, rounded up to the next E24 value so the current stays at or below
		the target. Typical Vf: red 1.8 to 2.2 V, green and blue 3.0 to 3.4 V, white 3.0 to 3.4 V. Check
		the datasheet.
	</p>
{:else}
	<div class="field">
		<label class="label" for="sp-list">Resistors, one per line or comma separated</label>
		<textarea id="sp-list" bind:value={list} spellcheck="false"></textarea>
	</div>
	{#if combo.error}
		<p class="error" role="alert">{combo.error}</p>
	{:else if combo.ok}
		{@const c = combo.ok}
		<dl class="readout">
			<div>
				<dt>Read</dt>
				<dd>{c.values.map((x) => fmt(x, 'Ω')).join(' + ')}</dd>
			</div>
			<div>
				<dt>Series</dt>
				<dd>{fmt(c.series, 'Ω')}</dd>
				<Copy value={String(c.series)} />
			</div>
			<div>
				<dt>Parallel</dt>
				<dd>{fmt(c.parallel, 'Ω')}</dd>
				<Copy value={String(c.parallel)} />
			</div>
		</dl>
	{/if}
	<p class="note">
		Series adds up. Parallel is 1 / (1/R1 + 1/R2 + ...), always below the smallest value. Two equal
		resistors in parallel give half.
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
	.act {
		justify-content: space-between;
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
	.note {
		margin: 0 0 1rem;
	}
</style>
