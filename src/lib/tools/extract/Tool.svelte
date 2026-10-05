<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import { defang, defangValue, extractAll, kinds, refang, type Kind } from './logic';

	type Mode = 'extract' | 'defang' | 'refang';

	let input = $state('');
	let mode = $state<Mode>('extract');
	let selected = $state<Kind[]>(kinds.map((k) => k.id));
	let dedupe = $state(true);
	let sort = $state(false);
	let defangOut = $state(false);
	let ready = false;

	const groups = $derived(
		mode === 'extract'
			? extractAll(input, selected, { dedupe, sort }).map((g) => ({
					...g,
					values: defangOut ? g.values.map(defangValue) : g.values
				}))
			: []
	);
	const found = $derived(groups.filter((g) => g.values.length));
	const total = $derived(found.reduce((n, g) => n + g.values.length, 0));
	const all = $derived(found.map((g) => `# ${g.label}\n${g.values.join('\n')}`).join('\n\n'));
	const converted = $derived(
		mode === 'defang' ? defang(input) : mode === 'refang' ? refang(input) : ''
	);

	function toggle(k: Kind) {
		selected = selected.includes(k) ? selected.filter((x) => x !== k) : [...selected, k];
	}

	onMount(() => {
		const h = readHash();
		input = h.in ?? h.text ?? '';
		if (h.m === 'defang' || h.m === 'refang') mode = h.m;
		if (h.k) {
			const ks = h.k.split(',');
			selected = kinds.map((k) => k.id).filter((id) => ks.includes(id));
		}
		if (h.d === '0') dedupe = false;
		if (h.s === '1') sort = true;
		if (h.f === '1') defangOut = true;
		ready = true;
	});

	$effect(() => {
		const state = {
			in: input,
			m: mode === 'extract' ? undefined : mode,
			k: selected.length === kinds.length ? undefined : selected.join(',') || 'none',
			d: dedupe ? undefined : '0',
			s: sort ? '1' : undefined,
			f: defangOut ? '1' : undefined
		};
		if (ready) writeHash(state);
	});
</script>

<div class="field">
	<label class="label" for="ex-in">Text, log or report</label>
	<textarea id="ex-in" bind:value={input} spellcheck="false"></textarea>
</div>

<div class="row modes" role="group" aria-label="Mode">
	<span class="label">Mode</span>
	<button type="button" aria-pressed={mode === 'extract'} onclick={() => (mode = 'extract')}
		>Extract</button
	>
	<button type="button" aria-pressed={mode === 'defang'} onclick={() => (mode = 'defang')}
		>Defang text</button
	>
	<button type="button" aria-pressed={mode === 'refang'} onclick={() => (mode = 'refang')}
		>Refang text</button
	>
</div>

{#if mode === 'extract'}
	<fieldset class="kinds">
		<legend class="label">Find</legend>
		{#each kinds as k (k.id)}
			<label class="check">
				<input type="checkbox" checked={selected.includes(k.id)} onchange={() => toggle(k.id)} />
				{k.label}
			</label>
		{/each}
		<span class="row bulk">
			<button type="button" onclick={() => (selected = kinds.map((k) => k.id))}>All</button>
			<button type="button" onclick={() => (selected = [])}>None</button>
		</span>
	</fieldset>

	<div class="row opts" role="group" aria-label="Output options">
		<span class="label">Output</span>
		<button type="button" aria-pressed={dedupe} onclick={() => (dedupe = !dedupe)}>Dedupe</button>
		<button type="button" aria-pressed={sort} onclick={() => (sort = !sort)}>Sort</button>
		<button type="button" aria-pressed={defangOut} onclick={() => (defangOut = !defangOut)}
			>Defang</button
		>
	</div>

	{#if input.trim()}
		<div class="row between summary">
			<span class="label"
				>{total} found in {found.length} {found.length === 1 ? 'kind' : 'kinds'}</span
			>
			<Copy value={all} label="Copy all" />
		</div>
		{#each found as g (g.kind)}
			<section class="group">
				<div class="row between">
					<h2 class="label">{g.label} <span class="n">{g.values.length}</span></h2>
					<Copy value={g.values.join('\n')} />
				</div>
				<pre>{g.values.join('\n')}</pre>
			</section>
		{/each}
		{#if !found.length}
			<p class="note">Nothing of the selected kinds found.</p>
		{/if}
	{/if}
{:else}
	<div class="field out">
		<div class="row between">
			<label class="label" for="ex-out">{mode === 'defang' ? 'Defanged' : 'Refanged'} text</label>
			<Copy value={converted} />
		</div>
		<textarea id="ex-out" readonly value={converted} spellcheck="false"></textarea>
	</div>
{/if}

<p class="note">
	Defanging makes indicators unclickable for sharing in reports and chat:
	<code>hxxps[:]//evil[.]example/x</code>, <code>user[@]evil[.]example</code>,
	<code>192.0.2[.]1</code> style. Extraction refangs first, so defanged indicators are found too.
</p>
<p class="note">
	Hashes are classified by length only: 32 hex digits could also be an NTLM hash or a UUID without
	dashes. Domains skip names that end in a common file extension (report.pdf, x.zip), even where
	that is a real TLD. Unquoted Windows paths end at the first space; quote them to keep spaces. IPv4
	addresses with leading zeros are skipped, as their meaning is ambiguous.
</p>

<style>
	.modes,
	.opts {
		margin: 1rem 0;
	}
	.kinds {
		border: 1px solid var(--rule-soft);
		margin: 0;
		padding: 0.5rem 0.75rem 0.75rem;
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1rem;
		align-items: center;
	}
	.check {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		min-height: 2.75rem;
		font-family: var(--font-mono);
		font-size: 0.875rem;
		cursor: pointer;
	}
	.check input {
		width: 1.15rem;
		height: 1.15rem;
		accent-color: var(--signal);
	}
	.between {
		justify-content: space-between;
	}
	.summary {
		border-bottom: 2px solid var(--rule);
		padding-bottom: 0.35rem;
		margin-bottom: 0.5rem;
	}
	.group {
		margin-bottom: 1rem;
	}
	.group h2 {
		margin: 0;
	}
	.n {
		color: var(--signal);
		font-weight: 700;
	}
	pre {
		margin: 0.25rem 0 0;
		padding: 0.5rem 0.75rem;
		background: var(--field);
		border: 1px solid var(--rule-soft);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		font-size: 0.9375rem;
	}
	.out {
		margin-bottom: 1rem;
	}
	.note {
		margin: 0 0 0.75rem;
	}
	code {
		overflow-wrap: anywhere;
	}
</style>
