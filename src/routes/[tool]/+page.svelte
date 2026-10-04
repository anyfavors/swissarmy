<script lang="ts">
	import { chapterTitle, getTool, toolNumber } from '#lib/tools/registry.ts';
	import Stamp from '#lib/ui/Stamp.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const meta = $derived(getTool(data.id)!);
	const Ui = $derived(data.Ui);
</script>

<svelte:head>
	<title>FM {toolNumber(meta)} {meta.title} · Field Manual</title>
	<meta name="description" content={meta.summary} />
</svelte:head>

<article>
	<header class="head">
		<p class="label running">
			<span class="no">FM {toolNumber(meta)}</span>
			<span>Chapter {meta.chapter} · {chapterTitle(meta.chapter)}</span>
		</p>
		<h1>{meta.title}</h1>
		<p class="sum">{meta.summary}</p>
		<Stamp network={meta.network} />
	</header>

	{#key data.id}
		<Ui />
	{/key}
</article>

<style>
	.head {
		display: grid;
		gap: 0.6rem;
		justify-items: start;
		padding-bottom: 1.25rem;
		margin-bottom: 1.75rem;
		border-bottom: 2px solid var(--rule);
	}
	.running {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1.25rem;
		margin: 0;
	}
	.no {
		color: var(--signal);
		font-weight: 700;
	}
	h1 {
		font-size: clamp(2rem, 6vw, 3.25rem);
		letter-spacing: -0.015em;
	}
	.sum {
		margin: 0;
		font-size: 1.125rem;
		max-width: 44rem;
	}
</style>
