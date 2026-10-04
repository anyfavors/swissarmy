<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		digestAll,
		formatSize,
		hmacAll,
		lengthHint,
		matchExpected,
		parseKey,
		toBase64,
		toHex,
		weakAlgos,
		type DigestAlgo,
		type KeyEncoding
	} from './logic';

	type Source = 'text' | 'file';
	type Mode = 'digest' | 'hmac';

	let source = $state<Source>('text');
	let mode = $state<Mode>('digest');
	let text = $state('');
	let file = $state<{ name: string; size: number; bytes: Uint8Array } | null>(null);
	let fileError = $state('');
	let reading = $state(false);
	let dragging = $state(false);
	let key = $state('');
	let keyEnc = $state<KeyEncoding>('text');
	let b64 = $state(false);
	let expected = $state('');
	let results = $state<Record<string, Uint8Array> | null>(null);
	let error = $state('');
	let busy = $state(false);
	let ready = false;
	let run = 0;

	const data = $derived(source === 'text' ? new TextEncoder().encode(text) : (file?.bytes ?? null));

	$effect(() => {
		const d = data;
		const m = mode;
		const k = key;
		const ke = keyEnc;
		const id = ++run;
		if (!d) {
			results = null;
			error = '';
			return;
		}
		let job: Promise<Record<string, Uint8Array>>;
		if (m === 'hmac') {
			if (!k) {
				results = null;
				error = '';
				return;
			}
			try {
				job = hmacAll(parseKey(k, ke), d);
			} catch (e) {
				results = null;
				error = (e as Error).message;
				return;
			}
		} else {
			job = digestAll(d);
		}
		busy = true;
		job.then(
			(r) => {
				if (id !== run) return;
				results = r;
				error = '';
				busy = false;
			},
			(e: Error) => {
				if (id !== run) return;
				results = null;
				error = e.message;
				busy = false;
			}
		);
	});

	const encode = (b: Uint8Array) => (b64 ? toBase64(b) : toHex(b));
	const hits = $derived(results ? matchExpected(expected, results) : []);
	const hint = $derived(
		expected.trim() && results && hits.length === 0 ? lengthHint(expected) : []
	);
	const label = (a: string) => (mode === 'hmac' ? `HMAC-${a}` : a);

	async function loadFile(f: File | undefined) {
		if (!f) return;
		fileError = '';
		reading = true;
		try {
			file = { name: f.name, size: f.size, bytes: new Uint8Array(await f.arrayBuffer()) };
		} catch (e) {
			file = null;
			fileError = `Could not read the file: ${(e as Error).message}`;
		} finally {
			reading = false;
		}
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		loadFile(e.dataTransfer?.files[0]);
	}

	onMount(() => {
		const h = readHash();
		if (h.in) text = h.in;
		if (h.mode === 'hmac') mode = 'hmac';
		if (h.key === 'hex') keyEnc = 'hex';
		if (h.out === 'b64') b64 = true;
		if (h.cmp) expected = h.cmp;
		ready = true;
	});

	// The text and the HMAC key are not written to the link: either may be a secret.
	$effect(() => {
		const state = {
			mode: mode === 'hmac' ? 'hmac' : undefined,
			key: keyEnc === 'hex' ? 'hex' : undefined,
			out: b64 ? 'b64' : undefined,
			cmp: expected.trim() || undefined
		};
		if (ready) writeHash(state);
	});
</script>

<div class="row opts" role="group" aria-label="Input">
	<span class="label">Input</span>
	<button type="button" aria-pressed={source === 'text'} onclick={() => (source = 'text')}
		>Text</button
	>
	<button type="button" aria-pressed={source === 'file'} onclick={() => (source = 'file')}
		>File</button
	>
</div>

{#if source === 'text'}
	<div class="field">
		<label class="label" for="hash-text">Text (hashed as UTF-8)</label>
		<textarea id="hash-text" bind:value={text} spellcheck="false"></textarea>
	</div>
{:else}
	<div
		class="drop"
		class:dragging
		role="group"
		aria-label="File to hash"
		ondragover={(e) => {
			e.preventDefault();
			dragging = true;
		}}
		ondragleave={() => (dragging = false)}
		ondrop={onDrop}
	>
		<label class="label" for="hash-file">Drop a file here or choose one</label>
		<input
			id="hash-file"
			type="file"
			onchange={(e) => loadFile((e.currentTarget as HTMLInputElement).files?.[0])}
		/>
		{#if reading}
			<p class="mono status">Reading file</p>
		{:else if file}
			<dl class="readout">
				<div>
					<dt>File</dt>
					<dd>{file.name}</dd>
				</div>
				<div>
					<dt>Size</dt>
					<dd>{formatSize(file.size)}</dd>
				</div>
			</dl>
		{/if}
	</div>
	{#if fileError}<p class="error" role="alert">{fileError}</p>{/if}
	<p class="note">The file is read inside this tab. Nothing is uploaded.</p>
{/if}

<div class="row opts" role="group" aria-label="Mode">
	<span class="label">Mode</span>
	<button type="button" aria-pressed={mode === 'digest'} onclick={() => (mode = 'digest')}
		>Digest</button
	>
	<button type="button" aria-pressed={mode === 'hmac'} onclick={() => (mode = 'hmac')}>HMAC</button>
</div>

{#if mode === 'hmac'}
	<div class="field">
		<div class="row between">
			<label class="label" for="hash-key">HMAC key</label>
			<div class="row" role="group" aria-label="Key encoding">
				<button type="button" aria-pressed={keyEnc === 'text'} onclick={() => (keyEnc = 'text')}
					>UTF-8 text</button
				>
				<button type="button" aria-pressed={keyEnc === 'hex'} onclick={() => (keyEnc = 'hex')}
					>Hex</button
				>
			</div>
		</div>
		<input
			id="hash-key"
			type="text"
			bind:value={key}
			spellcheck="false"
			autocomplete="off"
			autocapitalize="off"
		/>
	</div>
{/if}

<div class="row opts" role="group" aria-label="Output encoding">
	<span class="label">Output</span>
	<button type="button" aria-pressed={!b64} onclick={() => (b64 = false)}>Hex</button>
	<button type="button" aria-pressed={b64} onclick={() => (b64 = true)}>Base64</button>
</div>

<div class="field">
	<label class="label" for="hash-cmp">Compare with expected hash</label>
	<input
		id="hash-cmp"
		type="text"
		bind:value={expected}
		spellcheck="false"
		autocomplete="off"
		placeholder="Paste a published checksum"
	/>
</div>

{#if error}<p class="error" role="alert">{error}</p>{/if}

{#if results}
	{#if expected.trim()}
		{#if hits.length}
			<p class="verdict" aria-live="polite">Match: {hits.map(label).join(', ')}</p>
		{:else}
			<p class="error" role="alert">
				No match.{#if hint.length}
					The length fits {hint.join(' or ')}{mode === 'hmac' ? ' (as a plain digest)' : ''}.{/if}
			</p>
		{/if}
	{/if}

	<dl class="readout" aria-busy={busy}>
		{#each Object.entries(results) as [algo, bytes] (algo)}
			<div class:hit={hits.includes(algo)}>
				<dt>
					{label(algo)}{#if weakAlgos.includes(algo as DigestAlgo) && mode === 'digest'}<span
							class="weak">*</span
						>{/if}{#if hits.includes(algo)}<span class="tag">Match</span>{/if}
				</dt>
				<dd>{encode(bytes)}</dd>
				<Copy value={encode(bytes)} />
			</div>
		{/each}
	</dl>
{:else if mode === 'hmac' && !key && data}
	<p class="note">Enter a key to compute the HMAC.</p>
{/if}

<p class="note">
	* MD5 and SHA-1 are not collision resistant: use them for checksums only, never for signatures,
	certificates or anything an attacker can shape. A checksum from the same server as the download
	only catches transfer errors, not tampering.
</p>
<p class="note">
	HMAC with SHA-1 is still considered sound. The text and the key are never written to the address
	bar.
</p>

<style>
	.opts {
		margin: 1rem 0;
	}
	.between {
		justify-content: space-between;
	}
	.drop {
		display: grid;
		gap: 0.5rem;
		padding: 1rem;
		border: 1px dashed var(--rule);
		background: var(--field);
		margin-bottom: 0.75rem;
	}
	.drop.dragging {
		border-style: solid;
		background: var(--hilite);
	}
	.drop input {
		font: inherit;
		font-family: var(--font-mono);
		font-size: 0.875rem;
		color: var(--ink);
		max-width: 100%;
	}
	.status {
		margin: 0;
	}
	.readout {
		margin: 1rem 0 1.25rem;
	}
	.readout dd {
		font-size: 0.875rem;
	}
	.hit {
		background: var(--hilite);
	}
	.weak {
		color: var(--signal);
		margin-left: 0.15rem;
	}
	.tag {
		margin-left: 0.5rem;
		padding: 0 0.3rem;
		background: var(--signal);
		color: var(--signal-ink);
	}
	.verdict {
		font-family: var(--font-mono);
		font-size: 0.875rem;
		font-weight: 700;
		border-left: 3px solid var(--rule);
		background: var(--hilite);
		padding: 0.35rem 0.6rem;
		margin: 1rem 0 0;
	}
	.note + .note {
		margin-top: 0.5rem;
	}
</style>
