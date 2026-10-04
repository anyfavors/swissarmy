<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		formatInZone,
		isoWeek,
		parseInput,
		relative,
		toUnit,
		unitLabel,
		type Unit
	} from './logic';

	let input = $state('');
	let forced = $state<Unit | undefined>(undefined);
	let now = $state(Date.now());
	let ready = false;

	const zones = ['UTC', 'Europe/Copenhagen', 'Europe/London', 'America/New_York', 'Asia/Tokyo'];
	const localZone =
		typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC';

	const parsed = $derived.by(() => {
		if (!input.trim()) return null;
		try {
			return { p: parseInput(input, forced) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	onMount(() => {
		const h = readHash();
		if (h.unit && h.unit in unitLabel) forced = h.unit as Unit;
		input = h.in ?? String(Math.floor(Date.now() / 1000));
		ready = true;
		const t = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(t);
	});

	$effect(() => {
		const state = { in: input, unit: forced };
		if (ready) writeHash(state);
	});

	function setNow() {
		input = String(Math.floor(Date.now() / 1000));
		forced = undefined;
	}
</script>

<div class="field">
	<label class="label" for="ts-in">Epoch number or date (ISO 8601 or RFC 2822)</label>
	<div class="row nowrap">
		<input id="ts-in" type="text" bind:value={input} spellcheck="false" autocomplete="off" />
		<button type="button" onclick={setNow}>Now</button>
	</div>
</div>

<div class="row opts" role="group" aria-label="Unit of the number">
	<span class="label">Read number as</span>
	<button type="button" aria-pressed={forced === undefined} onclick={() => (forced = undefined)}
		>Auto</button
	>
	{#each ['s', 'ms', 'us', 'ns'] as const as u (u)}
		<button type="button" class="unit" aria-pressed={forced === u} onclick={() => (forced = u)}
			>{u === 'us' ? 'µs' : u}</button
		>
	{/each}
</div>

{#if parsed?.error}
	<p class="error" role="alert">{parsed.error}</p>
{:else if parsed?.p}
	{@const ms = parsed.p.ms}
	{@const src = parsed.p.source}
	{@const w = isoWeek(ms)}
	<p class="note">
		{#if src.kind === 'epoch'}Read as {unitLabel[src.unit]} since 1970-01-01 UTC.{:else}Read as a
			calendar date.{/if}
		{relative(ms, now)}.
	</p>

	<dl class="readout">
		<div>
			<dt>ISO 8601 (UTC)</dt>
			<dd>{new Date(ms).toISOString()}</dd>
			<Copy value={new Date(ms).toISOString()} />
		</div>
		<div>
			<dt>Local ({localZone})</dt>
			<dd>{formatInZone(ms, localZone)}</dd>
			<Copy value={formatInZone(ms, localZone)} />
		</div>
		<div>
			<dt>RFC 2822</dt>
			<dd>{new Date(ms).toUTCString()}</dd>
			<Copy value={new Date(ms).toUTCString()} />
		</div>
		<div>
			<dt>ISO week</dt>
			<dd>{w.year}-W{String(w.week).padStart(2, '0')}</dd>
			<Copy value={`${w.year}-W${String(w.week).padStart(2, '0')}`} />
		</div>
		{#each ['s', 'ms', 'us', 'ns'] as const as u (u)}
			<div>
				<dt>Epoch {unitLabel[u]}</dt>
				<dd>{toUnit(ms, u)}</dd>
				<Copy value={toUnit(ms, u)} />
			</div>
		{/each}
	</dl>

	<h2 class="label zones-h">Other time zones</h2>
	<dl class="readout">
		{#each zones.filter((z) => z !== localZone) as z (z)}
			<div>
				<dt>{z}</dt>
				<dd>{formatInZone(ms, z)}</dd>
				<Copy value={formatInZone(ms, z)} />
			</div>
		{/each}
	</dl>
{/if}

<style>
	/* Uppercasing would turn µ into Greek capital mu, which reads as M. */
	.unit {
		text-transform: none;
	}
	.nowrap {
		flex-wrap: nowrap;
	}
	.opts {
		margin: 1rem 0 1.25rem;
	}
	.readout {
		margin: 1rem 0 1.5rem;
	}
	.zones-h {
		margin: 2rem 0 0;
	}
</style>
