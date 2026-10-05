<script lang="ts">
	import { onMount } from 'svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import type { HttpStatus } from './data';
	import { search, type ClassFilter } from './logic';

	let query = $state('');
	let cls = $state<ClassFilter>(0);
	let nonStandard = $state(true);
	let list = $state<HttpStatus[]>([]);
	let classInfo = $state<Record<number, { name: string; text: string }>>({});
	let ready = false;

	const results = $derived(search(list, { query, cls, nonStandard }));
	const filters: { v: ClassFilter; label: string }[] = [
		{ v: 0, label: 'All' },
		{ v: 1, label: '1xx' },
		{ v: 2, label: '2xx' },
		{ v: 3, label: '3xx' },
		{ v: 4, label: '4xx' },
		{ v: 5, label: '5xx' }
	];

	onMount(() => {
		const h = readHash();
		if (h.in) query = h.in;
		else if (h.q) query = h.q;
		const c = Number(h.c);
		if (c >= 1 && c <= 5) cls = c as ClassFilter;
		if (h.ns === '0') nonStandard = false;
		ready = true;
		// The table is static reference data, loaded on demand to keep the page small.
		import('./data').then((m) => {
			list = m.statuses;
			classInfo = m.classes;
		});
	});

	$effect(() => {
		const state = {
			q: query,
			c: cls ? String(cls) : undefined,
			ns: nonStandard ? undefined : '0'
		};
		if (ready) writeHash(state);
	});
</script>

<div class="field">
	<label class="label" for="hs-q">Code or words</label>
	<input
		id="hs-q"
		type="search"
		bind:value={query}
		spellcheck="false"
		autocomplete="off"
		placeholder="404, 5xx, timeout, redirect"
	/>
</div>

<div class="row opts" role="group" aria-label="Filter">
	<span class="label">Class</span>
	{#each filters as f (f.v)}
		<button type="button" aria-pressed={cls === f.v} onclick={() => (cls = f.v)}>{f.label}</button>
	{/each}
	<button type="button" aria-pressed={nonStandard} onclick={() => (nonStandard = !nonStandard)}
		>Non-standard</button
	>
</div>

{#if cls && classInfo[cls]}
	<p class="note">{cls}xx {classInfo[cls].name}: {classInfo[cls].text}</p>
{/if}

<p class="label count" aria-live="polite">
	{#if list.length}{results.length} of {list.length} codes{:else}Loading table{/if}
</p>

<ul class="codes">
	{#each results as s (`${s.code}/${s.vendor ?? ''}`)}
		<li class:vendor={!!s.vendor}>
			<div class="head">
				<span class="code mono">{s.code}</span>
				<span class="name">{s.name}</span>
			</div>
			<p class="meaning">{s.meaning}</p>
			<dl class="facts">
				<div>
					<dt>Typical cause</dt>
					<dd>{s.cause}</dd>
				</div>
				<div>
					<dt>Cacheable by default</dt>
					<dd>{s.cacheable ? 'Yes, heuristically' : 'No, only with explicit headers'}</dd>
				</div>
				<div>
					<dt>Source</dt>
					<dd>
						{s.vendor ? `Non-standard, ${s.vendor}` : s.ref}{#if s.status}<span class="tag"
								>{s.status}</span
							>{/if}
					</dd>
				</div>
			</dl>
		</li>
	{/each}
</ul>

{#if list.length && !results.length}
	<p class="note">No match. Try a code prefix like 4 or 50, or a word like proxy.</p>
{/if}

<p class="note">
	Standard codes follow the IANA status code registry, mostly defined in RFC 9110. Cacheable by
	default means a cache may store the response without Cache-Control or Expires (RFC 9110 §15.1).
	Non-standard codes are vendor specific and never sent by other servers.
</p>

<style>
	.opts {
		margin: 1rem 0;
	}
	.count {
		margin: 0 0 0.5rem;
	}
	.codes {
		list-style: none;
		padding: 0;
		margin: 0 0 1.5rem;
		border-top: 2px solid var(--rule);
	}
	.codes li {
		padding: 0.75rem 0;
		border-bottom: 1px solid var(--rule-soft);
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.75rem;
		align-items: baseline;
	}
	.code {
		font-size: 1.375rem;
		font-weight: 700;
		color: var(--signal);
	}
	.vendor .code {
		color: var(--ink-2);
	}
	.name {
		font-weight: 700;
		overflow-wrap: anywhere;
	}
	.meaning {
		margin: 0.25rem 0 0.4rem;
	}
	.facts {
		margin: 0;
		display: grid;
		gap: 0.15rem;
		font-size: 0.9375rem;
	}
	.facts > div {
		display: grid;
		grid-template-columns: minmax(7rem, 12rem) 1fr;
		gap: 0 1rem;
	}
	.facts dt {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-2);
		padding-top: 0.15rem;
	}
	.facts dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.tag {
		margin-left: 0.5rem;
		padding: 0 0.3rem;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		text-transform: uppercase;
		background: var(--hilite);
	}
	@media (max-width: 30rem) {
		.facts > div {
			grid-template-columns: 1fr;
		}
	}
</style>
