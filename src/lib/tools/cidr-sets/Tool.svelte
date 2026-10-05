<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		checkMembership,
		formatCount,
		formatPrefix,
		formatRange,
		parseList,
		presets,
		subtractRanges,
		summarise,
		type Containment
	} from './logic';

	type Mode = 'aggregate' | 'exclude' | 'check';
	const modes: [Mode, string][] = [
		['aggregate', 'Aggregate'],
		['exclude', 'Exclude'],
		['check', 'Check membership']
	];

	let mode = $state<Mode>('aggregate');
	let list = $state(
		'10.0.0.0/25\n10.0.0.128/25\n10.0.1.0/24\n192.168.1.10-192.168.1.20\n2001:db8::/48\n2001:db8:1::/48'
	);
	let include = $state(presets[0].include);
	let exclude = $state(presets[0].exclude);
	let preset = $state<string>(presets[0].id);
	let items = $state('10.1.2.3\n192.168.0.0/23\n8.8.8.8\n2001:db8::1');
	let sets = $state('10.0.0.0/8\n192.168.0.0/24\n2001:db8::/32');
	let ready = false;

	const agg = $derived.by(() => {
		const p = parseList(list);
		return { ...p, s: summarise(p.entries.map((e) => e.range)) };
	});

	const excl = $derived.by(() => {
		const a = parseList(include);
		const b = parseList(exclude);
		const s = summarise(
			subtractRanges(
				a.entries.map((e) => e.range),
				b.entries.map((e) => e.range)
			)
		);
		return {
			errors: [...a.errors.map((e) => `Include: ${e}`), ...b.errors.map((e) => `Exclude: ${e}`)],
			empty: a.entries.length === 0,
			s
		};
	});

	const check = $derived.by(() => {
		const a = parseList(items);
		const b = parseList(sets);
		return {
			errors: [...a.errors.map((e) => `Addresses: ${e}`), ...b.errors.map((e) => `Ranges: ${e}`)],
			rows: checkMembership(a.entries, b.entries)
		};
	});

	const statusText: Record<Containment, string> = {
		inside: 'Inside',
		partial: 'Partly inside',
		outside: 'Outside'
	};

	const counts = (s: { count4: bigint; count6: bigint }) =>
		[
			s.count4 ? `${formatCount(s.count4)} IPv4` : '',
			s.count6 ? `${formatCount(s.count6)} IPv6` : ''
		]
			.filter(Boolean)
			.join(' · ') || 'no addresses';

	function applyPreset(id: string) {
		const p = presets.find((x) => x.id === id);
		if (!p) return;
		preset = id;
		include = p.include;
		exclude = p.exclude;
	}

	const currentPreset = $derived(presets.find((p) => p.id === preset));

	onMount(() => {
		const h = readHash();
		if (h.mode === 'aggregate' || h.mode === 'exclude' || h.mode === 'check') mode = h.mode;
		if (h.preset) {
			applyPreset(h.preset);
			if (!h.mode) mode = 'exclude';
		}
		if (h.in) {
			if (mode === 'exclude') include = h.in;
			else if (mode === 'check') items = h.in;
			else list = h.in;
		}
		ready = true;
	});

	$effect(() => {
		// Lists may be log extracts or internal plans, so only the mode and preset go in the URL.
		const state = {
			mode: mode === 'aggregate' ? undefined : mode,
			preset:
				mode === 'exclude' &&
				currentPreset &&
				include === currentPreset.include &&
				exclude === currentPreset.exclude
					? preset
					: undefined
		};
		if (ready) writeHash(state);
	});
</script>

<div class="row modes" role="group" aria-label="Operation">
	{#each modes as [m, label] (m)}
		<button type="button" aria-pressed={mode === m} onclick={() => (mode = m)}>{label}</button>
	{/each}
</div>

{#if mode === 'aggregate'}
	<div class="field">
		<label class="label" for="cs-list">Addresses, prefixes or ranges</label>
		<textarea id="cs-list" bind:value={list} spellcheck="false" autocomplete="off"></textarea>
		<p class="label hint">
			One per line or separated by commas · 10.0.0.0/8 · 10.0.0.0 255.0.0.0 · 10.0.0.1-10.0.0.9 · #
			comments
		</p>
	</div>
	{#each agg.errors as e (e)}<p class="error" role="alert">{e}</p>{/each}
	{#if agg.s.ranges.length}
		<p class="label summary">
			{agg.entries.length} entries · {agg.s.cidrs.length} prefixes · {agg.s.ranges.length} ranges · {counts(
				agg.s
			)}
		</p>
		<div class="grid">
			<section>
				<div class="row between">
					<h2 class="label">Minimal CIDR list</h2>
					<Copy value={agg.s.cidrs.map(formatPrefix).join('\n')} />
				</div>
				<pre class="out">{agg.s.cidrs.map(formatPrefix).join('\n')}</pre>
			</section>
			<section>
				<div class="row between">
					<h2 class="label">As ranges</h2>
					<Copy value={agg.s.ranges.map(formatRange).join('\n')} />
				</div>
				<pre class="out">{agg.s.ranges.map(formatRange).join('\n')}</pre>
			</section>
		</div>
		<p class="note">
			Overlapping and adjacent entries are merged, then each range is cut into the fewest aligned
			blocks. Host bits in a prefix are ignored, so 10.1.2.3/8 counts as 10.0.0.0/8.
		</p>
	{/if}
{:else if mode === 'exclude'}
	<div class="row presets" role="group" aria-label="Presets">
		{#each presets as p (p.id)}
			<button type="button" aria-pressed={preset === p.id} onclick={() => applyPreset(p.id)}
				>{p.label}</button
			>
		{/each}
	</div>
	{#if currentPreset}<p class="note">{currentPreset.note}</p>{/if}
	<div class="grid">
		<div class="field">
			<label class="label" for="cs-inc">Include</label>
			<textarea id="cs-inc" bind:value={include} spellcheck="false" autocomplete="off"></textarea>
		</div>
		<div class="field">
			<label class="label" for="cs-exc">Exclude</label>
			<textarea id="cs-exc" bind:value={exclude} spellcheck="false" autocomplete="off"></textarea>
		</div>
	</div>
	{#each excl.errors as e (e)}<p class="error" role="alert">{e}</p>{/each}
	{#if !excl.empty}
		{@const line = excl.s.cidrs.map(formatPrefix).join(', ')}
		<p class="label summary">
			{excl.s.cidrs.length} prefixes · {counts(excl.s)}
		</p>
		{#if excl.s.cidrs.length}
			<dl class="readout">
				<div>
					<dt>AllowedIPs line</dt>
					<dd>AllowedIPs = {line}</dd>
					<Copy value={`AllowedIPs = ${line}`} />
				</div>
				<div>
					<dt>Comma separated</dt>
					<dd>{line}</dd>
					<Copy value={line} />
				</div>
			</dl>
			<div class="row between">
				<h2 class="label">Result, one per line</h2>
				<Copy value={excl.s.cidrs.map(formatPrefix).join('\n')} />
			</div>
			<pre class="out">{excl.s.cidrs.map(formatPrefix).join('\n')}</pre>
		{:else}
			<p class="note">Nothing is left: the exclude list covers the whole include list.</p>
		{/if}
	{/if}
{:else}
	<div class="grid">
		<div class="field">
			<label class="label" for="cs-items">Addresses to test</label>
			<textarea id="cs-items" bind:value={items} spellcheck="false" autocomplete="off"></textarea>
		</div>
		<div class="field">
			<label class="label" for="cs-sets">Ranges</label>
			<textarea id="cs-sets" bind:value={sets} spellcheck="false" autocomplete="off"></textarea>
		</div>
	</div>
	{#each check.errors as e (e)}<p class="error" role="alert">{e}</p>{/each}
	{#if check.rows.length}
		{@const inside = check.rows.filter((x) => x.status === 'inside').length}
		<p class="label summary">{inside} of {check.rows.length} inside</p>
		<div class="scroll">
			<table>
				<thead>
					<tr
						><th scope="col">Entry</th><th scope="col">Result</th><th scope="col">Matched by</th
						></tr
					>
				</thead>
				<tbody>
					{#each check.rows as row, i (i)}
						<tr class:hit={row.status === 'inside'}>
							<td class="mono">{row.entry.text}</td>
							<td>{statusText[row.status]}</td>
							<td class="mono wrap">{row.matches.map((m) => m.text).join(', ') || 'none'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<p class="note">
			A prefix or range is inside when the ranges cover all of it, together if need be. Partly
			inside means some of its addresses are outside.
		</p>
	{/if}
{/if}

<style>
	.modes,
	.presets {
		margin-bottom: 1rem;
	}
	.presets {
		margin-bottom: 0.75rem;
	}
	.hint {
		margin: 0;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
		gap: 1.25rem;
		margin: 1rem 0;
	}
	.summary {
		margin: 1.25rem 0 0.5rem;
	}
	.between {
		justify-content: space-between;
	}
	h2.label {
		margin: 0;
		font-weight: 400;
	}
	.out {
		margin: 0.5rem 0 1rem;
		padding: 0.75rem;
		border-top: 2px solid var(--rule);
		border-bottom: 1px solid var(--rule-soft);
		background: var(--field);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		max-height: 24rem;
		overflow-y: auto;
	}
	.readout {
		margin: 0 0 1.25rem;
	}
	.error {
		margin: 0.5rem 0 0;
	}
	.scroll {
		overflow-x: auto;
		margin: 0.5rem 0 1rem;
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
		vertical-align: top;
	}
	td.mono,
	th {
		white-space: nowrap;
	}
	td.wrap {
		white-space: normal;
		min-width: 9rem;
	}
	th {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-2);
		font-weight: 400;
	}
	tr.hit td:nth-child(2) {
		color: var(--signal);
		font-weight: 700;
	}
</style>
