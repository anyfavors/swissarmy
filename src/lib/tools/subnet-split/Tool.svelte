<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import { formatCount } from '../cidr-sets/logic';
	import {
		formatAddress,
		formatPrefix,
		parseNeeds,
		parsePrefix,
		planCsv,
		planMarkdown,
		planVlsm,
		splitCount,
		splitTo,
		type Plan,
		type Split
	} from './logic';

	type Mode = 'split' | 'vlsm';
	type By = 'count' | 'len';

	let parentText = $state('192.168.0.0/22');
	let mode = $state<Mode>('vlsm');
	let by = $state<By>('count');
	let countText = $state('4');
	let lenText = $state('26');
	let needsText = $state('Office 200\nWarehouse 100\nGuests 60\nVoIP 25\nPrinters 10\nWAN link 2');
	let p2p = $state(false);
	let min64 = $state(true);
	let ready = false;

	const parent = $derived.by(() => {
		try {
			return { p: parsePrefix(parentText) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	const split = $derived.by((): { s?: Split; error?: string } => {
		const p = parent.p;
		if (!p || mode !== 'split') return {};
		try {
			if (by === 'count') {
				if (!/^\s*\d+\s*$/.test(countText))
					throw new Error('Number of subnets must be a whole number');
				return { s: splitCount(p, BigInt(countText.trim())) };
			}
			const len = Number(lenText.trim().replace(/^\//, ''));
			return { s: splitTo(p, len) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	const plan = $derived.by((): { plan?: Plan; error?: string } => {
		const p = parent.p;
		if (!p || mode !== 'vlsm') return {};
		try {
			return { plan: planVlsm(p, parseNeeds(needsText), { pointToPoint: p2p, min64 }) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	const fa = (n: bigint) => formatAddress(parent.p?.v ?? 4, n);
	const markdown = $derived(plan.plan ? planMarkdown(plan.plan) : '');

	function download(text: string, name: string, type: string) {
		const url = URL.createObjectURL(new Blob([text], { type }));
		const a = document.createElement('a');
		a.href = url;
		a.download = name;
		document.body.append(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	const fileBase = $derived(
		parent.p ? `vlsm-${formatPrefix(parent.p).replace(/[/:]/g, '_')}` : 'vlsm'
	);

	onMount(() => {
		const h = readHash();
		if (h.in) parentText = h.in;
		if (h.mode === 'split' || h.mode === 'vlsm') mode = h.mode;
		if (h.by === 'count' || h.by === 'len') by = h.by;
		if (h.n) countText = h.n;
		if (h.len) lenText = h.len;
		if (h.needs) needsText = h.needs;
		if (h.p2p === '1') p2p = true;
		if (h.min64 === '0') min64 = false;
		ready = true;
	});

	$effect(() => {
		const state = {
			in: parentText,
			mode,
			by: mode === 'split' ? by : undefined,
			n: mode === 'split' && by === 'count' ? countText : undefined,
			len: mode === 'split' && by === 'len' ? lenText : undefined,
			needs: mode === 'vlsm' ? needsText : undefined,
			p2p: p2p ? '1' : undefined,
			min64: min64 ? undefined : '0'
		};
		if (ready) writeHash(state);
	});
</script>

<div class="grid top">
	<div class="field">
		<label class="label" for="ss-parent">Parent prefix</label>
		<input
			id="ss-parent"
			type="text"
			bind:value={parentText}
			spellcheck="false"
			autocomplete="off"
		/>
	</div>
	<div class="field">
		<span class="label" id="ss-mode">Mode</span>
		<div class="row" role="group" aria-labelledby="ss-mode">
			<button type="button" aria-pressed={mode === 'vlsm'} onclick={() => (mode = 'vlsm')}
				>VLSM plan</button
			>
			<button type="button" aria-pressed={mode === 'split'} onclick={() => (mode = 'split')}
				>Equal split</button
			>
		</div>
	</div>
</div>

{#if parent.error}
	<p class="error" role="alert">{parent.error}</p>
{:else if parent.p}
	{@const p = parent.p}
	<p class="label summary">
		{formatPrefix(p)} · IPv{p.v} · {formatCount(1n << BigInt((p.v === 4 ? 32 : 128) - p.len))} addresses
		{#if p.hostBitsSet}· host bits cleared{/if}
	</p>
{/if}

{#if mode === 'split'}
	<div class="grid">
		<div class="field">
			<span class="label" id="ss-by">Split by</span>
			<div class="row" role="group" aria-labelledby="ss-by">
				<button type="button" aria-pressed={by === 'count'} onclick={() => (by = 'count')}
					>Number of subnets</button
				>
				<button type="button" aria-pressed={by === 'len'} onclick={() => (by = 'len')}
					>Prefix length</button
				>
			</div>
		</div>
		{#if by === 'count'}
			<div class="field">
				<label class="label" for="ss-count">Number of subnets</label>
				<input
					id="ss-count"
					type="text"
					inputmode="numeric"
					bind:value={countText}
					autocomplete="off"
				/>
			</div>
		{:else}
			<div class="field">
				<label class="label" for="ss-len">New prefix length</label>
				<input
					id="ss-len"
					type="text"
					inputmode="numeric"
					bind:value={lenText}
					autocomplete="off"
				/>
			</div>
		{/if}
	</div>

	{#if split.error}
		<p class="error" role="alert">{split.error}</p>
	{:else if split.s}
		{@const s = split.s}
		<dl class="readout">
			<div>
				<dt>Subnets</dt>
				<dd>{formatCount(s.count)} × /{s.newLen}</dd>
			</div>
			<div>
				<dt>Addresses each</dt>
				<dd>{formatCount(1n << BigInt((s.parent.v === 4 ? 32 : 128) - s.newLen))}</dd>
			</div>
			<div>
				<dt>Usable hosts each</dt>
				<dd>{formatCount(s.subnets[0].usable)}</dd>
			</div>
		</dl>
		{#if by === 'count' && BigInt(countText.trim()) !== s.count}
			<p class="note">
				Equal subnets come in powers of two, so {countText.trim()} becomes {formatCount(s.count)}.
			</p>
		{/if}
		<div class="scroll">
			<table>
				<thead>
					<tr>
						<th scope="col">#</th>
						<th scope="col">Prefix</th>
						<th scope="col">First usable</th>
						<th scope="col">Last usable</th>
						{#if s.parent.v === 4}<th scope="col">Broadcast</th>{/if}
					</tr>
				</thead>
				<tbody>
					{#each s.subnets as sub, i (i)}
						<tr>
							<td>{i + 1}</td>
							<td class="mono">{formatPrefix(sub)}</td>
							<td class="mono">{fa(sub.first)}</td>
							<td class="mono">{fa(sub.last)}</td>
							{#if s.parent.v === 4}
								<td class="mono">{sub.len >= 31 ? 'n/a' : fa(sub.last + 1n)}</td>
							{/if}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if s.truncated}
			<p class="note">Showing the first {s.subnets.length} of {formatCount(s.count)} subnets.</p>
		{/if}
		<div class="row">
			<Copy value={s.subnets.map(formatPrefix).join('\n')} label="Copy prefixes" />
		</div>
	{/if}
{:else}
	<div class="grid">
		<div class="field">
			<label class="label" for="ss-needs">Needs, one per line: name and hosts</label>
			<textarea id="ss-needs" bind:value={needsText} spellcheck="false" autocomplete="off"
			></textarea>
		</div>
		<div class="field opts">
			<span class="label" id="ss-opts">Options</span>
			<div class="row" role="group" aria-labelledby="ss-opts">
				{#if parent.p?.v === 6}
					<button type="button" aria-pressed={min64} onclick={() => (min64 = !min64)}
						>At least /64 per subnet</button
					>
				{:else}
					<button type="button" aria-pressed={p2p} onclick={() => (p2p = !p2p)}
						>/31 and /32 for 1 or 2 hosts</button
					>
				{/if}
			</div>
			{#if parent.p?.v === 6}
				<p class="note">
					LANs get a /64 (RFC 7421): SLAAC and many other mechanisms assume it. Turn this off only
					for links such as a /127 point-to-point (RFC 6164).
				</p>
			{:else}
				<p class="note">
					Off: the smallest block is a /30 with network and broadcast. On: two hosts get a /31 (RFC
					3021), one host a /32.
				</p>
			{/if}
		</div>
	</div>

	{#if plan.error}
		<p class="error" role="alert">{plan.error}</p>
	{:else if plan.plan}
		{@const pl = plan.plan}
		<p class="label summary">
			{pl.allocations.length} subnets · {formatCount(pl.used)} of {formatCount(pl.total)} addresses allocated
		</p>
		<div class="scroll">
			<table>
				<thead>
					<tr>
						<th scope="col">Name</th>
						<th scope="col" class="num">Hosts</th>
						<th scope="col">Prefix</th>
						<th scope="col">Range</th>
						<th scope="col" class="num">Usable</th>
						<th scope="col" class="num">Wasted</th>
					</tr>
				</thead>
				<tbody>
					{#each pl.allocations as a, i (i)}
						<tr>
							<td>{a.name}</td>
							<td class="num mono">{formatCount(a.hosts)}</td>
							<td class="mono strong">{formatPrefix(a)}</td>
							<td class="mono wrap">{fa(a.first)} to {fa(a.last)}</td>
							<td class="num mono">{formatCount(a.usable)}</td>
							<td class="num mono">{formatCount(a.wasted)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<h2 class="label free-head">Remaining free blocks</h2>
		{#if pl.free.length}
			<p class="mono free">{pl.free.map(formatPrefix).join(', ')}</p>
		{:else}
			<p class="note">None: the parent prefix is fully allocated.</p>
		{/if}
		<div class="row actions">
			<button type="button" onclick={() => download(planCsv(pl), `${fileBase}.csv`, 'text/csv')}
				>Download CSV</button
			>
			<button type="button" onclick={() => download(markdown, `${fileBase}.md`, 'text/markdown')}
				>Download Markdown</button
			>
			<Copy value={markdown} label="Copy Markdown" />
		</div>
		<p class="note">
			Largest first: sorted by block size, each subnet starts where the previous one ends, so every
			block stays aligned and the free space is one run at the end. Wasted is the block size minus
			the hosts asked for{pl.parent.v === 4 ? ', including network and broadcast' : ''}.
		</p>
	{/if}
{/if}

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
		gap: 1.25rem;
		margin: 1rem 0;
	}
	.top {
		margin-top: 0;
	}
	.opts {
		align-content: start;
	}
	.summary {
		margin: 0.5rem 0 1rem;
		overflow-wrap: anywhere;
	}
	.readout {
		margin: 0 0 1rem;
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
	.num {
		text-align: right;
	}
	.strong {
		font-weight: 700;
		color: var(--signal);
	}
	.free-head {
		margin: 1rem 0 0.25rem;
		font-weight: 400;
	}
	.free {
		margin: 0 0 1rem;
		overflow-wrap: anywhere;
	}
	.actions {
		margin-bottom: 1rem;
	}
</style>
