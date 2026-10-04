<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import { collapse, diffText, sideBySide, type DiffOptions, type DiffResult } from './logic';

	let original = $state('');
	let changed = $state('');
	let ignoreWhitespace = $state(false);
	let ignoreCase = $state(false);
	let ignoreTrailing = $state(false);
	let view = $state<'unified' | 'side'>('unified');
	let showAll = $state(false);
	let wide = $state(true);
	let result = $state<DiffResult | null>(null);
	let busy = $state(false);

	/** Inputs above this size go to a Web Worker so typing stays responsive. */
	const WORKER_CHARS = 60_000;
	let worker: Worker | null = null;
	let reqId = 0;

	function runSync(a: string, b: string, o: DiffOptions) {
		result = diffText(a, b, o);
		busy = false;
	}

	function runWorker(a: string, b: string, o: DiffOptions) {
		// A newer request replaces a running one: stop the old worker instead of queueing.
		if (busy && worker) {
			worker.terminate();
			worker = null;
		}
		try {
			worker ??= new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
		} catch {
			runSync(a, b, o);
			return;
		}
		const id = ++reqId;
		busy = true;
		worker.onmessage = (e: MessageEvent<{ id: number; result: DiffResult }>) => {
			if (e.data.id !== reqId) return;
			result = e.data.result;
			busy = false;
		};
		worker.onerror = () => {
			worker?.terminate();
			worker = null;
			runSync(a, b, o);
		};
		worker.postMessage({ id, a, b, o });
	}

	$effect(() => {
		const a = original;
		const b = changed;
		const o: DiffOptions = { ignoreWhitespace, ignoreCase, ignoreTrailing };
		const big = a.length + b.length > WORKER_CHARS;
		const t = setTimeout(() => (big ? runWorker(a, b, o) : runSync(a, b, o)), big ? 250 : 120);
		return () => clearTimeout(t);
	});

	const rows = $derived(result ? (showAll ? result.rows : collapse(result.rows)) : []);
	const pairs = $derived(view === 'side' && wide ? sideBySide(rows) : []);

	onMount(() => {
		const h = readHash();
		if (h.in) original = h.in;
		// Inputs can be large, so nothing is kept in the address bar.
		writeHash({});
		const mq = matchMedia('(min-width: 48rem)');
		wide = mq.matches;
		const onChange = () => (wide = mq.matches);
		mq.addEventListener('change', onChange);
		return () => {
			mq.removeEventListener('change', onChange);
			worker?.terminate();
		};
	});

	function swap() {
		[original, changed] = [changed, original];
	}
</script>

<div class="grid">
	<div class="field">
		<label class="label" for="diff-a">Original</label>
		<textarea id="diff-a" bind:value={original} spellcheck="false" autocomplete="off"></textarea>
	</div>
	<div class="field">
		<label class="label" for="diff-b">Changed</label>
		<textarea id="diff-b" bind:value={changed} spellcheck="false" autocomplete="off"></textarea>
	</div>
</div>

<div class="row opts" role="group" aria-label="Comparison options">
	<span class="label">Ignore</span>
	<button
		type="button"
		aria-pressed={ignoreWhitespace}
		onclick={() => (ignoreWhitespace = !ignoreWhitespace)}>Whitespace changes</button
	>
	<button
		type="button"
		aria-pressed={ignoreTrailing}
		onclick={() => (ignoreTrailing = !ignoreTrailing)}>Trailing space</button
	>
	<button type="button" aria-pressed={ignoreCase} onclick={() => (ignoreCase = !ignoreCase)}
		>Case</button
	>
	<button type="button" onclick={swap}>Swap sides</button>
</div>

<div class="row opts" role="group" aria-label="View">
	<span class="label">View</span>
	<button type="button" aria-pressed={view === 'unified'} onclick={() => (view = 'unified')}
		>Unified</button
	>
	<button type="button" aria-pressed={view === 'side'} onclick={() => (view = 'side')}
		>Side by side</button
	>
	<button type="button" aria-pressed={showAll} onclick={() => (showAll = !showAll)}
		>All lines</button
	>
</div>

{#if result}
	<div class="row summary" aria-live="polite">
		{#if busy}<span class="label">Comparing...</span>{/if}
		{#if result.identical}
			<span
				>No differences{ignoreWhitespace || ignoreCase || ignoreTrailing
					? ' with the current options'
					: ''}.</span
			>
		{:else}
			<span class="add">+{result.added} added</span>
			<span class="rem">-{result.removed} removed</span>
			<span class="label">lines</span>
		{/if}
		<span class="grow"></span>
		<Copy value={result.unified} label="Copy unified diff" />
	</div>

	{#if view === 'side' && !wide}
		<p class="note">Side by side needs a wider screen, showing unified.</p>
	{/if}

	{#if !result.identical}
		{#if view === 'side' && wide}
			<div class="diff side mono" role="table" aria-label="Side by side diff">
				{#each pairs as p, i (i)}
					{#if p.kind === 'skip'}
						<div class="skip" role="row">
							<span role="cell">{p.count} unchanged lines</span>
						</div>
					{:else}
						<div class="srow" role="row">
							{#each [p.left, p.right] as cell, side (side)}
								<div
									role="cell"
									class={[
										'cell',
										cell && p.kind === 'change' ? (side === 0 ? 'del' : 'ins') : '',
										!cell ? 'empty' : ''
									]}
								>
									<span class="no">{cell ? (side === 0 ? cell.aNo : cell.bNo) : ''}</span>
									<span class="txt"
										>{#if cell?.segs}{#each cell.segs as s, k (k)}<span class:chg={s.changed}
													>{s.text}</span
												>{/each}{:else}{cell?.text ?? ''}{/if}</span
									>
								</div>
							{/each}
						</div>
					{/if}
				{/each}
			</div>
		{:else}
			<div class="diff uni mono" role="table" aria-label="Unified diff">
				{#each rows as r, i (i)}
					{#if r.kind === 'skip'}
						<div class="skip" role="row"><span role="cell">{r.count} unchanged lines</span></div>
					{:else}
						<div class={['urow', r.kind]} role="row">
							<span class="no" role="cell">{r.aNo ?? ''}</span>
							<span class="no" role="cell">{r.bNo ?? ''}</span>
							<span
								class="sign"
								role="cell"
								aria-label={r.kind === 'eq' ? 'unchanged' : r.kind === 'del' ? 'removed' : 'added'}
								>{r.kind === 'del' ? '-' : r.kind === 'ins' ? '+' : ' '}</span
							>
							<span class="txt" role="cell"
								>{#if r.segs}{#each r.segs as s, k (k)}<span class:chg={s.changed}>{s.text}</span
										>{/each}{:else}{r.text}{/if}</span
							>
						</div>
					{/if}
				{/each}
			</div>
		{/if}
	{/if}
{/if}

<p class="note">
	Lines are compared with Myers' algorithm, the one behind <code>diff</code> and
	<code>git diff</code>, then changed line pairs are compared word by word. The copied text is a
	standard unified diff with 3 lines of context.
</p>

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
		gap: 1.25rem;
		margin-bottom: 1rem;
	}
	textarea {
		min-height: 12rem;
	}
	.opts {
		margin-bottom: 0.75rem;
	}
	.summary {
		margin: 1rem 0 0.75rem;
		font-family: var(--font-mono);
	}
	.add,
	.rem {
		font-weight: 700;
	}
	.rem {
		color: var(--signal);
	}
	.grow {
		flex: 1;
	}
	.diff {
		border-top: 2px solid var(--rule);
		border-bottom: 1px solid var(--rule-soft);
		font-size: 0.875rem;
		line-height: 1.45;
		margin-bottom: 1.25rem;
		overflow-x: auto;
	}
	.urow {
		display: grid;
		grid-template-columns: 3.5em 3.5em 1.5em 1fr;
	}
	.no {
		color: var(--ink-2);
		text-align: right;
		padding-right: 0.6em;
		user-select: none;
		font-size: 0.8em;
		line-height: 1.8;
	}
	.sign {
		user-select: none;
		text-align: center;
		font-weight: 700;
	}
	.txt {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		min-width: 0;
	}
	.del,
	.ins {
		background: var(--hilite);
	}
	.del .sign,
	.del .txt {
		color: var(--signal);
	}
	.ins .sign {
		color: var(--ink);
	}
	.ins {
		box-shadow: inset 3px 0 0 var(--ink);
	}
	.del {
		box-shadow: inset 3px 0 0 var(--signal);
	}
	.chg {
		font-weight: 700;
		text-decoration: underline;
		text-decoration-thickness: 2px;
		text-underline-offset: 0.15em;
	}
	.del .chg {
		text-decoration-line: line-through;
	}
	.skip {
		padding: 0.15rem 0.6rem;
		color: var(--ink-2);
		font-size: 0.75rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		border-top: 1px dashed var(--rule-soft);
		border-bottom: 1px dashed var(--rule-soft);
	}
	.srow {
		display: grid;
		grid-template-columns: 1fr 1fr;
	}
	.cell {
		display: grid;
		grid-template-columns: 3.5em 1fr;
		min-width: 0;
	}
	.cell + .cell {
		border-left: 1px solid var(--rule-soft);
	}
	.empty {
		background: repeating-linear-gradient(135deg, transparent 0 6px, var(--rule-soft) 6px 7px);
	}
	.note code {
		font-size: 0.9em;
	}
</style>
