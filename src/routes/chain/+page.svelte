<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import Copy from '#lib/ui/Copy.svelte';
	import Stamp from '#lib/ui/Stamp.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import { getOp, groups, runChain, type StepResult } from '#lib/chain/registry.ts';

	let input = $state('');
	let steps = $state<string[]>([]);
	let results = $state<StepResult[]>([]);
	let adding = $state('');
	let ready = false;
	let runId = 0;

	const examples: { label: string; input: string; steps: string[] }[] = [
		{
			label: 'Base64 to tidy JSON',
			input: 'eyJ1c2VyIjoiYWRhIiwicm9sZXMiOlsiYWRtaW4iLCJvcHMiXSwiYWN0aXZlIjp0cnVlfQ==',
			steps: ['base64.decode', 'json.sort']
		},
		{
			label: 'JWT payload as JSON',
			input:
				'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
			steps: ['jwt.payload', 'json.format']
		},
		{
			label: 'Double-encoded URL',
			input: 'q%3Dr%25C3%25B8dgr%25C3%25B8d%2520%2526%2520fl%25C3%25B8de',
			steps: ['url.decode', 'url.decode']
		},
		{
			label: 'Dedupe and hash a list',
			input: 'alice\nbob\nalice\n\ncarol',
			steps: ['text.remove-blank', 'text.unique-lines', 'text.sort-lines', 'hash.sha256']
		}
	];

	function load(ex: (typeof examples)[number]) {
		input = ex.input;
		steps = [...ex.steps];
	}

	function add() {
		if (adding && getOp(adding)) steps = [...steps, adding];
		adding = '';
	}

	function move(i: number, d: -1 | 1) {
		const j = i + d;
		if (j < 0 || j >= steps.length) return;
		const next = [...steps];
		[next[i], next[j]] = [next[j], next[i]];
		steps = next;
	}

	function remove(i: number) {
		steps = steps.filter((_, k) => k !== i);
	}

	onMount(() => {
		const h = readHash();
		if (h.in) input = h.in;
		if (h.ops) steps = h.ops.split(',').filter(Boolean);
		ready = true;
	});

	$effect(() => {
		const value = input;
		const ids = [...steps];
		const id = ++runId;
		const t = setTimeout(async () => {
			const r = await runChain(value, ids);
			if (id === runId) results = r;
		}, 120);
		return () => clearTimeout(t);
	});

	$effect(() => {
		// Short inputs travel in the link. Long ones would make unwieldy URLs.
		const state = { ops: steps.join(','), in: input.length <= 2000 ? input : undefined };
		if (ready) writeHash(state);
	});

	const final = $derived(
		results.length && !results.at(-1)?.error ? results.at(-1)?.output : undefined
	);
</script>

<svelte:head>
	<title>Chain · Field Manual</title>
	<meta name="description" content="Run text through several Field Manual tools in a row." />
</svelte:head>

<article>
	<header class="head">
		<p class="label running"><span class="no">FM 0-01</span><span>Procedures</span></p>
		<h1>Chain</h1>
		<p class="sum">
			Run text through several tools in a row: decode, then format, then hash. Each step shows its
			output, so you can see where something goes wrong.
		</p>
		<Stamp network={false} />
	</header>

	<div class="row examples" role="group" aria-label="Examples">
		<span class="label">Examples</span>
		{#each examples as ex (ex.label)}
			<button type="button" onclick={() => load(ex)}>{ex.label}</button>
		{/each}
	</div>

	<div class="field">
		<div class="row between">
			<label class="label" for="chain-in">Input</label>
			<Copy value={input} />
		</div>
		<textarea id="chain-in" bind:value={input} spellcheck="false" autocomplete="off"></textarea>
	</div>

	<ol class="steps">
		{#each steps as id, i (i + id)}
			{@const op = getOp(id)}
			{@const r = results[i]}
			<li class="step" class:failed={r?.error}>
				<div class="step-head">
					<span class="n">Step {i + 1}</span>
					<span class="name">{op?.label ?? id}</span>
					<span class="ctl">
						<button
							type="button"
							onclick={() => move(i, -1)}
							disabled={i === 0}
							aria-label={`Move step ${i + 1} up`}>Up</button
						>
						<button
							type="button"
							onclick={() => move(i, 1)}
							disabled={i === steps.length - 1}
							aria-label={`Move step ${i + 1} down`}>Down</button
						>
						<button type="button" onclick={() => remove(i)} aria-label={`Remove step ${i + 1}`}
							>Remove</button
						>
					</span>
				</div>
				{#if r?.error}
					<p class="error" role="alert">{r.error}</p>
				{:else if r}
					<div class="out">
						<pre>{r.output}</pre>
						<Copy value={r.output ?? ''} />
					</div>
				{:else if i >= results.length && results.at(-1)?.error}
					<p class="note">Not run: an earlier step failed.</p>
				{/if}
			</li>
		{/each}
	</ol>

	<div class="field add">
		<label class="label" for="chain-add">Add a step</label>
		<div class="row nowrap">
			<select id="chain-add" bind:value={adding} onchange={add}>
				<option value="">Choose a step …</option>
				{#each groups as g (g.title)}
					<optgroup label={g.title}>
						{#each g.ops as op (op.id)}
							<option value={op.id}>{op.label}</option>
						{/each}
					</optgroup>
				{/each}
			</select>
			{#if steps.length}
				<button type="button" onclick={() => (steps = [])}>Clear steps</button>
			{/if}
		</div>
	</div>

	{#if steps.length && final !== undefined}
		<section class="final" aria-labelledby="final-h">
			<div class="row between">
				<h2 id="final-h" class="label">
					Result after {steps.length} step{steps.length === 1 ? '' : 's'}
				</h2>
				<Copy value={final} />
			</div>
			<pre>{final}</pre>
		</section>
	{/if}

	<p class="note">
		Steps come from the tools in this manual, for example <a
			href={resolve('/[tool]', { tool: 'base64' })}>Base64</a
		>
		and <a href={resolve('/[tool]', { tool: 'json' })}>JSON</a>. The chain and short inputs are kept
		in the link, so you can bookmark a recipe. A JWT payload step only decodes; it does not check
		the signature.
	</p>
</article>

<style>
	.head {
		display: grid;
		gap: 0.6rem;
		justify-items: start;
		padding-bottom: 1.25rem;
		margin-bottom: 1.5rem;
		border-bottom: 2px solid var(--rule);
	}
	.running {
		display: flex;
		gap: 1.25rem;
		margin: 0;
	}
	.no {
		color: var(--signal);
		font-weight: 700;
	}
	h1 {
		font-size: clamp(2rem, 6vw, 3.25rem);
	}
	.sum {
		margin: 0;
		font-size: 1.125rem;
		max-width: 44rem;
	}
	.examples {
		margin-bottom: 1.25rem;
	}
	.between {
		justify-content: space-between;
	}
	.nowrap {
		flex-wrap: nowrap;
	}
	.steps {
		list-style: none;
		margin: 1.5rem 0 0;
		padding: 0;
	}
	.step {
		border-top: 2px solid var(--rule);
		padding: 0.6rem 0 1rem;
	}
	.step.failed .n {
		background: var(--signal);
		color: var(--signal-ink);
	}
	.step-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 0.75rem;
		margin-bottom: 0.5rem;
	}
	.n {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		border: 1px solid var(--rule);
		padding: 0.15rem 0.45rem;
	}
	.name {
		font-weight: 700;
		flex: 1;
		min-width: 10rem;
	}
	.ctl {
		display: flex;
		gap: 0.35rem;
	}
	.ctl button {
		min-height: 2.25rem;
		padding: 0.25rem 0.55rem;
		font-size: 0.6875rem;
	}
	.ctl button:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.out {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.5rem;
		align-items: start;
	}
	pre {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.9375rem;
		background: var(--field);
		border: 1px solid var(--rule-soft);
		padding: 0.6rem 0.75rem;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		max-height: 18rem;
		overflow: auto;
	}
	.add {
		margin: 1rem 0 1.5rem;
		padding-top: 1rem;
		border-top: 2px solid var(--rule);
	}
	.final {
		border: 2px solid var(--rule);
		padding: 0.75rem;
		margin-bottom: 1.5rem;
		display: grid;
		gap: 0.5rem;
	}
	.final h2 {
		margin: 0;
		color: var(--signal);
		font-weight: 700;
	}
	.final pre {
		max-height: 30rem;
	}
</style>
