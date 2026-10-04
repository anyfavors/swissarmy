<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		bestIndex,
		binaryUnits,
		bitUnits,
		decimalUnits,
		fmt,
		formatDuration,
		gapPercent,
		parseSize,
		speedUnits,
		transferSeconds,
		windowsLabel,
		type ParsedSize,
		type SpeedUnit
	} from './logic';

	let input = $state('2 TB');
	let speed = $state('1');
	let speedUnit = $state<SpeedUnit>('Gbit/s');
	let efficiency = $state('94');
	let ready = false;

	const parsed = $derived.by((): { p?: ParsedSize; error?: string } => {
		if (!input.trim()) return {};
		try {
			return { p: parseSize(input) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	const tables = $derived.by(() => {
		const p = parsed.p;
		if (!p) return null;
		const dec = decimalUnits(p.bytes);
		const bin = binaryUnits(p.bytes);
		const bits = bitUnits(p.bytes);
		return [
			{ title: 'Decimal, powers of 1000', rows: dec, best: bestIndex(dec) },
			{ title: 'Binary, powers of 1024', rows: bin, best: bestIndex(bin) },
			{ title: 'Bits, powers of 1000', rows: bits, best: bestIndex(bits) }
		];
	});

	const gap = $derived.by(() => {
		const p = parsed.p;
		if (!p || p.bytes < 1000) return null;
		const dec = decimalUnits(p.bytes);
		const bin = binaryUnits(p.bytes);
		const di = bestIndex(dec);
		const bi = Math.max(bestIndex(bin), 1);
		return {
			dec: `${fmt(Number(dec[di].value.toPrecision(4)))} ${dec[di].unit}`,
			bin: `${bin[bi].value.toFixed(2)} ${bin[bi].unit}`,
			win: windowsLabel(p.bytes),
			pct: gapPercent(di).toFixed(2),
			unit: dec[di].unit
		};
	});

	const transfer = $derived.by(() => {
		const p = parsed.p;
		if (!p) return null;
		try {
			const s = transferSeconds(p.bytes, Number(speed), speedUnit, Number(efficiency));
			return { s };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	onMount(() => {
		const h = readHash();
		if (h.in) input = h.in;
		if (h.sp) speed = h.sp;
		if (h.su && (speedUnits as string[]).includes(h.su)) speedUnit = h.su as SpeedUnit;
		if (h.eff) efficiency = h.eff;
		ready = true;
	});

	$effect(() => {
		const state = { in: input, sp: speed, su: speedUnit, eff: efficiency };
		if (ready) writeHash(state);
	});
</script>

<div class="field">
	<label class="label" for="bu-in">Size</label>
	<input id="bu-in" type="text" bind:value={input} spellcheck="false" autocomplete="off" />
	<p class="label hint">Accepts 1.5 TB · 500 GiB · 1048576 · 4 Tbit · 8 Mb · 500G</p>
</div>

{#if parsed.error}
	<p class="error" role="alert">{parsed.error}</p>
{:else if parsed.p}
	<p class="read">
		<span class="label">Read as</span>
		<span class="mono">{parsed.p.readAs}</span>
		<span class="mono">= {fmt(parsed.p.bytes)} bytes</span>
	</p>
	{#if parsed.p.warning}<p class="note warn">{parsed.p.warning}</p>{/if}

	{#if gap}
		<dl class="readout gap">
			<div>
				<dt>On the label</dt>
				<dd>{gap.dec}</dd>
			</div>
			<div>
				<dt>In binary units</dt>
				<dd class="hl">{gap.bin}</dd>
			</div>
			<div>
				<dt>Windows Explorer shows</dt>
				<dd>{gap.win}</dd>
			</div>
			<div>
				<dt>Gap at {gap.unit}</dt>
				<dd>{gap.pct} %</dd>
			</div>
		</dl>
		<p class="note">
			Disk makers count in powers of 1000. Windows counts in powers of 1024 but still writes KB, MB,
			GB, TB, so a {gap.dec} disk shows as {gap.win}. Nothing is missing; the gap grows by about 2.4
			% per prefix step. Explorer truncates to three digits rather than rounding.
		</p>
	{/if}

	{#if tables}
		<div class="tables">
			{#each tables as t (t.title)}
				<section>
					<h2 class="label">{t.title}</h2>
					<dl class="readout">
						{#each t.rows as r, i (r.unit)}
							<div class:best={i === t.best}>
								<dt class="unit">{r.unit}</dt>
								<dd>{fmt(r.value)}</dd>
								<Copy value={String(r.value)} />
							</div>
						{/each}
					</dl>
				</section>
			{/each}
		</div>
	{/if}

	<h2 class="label head">Transfer time</h2>
	<div class="calc">
		<div class="field">
			<label class="label" for="bu-speed">Link speed</label>
			<input id="bu-speed" type="text" inputmode="decimal" bind:value={speed} autocomplete="off" />
		</div>
		<div class="field">
			<label class="label" for="bu-eff">Efficiency %</label>
			<input
				id="bu-eff"
				type="text"
				inputmode="decimal"
				bind:value={efficiency}
				autocomplete="off"
			/>
		</div>
	</div>
	<div class="row opts" role="group" aria-label="Speed unit">
		<span class="label">Unit</span>
		{#each speedUnits as u (u)}
			<button
				type="button"
				class="unit"
				aria-pressed={speedUnit === u}
				onclick={() => (speedUnit = u)}>{u}</button
			>
		{/each}
	</div>
	{#if transfer?.error}
		<p class="error" role="alert">{transfer.error}</p>
	{:else if transfer?.s !== undefined}
		<dl class="readout">
			<div>
				<dt>Duration</dt>
				<dd class="hl">{formatDuration(transfer.s)}</dd>
				<Copy value={formatDuration(transfer.s)} />
			</div>
			<div>
				<dt>Seconds</dt>
				<dd>{fmt(transfer.s, 3)}</dd>
			</div>
		</dl>
	{/if}
{/if}

<p class="note rules">
	Parsing rules: <code>B</code> is bytes and <code>b</code> is bits. <code>k M G T P</code> are
	powers of 1000, <code>K</code> counts as <code>k</code>. <code>Ki Mi Gi Ti Pi</code> are powers of
	1024. A bare letter like <code>500G</code> is read as 1024-based, as <code>df -h</code> prints it. No
	unit means bytes. Efficiency covers protocol overhead: around 94 % for TCP over Ethernet at 1500 MTU.
</p>

<style>
	.hint {
		margin: 0;
		text-transform: none;
		letter-spacing: 0.02em;
	}
	.read {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.75rem;
		align-items: baseline;
		margin: 1.25rem 0 0.5rem;
	}
	.warn {
		border-left-color: var(--signal);
		margin-bottom: 0.75rem;
	}
	.gap {
		margin: 1rem 0 0.75rem;
	}
	.hl {
		color: var(--signal);
		font-weight: 700;
	}
	.tables {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr));
		gap: 1.25rem;
		margin: 1.5rem 0;
	}
	.tables h2 {
		margin: 0 0 0.4rem;
	}
	/* Narrow columns here, the global readout reserves 8rem for the label. */
	.tables .readout > div {
		grid-template-columns: 4rem 1fr auto;
	}
	.tables .readout dt {
		grid-column: auto;
	}
	.readout dt.unit {
		text-transform: none;
	}
	.readout > div.best {
		background: var(--hilite);
	}
	.readout > div.best dd {
		font-weight: 700;
	}
	.head {
		margin: 2rem 0 0.5rem;
	}
	.calc {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
		gap: 1rem;
	}
	.opts {
		margin: 0.75rem 0;
	}
	/* Units are case sensitive. */
	.unit {
		text-transform: none;
	}
	.rules {
		margin-top: 1.5rem;
	}
</style>
