<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		compute,
		fmt,
		formatHours,
		levels,
		parseDisks,
		rebuildSeconds,
		toTB,
		toTiB,
		ureProbability,
		type Level,
		type RaidResult
	} from './logic';

	const ures = [
		{ v: 1e14, label: '1 in 10¹⁴', hint: 'desktop' },
		{ v: 1e15, label: '1 in 10¹⁵', hint: 'NAS, enterprise' },
		{ v: 1e16, label: '1 in 10¹⁶', hint: 'some enterprise' }
	];

	let disks = $state('6 x 8 TB');
	let level = $state<Level>('5');
	let groups = $state('2');
	let speed = $state('150');
	let ure = $state(1e14);
	let ready = false;

	const current = $derived(levels.find((l) => l.id === level)!);

	const res = $derived.by((): { r?: RaidResult; error?: string } => {
		try {
			return { r: compute(level, parseDisks(disks), Number(groups)) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	const rebuild = $derived.by((): { s?: number; error?: string } => {
		if (!res.r || res.r.tolerance === 0) return {};
		const n = Number(speed.replace(',', '.'));
		try {
			return { s: rebuildSeconds(res.r.smallest, n) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	function cap(b: number): string {
		return `${fmt(toTB(b))} TB · ${fmt(toTiB(b))} TiB`;
	}

	function pct(p: number): string {
		if (p < 0.001) return '< 0.1 %';
		return `${fmt(p * 100, 1)} %`;
	}

	function factor(f: number): string {
		return `× ${fmt(f, 2)}`;
	}

	onMount(() => {
		const h = readHash();
		if (h.in) disks = h.in;
		if (h.l && levels.some((l) => l.id === h.l)) level = h.l as Level;
		if (h.g) groups = h.g;
		if (h.s) speed = h.s;
		const u = Number(h.u);
		if (ures.some((x) => x.v === u)) ure = u;
		ready = true;
	});

	$effect(() => {
		const state = {
			in: disks,
			l: level,
			g: current.nested ? groups : undefined,
			s: speed,
			u: ure === 1e14 ? undefined : String(ure)
		};
		if (ready) writeHash(state);
	});
</script>

<div class="field">
	<label class="label" for="raid-disks">Disks</label>
	<input id="raid-disks" type="text" bind:value={disks} spellcheck="false" autocomplete="off" />
	<p class="label hint">
		Accepts 6 x 8 TB · 4x4TB, 2x8TB · 12, 12, 10 (TB if no unit) · 960 GB · 1 TiB
	</p>
</div>

<div class="row opts" role="group" aria-label="RAID level">
	<span class="label">Level</span>
	{#each levels as l (l.id)}
		<button type="button" aria-pressed={level === l.id} onclick={() => (level = l.id)}
			>{l.label}</button
		>
	{/each}
</div>

<div class="inputs">
	{#if current.nested}
		<div class="field">
			<label class="label" for="raid-groups">Spans (RAID {level === '50' ? 5 : 6} groups)</label>
			<input
				id="raid-groups"
				type="text"
				inputmode="numeric"
				bind:value={groups}
				autocomplete="off"
			/>
		</div>
	{/if}
	<div class="field">
		<label class="label" for="raid-speed">Rebuild speed, MB/s</label>
		<input id="raid-speed" type="text" inputmode="decimal" bind:value={speed} autocomplete="off" />
	</div>
</div>

{#if res.error}
	<p class="error" role="alert">{res.error}</p>
{:else if res.r}
	{@const r = res.r}
	{@const usable = cap(r.usable)}
	<dl class="readout out">
		<div>
			<dt>Usable</dt>
			<dd class="strong">{usable}</dd>
			<Copy value={usable} />
		</div>
		<div>
			<dt>Raw</dt>
			<dd>{cap(r.raw)} · {r.disks} disks</dd>
		</div>
		<div>
			<dt>Efficiency</dt>
			<dd>{fmt((r.usable / r.raw) * 100, 1)} %</dd>
		</div>
		{#if current.nested}
			<div>
				<dt>Layout</dt>
				<dd>{r.groups} spans of {r.perGroup} disks</dd>
			</div>
		{/if}
		<div>
			<dt>Fault tolerance</dt>
			<dd>
				{#if r.tolerance === 0}
					None. One failed disk loses the array.
				{:else if r.toleranceBest > r.tolerance}
					{r.tolerance} disk{r.tolerance > 1 ? 's' : ''} guaranteed, up to {r.toleranceBest} if they fail
					in different {level === '10' ? 'mirrors' : 'spans'}
				{:else}
					{r.tolerance} disk{r.tolerance > 1 ? 's' : ''}
				{/if}
			</dd>
		</div>
		<div>
			<dt>Read, theoretical</dt>
			<dd>{factor(r.read)} one disk</dd>
		</div>
		<div>
			<dt>Write, theoretical</dt>
			<dd>{factor(r.write)} one disk · {r.writeNote}</dd>
		</div>
		{#if rebuild.s !== undefined}
			<div>
				<dt>Rebuild one disk</dt>
				<dd>{formatHours(rebuild.s)} at {speed} MB/s, best case</dd>
			</div>
		{/if}
	</dl>
	{#if rebuild.error}<p class="error" role="alert">{rebuild.error}</p>{/if}

	{#if r.mixed && level !== 'jbod'}
		<p class="note">
			Mixed sizes: the smallest disk ({fmt(toTB(r.smallest))} TB) governs, every disk contributes only
			that much. {fmt(toTB(r.raw - r.smallest * r.disks))} TB is left unused.
		</p>
	{/if}

	{#if r.ureExposedBytes > 0}
		{@const bits = r.ureExposedBytes * 8}
		<h2 class="label sect">Unrecoverable read errors during a rebuild</h2>
		<div class="row opts" role="group" aria-label="Drive URE specification">
			<span class="label">Spec</span>
			{#each ures as u (u.v)}
				<button type="button" aria-pressed={ure === u.v} onclick={() => (ure = u.v)}
					>{u.label} <span class="dim">{u.hint}</span></button
				>
			{/each}
		</div>
		<dl class="readout">
			<div>
				<dt>Read during rebuild</dt>
				<dd>{fmt(toTB(r.ureExposedBytes))} TB = {bits.toExponential(2)} bits</dd>
			</div>
			<div>
				<dt>P(at least one URE)</dt>
				<dd class="strong">{pct(ureProbability(r.ureExposedBytes, ure))}</dd>
			</div>
		</dl>
		<p class="note">
			With one disk gone there is no redundancy left{level === '50' ? ' in that span' : ''}, so
			every surviving bit{level === '10' || level === '1' ? ' of the mirror partner' : ''} must read cleanly.
			P = 1 - (1 - 1/R)<sup>b</sup> ≈ 1 - e<sup>-b/R</sup>, with b bits read and R the spec. The
			spec is a worst-case bound ("less than 1 in R"); real drives usually do much better, and many
			controllers lose only the affected stripe rather than the whole array. Treat this as an upper
			bound, and as a reason to prefer RAID 6 or 10 for large disks.
		</p>
	{:else if level === '6' || level === '60'}
		<p class="note">
			During a single-disk rebuild one parity remains, so a read error can still be corrected.
		</p>
	{/if}
{/if}

<p class="note foot">
	Capacities in TB (10¹² bytes, as on the disk label) and TiB (2⁴⁰, as most operating systems show).
	Filesystem overhead, hot spares and controller metadata are not subtracted. Speed factors assume
	identical disks, full-stripe parallelism and no cache; real arrays differ. Rebuild time assumes
	the whole disk is rewritten at a steady speed with no other load.
</p>

<style>
	.hint {
		margin: 0.35rem 0 0;
		text-transform: none;
		letter-spacing: 0.02em;
	}
	.opts {
		margin: 1rem 0;
	}
	.inputs {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
		gap: 1rem;
	}
	.out {
		margin-top: 1.25rem;
	}
	.strong {
		font-weight: 700;
		color: var(--signal);
	}
	.dim {
		opacity: 0.75;
		text-transform: none;
	}
	.sect {
		margin: 2rem 0 0;
	}
	.note {
		margin: 1rem 0;
	}
	.foot {
		margin-top: 2rem;
	}
</style>
