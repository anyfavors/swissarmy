<script lang="ts">
	import '../app.css';
	import { resolve } from '$app/paths';
	import Palette from '#lib/ui/Palette.svelte';
	import { onMount } from 'svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
	let palette: Palette;

	type Edition = 'auto' | 'paper' | 'blueprint';
	let edition = $state<Edition>('auto');
	const next: Record<Edition, Edition> = { auto: 'paper', paper: 'blueprint', blueprint: 'auto' };

	onMount(() => {
		// Marks the page as interactive; the browser tests wait for it before using shortcuts.
		document.documentElement.dataset.hydrated = '';
		const saved = document.documentElement.dataset.theme;
		if (saved === 'paper' || saved === 'blueprint') edition = saved;
	});

	function cycleEdition() {
		edition = next[edition];
		const root = document.documentElement;
		try {
			if (edition === 'auto') {
				delete root.dataset.theme;
				localStorage.removeItem('fm-theme');
			} else {
				root.dataset.theme = edition;
				localStorage.setItem('fm-theme', edition);
			}
		} catch {
			/* storage blocked: the choice just won't persist */
		}
	}
</script>

<a class="skip" href="#main">Skip to content</a>

<header class="masthead">
	<div class="wrap bar">
		<a class="mark" href={resolve('/')} aria-label="Field Manual, index">
			<span class="fm">FM</span>
			<span class="name">
				<strong>Field Manual</strong>
				<span class="label">smhansen.dev</span>
			</span>
		</a>
		<nav class="row" aria-label="Site">
			<a class="btn" href={resolve('/chain')}>Chain</a>
			<button type="button" onclick={() => palette.open()}>
				Search <kbd class="hint">Ctrl K</kbd>
			</button>
			<button
				type="button"
				onclick={cycleEdition}
				title="Switch between paper and blueprint editions"
			>
				Edition: {edition}
			</button>
		</nav>
	</div>
</header>

<main id="main" class="wrap">
	{@render children()}
</main>

<footer class="wrap colophon">
	<p class="label">
		Field Manual · Every tool runs in your browser · Network use is marked on the tool ·
		<a href={resolve('/colophon')}>Colophon</a>
	</p>
</footer>

<Palette bind:this={palette} />

<style>
	.skip {
		position: absolute;
		left: -999px;
	}
	.skip:focus {
		left: 1rem;
		top: 1rem;
		background: var(--paper);
		padding: 0.5rem;
		z-index: 10;
	}
	.masthead {
		border-top: 6px solid var(--rule);
		border-bottom: 1px solid var(--rule);
		margin-bottom: clamp(1.5rem, 4vw, 3rem);
	}
	.bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		padding-top: 0.75rem;
		padding-bottom: 0.75rem;
		flex-wrap: wrap;
	}
	.mark {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		text-decoration: none;
	}
	.fm {
		font-family: var(--font-mono);
		font-weight: 700;
		font-size: 1.25rem;
		letter-spacing: 0.05em;
		color: var(--signal);
		border: 2px solid var(--signal);
		padding: 0.15rem 0.45rem;
		line-height: 1.2;
	}
	.name {
		display: grid;
		line-height: 1.2;
	}
	.hint {
		font-size: 0.6875rem;
		opacity: 0.7;
	}
	@media (max-width: 40rem) {
		.hint {
			display: none;
		}
	}
	.colophon {
		margin-top: 4rem;
		padding-bottom: 2rem;
	}
	.colophon p {
		margin: 0;
		padding-top: 1rem;
		border-top: 1px solid var(--rule);
	}
</style>
