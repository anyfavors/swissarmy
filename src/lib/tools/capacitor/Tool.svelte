<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		TOLERANCES,
		VOLT_TABLE,
		curvePoints,
		decodeCap,
		encodeCap,
		fmt,
		lcImpedance,
		lcResonance,
		parseF,
		parseH,
		parseHz,
		parseOhm,
		rc,
		tolRange,
		units,
		xc,
		xl
	} from './logic';

	type Mode = 'code' | 'rc' | 'lc';
	const modes: { id: Mode; label: string }[] = [
		{ id: 'code', label: 'Markings' },
		{ id: 'rc', label: 'RC' },
		{ id: 'lc', label: 'LC and reactance' }
	];
	let mode = $state<Mode>('code');

	let code = $state('104K 1H');
	let value = $state('100n');
	let rR = $state('10k');
	let rC = $state('100u');
	let lL = $state('10u');
	let lC = $state('100n');
	let lF = $state('1k');
	let ready = false;

	function run<T>(f: () => T): { ok?: T; error?: string } {
		try {
			return { ok: f() };
		} catch (e) {
			return { error: (e as Error).message };
		}
	}

	const dec = $derived(code.trim() ? run(() => decodeCap(code)) : {});
	const val = $derived(
		run(() => {
			const f = parseF(value);
			if (f === undefined) return undefined;
			if (!(f > 0)) throw new Error('Value must be above zero');
			return { f, u: units(f), code: encodeCap(f) };
		})
	);

	const rcv = $derived(
		run(() => {
			const r = parseOhm(rR);
			const c = parseF(rC);
			if (r === undefined || c === undefined) throw new Error('Enter R and C');
			return rc(r, c);
		})
	);

	const lc = $derived(
		run(() => {
			const l = parseH(lL);
			const c = parseF(lC);
			const f = parseHz(lF);
			return {
				f0: l !== undefined && c !== undefined ? lcResonance(l, c) : undefined,
				z0: l !== undefined && c !== undefined && l > 0 && c > 0 ? lcImpedance(l, c) : undefined,
				xc: f !== undefined && c !== undefined ? xc(f, c) : undefined,
				xl: f !== undefined && l !== undefined ? xl(f, l) : undefined,
				f
			};
		})
	);

	const W = 480;
	const H = 180;
	const curves = curvePoints(W, H);

	const pct = (x: number) => x.toFixed(1) + ' %';

	onMount(() => {
		const h = readHash();
		if (modes.some((m) => m.id === h.m)) mode = h.m as Mode;
		if (h.code !== undefined) code = h.code;
		if (h.v !== undefined) value = h.v;
		if (h.r) rR = h.r;
		if (h.c) rC = h.c;
		if (h.l) lL = h.l;
		if (h.lc) lC = h.lc;
		if (h.f) lF = h.f;
		if (h.in) {
			code = h.in;
			mode = 'code';
		}
		ready = true;
	});

	$effect(() => {
		const s: Record<string, string | undefined> = { m: mode === 'code' ? undefined : mode };
		if (mode === 'code') Object.assign(s, { code, v: value });
		if (mode === 'rc') Object.assign(s, { r: rR, c: rC });
		if (mode === 'lc') Object.assign(s, { l: lL, lc: lC, f: lF });
		if (ready) writeHash(s);
	});
</script>

<div class="row modes" role="group" aria-label="Calculator">
	{#each modes as m (m.id)}
		<button type="button" aria-pressed={mode === m.id} onclick={() => (mode = m.id)}
			>{m.label}</button
		>
	{/each}
</div>

{#if mode === 'code'}
	<div class="grid">
		<div class="field">
			<label class="label" for="cap-code">Marking on the part</label>
			<input id="cap-code" type="text" bind:value={code} spellcheck="false" autocomplete="off" />
		</div>
	</div>
	{#if dec.error}
		<p class="error" role="alert">{dec.error}</p>
	{:else if dec.ok}
		{@const d = dec.ok}
		{@const u = units(d.value)}
		<p class="say">{fmt(d.value, 'F')}</p>
		<dl class="readout">
			<div>
				<dt class="nt">pF</dt>
				<dd>{u.pF}</dd>
				<Copy value={String(u.pF)} />
			</div>
			<div>
				<dt class="nt">nF</dt>
				<dd>{u.nF}</dd>
				<Copy value={String(u.nF)} />
			</div>
			<div>
				<dt class="nt">µF</dt>
				<dd>{u.uF}</dd>
				<Copy value={String(u.uF)} />
			</div>
			<div>
				<dt>Read as</dt>
				<dd>{d.system}</dd>
			</div>
			{#if d.tol}
				{@const r = tolRange(d.value, d.tol)}
				<div>
					<dt>Tolerance {d.tol.letter}</dt>
					<dd>{d.tol.text}, {fmt(r.min, 'F')} to {fmt(r.max, 'F')}</dd>
				</div>
			{/if}
			{#if d.volts !== undefined}
				<div>
					<dt>Rated voltage {d.voltCode}</dt>
					<dd>{d.volts} V</dd>
				</div>
			{/if}
		</dl>
	{/if}

	<h2 class="label sub">Value to marking</h2>
	<div class="grid">
		<div class="field">
			<label class="label" for="cap-val">Capacitance</label>
			<input id="cap-val" type="text" bind:value spellcheck="false" autocomplete="off" />
		</div>
	</div>
	{#if val.error}
		<p class="error" role="alert">{val.error}</p>
	{:else if val.ok}
		{@const v = val.ok}
		<dl class="readout">
			<div>
				<dt>Code</dt>
				<dd>{v.code ?? 'no 3-character code, needs more digits'}</dd>
				{#if v.code}<Copy value={v.code} />{/if}
			</div>
			<div>
				<dt class="nt">pF / nF / µF</dt>
				<dd>{v.u.pF} pF = {v.u.nF} nF = {v.u.uF} µF</dd>
			</div>
		</dl>
	{/if}

	<div class="tables">
		<div class="scroll">
			<table>
				<caption class="label">Tolerance letters</caption>
				<thead><tr><th scope="col">Letter</th><th scope="col">Tolerance</th></tr></thead>
				<tbody>
					{#each TOLERANCES as t (t.letter)}
						<tr><td class="mono">{t.letter}</td><td>{t.text}</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
		<div class="scroll">
			<table>
				<caption class="label">Voltage codes</caption>
				<thead><tr><th scope="col">Code</th><th scope="col">Volts</th></tr></thead>
				<tbody>
					{#each VOLT_TABLE as v (v.code)}
						<tr><td class="mono">{v.code}</td><td class="mono">{v.volts} V</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
	<p class="note">
		The code is in picofarads: two digits and a count of zeros, so 104 is 10 and four zeros, 100 000
		pF = 100 nF. R marks the decimal point (4R7 = 4.7 pF). Voltage codes (EIA): the digit is the
		power of ten, the letter the mantissa, so 1H = 5.0 × 10 = 50 V. Electrolytics print the value
		and voltage in plain text.
	</p>
{:else if mode === 'rc'}
	<div class="grid">
		<div class="field">
			<label class="label" for="rc-r">Resistance R</label>
			<input id="rc-r" type="text" bind:value={rR} spellcheck="false" autocomplete="off" />
		</div>
		<div class="field">
			<label class="label" for="rc-c">Capacitance C</label>
			<input id="rc-c" type="text" bind:value={rC} spellcheck="false" autocomplete="off" />
		</div>
	</div>
	{#if rcv.error}
		<p class="error" role="alert">{rcv.error}</p>
	{:else if rcv.ok}
		{@const o = rcv.ok}
		<p class="say">τ = {fmt(o.tau, 's')}</p>
		<dl class="readout">
			<div>
				<dt class="nt">TIME CONSTANT τ = RC</dt>
				<dd>{fmt(o.tau, 's')}</dd>
				<Copy value={String(o.tau)} />
			</div>
			<div>
				<dt class="nt">CUTOFF fc = 1 / 2πRC</dt>
				<dd>{fmt(o.fc, 'Hz')}</dd>
				<Copy value={String(o.fc)} />
			</div>
			<div>
				<dt class="nt">SETTLED (5 τ)</dt>
				<dd>{fmt(5 * o.tau, 's')}</dd>
			</div>
		</dl>

		<div class="scroll">
			<table>
				<caption class="label">Capacitor voltage, percent of supply</caption>
				<thead>
					<tr
						><th scope="col" class="nt">τ</th><th scope="col">Time</th><th scope="col">Charging</th
						><th scope="col">Discharging</th></tr
					>
				</thead>
				<tbody>
					{#each o.rows as row (row.n)}
						<tr>
							<td class="mono">{row.n} τ</td>
							<td class="mono">{fmt(row.t, 's')}</td>
							<td class="mono">{pct(row.charge)}</td>
							<td class="mono">{pct(row.discharge)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<figure class="chart">
			<svg
				viewBox="0 0 {W + 60} {H + 50}"
				role="img"
				aria-label="Charge and discharge curves from 0 to 5 time constants"
			>
				<g transform="translate(44 10)">
					{#each [0, 25, 50, 75, 100] as y (y)}
						<line class="grid-line" x1="0" x2={W} y1={H - (y / 100) * H} y2={H - (y / 100) * H} />
						<text class="tick" x="-6" y={H - (y / 100) * H + 4} text-anchor="end">{y}</text>
					{/each}
					{#each [0, 1, 2, 3, 4, 5] as x (x)}
						<line class="grid-line" x1={(x / 5) * W} x2={(x / 5) * W} y1="0" y2={H} />
						<text class="tick" x={(x / 5) * W} y={H + 18} text-anchor="middle">{x} τ</text>
					{/each}
					<line class="axis" x1="0" x2={W} y1={H} y2={H} />
					<line class="axis" x1="0" x2="0" y1="0" y2={H} />
					<polyline class="chg" points={curves.charge} />
					<polyline class="dis" points={curves.discharge} />
					<text class="tag chg-t" x={W - 4} y="24" text-anchor="end">charging</text>
					<text class="tag dis-t" x={W - 4} y={H - 26} text-anchor="end">discharging</text>
				</g>
			</svg>
		</figure>
	{/if}
	<p class="note">
		Charging: V = V0 (1 − e^(−t/τ)). Discharging: V = V0 e^(−t/τ). After 5 τ the capacitor is within
		1 % of its final value. The same R and C as a first-order filter have −3 dB at fc, as a low-pass
		(C to ground) or high-pass (C in series).
	</p>
{:else}
	<div class="grid">
		<div class="field">
			<label class="label" for="lc-l">Inductance L</label>
			<input id="lc-l" type="text" bind:value={lL} spellcheck="false" autocomplete="off" />
		</div>
		<div class="field">
			<label class="label" for="lc-c">Capacitance C</label>
			<input id="lc-c" type="text" bind:value={lC} spellcheck="false" autocomplete="off" />
		</div>
		<div class="field">
			<label class="label" for="lc-f">Frequency f</label>
			<input id="lc-f" type="text" bind:value={lF} spellcheck="false" autocomplete="off" />
		</div>
	</div>
	{#if lc.error}
		<p class="error" role="alert">{lc.error}</p>
	{:else if lc.ok}
		{@const o = lc.ok}
		<dl class="readout">
			<div>
				<dt>Resonance f0</dt>
				<dd>{o.f0 !== undefined ? fmt(o.f0, 'Hz') : 'enter L and C'}</dd>
				{#if o.f0 !== undefined}<Copy value={String(o.f0)} />{/if}
			</div>
			{#if o.z0 !== undefined}
				<div>
					<dt>√(L/C)</dt>
					<dd>{fmt(o.z0, 'Ω')}</dd>
				</div>
			{/if}
			<div>
				<dt>Xc at {o.f !== undefined ? fmt(o.f, 'Hz') : 'f'}</dt>
				<dd>{o.xc !== undefined ? fmt(o.xc, 'Ω') : 'enter C and f'}</dd>
			</div>
			<div>
				<dt>XL at {o.f !== undefined ? fmt(o.f, 'Hz') : 'f'}</dt>
				<dd>{o.xl !== undefined ? fmt(o.xl, 'Ω') : 'enter L and f'}</dd>
			</div>
		</dl>
	{/if}
	<p class="note">
		f0 = 1 / (2π√(LC)), where Xc = XL. Xc = 1 / (2πfC) falls with frequency, XL = 2πfL rises. Units:
		10u for 10 µH, 100n for 100 nF, 1k or 1kHz for frequency.
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
	.tables {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
		gap: 0 1.5rem;
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
	}
	th {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-2);
		font-weight: 400;
	}
	.chart {
		margin: 0 0 1.25rem;
	}
	.chart svg {
		display: block;
		width: 100%;
		max-width: 36rem;
		height: auto;
	}
	.grid-line {
		stroke: var(--rule-soft);
		stroke-width: 1;
	}
	.axis {
		stroke: var(--rule);
		stroke-width: 1.5;
	}
	.tick,
	.tag {
		fill: var(--ink-2);
		font-family: var(--font-mono);
		font-size: 15px;
	}
	.chg {
		fill: none;
		stroke: var(--signal);
		stroke-width: 2.5;
	}
	.dis {
		fill: none;
		stroke: var(--ink);
		stroke-width: 2;
		stroke-dasharray: 6 4;
	}
	.chg-t {
		fill: var(--signal);
	}
	.dis-t {
		fill: var(--ink);
	}
	.note {
		margin: 0 0 1rem;
	}
	.nt {
		text-transform: none;
	}
</style>
