<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		formatJson,
		JsonError,
		locate,
		type FormatResult,
		type Indent,
		type Located
	} from './logic';

	/** Inputs above this size are not written to the URL. */
	const HASH_LIMIT = 8000;

	let input = $state('');
	/** The text that was last formatted. Lags `input` by the debounce delay. */
	let committed = $state('');
	let indent = $state<Indent>(2);
	let sortKeys = $state(false);
	let ready = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	const indents: { v: Indent; label: string }[] = [
		{ v: 2, label: '2 spaces' },
		{ v: 4, label: '4 spaces' },
		{ v: 'tab', label: 'Tab' },
		{ v: 'min', label: 'Minify' }
	];

	function onInput() {
		clearTimeout(timer);
		const delay = input.length > 1_000_000 ? 400 : input.length > 50_000 ? 200 : 80;
		timer = setTimeout(() => (committed = input), delay);
	}

	const result = $derived.by((): { r?: FormatResult; error?: string; at?: Located } => {
		if (!committed.trim()) return {};
		try {
			return { r: formatJson(committed, indent, sortKeys) };
		} catch (e) {
			if (e instanceof JsonError) return { error: e.message, at: locate(committed, e.pos) };
			return { error: (e as Error).message };
		}
	});

	const fmt = new Intl.NumberFormat('en-GB');
	const size = (n: number) =>
		n < 10_000 ? `${fmt.format(n)} bytes` : `${fmt.format(Math.round(n / 1024))} KiB`;

	onMount(() => {
		const h = readHash();
		if (h.ind) {
			const v = h.ind === 'tab' || h.ind === 'min' ? h.ind : Number(h.ind);
			if (v === 2 || v === 4 || v === 'tab' || v === 'min') indent = v;
		}
		if (h.sort === '1') sortKeys = true;
		if (h.in) input = committed = h.in;
		ready = true;
		return () => clearTimeout(timer);
	});

	$effect(() => {
		const state = {
			in: committed.length <= HASH_LIMIT ? committed : undefined,
			ind: indent === 2 ? undefined : String(indent),
			sort: sortKeys ? '1' : undefined
		};
		if (ready) writeHash(state);
	});
</script>

<div class="row opts" role="group" aria-label="Output format">
	<span class="label">Indent</span>
	{#each indents as o (o.v)}
		<button type="button" aria-pressed={indent === o.v} onclick={() => (indent = o.v)}
			>{o.label}</button
		>
	{/each}
	<button type="button" aria-pressed={sortKeys} onclick={() => (sortKeys = !sortKeys)}
		>Sort keys</button
	>
</div>

<div class="grid">
	<div class="field">
		<div class="row between">
			<label class="label" for="json-in">JSON input</label>
			{#if result.r}<span class="label ok">Valid</span>{/if}
		</div>
		<textarea
			id="json-in"
			bind:value={input}
			oninput={onInput}
			spellcheck="false"
			aria-invalid={!!result.error}
			aria-describedby={result.error ? 'json-err' : undefined}></textarea>
	</div>

	<div class="field">
		<div class="row between">
			<label class="label" for="json-out">Formatted</label>
			<Copy value={result.r?.output ?? ''} />
		</div>
		<textarea id="json-out" readonly value={result.r?.output ?? ''} spellcheck="false"></textarea>
	</div>
</div>

{#if result.error}
	<div id="json-err" class="err" role="alert">
		<p class="error">
			{result.error}{#if result.at}, line {result.at.line} column {result.at.col}{/if}
		</p>
		{#if result.at}
			<pre class="excerpt" aria-hidden="true">{result.at.excerpt}
<span class="caret">{result.at.caret}</span></pre>
		{/if}
	</div>
{:else if result.r}
	{@const r = result.r}
	{@const s = r.stats}
	<dl class="readout">
		<div>
			<dt>Depth</dt>
			<dd>{s.depth}</dd>
		</div>
		<div>
			<dt>Keys</dt>
			<dd>{fmt.format(s.keys)} in {fmt.format(s.objects)} objects</dd>
		</div>
		<div>
			<dt>Arrays</dt>
			<dd>{fmt.format(s.arrays)}</dd>
		</div>
		{#if s.duplicateKeys}
			<div>
				<dt>Duplicate keys</dt>
				<dd class="warn">{s.duplicateKeys}, most parsers keep only the last</dd>
			</div>
		{/if}
		<div>
			<dt>Size</dt>
			<dd>
				{size(r.sizeIn)} in, {size(r.sizeOut)} out
				{#if r.sizeIn}({r.sizeOut >= r.sizeIn ? '+' : ''}{(
						((r.sizeOut - r.sizeIn) / r.sizeIn) *
						100
					).toFixed(1)} %){/if}
			</dd>
		</div>
	</dl>
{/if}

<p class="note">
	Numbers and strings are kept exactly as written, so large integers and values like
	<code>1.0</code> survive reformatting. Sorting compares keys by code unit, like most tools. Inputs over
	8000 characters are not stored in the link.
</p>

<style>
	.opts {
		margin-bottom: 1rem;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
		gap: 1.25rem;
		margin-bottom: 1rem;
	}
	.grid textarea {
		min-height: 18rem;
		tab-size: 2;
	}
	.between {
		justify-content: space-between;
	}
	.ok {
		color: var(--signal);
	}
	.err {
		margin-bottom: 1.25rem;
	}
	.excerpt {
		margin: 0.5rem 0 0;
		padding: 0.5rem 0.6rem;
		background: var(--field);
		border: 1px solid var(--rule-soft);
		font-size: 0.875rem;
		overflow-x: auto;
		white-space: pre;
	}
	.caret {
		color: var(--signal);
		font-weight: 700;
	}
	.readout {
		margin: 1rem 0 1.5rem;
	}
	.warn {
		color: var(--signal);
	}
</style>
