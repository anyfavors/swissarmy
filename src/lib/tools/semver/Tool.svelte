<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		checkList,
		explainRange,
		increments,
		maxSatisfying,
		parseRange,
		prereleaseNote,
		tryParse,
		type Range
	} from './logic';

	let range = $state('^1.2.3');
	let versions = $state('1.2.2\n1.2.3\n1.2.10\n1.3.0-beta.1\n1.9.0\n2.0.0');
	let ready = false;

	const parsedRange = $derived.by((): { r?: Range; error?: string } => {
		try {
			return { r: parseRange(range) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});
	const lines = $derived(parsedRange.r ? explainRange(parsedRange.r) : []);
	const preNote = $derived(parsedRange.r ? prereleaseNote(parsedRange.r) : null);
	const list = $derived(checkList(versions, parsedRange.r ?? null));
	const best = $derived(maxSatisfying(list));
	const single = $derived(tryParse(range));
	const inc = $derived(single ? increments(single) : null);

	onMount(() => {
		const h = readHash();
		if (h.in) {
			// A bare version goes into the list, anything else is a range
			if (tryParse(h.in) && !/^[\^~<>=]/.test(h.in.trim())) versions = h.in;
			else range = h.in;
		}
		if (h.r !== undefined) range = h.r;
		if (h.v !== undefined) versions = h.v;
		ready = true;
	});

	$effect(() => {
		const state = { r: range, v: versions };
		if (ready) writeHash(state);
	});
</script>

<div class="grid">
	<div class="field">
		<label class="label" for="sv-range">Range (npm syntax) or one version</label>
		<input
			id="sv-range"
			type="text"
			bind:value={range}
			spellcheck="false"
			autocomplete="off"
			autocapitalize="off"
			placeholder="^1.2.3 || >=2.1.0 <3"
		/>
		{#if parsedRange.error}
			<p class="error" role="alert">{parsedRange.error}</p>
		{:else if parsedRange.r}
			<dl class="readout">
				<div>
					<dt>Normalised</dt>
					<dd>{parsedRange.r.text}</dd>
					<Copy value={parsedRange.r.text} />
				</div>
				{#each lines as l, i (i)}
					<div>
						<dt>{lines.length > 1 ? `Alternative ${i + 1}` : 'Allows'}</dt>
						<dd class="plain">{l}</dd>
					</div>
				{/each}
				{#if preNote}
					<div>
						<dt>Pre-releases</dt>
						<dd class="plain">{preNote}</dd>
					</div>
				{/if}
			</dl>
		{/if}
		{#if single}
			<dl class="readout">
				<div>
					<dt>Major . minor . patch</dt>
					<dd>{single.major} . {single.minor} . {single.patch}</dd>
				</div>
				<div>
					<dt>Pre-release</dt>
					<dd>{single.prerelease.length ? single.prerelease.join(' . ') : 'none'}</dd>
				</div>
				<div>
					<dt>Build metadata</dt>
					<dd>{single.build.length ? single.build.join(' . ') : 'none'}</dd>
				</div>
				{#if inc}
					<div>
						<dt>Next major / minor / patch</dt>
						<dd>{inc.major} / {inc.minor} / {inc.patch}</dd>
					</div>
				{/if}
			</dl>
		{/if}
	</div>

	<div class="field">
		<label class="label" for="sv-list">Versions, one per line or comma separated</label>
		<textarea id="sv-list" bind:value={versions} spellcheck="false" autocomplete="off"></textarea>
	</div>
</div>

{#if list.length}
	<div class="scroll">
		<table>
			<caption class="label">
				Sorted by precedence{#if best}, highest match {best.version}{/if}
			</caption>
			<thead>
				<tr>
					<th scope="col">Version</th>
					<th scope="col">In range</th>
					<th scope="col">Parts</th>
				</tr>
			</thead>
			<tbody>
				{#each list as c, i (i)}
					<tr class:hit={c.ok} class:best={c.v && best && c.v.version === best.version}>
						<th scope="row" class="mono">{c.input}</th>
						{#if c.v}
							<td class="mono">{c.ok ? 'yes' : 'no'}</td>
							<td class="mono dim">
								{c.v.major}.{c.v.minor}.{c.v.patch}{#if c.v.prerelease.length}
									pre {c.v.prerelease.join('.')}{/if}{#if c.v.build.length}
									build {c.v.build.join('.')}{/if}
							</td>
						{:else}
							<td class="mono">invalid</td>
							<td class="err">{c.error}</td>
						{/if}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<p class="note">
	Caret allows changes that do not modify the left-most non-zero part, so ^0.2.3 stays below 0.3.0.
	Tilde allows patch changes. A pre-release only matches when the range names a pre-release on the
	same major.minor.patch, as npm does. The -0 in &lt;2.0.0-0 keeps 2.0.0 pre-releases out.
</p>

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
		gap: 1.25rem;
		margin-bottom: 1.25rem;
		align-items: start;
	}
	.readout {
		margin-top: 0.75rem;
	}
	.plain {
		font-family: var(--font-body);
	}
	.scroll {
		overflow-x: auto;
		margin: 0 0 1.25rem;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		border-top: 2px solid var(--rule);
		font-size: 0.9375rem;
	}
	caption {
		text-align: left;
		padding-bottom: 0.4rem;
	}
	th,
	td {
		text-align: left;
		padding: 0.4rem 0.75rem 0.4rem 0;
		border-bottom: 1px solid var(--rule-soft);
		vertical-align: top;
		overflow-wrap: anywhere;
	}
	thead th {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-2);
		font-weight: 400;
	}
	th[scope='row'] {
		font-weight: 400;
	}
	.hit {
		background: var(--hilite);
	}
	.best th {
		font-weight: 700;
	}
	.dim {
		color: var(--ink-2);
	}
	.err {
		color: var(--signal);
		font-size: 0.875rem;
	}
	.error {
		margin-top: 0.5rem;
	}
</style>
