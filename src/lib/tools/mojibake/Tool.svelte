<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash } from '#lib/util/hash.ts';
	import { MAX_PASSES, diagnose } from './logic';

	let input = $state('');

	const d = $derived(input ? diagnose(input) : null);
	const changed = $derived(d ? d.best.text !== input : false);

	onMount(() => {
		const h = readHash();
		if (h.in) input = h.in;
	});

	const pct = (n: number) => `${Math.round(n * 100)}%`;
</script>

<div class="field">
	<div class="row between">
		<label class="label" for="mb-in">Garbled text</label>
		<Copy value={input} />
	</div>
	<textarea id="mb-in" bind:value={input} spellcheck="false" placeholder="Ã¦Ã¸Ã¥, Itâ€™s"
	></textarea>
</div>

{#if d}
	<div class="field best">
		<div class="row between">
			<span class="label" id="mb-best">
				{changed ? `Best repair: ${d.best.via}` : 'Nothing to repair'}
			</span>
			<Copy value={d.best.text} />
		</div>
		<p class="out" aria-labelledby="mb-best">{d.best.text}</p>
	</div>

	{#if d.lost}
		<p class="note warn" role="status">
			{d.lost} replacement character{d.lost === 1 ? '' : 's'} (<code>&#xFFFD;</code>) found. This is
			the reverse mistake: Latin-1 or Windows-1252 bytes were read as UTF-8, which is not valid, so
			each bad byte was replaced. The original bytes are gone and cannot be recovered from this
			text. Go back to the source file or database and read it with the right charset.
		</p>
	{/if}

	{#if d.all.length > 1}
		<h2 class="label head">Candidates</h2>
		<dl class="readout">
			{#each d.all as c (c.via)}
				<div>
					<dt>{c.via}, plausibility {pct(c.score)}</dt>
					<dd>{c.text}</dd>
					<Copy value={c.text} />
				</div>
			{/each}
		</dl>
	{/if}
{/if}

<p class="note">
	Mojibake like <code>Ã¦</code> for <code>æ</code> happens when UTF-8 bytes are read as Windows-1252
	or Latin-1: each byte of a two-byte character shows up as its own character. The repair turns
	those characters back into bytes and reads them as UTF-8, up to {MAX_PASSES} times for text that was
	mangled more than once. Only runs that decode cleanly are changed, so the rest of the text is left as
	it is. Plausibility drops for each telltale pair such as <code>Ã¦</code> and for stray control characters.
</p>

<style>
	.between {
		justify-content: space-between;
	}
	.field {
		margin-bottom: 1.25rem;
	}
	.out {
		margin: 0;
		min-height: 3rem;
		padding: 0.65rem 0.75rem;
		border: 1px solid var(--rule);
		border-left: 4px solid var(--signal);
		background: var(--field);
		font-family: var(--font-mono);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.warn {
		border-left-color: var(--signal);
		color: var(--ink);
		margin-bottom: 1.25rem;
	}
	.head {
		margin: 1.5rem 0 0.75rem;
		font-weight: 400;
	}
	.readout {
		margin-bottom: 1.25rem;
	}
	.readout dd {
		white-space: pre-wrap;
	}
	code {
		overflow-wrap: anywhere;
	}
</style>
