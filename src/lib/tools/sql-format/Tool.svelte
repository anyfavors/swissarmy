<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import { locate, type Located } from '../json/logic';
	import { formatSql, minifySql, SqlError, type FormatOptions, type KeywordCase } from './logic';

	let input = $state('');
	let committed = $state('');
	let mode = $state<'format' | 'minify'>('format');
	let keywordCase = $state<KeywordCase>('upper');
	let indent = $state<FormatOptions['indent']>(2);
	let ready = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	const cases: { v: KeywordCase; label: string }[] = [
		{ v: 'upper', label: 'Upper' },
		{ v: 'lower', label: 'Lower' },
		{ v: 'preserve', label: 'As written' }
	];
	const indents: { v: FormatOptions['indent']; label: string }[] = [
		{ v: 2, label: '2 spaces' },
		{ v: 4, label: '4 spaces' },
		{ v: 'tab', label: 'Tab' }
	];

	function onInput() {
		clearTimeout(timer);
		const delay = input.length > 200_000 ? 300 : 80;
		timer = setTimeout(() => (committed = input), delay);
	}

	const result = $derived.by((): { output?: string; error?: string; at?: Located } => {
		if (!committed.trim()) return {};
		try {
			return {
				output:
					mode === 'minify' ? minifySql(committed) : formatSql(committed, { keywordCase, indent })
			};
		} catch (e) {
			if (e instanceof SqlError) return { error: e.message, at: locate(committed, e.pos) };
			return { error: (e as Error).message };
		}
	});

	onMount(() => {
		const h = readHash();
		if (h.mode === 'minify') mode = 'minify';
		if (h.kc === 'lower' || h.kc === 'preserve') keywordCase = h.kc;
		if (h.ind === '4') indent = 4;
		if (h.ind === 'tab') indent = 'tab';
		if (h.in) input = committed = h.in;
		ready = true;
		return () => clearTimeout(timer);
	});

	$effect(() => {
		const state = {
			// Input stays out of the URL: configs and data dumps often hold secrets or personal data.
			mode: mode === 'minify' ? mode : undefined,
			kc: keywordCase === 'upper' ? undefined : keywordCase,
			ind: indent === 2 ? undefined : String(indent)
		};
		if (ready) writeHash(state);
	});
</script>

<div class="row opts" role="group" aria-label="Output">
	<span class="label">Output</span>
	<button type="button" aria-pressed={mode === 'format'} onclick={() => (mode = 'format')}
		>Format</button
	>
	<button type="button" aria-pressed={mode === 'minify'} onclick={() => (mode = 'minify')}
		>Minify</button
	>
</div>
{#if mode === 'format'}
	<div class="row opts" role="group" aria-label="Keyword case">
		<span class="label">Keywords</span>
		{#each cases as c (c.v)}
			<button type="button" aria-pressed={keywordCase === c.v} onclick={() => (keywordCase = c.v)}
				>{c.label}</button
			>
		{/each}
	</div>
	<div class="row opts" role="group" aria-label="Indentation">
		<span class="label">Indent</span>
		{#each indents as o (o.v)}
			<button type="button" aria-pressed={indent === o.v} onclick={() => (indent = o.v)}
				>{o.label}</button
			>
		{/each}
	</div>
{/if}

<div class="grid">
	<div class="field">
		<div class="row between">
			<label class="label" for="sql-in">SQL</label>
		</div>
		<textarea
			id="sql-in"
			bind:value={input}
			oninput={onInput}
			spellcheck="false"
			placeholder="select id, name from users where active = true order by name"
			aria-invalid={!!result.error}
			aria-describedby={result.error ? 'sql-err' : undefined}></textarea>
	</div>
	<div class="field">
		<div class="row between">
			<label class="label" for="sql-out">{mode === 'format' ? 'Formatted' : 'Minified'}</label>
			<Copy value={result.output ?? ''} />
		</div>
		<textarea id="sql-out" readonly value={result.output ?? ''} spellcheck="false"></textarea>
	</div>
</div>

{#if result.error}
	<div id="sql-err" class="err" role="alert">
		<p class="error">
			{result.error}{#if result.at}, line {result.at.line} column {result.at.col}{/if}
		</p>
		{#if result.at}
			<pre class="excerpt" aria-hidden="true">{result.at.excerpt}
<span class="caret">{result.at.caret}</span></pre>
		{/if}
	</div>
{/if}

<p class="note">
	This is a formatter, not a validator: it lays out the words it finds and does not check that the
	query would run. Strings, quoted identifiers (<code>"x"</code>, <code>`x`</code>,
	<code>[x]</code>), dollar-quoted bodies and comments are copied exactly. Only keywords change
	case; words often used as column names, like <code>name</code> or <code>date</code>, are left
	alone.
</p>
<p class="note">
	Minify keeps optimizer hints (<code>/*+ ... */</code>, <code>/*! ... */</code>) and drops other
	comments.
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
		tab-size: 4;
	}
	.between {
		justify-content: space-between;
		min-height: 2.25rem;
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
	.note {
		margin-bottom: 0.75rem;
	}
	.note code {
		overflow-wrap: anywhere;
	}
</style>
