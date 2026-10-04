<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		buildUrl,
		commonTypes,
		formatTtl,
		isIpAddress,
		lookupAll,
		plan,
		queryTypes,
		resolvers,
		TIMEOUT_MS,
		type DnsRecord,
		type LookupResult,
		type Plan,
		type ResolverId,
		type TypeChoice
	} from './logic';

	let input = $state('example.com');
	let choice = $state<TypeChoice>('A');
	let resolver = $state<ResolverId>('cloudflare');
	let busy = $state(false);
	let run = $state<{ results: LookupResult[]; totalMs: number; resolver: ResolverId } | null>(null);
	let ready = false;
	let seq = 0;

	const planned = $derived.by((): { p?: Plan; error?: string } => {
		if (!input.trim()) return {};
		try {
			return { p: plan(input, choice) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	const urls = $derived(planned.p ? planned.p.queries.map((q) => buildUrl(resolver, q)) : []);

	function onInput() {
		if (isIpAddress(input)) choice = 'PTR';
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		const p = planned.p;
		if (!p || busy) return;
		const id = ++seq;
		const r = resolver;
		busy = true;
		run = null;
		const start = performance.now();
		const results = await lookupAll(r, p.queries);
		if (id !== seq) return;
		run = { results, totalMs: performance.now() - start, resolver: r };
		busy = false;
	}

	const ms = (n: number) => `${Math.round(n)} ms`;

	const flagInfo: [keyof NonNullable<LookupResult['answer']>['flags'], string][] = [
		['AD', 'Authentic data: the resolver validated DNSSEC'],
		['TC', 'Truncated'],
		['RD', 'Recursion desired'],
		['RA', 'Recursion available'],
		['CD', 'Checking disabled: DNSSEC validation off']
	];

	onMount(() => {
		const h = readHash();
		if (h.in) input = h.in;
		if (h.t === 'ALL' || (queryTypes as readonly string[]).includes(h.t))
			choice = h.t as TypeChoice;
		if (h.r === 'google') resolver = 'google';
		if (h.in && !h.t && isIpAddress(input)) choice = 'PTR';
		ready = true;
	});

	$effect(() => {
		const state = {
			in: input,
			t: choice === 'A' ? undefined : choice,
			r: resolver === 'google' ? 'google' : undefined
		};
		if (ready) writeHash(state);
	});
</script>

{#snippet table(caption: string, rows: DnsRecord[])}
	<table>
		<caption class="label">{caption}</caption>
		<thead>
			<tr>
				<th scope="col">Name</th>
				<th scope="col">Type</th>
				<th scope="col">TTL</th>
				<th scope="col">Data</th>
			</tr>
		</thead>
		<tbody>
			{#each rows as r, i (i)}
				<tr>
					<td class="mono name">{r.name}</td>
					<td class="mono strong">{r.typeName}</td>
					<td class="mono ttl">{r.ttl}<span class="dim">{formatTtl(r.ttl)}</span></td>
					<td class="mono data"
						><div class="cell">
							{#if r.caa}
								<span class="kv"><span class="dim">flag</span> {r.caa.flags}</span>
								<span class="kv"><span class="dim">tag</span> {r.caa.tag}</span>
								<span class="kv"><span class="dim">value</span> {r.caa.value}</span>
							{:else if r.mx}
								<span class="kv"><span class="dim">pref</span> {r.mx.preference}</span>
								<span class="kv">{r.mx.exchange}</span>
							{:else}
								{#if r.txtKind}<span class="kind">{r.txtKind}</span>{/if}
								<span class="val">{r.display}</span>
							{/if}
							<Copy value={r.display} />
						</div></td
					>
				</tr>
			{/each}
		</tbody>
	</table>
{/snippet}

<form class="ask" onsubmit={submit}>
	<div class="grid">
		<div class="field">
			<label class="label" for="dns-name">Domain name or IP address</label>
			<input
				id="dns-name"
				type="text"
				bind:value={input}
				oninput={onInput}
				spellcheck="false"
				autocomplete="off"
				autocapitalize="off"
				inputmode="url"
			/>
		</div>
		<div class="field">
			<label class="label" for="dns-type">Record type</label>
			<select id="dns-type" bind:value={choice}>
				{#each queryTypes as t (t)}<option value={t}>{t}</option>{/each}
				<option value="ALL">ALL common ({commonTypes.join(' ')})</option>
			</select>
		</div>
	</div>

	<div class="row opts" role="group" aria-label="Resolver">
		<span class="label">Resolver</span>
		{#each Object.values(resolvers) as r (r.id)}
			<button type="button" aria-pressed={resolver === r.id} onclick={() => (resolver = r.id)}
				>{r.label}</button
			>
		{/each}
	</div>

	{#if planned.error}
		<p class="error" role="alert">{planned.error}</p>
	{:else if planned.p}
		{#if planned.p.reverseOf}
			<p class="note">IP address: looks up the PTR record of the reverse name.</p>
		{:else if planned.p.fromUrl}
			<p class="note">URL: only the host name is looked up.</p>
		{/if}
		<div class="send">
			<p class="label">
				Will send {urls.length === 1 ? 'this request' : `${urls.length} requests`}
			</p>
			<ul>
				{#each urls as u (u)}<li class="mono">GET {u}</li>{/each}
			</ul>
		</div>
	{/if}

	<button type="submit" class="go" disabled={!planned.p || busy}>
		{busy ? 'Looking up' : 'Look up'}
	</button>
</form>

<div aria-live="polite">
	{#if busy}
		<p class="label wait">Waiting for {resolvers[resolver].host}, up to {TIMEOUT_MS / 1000} s</p>
	{/if}
	{#if run}
		{@const rv = resolvers[run.resolver]}
		<p class="by">
			Answered by <strong>{rv.label}</strong> <span class="mono">({rv.host})</span> in
			<span class="mono">{ms(run.totalMs)}</span>
		</p>
	{/if}
</div>

{#if run}
	{#each run.results as res (res.url)}
		<section class="res">
			<h2 class="head">
				<span class="mono strong">{res.query.type}</span>
				<span class="mono qname">{res.query.name}</span>
				{#if res.answer}
					<span class="status" class:bad={res.answer.status !== 0}>{res.answer.statusName}</span>
				{/if}
				<span class="label">{ms(res.ms)}</span>
			</h2>
			{#if res.error}
				<p class="error" role="alert">{res.error}</p>
			{:else if res.answer}
				{@const a = res.answer}
				{#if a.status !== 0}<p class="note">{a.statusText}.</p>{/if}
				<ul class="flags" aria-label="Header flags">
					{#each flagInfo as [f, text] (f)}
						<li class:on={a.flags[f]}>
							<span class="mono">{f}</span>
							<span class="visually-hidden">{a.flags[f] ? 'set' : 'not set'}:</span>
							<span class="ftext">{text}</span>
						</li>
					{/each}
				</ul>
				{#if a.answer.length}
					<div class="scroll">{@render table('Answer', a.answer)}</div>
				{:else if a.status === 0}
					<p class="note">No records of this type (NODATA).</p>
				{/if}
				{#if a.authority.length}
					<div class="scroll">{@render table('Authority', a.authority)}</div>
				{/if}
				{#if a.additional.length}
					<div class="scroll">{@render table('Additional', a.additional)}</div>
				{/if}
				{#if a.comment}<p class="label cmt">Resolver comment: {a.comment}</p>{/if}
			{/if}
		</section>
	{/each}
{/if}

<p class="note foot">
	DNS over HTTPS (DoH) sends an ordinary DNS question inside an HTTPS request, so it works from a
	browser. The resolver you pick sees the name, the record type and your IP address. Nothing else is
	sent: no cookies, no referrer. Nothing is sent until you press Look up, and failed requests are
	not retried.
</p>

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
		gap: 1rem 1.25rem;
	}
	.opts {
		margin: 1rem 0;
	}
	.send {
		margin: 0 0 1rem;
		border-top: 2px solid var(--rule);
		padding-top: 0.4rem;
	}
	.send p {
		margin: 0 0 0.3rem;
	}
	.send ul {
		list-style: none;
		margin: 0;
		padding: 0;
		font-size: 0.875rem;
	}
	.send li {
		overflow-wrap: anywhere;
		padding: 0.15rem 0;
	}
	.ask .note,
	.ask .error {
		margin-bottom: 1rem;
	}
	.go {
		background: var(--signal);
		color: var(--signal-ink);
		border-color: var(--signal);
		font-weight: 700;
	}
	.go:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.wait,
	.by {
		margin: 1.25rem 0 0;
	}
	.res {
		margin: 1.5rem 0;
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 0.75rem;
		font-size: 1.125rem;
		font-weight: 400;
		margin-bottom: 0.5rem;
	}
	.qname {
		overflow-wrap: anywhere;
	}
	.strong {
		font-weight: 700;
	}
	.status {
		font-family: var(--font-mono);
		font-weight: 700;
		padding: 0 0.4rem;
		border: 1px solid var(--rule);
	}
	.status.bad {
		color: var(--signal);
		border-color: var(--signal);
		background: var(--hilite);
	}
	.flags {
		list-style: none;
		margin: 0 0 0.75rem;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		font-size: 0.8125rem;
	}
	.flags li {
		border: 1px solid var(--rule-soft);
		padding: 0.15rem 0.45rem;
		color: var(--ink-2);
	}
	.flags li .ftext {
		display: none;
	}
	.flags li.on {
		border-color: var(--rule);
		color: var(--ink);
		font-weight: 700;
	}
	.flags li.on .ftext {
		display: inline;
		font-weight: 400;
	}
	.scroll {
		margin: 0.5rem 0 1rem;
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
		vertical-align: top;
	}
	th {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-2);
		font-weight: 400;
	}
	.name,
	.data {
		overflow-wrap: anywhere;
	}
	.ttl {
		white-space: nowrap;
	}
	.ttl .dim {
		display: block;
	}
	.dim {
		color: var(--ink-2);
		font-size: 0.8125rem;
	}
	.cell {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 0.75rem;
	}
	.val {
		flex: 1 1 12rem;
		min-width: 0;
	}
	.kind {
		background: var(--hilite);
		color: var(--signal);
		font-weight: 700;
		font-size: 0.75rem;
		letter-spacing: 0.06em;
		padding: 0 0.35rem;
		border: 1px solid var(--signal);
	}
	.cell :global(.copy) {
		margin-left: auto;
	}
	.cmt {
		text-transform: none;
		letter-spacing: 0.02em;
		margin: 0 0 1rem;
	}
	.foot {
		margin-top: 2rem;
	}
	@media (max-width: 40rem) {
		thead {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
		}
		tbody tr {
			display: grid;
			grid-template-columns: auto 1fr;
			gap: 0.15rem 0.75rem;
			padding: 0.45rem 0;
			border-bottom: 1px solid var(--rule-soft);
		}
		td {
			border: 0;
			padding: 0;
		}
		td.name {
			grid-column: 1 / -1;
		}
		.ttl .dim {
			display: inline;
			margin-left: 0.5rem;
		}
		td.data {
			grid-column: 1 / -1;
		}
	}
</style>
