<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import { formatIso, formats, kindLabel, parse, type Kind } from './logic';

	let input = $state('');
	let kind = $state<Kind | 'auto'>('auto');
	let ready = false;

	const kinds = Object.keys(kindLabel) as Kind[];

	const result = $derived.by(() => {
		if (!input.trim()) return null;
		try {
			const p = parse(input, kind);
			return { p, rows: p.ns === undefined ? [] : formats(p.ns) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	function setNow() {
		input = formatIso(BigInt(Date.now()) * 1_000_000n);
		kind = 'auto';
	}

	onMount(() => {
		const h = readHash();
		if (h.f && (h.f in kindLabel || h.f === 'auto')) kind = h.f as Kind | 'auto';
		input = h.in ?? '133735200000000000';
		ready = true;
	});

	$effect(() => {
		const state = { in: input, f: kind === 'auto' ? undefined : kind };
		if (ready) writeHash(state);
	});
</script>

<div class="field">
	<label class="label" for="wt-in">Value or ISO date</label>
	<div class="row nowrap">
		<input
			id="wt-in"
			type="text"
			bind:value={input}
			spellcheck="false"
			autocomplete="off"
			autocapitalize="off"
		/>
		<button type="button" onclick={setNow}>Now</button>
	</div>
</div>

<div class="row kinds" role="group" aria-label="Input format">
	<span class="label">Read as</span>
	<button type="button" aria-pressed={kind === 'auto'} onclick={() => (kind = 'auto')}>Auto</button>
	{#each kinds as k (k)}
		<button type="button" aria-pressed={kind === k} onclick={() => (kind = k)}
			>{kindLabel[k]}</button
		>
	{/each}
</div>

{#if result?.error}
	<p class="error" role="alert">{result.error}</p>
{:else if result?.p}
	{@const p = result.p}
	<p class="read"><span class="label">Read as</span> {kindLabel[p.kind]}</p>
	{#if p.details.length}
		<dl class="readout details">
			{#each p.details as d (d.label)}
				<div>
					<dt>{d.label}</dt>
					<dd>{d.value}</dd>
				</div>
			{/each}
		</dl>
	{/if}
	{#if p.special}
		<p class="say">{p.special}</p>
	{/if}
	{#each p.notes as n (n)}
		<p class="note">{n}</p>
	{/each}
	{#if result.rows.length}
		<dl class="readout out">
			{#each result.rows as r (r.kind)}
				<div class:src={r.kind === p.kind}>
					<dt>{r.label}</dt>
					<dd>
						{#if r.value}
							<span class="val">{r.value}</span>
							{#if r.extra}<span class="extra">{r.extra}</span>{/if}
						{:else}
							<span class="extra">out of range</span>
						{/if}
					</dd>
					<Copy value={r.value} />
				</div>
			{/each}
		</dl>
	{/if}
{/if}

<p class="note">
	AD stores lastLogonTimestamp, pwdLastSet, accountExpires and badPasswordTime as FILETIME: 100 ns
	steps since 1601-01-01 UTC. On Windows, <code>w32tm /ntte</code> does the same conversion. lastLogonTimestamp
	only replicates when it is 9 to 14 days old, so it can lag by two weeks.
</p>
<p class="note">
	Excel's 1900 system counts 1900-02-29, a day that never existed, so serials before 61 are one day
	off from a plain day count. GPS time ignores leap seconds: GPS − UTC is 18 s since 2017-01-01
	(IERS Bulletin C). NTP seconds wrap in 2036; the hex form is 32-bit seconds and 32-bit fraction.
</p>
<p class="note">
	Snowflake ids hold milliseconds since a service epoch in the top 42 bits: X / Twitter
	1288834974657 (2010-11-04), Discord 1420070400000 (2015-01-01). Given a date, the tool shows the
	lowest id for that millisecond, useful for since_id style range queries.
</p>

<style>
	.nowrap {
		flex-wrap: nowrap;
	}
	.kinds {
		margin: 1rem 0 1.25rem;
	}
	.kinds button {
		text-transform: none;
		letter-spacing: 0;
	}
	.read {
		margin: 0 0 0.75rem;
		font-family: var(--font-mono);
	}
	.say {
		font-size: 1.125rem;
		line-height: 1.4;
		margin: 1rem 0;
		padding: 0.5rem 0.75rem;
		border-left: 4px solid var(--signal);
		background: var(--hilite);
		overflow-wrap: anywhere;
	}
	.details {
		margin-bottom: 1rem;
	}
	.out {
		margin: 1rem 0 1.5rem;
	}
	.out .src {
		background: var(--hilite);
	}
	.val {
		display: block;
	}
	.extra {
		display: block;
		font-size: 0.8125rem;
		color: var(--ink-2);
	}
	.note {
		margin: 0 0 0.75rem;
	}
	.note code {
		overflow-wrap: anywhere;
	}
</style>
