<script lang="ts">
	import { onMount } from 'svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import { codepoint, search } from './logic';

	let q = $state('');
	let latin1 = $state(false);
	let ready = false;

	const found = $derived(search(q, latin1 ? 255 : 127));

	onMount(() => {
		const h = readHash();
		if (h.in) q = h.in;
		if (h.set === 'latin1') latin1 = true;
		ready = true;
	});

	$effect(() => {
		const state = { in: q, set: latin1 ? 'latin1' : undefined };
		if (ready) writeHash(state);
	});
</script>

<div class="field">
	<label class="label" for="ascii-q">Find</label>
	<input id="ascii-q" type="search" bind:value={q} spellcheck="false" autocomplete="off" />
	<p class="label hint">A character · 65 · 0x41 · U+00E5 · ^C · \n · ESC · a word of the name</p>
</div>

<div class="row opts" role="group" aria-label="Character set">
	<button type="button" aria-pressed={!latin1} onclick={() => (latin1 = false)}>ASCII 0-127</button>
	<button type="button" aria-pressed={latin1} onclick={() => (latin1 = true)}
		>+ Latin-1 and Windows-1252</button
	>
	<span class="label count" aria-live="polite">{found.length} shown</span>
</div>

<div class="scroll">
	<table>
		<thead>
			<tr>
				<th scope="col">Dec</th>
				<th scope="col">Hex</th>
				<th scope="col">Oct</th>
				<th scope="col">Bin</th>
				<th scope="col">Char</th>
				<th scope="col">Code</th>
				<th scope="col">Name</th>
				{#if latin1}
					<th scope="col">Windows-1252</th>
					<th scope="col">UTF-8</th>
				{/if}
			</tr>
		</thead>
		<tbody>
			{#each found as r (r.code)}
				<tr class:ctl={r.control} class:diff={latin1 && r.cp1252}>
					<th scope="row" class="mono">{r.code}</th>
					<td class="mono">{r.hex}</td>
					<td class="mono">{r.oct}</td>
					<td class="mono bin">{r.bin}</td>
					<td class="glyph">{r.glyph}</td>
					<td class="mono codes">
						{#if r.abbr}<span class="abbr">{r.abbr}</span>{/if}
						{#if r.caret}<span>{r.caret}</span>{/if}
						{#if r.escape}<span title={r.note}>{r.escape}</span>{/if}
					</td>
					<td class="name">{r.name}</td>
					{#if latin1}
						<td class="name">
							{#if r.cp1252}
								<span class="glyph w">{r.cp1252.char}</span>
								{codepoint(r.cp1252.cp)}
								{r.cp1252.name}
							{:else if r.cp1252 === null}
								<span class="dim">not assigned</span>
							{/if}
						</td>
						<td class="mono">{r.code > 127 ? r.utf8 : ''}</td>
					{/if}
				</tr>
			{/each}
		</tbody>
	</table>
</div>
{#if !found.length}<p class="note">Nothing matches.</p>{/if}

<p class="note">
	Control codes are shown as Unicode control pictures (␀ ␊ ␡). Caret notation is how terminals echo
	them: Ctrl plus the character 64 positions higher, so ^C is 3 and ^[ is ESC. \e is a GNU
	extension; portable C writes \033 or \x1b. Latin-1 (ISO 8859-1) leaves 128-159 to C1 control
	codes, which Windows-1252 fills with printable characters such as € and curly quotes. Text that
	shows â€™ where ’ belongs is UTF-8 read as Windows-1252.
</p>

<style>
	.hint {
		margin: 0.35rem 0 0;
		text-transform: none;
		letter-spacing: 0.02em;
	}
	.opts {
		margin: 1rem 0;
	}
	.count {
		margin-left: auto;
	}
	.scroll {
		overflow-x: auto;
		margin-bottom: 1rem;
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
		padding: 0.3rem 0.75rem 0.3rem 0;
		border-bottom: 1px solid var(--rule-soft);
		vertical-align: baseline;
	}
	thead th {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-2);
		font-weight: 400;
		white-space: nowrap;
	}
	th[scope='row'] {
		font-weight: 700;
	}
	.bin {
		color: var(--ink-2);
		font-size: 0.8125rem;
	}
	.glyph {
		font-family: var(--font-mono);
		font-size: 1.125rem;
		font-weight: 700;
		white-space: nowrap;
	}
	.glyph.w {
		color: var(--signal);
		margin-right: 0.35rem;
	}
	tr.ctl .glyph {
		color: var(--ink-2);
		font-weight: 400;
	}
	tr.diff td {
		background: var(--hilite);
	}
	.codes {
		white-space: nowrap;
	}
	.codes span + span {
		margin-left: 0.5rem;
	}
	.abbr {
		font-weight: 700;
	}
	.name {
		font-size: 0.875rem;
		min-width: 10rem;
	}
	.dim {
		color: var(--ink-2);
	}
</style>
