<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import { resolvers, TIMEOUT_MS, type LookupResult, type ResolverId } from '../dns/logic';
	import {
		classifyInput,
		dohResolve,
		LOOKUP_LIMIT,
		parseSpf,
		qualifierWords,
		VOID_LIMIT,
		walkSpf,
		type Finding,
		type InputKind,
		type ParsedSpf,
		type SpfNode,
		type SpfTree
	} from './logic';

	let input = $state('v=spf1 ip4:192.0.2.0/24 include:_spf.example.net mx ~all');
	let resolver = $state<ResolverId>('cloudflare');
	let checkTargets = $state(true);
	let busy = $state(false);
	let tree = $state<SpfTree | null>(null);
	let treeFor = $state('');
	let sent = $state<LookupResult[]>([]);
	let ready = false;
	let seq = 0;

	const kind = $derived.by((): { k?: InputKind; error?: string } => {
		try {
			return { k: classifyInput(input) ?? undefined };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	const parsed = $derived.by((): { p?: ParsedSpf; error?: string } => {
		if (kind.k?.kind !== 'record') return {};
		try {
			return { p: parseSpf(kind.k.record) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	const domain = $derived(kind.k?.kind === 'domain' ? kind.k.domain : '');

	async function run(e: SubmitEvent) {
		e.preventDefault();
		if (!domain || busy) return;
		const id = ++seq;
		const d = domain;
		busy = true;
		tree = null;
		sent = [];
		const log: LookupResult[] = [];
		const resolve = dohResolve(resolver, (r) => {
			if (id !== seq) return;
			log.push(r);
			sent = [...log];
		});
		try {
			const t = await walkSpf(d, resolve, { checkTargets });
			if (id !== seq) return;
			tree = t;
			treeFor = d;
		} finally {
			if (id === seq) busy = false;
		}
	}

	const ms = (n: number) => `${Math.round(n)} ms`;

	onMount(() => {
		const h = readHash();
		if (h.in) input = h.in;
		if (h.r === 'google') resolver = 'google';
		if (h.t === '0') checkTargets = false;
		ready = true;
	});

	$effect(() => {
		const state = {
			in: input,
			r: resolver === 'google' ? 'google' : undefined,
			t: checkTargets ? undefined : '0'
		};
		if (ready) writeHash(state);
	});
</script>

{#snippet findings(list: Finding[])}
	{#if list.length}
		<ul class="findings">
			{#each list as f, i (i)}
				<li class="lv-{f.level}"><span class="lvl">{f.level}</span> {f.text}</li>
			{/each}
		</ul>
	{/if}
{/snippet}

{#snippet terms(p: ParsedSpf)}
	<ol class="terms">
		<li>
			<span class="mono raw">v=spf1</span>
			<span class="explain">Version: this TXT record is an SPF policy.</span>
		</li>
		{#each p.terms as t, i (i)}
			<li class:bad={!!t.error} class:off={t.unreachable}>
				<span class="mono raw">{t.raw}</span>
				{#if t.kind === 'mechanism' && !t.error}
					<span class="badge q{t.qualifier === '+' ? 'pass' : qualifierWords[t.qualifier].result}"
						>{qualifierWords[t.qualifier].result}</span
					>
				{/if}
				{#if t.lookup}<span class="badge">1 lookup</span>{/if}
				<span class="explain"
					>{t.explain}{#if t.unreachable}
						Never reached: it comes after all.{/if}</span
				>
				{#if t.error}<span class="explain err">{t.error}</span>{/if}
			</li>
		{/each}
	</ol>
{/snippet}

{#snippet node(n: SpfNode)}
	<li class="node">
		<div class="nhead">
			{#if n.term}<span class="mono via">{n.term}</span>{:else}<span class="mono via"
					>{n.domain}</span
				>{/if}
			<span class="count" title="Lookups in this record / including everything below"
				>{n.own} own, {n.total} total</span
			>
			{#if n.voids}<span class="count warn">{n.voids} void</span>{/if}
		</div>
		{#if n.error}<p class="error" role="alert">{n.error}</p>{/if}
		{#if n.record}
			<div class="rec">
				<span class="mono">{n.record}</span>
				<Copy value={n.record} />
			</div>
		{/if}
		{@render findings(n.findings.filter((f) => f.text !== n.error))}
		{#if n.checks.length}
			<ul class="checks">
				{#each n.checks as c, i (i)}
					<li class:void={c.result === 'void'} class:cerr={c.result === 'error'}>
						<span class="mono">{c.term}</span>
						<span class="dim mono">{c.type} {c.name}</span>
						<span>{c.result === 'void' ? 'void: ' : ''}{c.detail}</span>
					</li>
				{/each}
			</ul>
		{/if}
		{#if n.parsed}
			<details>
				<summary class="label">Explain {n.parsed.terms.length} terms</summary>
				{@render terms(n.parsed)}
			</details>
		{/if}
		{#if n.children.length}
			<ul class="tree">
				{#each n.children as c, i (i)}{@render node(c)}{/each}
			</ul>
		{/if}
	</li>
{/snippet}

<form onsubmit={run}>
	<div class="field">
		<label class="label" for="spf-in">SPF record or domain name</label>
		<textarea
			id="spf-in"
			rows="3"
			bind:value={input}
			spellcheck="false"
			autocomplete="off"
			autocapitalize="off"></textarea>
	</div>

	{#if kind.error}
		<p class="error" role="alert">{kind.error}</p>
	{:else if domain}
		<div class="row opts" role="group" aria-label="Resolver">
			<span class="label">Resolver</span>
			{#each Object.values(resolvers) as r (r.id)}
				<button type="button" aria-pressed={resolver === r.id} onclick={() => (resolver = r.id)}
					>{r.label}</button
				>
			{/each}
			<button
				type="button"
				aria-pressed={checkTargets}
				onclick={() => (checkTargets = !checkTargets)}>Check a, mx, exists targets</button
			>
		</div>
		<p class="note">
			Sends GET {resolvers[resolver].endpoint}?name={domain}&type=TXT, then one request per include
			and redirect{checkTargets
				? ', and one per a, mx and exists target to find void lookups'
				: ''}. Nothing is sent until you press Look up.
		</p>
		<button type="submit" class="go" disabled={busy}>{busy ? 'Looking up' : 'Look up'}</button>
	{/if}
</form>

{#if parsed.error}
	<p class="error" role="alert">{parsed.error}</p>
{:else if parsed.p}
	{@const p = parsed.p}
	<dl class="readout">
		<div>
			<dt>Lookups in this record</dt>
			<dd>{p.lookups} of {LOOKUP_LIMIT} (includes count their own lookups too)</dd>
		</div>
		<div>
			<dt>Default result</dt>
			<dd>
				{#if p.hasAll}
					{@const a = p.terms.find((t) => t.name === 'all' && t.kind === 'mechanism')}
					{a ? qualifierWords[a.qualifier].result : ''}
				{:else if p.redirect}
					from {p.redirect}
				{:else}
					neutral (no all)
				{/if}
			</dd>
		</div>
	</dl>
	{@render findings(p.findings)}
	{@render terms(p)}
	<p class="note">
		To count nested lookups, enter just the domain name: the tool then fetches the record and every
		include over DNS over HTTPS.
	</p>
{/if}

<div aria-live="polite">
	{#if busy}
		<p class="label wait">
			Resolving with {resolvers[resolver].host}, up to {TIMEOUT_MS / 1000} s per request
		</p>
	{/if}
</div>

{#if tree}
	<section class="res">
		<h2 class="label">Result for {treeFor}</h2>
		<dl class="readout">
			<div class:over={tree.lookups > LOOKUP_LIMIT}>
				<dt>DNS lookups</dt>
				<dd>{tree.lookups} of {LOOKUP_LIMIT}</dd>
			</div>
			<div class:over={tree.voids > VOID_LIMIT}>
				<dt>Void lookups</dt>
				<dd>{tree.voids} of {VOID_LIMIT}</dd>
			</div>
			<div>
				<dt>Requests sent</dt>
				<dd>{tree.queries}</dd>
			</div>
		</dl>
		{@render findings(tree.findings)}
		{#if tree.truncated}
			<p class="note">Stopped early: this tool sends at most 60 requests per check.</p>
		{/if}
		<ul class="tree top">{@render node(tree.root)}</ul>
	</section>
{/if}

{#if sent.length}
	<section class="res">
		<h2 class="label">Queries sent ({sent.length})</h2>
		<ol class="sent">
			{#each sent as q, i (i)}
				<li>
					<span class="mono">GET {q.url}</span>
					<span class="dim mono">{q.error ? 'failed' : q.answer?.statusName} {ms(q.ms)}</span>
				</li>
			{/each}
		</ol>
	</section>
{/if}

<p class="note foot">
	SPF lists the servers allowed to send mail with this domain in the envelope sender (Return-Path).
	Receivers stop at the first matching term. RFC 7208 allows 10 terms that need DNS (include, a, mx,
	ptr, exists, redirect) across the whole tree, and 2 lookups that return nothing. ip4, ip6 and all
	are free. Explaining a pasted record never touches the network.
</p>

<style>
	textarea {
		min-height: 5rem;
	}
	.opts {
		margin: 1rem 0 0.75rem;
	}
	form .note,
	form .error {
		margin: 0.75rem 0;
		overflow-wrap: anywhere;
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
	.readout {
		margin: 1.25rem 0 0.75rem;
	}
	.readout .over {
		background: var(--hilite);
	}
	.readout .over dd {
		color: var(--signal);
		font-weight: 700;
	}
	.findings {
		list-style: none;
		margin: 0.5rem 0;
		padding: 0;
		display: grid;
		gap: 0.3rem;
		font-size: 0.9375rem;
	}
	.findings li {
		border-left: 3px solid var(--rule-soft);
		padding: 0.15rem 0 0.15rem 0.6rem;
		overflow-wrap: anywhere;
	}
	.findings li.lv-error {
		border-left-color: var(--signal);
		background: var(--hilite);
	}
	.findings li.lv-warn {
		border-left-color: var(--signal);
	}
	.lvl {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-2);
		margin-right: 0.25rem;
	}
	.lv-error .lvl,
	.lv-warn .lvl {
		color: var(--signal);
	}
	.terms {
		list-style: none;
		margin: 0.75rem 0;
		padding: 0;
		border-top: 2px solid var(--rule);
	}
	.terms li {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.2rem 0.6rem;
		padding: 0.45rem 0;
		border-bottom: 1px solid var(--rule-soft);
	}
	.terms li.off {
		color: var(--ink-2);
	}
	.terms li.bad .raw {
		color: var(--signal);
	}
	.raw {
		font-weight: 700;
		overflow-wrap: anywhere;
	}
	.explain {
		flex: 1 1 100%;
		font-size: 0.9375rem;
		overflow-wrap: anywhere;
	}
	.explain.err {
		color: var(--signal);
		font-family: var(--font-mono);
		font-size: 0.875rem;
	}
	.badge {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		border: 1px solid var(--rule-soft);
		padding: 0 0.35rem;
		color: var(--ink-2);
	}
	.badge.qfail {
		border-color: var(--rule);
		color: var(--ink);
	}
	.badge.qpass {
		background: var(--hilite);
		border-color: var(--signal);
		color: var(--signal);
	}
	.res {
		margin: 1.5rem 0;
	}
	.res h2 {
		margin-bottom: 0.5rem;
		overflow-wrap: anywhere;
	}
	.tree {
		list-style: none;
		margin: 0;
		padding: 0 0 0 0.9rem;
		border-left: 1px solid var(--rule-soft);
	}
	.tree.top {
		padding-left: 0;
		border-left: 0;
	}
	.node {
		padding: 0.5rem 0 0.25rem;
		min-width: 0;
	}
	.nhead {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.6rem;
		align-items: baseline;
		border-top: 2px solid var(--rule);
		padding-top: 0.35rem;
	}
	.via {
		font-weight: 700;
		overflow-wrap: anywhere;
	}
	.count {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		border: 1px solid var(--rule);
		padding: 0 0.35rem;
	}
	.count.warn {
		border-color: var(--signal);
		color: var(--signal);
	}
	.rec {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.75rem;
		align-items: baseline;
		margin: 0.35rem 0;
		font-size: 0.875rem;
	}
	.rec .mono {
		flex: 1 1 12rem;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.node .error {
		margin: 0.35rem 0;
	}
	.checks,
	.sent {
		list-style: none;
		margin: 0.35rem 0;
		padding: 0;
		font-size: 0.875rem;
	}
	.checks li,
	.sent li {
		display: flex;
		flex-wrap: wrap;
		gap: 0.15rem 0.6rem;
		padding: 0.2rem 0;
		border-bottom: 1px solid var(--rule-soft);
		overflow-wrap: anywhere;
	}
	.checks li > *,
	.sent li > * {
		min-width: 0;
	}
	.checks li.void,
	.checks li.cerr {
		background: var(--hilite);
	}
	.dim {
		color: var(--ink-2);
	}
	details {
		margin: 0.35rem 0;
	}
	summary {
		cursor: pointer;
		min-height: 2.75rem;
		display: flex;
		align-items: center;
	}
	.wait {
		margin: 1rem 0 0;
	}
	.foot {
		margin-top: 2rem;
	}
</style>
