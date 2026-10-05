<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import { alphabets, spell, type Alphabet, type CaseMode } from './logic';

	let text = $state('');
	let alphabet = $state<Alphabet>('nato');
	let caseMode = $state<CaseMode>('upper');
	let hints = $state(false);
	let ready = false;

	const items = $derived(spell(text, { alphabet, caseMode }));
	const line = $derived(items.map((i) => i.say).join(', '));

	const caseModes: { id: CaseMode; label: string }[] = [
		{ id: 'upper', label: 'Mark capitals' },
		{ id: 'both', label: 'Mark both' },
		{ id: 'none', label: 'Ignore case' }
	];

	onMount(() => {
		const h = readHash();
		if (h.in) text = h.in;
		if (h.a === 'danish') alphabet = 'danish';
		if (h.c === 'both' || h.c === 'none') caseMode = h.c;
		if (h.p === '1') hints = true;
		ready = true;
	});

	// The text itself is never written to the URL: it is often a password.
	$effect(() => {
		const state = {
			a: alphabet === 'nato' ? undefined : alphabet,
			c: caseMode === 'upper' ? undefined : caseMode,
			p: hints ? '1' : undefined
		};
		if (ready) writeHash(state);
	});
</script>

<div class="field">
	<label class="label" for="sp-in">Text to spell</label>
	<input
		id="sp-in"
		type="text"
		bind:value={text}
		spellcheck="false"
		autocomplete="off"
		autocapitalize="off"
		placeholder="Xq7#mP2e"
	/>
</div>

<div class="row opts" role="group" aria-label="Alphabet">
	<span class="label">Alphabet</span>
	{#each alphabets as a (a.id)}
		<button type="button" aria-pressed={alphabet === a.id} onclick={() => (alphabet = a.id)}
			>{a.label}</button
		>
	{/each}
</div>
<div class="row opts" role="group" aria-label="Case">
	<span class="label">Case</span>
	{#each caseModes as m (m.id)}
		<button type="button" aria-pressed={caseMode === m.id} onclick={() => (caseMode = m.id)}
			>{m.label}</button
		>
	{/each}
	{#if alphabet === 'nato'}
		<button type="button" aria-pressed={hints} onclick={() => (hints = !hints)}
			>ICAO pronunciation</button
		>
	{/if}
</div>

{#if items.length}
	<div class="row between">
		<span class="label">{items.length} characters</span>
		<Copy value={line} label="Copy as line" />
	</div>
	<ol class="spelled" lang={alphabet === 'danish' ? 'da' : 'en'}>
		{#each items as it, i (i)}
			<li class:sym={it.kind !== 'letter'}>
				<span class="ch mono" class:up={it.upper}>{it.char === ' ' ? '␠' : it.char}</span>
				<span class="say">{it.say}</span>
				{#if hints && it.hint}<span class="hint mono">{it.hint}</span>{/if}
			</li>
		{/each}
	</ol>
{/if}

<p class="note">
	Nothing you type is stored or put in the page address. NATO/ICAO words follow ICAO Annex 10,
	Volume II, which spells Alfa and Juliett so they are pronounced right in every language. ICAO
	pronunciation stresses the capitalised syllable and uses TREE, FIFE and NIN-er for 3, 5 and 9 on
	radio. The Danish alphabet is the traditional telephone one (Anna, Bernhard, Cecilie); some
	letters have local variants.
</p>

<style>
	.opts {
		margin: 1rem 0 0;
	}
	.between {
		justify-content: space-between;
		margin: 1.5rem 0 0.5rem;
	}
	.spelled {
		list-style: none;
		margin: 0 0 1.5rem;
		padding: 0;
		border-top: 2px solid var(--rule);
		counter-reset: n;
	}
	.spelled li {
		display: grid;
		grid-template-columns: 2rem 2.5rem 1fr;
		gap: 0.25rem 0.75rem;
		align-items: baseline;
		padding: 0.4rem 0;
		border-bottom: 1px solid var(--rule-soft);
		counter-increment: n;
	}
	.spelled li::before {
		content: counter(n);
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--ink-2);
	}
	.ch {
		font-size: 1.375rem;
		font-weight: 700;
		text-align: center;
		border: 1px solid var(--rule-soft);
		padding: 0 0.25rem;
		overflow-wrap: anywhere;
	}
	.ch.up {
		color: var(--signal);
	}
	.say {
		font-size: 1.125rem;
		overflow-wrap: anywhere;
	}
	.sym .say {
		font-style: italic;
	}
	.hint {
		grid-column: 3;
		font-size: 0.8125rem;
		color: var(--ink-2);
	}
	.note {
		margin-top: 1.5rem;
	}
</style>
