<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		auto,
		candidates,
		check,
		complete,
		computable,
		kindLabels,
		type Kind,
		type Result
	} from './logic';

	type Mode = 'validate' | 'compute';
	const kinds = Object.keys(kindLabels) as Kind[];

	let input = $state('DK50 0040 0440 1162 43');
	let kind = $state<Kind | 'auto'>('auto');
	let mode = $state<Mode>('validate');
	let ready = false;

	const results = $derived.by((): { list: Result[]; error?: string } => {
		if (!input.trim() || mode !== 'validate') return { list: [] };
		if (kind === 'auto') {
			const list = auto(input);
			return list.length
				? { list }
				: { list, error: 'Not recognised. Pick a type to see what the input is missing.' };
		}
		try {
			return { list: [check(kind, input)] };
		} catch (e) {
			return { list: [], error: (e as Error).message };
		}
	});

	const computed = $derived.by((): { k: Kind; v?: string; error?: string }[] => {
		if (!input.trim() || mode !== 'compute') return [];
		const ks: Kind[] = kind === 'auto' ? computable : kind === 'cpr' ? [] : [kind];
		const out = ks.map((k) => {
			try {
				return { k, v: complete(k, input) };
			} catch (e) {
				return { k, error: (e as Error).message };
			}
		});
		return kind === 'auto' ? out.filter((o) => o.v) : out;
	});

	/** Anything that could be a CPR number stays out of the URL. */
	const sensitive = $derived(
		kind === 'cpr' || candidates(input).includes('cpr') || results.list.some((r) => r.sensitive)
	);

	const statusText: Record<Result['status'], string> = {
		valid: 'Valid',
		invalid: 'Invalid',
		warn: 'Check'
	};

	onMount(() => {
		const h = readHash();
		if (h.in) input = h.in;
		if (h.t && (h.t === 'auto' || h.t in kindLabels)) kind = h.t as Kind | 'auto';
		if (h.m === 'compute') mode = 'compute';
		ready = true;
	});

	$effect(() => {
		const state = {
			in: sensitive ? undefined : input,
			t: kind === 'auto' ? undefined : kind,
			m: mode === 'compute' ? 'compute' : undefined
		};
		if (ready) writeHash(state);
	});
</script>

<div class="inputs">
	<div class="field wide">
		<label class="label" for="cd-in"
			>{mode === 'validate' ? 'Number' : 'Payload without check digit'}</label
		>
		<input id="cd-in" type="text" bind:value={input} spellcheck="false" autocomplete="off" />
	</div>
	<div class="field">
		<label class="label" for="cd-kind">Type</label>
		<select id="cd-kind" bind:value={kind}>
			<option value="auto">Auto-detect</option>
			{#each kinds as k (k)}
				{#if mode === 'validate' || k !== 'cpr'}
					<option value={k}>{kindLabels[k]}</option>
				{/if}
			{/each}
		</select>
	</div>
</div>

<div class="row opts" role="group" aria-label="Mode">
	<button type="button" aria-pressed={mode === 'validate'} onclick={() => (mode = 'validate')}
		>Validate</button
	>
	<button
		type="button"
		aria-pressed={mode === 'compute'}
		onclick={() => ((mode = 'compute'), kind === 'cpr' && (kind = 'auto'))}
		>Compute check digit</button
	>
</div>

{#if sensitive}
	<p class="note privacy">
		Looks like it could be a CPR number. It is checked only in this browser and is not written to
		the page address, so it will not end up in history or a shared link. Avoid pasting real CPR
		numbers into tools you have not checked.
	</p>
{/if}

{#if mode === 'validate'}
	{#if results.error}
		<p class="error" role="alert">{results.error}</p>
	{/if}
	{#each results.list as r (r.kind)}
		<section class="res" aria-label={kindLabels[r.kind]}>
			<p class="head">
				<span class="label">{kindLabels[r.kind]}</span>
				<span class="tag" class:ok={r.status === 'valid'} class:bad={r.status === 'invalid'}
					>{statusText[r.status]}</span
				>
			</p>
			<dl class="readout">
				<div>
					<dt>Formatted</dt>
					<dd class="val">{r.formatted}</dd>
					{#if !r.sensitive}<Copy value={r.formatted} />{/if}
				</div>
				{#each r.details as [k, v] (k)}
					<div>
						<dt>{k}</dt>
						<dd>{v}</dd>
					</div>
				{/each}
			</dl>
			{#each r.problems as p (p)}
				<p class={r.status === 'invalid' ? 'error' : 'note'}>{p}</p>
			{/each}
		</section>
	{/each}
{:else}
	{#if !computed.length}
		<p class="note">
			Enter the digits before the check digit. For IBAN enter the country code and the BBAN, with or
			without 00 as placeholder check digits. Not offered for CPR.
		</p>
	{/if}
	<dl class="readout out">
		{#each computed as c (c.k)}
			<div>
				<dt>{kindLabels[c.k]}</dt>
				{#if c.v}
					<dd class="val">{c.v}</dd>
					<Copy value={c.v} />
				{:else}
					<dd class="err" role="alert">{c.error}</dd>
				{/if}
			</div>
		{/each}
	</dl>
{/if}

<p class="note foot">
	Auto-detect lists every type the input fits, passing ones first: an 8-digit number can be a CVR,
	an EAN-8 and an ISSN at once. A valid check digit only means the number is well formed, not that
	it exists or is in use. IBAN lengths from the SWIFT IBAN Registry; ISBN hyphen positions depend on
	registrant ranges and are not shown.
</p>

<style>
	.inputs {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
		gap: 1rem;
	}
	.wide {
		grid-column: span 2;
	}
	@media (max-width: 40rem) {
		.wide {
			grid-column: auto;
		}
	}
	.opts {
		margin: 1rem 0;
	}
	.privacy {
		border-left-color: var(--signal);
		margin-bottom: 1rem;
	}
	.res {
		margin: 1.5rem 0;
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1rem;
		align-items: center;
		margin: 0 0 0.5rem;
	}
	.tag {
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		border: 1px solid var(--rule);
		padding: 0.1rem 0.5rem;
	}
	.tag.ok {
		background: var(--ink);
		color: var(--paper);
	}
	.tag.bad {
		background: var(--signal);
		color: var(--signal-ink);
		border-color: var(--signal);
	}
	.val {
		font-weight: 700;
		font-size: 1.0625rem;
	}
	.err {
		color: var(--signal);
		font-size: 0.875rem;
	}
	.res .error,
	.res .note {
		margin-top: 0.5rem;
	}
	.out {
		margin-top: 1rem;
	}
	.foot {
		margin-top: 2rem;
	}
</style>
