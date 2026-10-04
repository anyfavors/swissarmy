<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import { decodeEntities, encodeEntities } from './logic';

	let plain = $state('');
	let encoded = $state('');
	let nonAscii = $state(false);
	let unknown = $state<string[]>([]);
	let ready = false;

	function fromPlain() {
		encoded = encodeEntities(plain, nonAscii);
		unknown = [];
	}

	function fromEncoded() {
		const r = decodeEntities(encoded);
		plain = r.text;
		unknown = r.unknown;
	}

	onMount(() => {
		const h = readHash();
		if (h.ascii === '1') nonAscii = true;
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
		const state = { text: plain, ascii: nonAscii ? '1' : undefined };
		if (ready) writeHash(state);
	});
</script>

<div class="grid">
	<div class="field">
		<div class="row between">
			<label class="label" for="he-plain">Plain text</label>
			<Copy value={plain} />
		</div>
		<textarea id="he-plain" bind:value={plain} oninput={fromPlain} spellcheck="false"></textarea>
	</div>

	<div class="field">
		<div class="row between">
			<label class="label" for="he-enc">HTML with entities</label>
			<Copy value={encoded} />
		</div>
		<textarea id="he-enc" bind:value={encoded} oninput={fromEncoded} spellcheck="false"></textarea>
	</div>
</div>

<div class="row opts" role="group" aria-label="Encoding options">
	<span class="label">Encode</span>
	<button
		type="button"
		aria-pressed={nonAscii}
		onclick={() => ((nonAscii = !nonAscii), fromPlain())}>Non-ASCII as &amp;#x..;</button
	>
</div>

{#if unknown.length}
	<p class="note unknown" role="status">
		Unknown entity, left as written: <code>{unknown.join(' ')}</code>
	</p>
{/if}

<p class="note">
	Encoding escapes <code>&amp; &lt; &gt; &quot; '</code>, which is enough for text and quoted
	attribute values in UTF-8 pages. Decoding knows the 252 HTML 4 names plus
	<code>&amp;apos;</code>, and decimal and hex references. Numeric references 128 to 159 decode as
	Windows-1252, as browsers do, so <code>&amp;#150;</code> is an en dash.
</p>

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
	/* The entity syntax is case sensitive. */
	.opts button {
		text-transform: none;
	}
	.unknown {
		margin-bottom: 1rem;
		border-left-color: var(--signal);
	}
	code {
		overflow-wrap: anywhere;
	}
</style>
