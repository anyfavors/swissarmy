<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import { parseHex } from '../hex/logic';
	import {
		base58CheckDecode,
		decode,
		encode,
		encodings,
		toHex,
		utf8Text,
		type Base58Check,
		type Encoding
	} from './logic';

	let plain = $state('');
	let encoded = $state('');
	let enc = $state<Encoding>('base32');
	let plainHex = $state(false);
	let error = $state('');
	let binary = $state(false);
	let check = $state<Base58Check | null>(null);
	let all = $state<{ id: Encoding; label: string; value: string; error: string }[]>([]);
	let ready = false;
	let seq = 0;

	function plainBytes(): Uint8Array {
		return plainHex ? parseHex(plain) : new TextEncoder().encode(plain);
	}

	async function fromPlain() {
		const my = ++seq;
		check = null;
		binary = false;
		try {
			const bytes = plainBytes();
			const out = await encode(bytes, enc);
			if (my !== seq) return;
			encoded = out;
			error = '';
		} catch (e) {
			if (my !== seq) return;
			encoded = '';
			error = (e as Error).message;
		}
		void refreshAll();
	}

	async function fromEncoded() {
		const my = ++seq;
		check = null;
		if (!encoded.trim()) {
			plain = '';
			error = '';
			binary = false;
			void refreshAll();
			return;
		}
		try {
			let bytes: Uint8Array;
			if (enc === 'base58check') {
				const r = await base58CheckDecode(encoded);
				if (my !== seq) return;
				check = r;
				bytes = r.payload;
			} else bytes = await decode(encoded, enc);
			if (my !== seq) return;
			const text = utf8Text(bytes);
			binary = text === null;
			plainHex = binary || plainHex;
			plain = plainHex ? toHex(bytes) : (text ?? '');
			error = '';
		} catch (e) {
			if (my !== seq) return;
			error = (e as Error).message;
		}
		void refreshAll();
	}

	async function refreshAll() {
		let bytes: Uint8Array;
		try {
			bytes = plainBytes();
		} catch {
			all = [];
			return;
		}
		all = await Promise.all(
			encodings.map(async (e) => {
				try {
					return { ...e, value: await encode(bytes, e.id), error: '' };
				} catch (err) {
					return { ...e, value: '', error: (err as Error).message };
				}
			})
		);
	}

	function pick(e: Encoding) {
		enc = e;
		if (encoded.trim() && !plain) fromEncoded();
		else fromPlain();
	}

	function setHex(on: boolean) {
		if (on === plainHex) return;
		let bytes: Uint8Array;
		try {
			bytes = plainBytes();
		} catch (e) {
			error = (e as Error).message;
			return;
		}
		if (on) plain = toHex(bytes);
		else {
			const text = utf8Text(bytes);
			if (text === null) {
				error = 'These bytes are not UTF-8 text, so they stay as hex';
				return;
			}
			plain = text;
		}
		plainHex = on;
		fromPlain();
	}

	onMount(() => {
		const h = readHash();
		if (encodings.some((e) => e.id === h.e)) enc = h.e as Encoding;
		if (h.hex === '1') plainHex = true;
		if (h.in) {
			encoded = h.in;
			if (!h.e && /^\s*<~/.test(h.in)) enc = 'ascii85';
			fromEncoded();
		} else void refreshAll();
		ready = true;
	});

	// Options only, the data stays out of the link.
	$effect(() => {
		const state = { e: enc === 'base32' ? undefined : enc, hex: plainHex ? '1' : undefined };
		if (ready) writeHash(state);
	});

	const hex = (b: Uint8Array) => toHex(b);
</script>

<div class="row opts" role="group" aria-label="Encoding">
	<span class="label">Encoding</span>
	{#each encodings as e (e.id)}
		<button type="button" class="case" aria-pressed={enc === e.id} onclick={() => pick(e.id)}
			>{e.label}</button
		>
	{/each}
</div>

<div class="grid">
	<div class="field">
		<div class="row between">
			<label class="label" for="bn-plain">{plainHex ? 'Bytes (hex)' : 'Plain text (UTF-8)'}</label>
			<span class="row">
				<button type="button" aria-pressed={plainHex} onclick={() => setHex(!plainHex)}>Hex</button>
				<Copy value={plain} />
			</span>
		</div>
		<textarea id="bn-plain" bind:value={plain} oninput={fromPlain} spellcheck="false"></textarea>
	</div>

	<div class="field">
		<div class="row between">
			<label class="label" for="bn-enc">{encodings.find((e) => e.id === enc)?.label}</label>
			<Copy value={encoded} />
		</div>
		<textarea id="bn-enc" bind:value={encoded} oninput={fromEncoded} spellcheck="false"></textarea>
	</div>
</div>

{#if error}<p class="error" role="alert">{error}</p>{/if}
{#if binary}
	<p class="note">The decoded bytes are not valid UTF-8, so they are shown as hex.</p>
{/if}

{#if check}
	<dl class="readout check">
		<div>
			<dt>Checksum</dt>
			<dd class:bad={!check.valid}>
				{check.valid ? 'Valid' : `Does not match, expected ${hex(check.expected)}`}
			</dd>
		</div>
		<div>
			<dt>Version byte</dt>
			<dd>0x{check.version.toString(16).padStart(2, '0')} ({check.version})</dd>
		</div>
		<div>
			<dt>Payload</dt>
			<dd>{hex(check.payload.subarray(1))}</dd>
			<Copy value={hex(check.payload.subarray(1))} />
		</div>
	</dl>
{/if}

<h2 class="label head">All encodings of the plain side</h2>
<dl class="readout">
	{#each all as row (row.id)}
		<div>
			<dt>{row.label}</dt>
			<dd>
				{#if row.error}<span class="muted">{row.error}</span>{:else}{row.value}{/if}
			</dd>
			<Copy value={row.value} />
		</div>
	{/each}
</dl>

<p class="note">
	Base32 and base32hex follow RFC 4648 with padding. Crockford groups bytes 5 bits at a time without
	padding or check symbol, and reads I, L as 1 and O as 0. Base58 and Base36 treat the bytes as one
	big number, each leading zero byte becomes one leading <code>1</code> or <code>0</code>.
	Base58Check adds the first 4 bytes of a double SHA-256, as Bitcoin addresses do. Z85 only takes
	whole 4-byte frames.
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
	.case {
		text-transform: none;
	}
	.check {
		margin: 1rem 0;
	}
	.bad {
		color: var(--signal);
	}
	.muted {
		color: var(--ink-2);
	}
	.head {
		margin: 2rem 0 0.75rem;
		font-weight: 400;
	}
	.readout {
		margin-bottom: 1.25rem;
	}
	code {
		overflow-wrap: anywhere;
	}
</style>
