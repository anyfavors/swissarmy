<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import { base64ToBytes, bytesToBase64 } from '../base64/logic';
	import {
		compress,
		decompress,
		formats,
		looksLikeGzipBase64,
		ratio,
		textBytes,
		utf8OrNull,
		type Format
	} from './logic';

	let dir = $state<'compress' | 'decompress'>('compress');
	let format = $state<Format | 'auto'>('gzip');
	let inAs = $state<'text' | 'base64'>('text');
	let outAs = $state<'base64' | 'text'>('base64');
	let input = $state('');
	let output = $state('');
	let outBytes = $state<Uint8Array | null>(null);
	let inSize = $state(0);
	let used = $state<Format | null>(null);
	let error = $state('');
	let binary = $state(false);
	let fileUrl = $state('');
	let ready = $state(false);
	let seq = 0;

	async function run(
		src: string,
		d: typeof dir,
		f: Format | 'auto',
		ia: typeof inAs,
		oa: typeof outAs
	) {
		const my = ++seq;
		error = '';
		binary = false;
		if (!src) {
			output = '';
			outBytes = null;
			inSize = 0;
			used = null;
			return;
		}
		try {
			const bytes = ia === 'base64' ? base64ToBytes(src) : textBytes(src);
			let out: Uint8Array;
			let fmt: Format;
			if (d === 'compress') {
				fmt = f === 'auto' ? 'gzip' : f;
				out = await compress(bytes, fmt);
			} else {
				const r = await decompress(bytes, f);
				out = r.bytes;
				fmt = r.format;
			}
			if (my !== seq) return;
			inSize = bytes.length;
			outBytes = out;
			used = fmt;
			const text = oa === 'text' ? utf8OrNull(out) : null;
			binary = oa === 'text' && text === null;
			output = text ?? bytesToBase64(out);
		} catch (e) {
			if (my !== seq) return;
			error = (e as Error).message;
			output = '';
			outBytes = null;
			used = null;
		}
	}

	$effect(() => {
		if (ready) void run(input, dir, format, inAs, outAs);
	});

	// A download link for the result, useful when it is binary.
	let lastUrl = '';
	$effect(() => {
		const b = outBytes;
		if (lastUrl) URL.revokeObjectURL(lastUrl);
		lastUrl = b
			? URL.createObjectURL(new Blob([b as BlobPart], { type: 'application/octet-stream' }))
			: '';
		fileUrl = lastUrl;
	});
	onDestroy(() => {
		if (lastUrl) URL.revokeObjectURL(lastUrl);
	});

	function setDir(d: typeof dir) {
		dir = d;
		if (d === 'compress') {
			if (format === 'auto') format = 'gzip';
			inAs = 'text';
			outAs = 'base64';
		} else {
			format = 'auto';
			inAs = 'base64';
			outAs = 'text';
		}
	}

	const ext: Record<Format, string> = { gzip: '.gz', deflate: '.zz', 'deflate-raw': '.deflate' };
	const fileName = $derived(dir === 'compress' && used ? `data${ext[used]}` : 'data.bin');
	const r = $derived(
		outBytes
			? dir === 'compress'
				? ratio(inSize, outBytes.length)
				: ratio(outBytes.length, inSize)
			: null
	);
	const fmtLabel = (f: Format) => formats.find((x) => x.id === f)?.label ?? f;

	onMount(() => {
		const h = readHash();
		if (h.d === 'de') setDir('decompress');
		if (formats.some((f) => f.id === h.f) || (h.f === 'auto' && dir === 'decompress'))
			format = h.f as Format | 'auto';
		if (h.i === 'text' || h.i === 'base64') inAs = h.i;
		if (h.o === 'text' || h.o === 'base64') outAs = h.o;
		if (h.in) {
			if (!h.d && looksLikeGzipBase64(h.in) > 0) setDir('decompress');
			input = h.in;
		}
		ready = true;
	});

	// Options only, the data stays out of the link.
	$effect(() => {
		const state = {
			d: dir === 'decompress' ? 'de' : undefined,
			f: format,
			i: inAs,
			o: outAs
		};
		if (ready) writeHash(state);
	});
</script>

<div class="row opts" role="group" aria-label="Direction">
	<button type="button" aria-pressed={dir === 'compress'} onclick={() => setDir('compress')}
		>Compress</button
	>
	<button type="button" aria-pressed={dir === 'decompress'} onclick={() => setDir('decompress')}
		>Decompress</button
	>
</div>

<div class="row opts" role="group" aria-label="Format">
	<span class="label">Format</span>
	{#if dir === 'decompress'}
		<button type="button" aria-pressed={format === 'auto'} onclick={() => (format = 'auto')}
			>Detect</button
		>
	{/if}
	{#each formats as f (f.id)}
		<button type="button" aria-pressed={format === f.id} onclick={() => (format = f.id)}
			>{f.label}</button
		>
	{/each}
</div>

<div class="grid">
	<div class="field">
		<div class="row between">
			<label class="label" for="cz-in">Input</label>
			<span class="row" role="group" aria-label="Input is">
				<button type="button" aria-pressed={inAs === 'text'} onclick={() => (inAs = 'text')}
					>Text</button
				>
				<button type="button" aria-pressed={inAs === 'base64'} onclick={() => (inAs = 'base64')}
					>Base64</button
				>
			</span>
		</div>
		<textarea id="cz-in" bind:value={input} spellcheck="false"></textarea>
	</div>
	<div class="field">
		<div class="row between">
			<span class="label" id="cz-out-label">Output</span>
			<span class="row" role="group" aria-label="Output as">
				<button type="button" aria-pressed={outAs === 'base64'} onclick={() => (outAs = 'base64')}
					>Base64</button
				>
				<button type="button" aria-pressed={outAs === 'text'} onclick={() => (outAs = 'text')}
					>Text</button
				>
				<Copy value={output} />
			</span>
		</div>
		<p class="out" aria-labelledby="cz-out-label">{output}</p>
	</div>
</div>

{#if error}<p class="error" role="alert">{error}</p>{/if}
{#if binary}
	<p class="note warn" role="status">The result is not UTF-8 text, so it is shown as Base64.</p>
{/if}

{#if outBytes && r}
	<dl class="readout">
		<div>
			<dt>Format</dt>
			<dd>
				{used ? fmtLabel(used) : ''}{dir === 'decompress' && format === 'auto' ? ', detected' : ''}
			</dd>
		</div>
		<div>
			<dt>{dir === 'compress' ? 'Original' : 'Compressed'}</dt>
			<dd>{inSize} bytes</dd>
		</div>
		<div>
			<dt>{dir === 'compress' ? 'Compressed' : 'Original'}</dt>
			<dd>{outBytes.length} bytes</dd>
		</div>
		<div>
			<dt>Ratio</dt>
			<dd>{r.ratio}, {r.saved}</dd>
		</div>
	</dl>
	{#if fileUrl}
		<p class="save"><a class="btn" href={fileUrl} download={fileName}>Save as file</a></p>
	{/if}
{/if}

<p class="note">
	Uses the browser's own CompressionStream, nothing is uploaded. Text is compressed as UTF-8. gzip
	adds a header and CRC-32, deflate (zlib) a 2-byte header and Adler-32, raw deflate nothing, so
	tiny inputs can grow. Detect reads the first bytes: <code>1f 8b</code> is gzip, a valid zlib
	header is deflate, anything else is tried as raw deflate. Base64 for gzip usually starts with
	<code>H4sI</code>.
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
		margin-bottom: 1rem;
	}
	.out {
		margin: 0;
		min-height: 9rem;
		padding: 0.65rem 0.75rem;
		border: 1px solid var(--rule);
		background: var(--field);
		font-family: var(--font-mono);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.warn {
		border-left-color: var(--signal);
		margin-bottom: 1rem;
	}
	.readout {
		margin: 1rem 0;
	}
	.save {
		margin: 0 0 1.25rem;
	}
	code {
		overflow-wrap: anywhere;
	}
</style>
