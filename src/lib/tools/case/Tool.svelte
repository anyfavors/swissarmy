<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import { cases, convertCase, splitWords } from './logic';

	let input = $state('');
	let ready = false;

	const results = $derived(cases.map((c) => ({ ...c, out: convertCase(input, c.id) })));
	const words = $derived(input.includes('\n') ? [] : splitWords(input));

	onMount(() => {
		const h = readHash();
		input = h.in ?? h.text ?? 'parseHTTPResponse';
		ready = true;
	});

	$effect(() => {
		const state = { in: input };
		if (ready) writeHash(state);
	});
</script>

<div class="field">
	<label class="label" for="case-in">Text or identifier</label>
	<textarea id="case-in" bind:value={input} spellcheck="false" rows="3"></textarea>
</div>

{#if words.length > 1}
	<p class="label words">
		Words: {#each words as w, i (i)}<span class="word">{w}</span>{/each}
	</p>
{/if}

<dl class="readout">
	{#each results as r (r.id)}
		<div>
			<dt>{r.label}</dt>
			<dd class="out">{r.out}</dd>
			<Copy value={r.out} />
		</div>
	{/each}
</dl>

<p class="note">
	Identifier styles split on spaces and punctuation, on a lower to upper change, and at the end of
	an acronym, so <code>parseHTTPResponse</code> becomes parse, HTTP, Response. Digits stay with the letters
	before them. Multi-line input converts line by line.
</p>
<p class="note">
	Title Case follows English rules: articles, short conjunctions and short prepositions (a, an, the,
	and, or, of, to, in, on, at, by, for, via...) stay lower case unless first or last, or after a
	colon. Words with an inner capital (iPhone, NASA) are kept. Style guides differ, so check
	headlines by hand. Danish titles normally use sentence case. Sentence case lowers everything else,
	including names.
</p>

<style>
	.field {
		margin-bottom: 0.75rem;
	}
	textarea {
		min-height: 5rem;
	}
	.words {
		margin: 0 0 1rem;
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		align-items: center;
	}
	.word {
		border: 1px solid var(--rule-soft);
		padding: 0 0.35rem;
		color: var(--ink);
		text-transform: none;
		letter-spacing: 0;
	}
	.readout {
		margin: 0 0 1.25rem;
	}
	.out {
		white-space: pre-wrap;
	}
	.note {
		margin: 0 0 0.75rem;
	}
	code {
		overflow-wrap: anywhere;
	}
</style>
