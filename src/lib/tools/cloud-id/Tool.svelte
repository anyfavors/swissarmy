<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import { parseId } from './logic';

	let input = $state('');
	let ready = false;

	const examples: { label: string; v: string }[] = [
		{
			label: 'EC2 instance',
			v: 'arn:aws:ec2:eu-north-1:123456789012:instance/i-0abcd1234efgh5678'
		},
		{ label: 'S3 object', v: 'arn:aws:s3:::my-bucket/logs/2026/10/05.gz' },
		{ label: 'IAM role', v: 'arn:aws:iam::123456789012:role/service/ops/deployer' },
		{
			label: 'Azure SQL DB',
			v: '/subscriptions/00000000-1111-2222-3333-444444444444/resourceGroups/rg-data/providers/Microsoft.Sql/servers/sql1/databases/orders'
		},
		{
			label: 'GCE instance',
			v: '//compute.googleapis.com/projects/my-project-123/zones/europe-north1-a/instances/web-1'
		}
	];

	const cloudName = {
		aws: 'AWS ARN',
		azure: 'Azure resource ID',
		gcp: 'Google Cloud resource name'
	};

	const result = $derived.by(() => {
		if (!input.trim()) return null;
		try {
			return { p: parseId(input) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	onMount(() => {
		const h = readHash();
		input = h.in ?? examples[2].v;
		ready = true;
	});

	$effect(() => {
		const state = { in: input };
		if (ready) writeHash(state);
	});
</script>

<div class="field">
	<label class="label" for="cid-in">ARN, Azure resource ID or Google resource name</label>
	<textarea id="cid-in" class="short" bind:value={input} spellcheck="false" autocomplete="off"
	></textarea>
</div>

<div class="row examples" role="group" aria-label="Examples">
	{#each examples as ex (ex.v)}
		<button
			type="button"
			class="ex"
			aria-pressed={input.trim() === ex.v}
			onclick={() => (input = ex.v)}>{ex.label}</button
		>
	{/each}
</div>

{#if result?.error}
	<p class="error" role="alert">{result.error}</p>
{:else if result?.p}
	{@const p = result.p}
	<p class="say" class:bad={p.errors.length > 0}>
		{cloudName[p.cloud]}, {p.errors.length
			? `${p.errors.length} problem${p.errors.length === 1 ? '' : 's'}`
			: 'format looks valid'}
	</p>
	{#each p.errors as e (e)}
		<p class="error" role="alert">{e}</p>
	{/each}
	<dl class="readout">
		{#each p.parts as part, i (i)}
			<div>
				<dt>{part.label}</dt>
				<dd>{part.value}</dd>
				<Copy value={part.value} />
			</div>
		{/each}
	</dl>
	{#each p.notes as n (n)}
		<p class="note">{n}</p>
	{/each}
{/if}

<p class="note">
	This checks the shape of the identifier only. It cannot tell whether the resource exists, and
	nothing is sent anywhere.
</p>

<style>
	.short {
		min-height: 4.5rem;
	}
	.examples {
		margin: 0.75rem 0 1.25rem;
	}
	.ex {
		text-transform: none;
		letter-spacing: 0;
	}
	.say {
		font-size: 1.125rem;
		margin: 0 0 1rem;
		padding: 0.5rem 0.75rem;
		border-left: 4px solid var(--rule);
	}
	.say.bad {
		border-left-color: var(--signal);
		background: var(--hilite);
	}
	.error {
		margin: 0 0 0.5rem;
	}
	.readout {
		margin: 1rem 0;
	}
	.note {
		margin: 0 0 1rem;
	}
</style>
