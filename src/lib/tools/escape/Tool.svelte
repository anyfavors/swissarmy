<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import { flavours } from './logic';

	let input = $state('');
	let mode = $state<'escape' | 'unescape'>('escape');
	let pick = $state('json');
	let ready = false;

	const escaped = $derived(
		flavours.map((f) => ({ ...f, value: f.escape(input), warning: f.warn?.(input) }))
	);

	const unescaped = $derived.by(() => {
		const f = flavours.find((x) => x.id === pick) ?? flavours[0];
		if (!input) return { value: '', error: '' };
		try {
			return { value: f.unescape(input), error: '' };
		} catch (e) {
			return { value: '', error: (e as Error).message };
		}
	});

	/** Shows control characters in the result, which would otherwise be invisible. */
	function visible(s: string): string {
		return s.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, (c) =>
			String.fromCodePoint(0x2400 + (c === '\x7f' ? 0x21 : c.charCodeAt(0)))
		);
	}

	onMount(() => {
		const h = readHash();
		if (h.m === 'un') mode = 'unescape';
		if (flavours.some((f) => f.id === h.f)) pick = h.f;
		if (h.in) input = h.in;
		ready = true;
	});

	// Options only: the string could be anything, so it stays out of the link.
	$effect(() => {
		const state = {
			m: mode === 'unescape' ? 'un' : undefined,
			f: pick === 'json' ? undefined : pick
		};
		if (ready) writeHash(state);
	});
</script>

<div class="row opts" role="group" aria-label="Direction">
	<span class="label">Direction</span>
	<button type="button" aria-pressed={mode === 'escape'} onclick={() => (mode = 'escape')}
		>Escape</button
	>
	<button type="button" aria-pressed={mode === 'unescape'} onclick={() => (mode = 'unescape')}
		>Unescape</button
	>
</div>

{#if mode === 'unescape'}
	<div class="row opts" role="group" aria-label="Escaped as">
		<span class="label">Escaped as</span>
		{#each flavours as f (f.id)}
			<button type="button" class="case" aria-pressed={pick === f.id} onclick={() => (pick = f.id)}
				>{f.label}</button
			>
		{/each}
	</div>
{/if}

<div class="field">
	<div class="row between">
		<label class="label" for="esc-in">{mode === 'escape' ? 'Raw text' : 'Escaped literal'}</label>
		<Copy value={input} />
	</div>
	<textarea id="esc-in" bind:value={input} spellcheck="false"></textarea>
</div>

{#if mode === 'escape'}
	<dl class="readout">
		{#each escaped as f (f.id)}
			<div>
				<dt>{f.label}</dt>
				<dd>
					<span class="lit">{f.value}</span>
					{#if f.warning}<span class="warn">{f.warning}</span>{/if}
				</dd>
				<Copy value={f.value} />
			</div>
		{/each}
	</dl>
{:else}
	{#if unescaped.error}<p class="error" role="alert">{unescaped.error}</p>{/if}
	<div class="field result">
		<div class="row between">
			<span class="label" id="esc-out-label">Raw text</span>
			<Copy value={unescaped.value} />
		</div>
		<pre class="out" aria-labelledby="esc-out-label">{visible(unescaped.value)}</pre>
	</div>
{/if}

<p class="note">
	Each form is a complete literal, quotes included. Shell and PowerShell single quotes take
	everything literally, so only the quote itself needs care. PowerShell also treats typographic
	quotes as quotes. C / Java writes control characters as 3-digit octal, valid in both, and reads
	<code>\x</code> and octal escapes as UTF-8 bytes. Unescaped control characters are shown as
	symbols such as <code>&#x2400;</code> for NUL, copying gives the real characters.
</p>

<style>
	.between {
		justify-content: space-between;
	}
	.opts {
		margin-bottom: 1rem;
	}
	.case {
		text-transform: none;
	}
	.field {
		margin-bottom: 1.25rem;
	}
	.readout {
		margin-bottom: 1.25rem;
	}
	.lit {
		white-space: pre-wrap;
	}
	.warn {
		display: block;
		font-family: var(--font-body);
		font-size: 0.875rem;
		color: var(--signal);
		margin-top: 0.25rem;
	}
	.out {
		margin: 0;
		min-height: 3rem;
		padding: 0.65rem 0.75rem;
		border: 1px solid var(--rule);
		background: var(--field);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	code {
		overflow-wrap: anywhere;
	}
</style>
