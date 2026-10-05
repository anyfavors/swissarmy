<script lang="ts">
	import { resolve } from '$app/paths';
	import { loadDetectors, toc, tools, toolNumber, type Detector } from '#lib/tools/registry.ts';
	import { detectTools } from '#lib/util/search.ts';
	import { handOff } from '#lib/util/hash.ts';

	let intake = $state('');
	let detectors = $state<Map<string, Detector> | null>(null);
	const matches = $derived(detectors ? detectTools(intake, tools, detectors) : []);

	// The recognisers are only needed once someone types here, so they load on first input.
	$effect(() => {
		if (intake.trim() && !detectors) loadDetectors().then((d) => (detectors = d));
	});

	function href(id: string) {
		return resolve('/[tool]', { tool: id });
	}
</script>

<svelte:head>
	<title>Field Manual · stephanmh.dev</title>
	<meta
		name="description"
		content="Browser-side utilities for encoding, networking, time, security and more. Nothing leaves your browser."
	/>
</svelte:head>

<section class="cover">
	<p class="label">Rev. 0.1 · Issued {new Date().getFullYear()} · {tools.length} entries</p>
	<h1>Field Manual</h1>
	<p class="lede">
		Utilities for the working day: encoding, networks, time, certificates and conversions.
		Everything runs in your browser.
	</p>
</section>

<section class="intake" aria-labelledby="intake-h">
	<h2 id="intake-h"><span class="sec">§0</span> Intake</h2>
	<label class="label" for="intake">Paste anything and the manual suggests where to look</label>
	<textarea
		id="intake"
		bind:value={intake}
		spellcheck="false"
		autocomplete="off"
		placeholder="10.20.0.0/22   ·   1791115200   ·   SGVsbG8gd29ybGQ="></textarea>
	{#if intake.trim()}
		{#if matches.length}
			<ol class="matches" aria-live="polite">
				{#each matches as m (m.tool.id)}
					<li>
						<a class="btn" href={href(m.tool.id)} onclick={() => handOff(intake.trim())}>
							<span class="no">{toolNumber(m.tool)}</span>
							{m.tool.title}
						</a>
					</li>
				{/each}
			</ol>
		{:else if detectors}
			<p class="note" aria-live="polite">No entry recognises this yet. Try the search (Ctrl K).</p>
		{/if}
	{/if}
</section>

<section aria-labelledby="toc-h">
	<h2 id="toc-h"><span class="sec">§</span> Contents</h2>
	<ol class="toc">
		{#each toc as ch (ch.no)}
			<li class="chapter" class:empty={!ch.tools.length}>
				<h3><span class="chno">{ch.no}</span> {ch.title}</h3>
				{#if ch.tools.length}
					<ol>
						{#each ch.tools as t (t.id)}
							<li>
								<a href={resolve('/[tool]', { tool: t.id })}>
									<span class="t">{t.title}</span>
									<span class="leader" aria-hidden="true"></span>
									<span class="no">{toolNumber(t)}</span>
								</a>
								<p class="sum">{t.summary}</p>
							</li>
						{/each}
					</ol>
				{:else}
					<p class="label pending">In preparation</p>
				{/if}
			</li>
		{/each}
	</ol>
</section>

<style>
	.cover {
		border-bottom: 2px solid var(--rule);
		padding-bottom: 1.5rem;
		margin-bottom: 2.5rem;
	}
	h1 {
		font-size: clamp(2.75rem, 9vw, 6rem);
		letter-spacing: -0.02em;
		margin: 0.25rem 0 0.75rem;
	}
	.lede {
		font-size: 1.1875rem;
		max-width: 38rem;
		margin: 0;
	}
	h2 {
		font-size: 1.375rem;
		margin-bottom: 0.75rem;
	}
	.sec {
		font-family: var(--font-mono);
		color: var(--signal);
		margin-right: 0.35rem;
	}
	.intake {
		display: grid;
		gap: 0.5rem;
		margin-bottom: 3rem;
	}
	.intake textarea {
		min-height: 5.5rem;
	}
	.matches {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.matches .no {
		color: var(--signal);
	}
	.matches a:hover .no {
		color: inherit;
	}
	.toc {
		list-style: none;
		padding: 0;
		margin: 0;
		columns: 2 22rem;
		column-gap: 3rem;
	}
	.chapter {
		break-inside: avoid;
		padding: 0.75rem 0 1rem;
		border-top: 2px solid var(--rule);
	}
	.chapter h3 {
		font-size: 1rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		margin-bottom: 0.5rem;
	}
	.chno {
		font-family: var(--font-mono);
		color: var(--signal);
		display: inline-block;
		min-width: 1.75rem;
	}
	.chapter.empty h3 {
		color: var(--ink-2);
	}
	.chapter.empty .chno {
		color: var(--ink-2);
	}
	.chapter ol {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.chapter ol a {
		display: flex;
		align-items: baseline;
		gap: 0.4rem;
		text-decoration: none;
		font-weight: 700;
	}
	.chapter ol a:hover .t {
		text-decoration: underline;
		text-decoration-color: var(--signal);
		text-decoration-thickness: 2px;
	}
	.leader {
		flex: 1;
		border-bottom: 2px dotted var(--rule-soft);
		transform: translateY(-0.3em);
	}
	.chapter .no {
		font-family: var(--font-mono);
		font-weight: 400;
	}
	.sum {
		margin: 0 0 0.6rem;
		font-size: 0.875rem;
		color: var(--ink-2);
	}
	.pending {
		margin: 0;
	}
</style>
