<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import { decode, encode, modeLabel, parseUrl, type UrlMode } from './logic';

	let plain = $state('');
	let encoded = $state('');
	let mode = $state<UrlMode>('component');
	let error = $state('');
	let ready = false;

	const modes: UrlMode[] = ['component', 'uri', 'form'];

	function fromPlain() {
		try {
			encoded = encode(plain, mode);
			error = '';
		} catch (e) {
			error = (e as Error).message;
		}
	}

	function fromEncoded() {
		try {
			plain = decode(encoded, mode);
			error = '';
		} catch (e) {
			error = (e as Error).message;
		}
	}

	function setMode(m: UrlMode) {
		mode = m;
		fromPlain();
	}

	const url = $derived(parseUrl(encoded) ?? parseUrl(plain));

	onMount(() => {
		const h = readHash();
		if (h.m && h.m in modeLabel) mode = h.m as UrlMode;
		if (h.in) {
			encoded = h.in;
			fromEncoded();
		} else if (h.text) {
			plain = h.text;
			fromPlain();
		}
		ready = true;
	});

	$effect(() => {
		const state = { text: plain, m: mode === 'component' ? undefined : mode };
		if (ready) writeHash(state);
	});
</script>

<div class="grid">
	<div class="field">
		<div class="row between">
			<label class="label" for="url-plain">Plain text</label>
			<Copy value={plain} />
		</div>
		<textarea id="url-plain" bind:value={plain} oninput={fromPlain} spellcheck="false"></textarea>
	</div>

	<div class="field">
		<div class="row between">
			<label class="label" for="url-enc">Percent-encoded</label>
			<Copy value={encoded} />
		</div>
		<textarea id="url-enc" bind:value={encoded} oninput={fromEncoded} spellcheck="false"></textarea>
	</div>
</div>

<div class="row opts" role="group" aria-label="Encoding mode">
	<span class="label">Mode</span>
	{#each modes as m (m)}
		<button type="button" aria-pressed={mode === m} onclick={() => setMode(m)}
			>{modeLabel[m]}</button
		>
	{/each}
</div>

{#if error}<p class="error" role="alert">{error}</p>{/if}

<p class="note">
	Component encodes everything except letters, digits and <code>-_.!~*'()</code>, for a single query
	value or path segment. Full URI keeps <code>;/?:@&amp;=+$,#</code> so a whole URL stays usable.
	Form is what HTML forms send: space becomes <code>+</code> and decoding reads
	<code>+</code> as space.
</p>

{#if url}
	<h2 class="label head">Parsed URL</h2>
	<dl class="readout">
		{#each url.parts as p (p.label)}
			<div>
				<dt>{p.label}</dt>
				<dd>{p.value}</dd>
				<Copy value={p.value} />
			</div>
		{/each}
	</dl>
	{#if url.params.length}
		<h2 class="label head">Query parameters, decoded</h2>
		<dl class="readout">
			{#each url.params as [k, v], i (i)}
				<div>
					<dt class="key">{k || '(empty name)'}</dt>
					<dd>{v}</dd>
					<Copy value={v} />
				</div>
			{/each}
		</dl>
	{/if}
{/if}

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
		gap: 1.25rem;
		margin-bottom: 1rem;
	}
	.between {
		justify-content: space-between;
	}
	.opts {
		margin-bottom: 1.25rem;
	}
	.note {
		margin-bottom: 1.25rem;
	}
	.head {
		margin: 1.5rem 0 0.4rem;
	}
	/* Parameter names are data, keep their case. */
	.readout dt.key {
		text-transform: none;
		letter-spacing: 0;
		overflow-wrap: anywhere;
	}
</style>
