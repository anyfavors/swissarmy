<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import { safeFilename, slugify, type Target } from './logic';

	let input = $state('');
	let danish = $state(false);
	let sep = $state<'-' | '_' | '.'>('-');
	let lower = $state(true);
	let unicode = $state(false);
	let max = $state(0);
	let target = $state<Target>('portable');
	let ready = false;

	const slug = $derived(slugify(input, { danish, separator: sep, lower, unicode, maxLength: max }));
	const file = $derived(input ? safeFilename(input, target) : { name: '', changes: [] });

	const seps = ['-', '_', '.'] as const;

	const targets: { id: Target; label: string }[] = [
		{ id: 'portable', label: 'All' },
		{ id: 'windows', label: 'Windows' },
		{ id: 'macos', label: 'macOS' },
		{ id: 'linux', label: 'Linux' }
	];

	onMount(() => {
		const h = readHash();
		input = h.in ?? h.text ?? 'Rødgrød med fløde: årets opskrift?';
		if (h.da === '1') danish = true;
		if (h.sep === '_' || h.sep === '.') sep = h.sep;
		if (h.case === 'keep') lower = false;
		if (h.uni === '1') unicode = true;
		if (h.max && /^\d+$/.test(h.max)) max = Number(h.max);
		if (h.os === 'windows' || h.os === 'macos' || h.os === 'linux') target = h.os;
		ready = true;
	});

	$effect(() => {
		const state = {
			in: input,
			da: danish ? '1' : undefined,
			sep: sep === '-' ? undefined : sep,
			case: lower ? undefined : 'keep',
			uni: unicode ? '1' : undefined,
			max: max > 0 ? String(max) : undefined,
			os: target === 'portable' ? undefined : target
		};
		if (ready) writeHash(state);
	});
</script>

<div class="field">
	<label class="label" for="sl-in">Title or name</label>
	<input id="sl-in" type="text" bind:value={input} spellcheck="false" autocomplete="off" />
</div>

<section>
	<h2 class="label head">Slug</h2>
	<div class="result row between">
		<output class="value" for="sl-in">{slug || ' '}</output>
		<Copy value={slug} />
	</div>
	<div class="row opts" role="group" aria-label="Slug options">
		<button type="button" aria-pressed={danish} onclick={() => (danish = !danish)}
			>æ ae ø oe å aa</button
		>
		<button type="button" aria-pressed={lower} onclick={() => (lower = !lower)}>Lower case</button>
		<button type="button" aria-pressed={unicode} onclick={() => (unicode = !unicode)}
			>Keep non-Latin</button
		>
	</div>
	<div class="row opts" role="group" aria-label="Separator">
		<span class="label">Separator</span>
		{#each seps as s (s)}
			<button type="button" class="sep" aria-pressed={sep === s} onclick={() => (sep = s)}
				>{s}</button
			>
		{/each}
		<label class="label" for="sl-max">Max length</label>
		<input id="sl-max" class="num" type="number" min="0" bind:value={max} />
	</div>
</section>

<section>
	<h2 class="label head">Filename</h2>
	<div class="result row between">
		<output class="value" for="sl-in">{file.name || ' '}</output>
		<Copy value={file.name} />
	</div>
	<div class="row opts" role="group" aria-label="Target system">
		<span class="label">Safe on</span>
		{#each targets as t (t.id)}
			<button type="button" aria-pressed={target === t.id} onclick={() => (target = t.id)}
				>{t.label}</button
			>
		{/each}
	</div>
	{#if file.changes.length}
		<ul class="changes">
			{#each file.changes as c (c)}<li>{c}</li>{/each}
		</ul>
	{:else if input}
		<p class="note">Already safe, nothing changed.</p>
	{/if}
</section>

<p class="note">
	The slug folds accents to plain letters (é to e, ß to ss, ø to o). The Danish option writes æ, ø,
	å as ae, oe, aa, as in Aarhus. Without "Keep non-Latin", Greek, Cyrillic and other scripts are
	dropped.
</p>
<p class="note">
	Windows forbids <code>&lt; &gt; : " / \ | ? *</code>, control characters, the device names CON,
	PRN, AUX, NUL, COM1 to COM9 and LPT1 to LPT9 (also with an extension, as in nul.txt), and names
	ending in a space or dot. Linux only forbids / and NUL. macOS also avoids : as Finder shows it as
	/. Names are limited to 255 UTF-16 units on NTFS and 255 bytes of UTF-8 on ext4 and APFS. "All"
	applies every rule. Source: Microsoft, Naming Files, Paths, and Namespaces.
</p>

<style>
	section {
		margin-top: 1.5rem;
	}
	.head {
		margin: 0 0 0.35rem;
	}
	.between {
		justify-content: space-between;
	}
	.result {
		border-top: 2px solid var(--rule);
		border-bottom: 1px solid var(--rule-soft);
		padding: 0.5rem 0;
		flex-wrap: nowrap;
	}
	.value {
		font-family: var(--font-mono);
		font-size: 1.125rem;
		overflow-wrap: anywhere;
		min-width: 0;
		white-space: pre-wrap;
	}
	.opts {
		margin-top: 0.75rem;
	}
	.opts button {
		text-transform: none;
	}
	.sep {
		min-width: 2.75rem;
		justify-content: center;
	}
	.num {
		width: 6rem;
		font: inherit;
		font-family: var(--font-mono);
		color: var(--ink);
		background: var(--field);
		border: 1px solid var(--rule);
		border-radius: 0;
		padding: 0.5rem 0.6rem;
		min-height: 2.75rem;
	}
	.changes {
		margin: 0.75rem 0 0;
		padding-left: 1.25rem;
		font-size: 0.9375rem;
	}
	.changes li::marker {
		color: var(--signal);
	}
	.note {
		margin: 1.25rem 0 0;
	}
	code {
		overflow-wrap: anywhere;
	}
</style>
