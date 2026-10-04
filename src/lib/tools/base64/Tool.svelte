<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import { decodeText, encodeText, toHex, type Base64Variant } from './logic';

	let plain = $state('');
	let encoded = $state('');
	let variant = $state<Base64Variant>('standard');
	let pad = $state(true);
	let error = $state('');
	let binary = $state<Uint8Array | null>(null);
	let ready = false;

	function fromPlain() {
		encoded = encodeText(plain, variant, pad);
		error = '';
		binary = null;
	}

	function fromEncoded() {
		if (!encoded.trim()) {
			plain = '';
			error = '';
			binary = null;
			return;
		}
		try {
			const d = decodeText(encoded);
			plain = d.text;
			binary = d.utf8 ? null : d.bytes;
			error = '';
		} catch (e) {
			error = (e as Error).message;
		}
	}

	onMount(() => {
		const h = readHash();
		if (h.v === 'url') variant = 'url';
		if (h.pad === '0') pad = false;
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
		const state = {
			text: plain,
			v: variant === 'url' ? 'url' : undefined,
			pad: pad ? undefined : '0'
		};
		if (ready) writeHash(state);
	});
</script>

<div class="grid">
	<div class="field">
		<div class="row between">
			<label class="label" for="plain">Plain text (UTF-8)</label>
			<Copy value={plain} />
		</div>
		<textarea id="plain" bind:value={plain} oninput={fromPlain} spellcheck="false"></textarea>
	</div>

	<div class="field">
		<div class="row between">
			<label class="label" for="encoded">Base64</label>
			<Copy value={encoded} />
		</div>
		<textarea id="encoded" bind:value={encoded} oninput={fromEncoded} spellcheck="false"></textarea>
	</div>
</div>

<div class="row opts" role="group" aria-label="Output options">
	<span class="label">Alphabet</span>
	<button
		type="button"
		aria-pressed={variant === 'standard'}
		onclick={() => ((variant = 'standard'), fromPlain())}
	>
		Standard + /
	</button>
	<button
		type="button"
		aria-pressed={variant === 'url'}
		onclick={() => ((variant = 'url'), fromPlain())}
	>
		URL-safe - _
	</button>
	<button type="button" aria-pressed={pad} onclick={() => ((pad = !pad), fromPlain())}
		>Padding =</button
	>
</div>

{#if error}<p class="error" role="alert">{error}</p>{/if}
{#if binary}
	<p class="note">
		The decoded bytes are not valid UTF-8, so this is probably binary data ({binary.length} bytes). Hex:
		<code>{toHex(binary)}</code>
	</p>
{/if}

<dl class="readout">
	<div>
		<dt>Plain length</dt>
		<dd>{new TextEncoder().encode(plain).length} bytes</dd>
	</div>
	<div>
		<dt>Encoded length</dt>
		<dd>{encoded.replace(/\s/g, '').length} characters</dd>
	</div>
</dl>

<p class="note">
	Decoding accepts both alphabets, with or without padding, and ignores line breaks, so PEM bodies
	and wrapped MIME parts paste straight in.
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
	.readout {
		margin: 1.25rem 0;
	}
	.note code {
		overflow-wrap: anywhere;
	}
</style>
