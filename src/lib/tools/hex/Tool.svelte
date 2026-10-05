<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		DUMP_LIMIT,
		bytesToText,
		formatBinary,
		formatDecimal,
		formatHex,
		hexStyles,
		hexdump,
		looksLikeHexBytes,
		parseInput,
		swapEndian,
		type HexStyle,
		type InputKind,
		type Width
	} from './logic';

	const kinds: { id: InputKind; label: string }[] = [
		{ id: 'text', label: 'Text' },
		{ id: 'hex', label: 'Hex' },
		{ id: 'binary', label: 'Binary' },
		{ id: 'decimal', label: 'Decimal' }
	];

	let input = $state('');
	let kind = $state<InputKind>('text');
	let style = $state<HexStyle>('spaced');
	let upper = $state(false);
	let width = $state<Width | 0>(0);
	let file = $state<{ name: string; bytes: Uint8Array } | null>(null);
	let fileError = $state('');
	let fileSize = $state(0);
	let dragging = $state(false);
	let ready = false;

	const parsed = $derived.by(() => {
		try {
			return { bytes: parseInput(input, kind), error: '' };
		} catch (e) {
			return { bytes: new Uint8Array(), error: (e as Error).message };
		}
	});
	const bytes = $derived(parsed.bytes);
	const decoded = $derived(bytesToText(bytes));
	const hex = $derived(formatHex(bytes, style, upper));
	const swapped = $derived.by(() => {
		if (!width) return { value: '', error: '' };
		try {
			return { value: formatHex(swapEndian(bytes, width), style, upper), error: '' };
		} catch (e) {
			return { value: '', error: (e as Error).message };
		}
	});
	const dumpBytes = $derived(file ? file.bytes : bytes);
	const dump = $derived(hexdump(dumpBytes));

	async function load(f: File) {
		fileError = '';
		try {
			// Only the shown part is read, so big files stay cheap.
			const buf = await f.slice(0, DUMP_LIMIT).arrayBuffer();
			file = { name: f.name, bytes: new Uint8Array(buf) };
			fileSize = f.size;
		} catch (e) {
			fileError = (e as Error).message;
		}
	}

	function onPick(e: Event) {
		const f = (e.currentTarget as HTMLInputElement).files?.[0];
		if (f) load(f);
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		const f = e.dataTransfer?.files?.[0];
		if (f) load(f);
	}

	onMount(() => {
		const h = readHash();
		if (kinds.some((k) => k.id === h.k)) kind = h.k as InputKind;
		if (hexStyles.some((s) => s.id === h.s)) style = h.s as HexStyle;
		if (h.u === '1') upper = true;
		if (h.w === '2' || h.w === '4' || h.w === '8') width = Number(h.w) as Width;
		if (h.in) {
			input = h.in;
			if (!h.k && looksLikeHexBytes(h.in) > 0) kind = 'hex';
		}
		ready = true;
	});

	// Options only: the input can be anything, including keys, so it stays out of the link.
	$effect(() => {
		const state = {
			k: kind === 'text' ? undefined : kind,
			s: style === 'spaced' ? undefined : style,
			u: upper ? '1' : undefined,
			w: width ? String(width) : undefined
		};
		if (ready) writeHash(state);
	});

	const sizeText = (n: number) => `${n} byte${n === 1 ? '' : 's'}`;
</script>

<div class="row opts" role="group" aria-label="Input is">
	<span class="label">Input is</span>
	{#each kinds as k (k.id)}
		<button type="button" aria-pressed={kind === k.id} onclick={() => (kind = k.id)}
			>{k.label}</button
		>
	{/each}
</div>

<div class="field">
	<div class="row between">
		<label class="label" for="hex-in">Input ({kind === 'text' ? 'UTF-8 text' : kind})</label>
		<Copy value={input} />
	</div>
	<textarea id="hex-in" bind:value={input} spellcheck="false"></textarea>
</div>

{#if parsed.error}<p class="error" role="alert">{parsed.error}</p>{/if}

<div class="row opts" role="group" aria-label="Hex notation">
	<span class="label">Hex notation</span>
	{#each hexStyles as s (s.id)}
		<button type="button" class="case" aria-pressed={style === s.id} onclick={() => (style = s.id)}
			>{s.label}</button
		>
	{/each}
	<button type="button" aria-pressed={upper} onclick={() => (upper = !upper)}>Upper case</button>
</div>

<dl class="readout">
	<div>
		<dt>Bytes</dt>
		<dd>{sizeText(bytes.length)}</dd>
	</div>
	<div>
		<dt>Text (UTF-8)</dt>
		<dd>
			{#if decoded.utf8}{decoded.text}{:else}<span class="muted">Not valid UTF-8</span>{/if}
		</dd>
		<Copy value={decoded.utf8 ? decoded.text : ''} />
	</div>
	<div>
		<dt>Hex</dt>
		<dd>{hex}</dd>
		<Copy value={bytes.length ? hex : ''} />
	</div>
	<div>
		<dt>Binary</dt>
		<dd>{formatBinary(bytes)}</dd>
		<Copy value={formatBinary(bytes)} />
	</div>
	<div>
		<dt>Decimal</dt>
		<dd>{formatDecimal(bytes)}</dd>
		<Copy value={formatDecimal(bytes)} />
	</div>
</dl>

<div class="row opts swap" role="group" aria-label="Byte swap">
	<span class="label">Swap bytes in</span>
	<button type="button" aria-pressed={width === 0} onclick={() => (width = 0)}>Off</button>
	{#each [2, 4, 8] as const as w (w)}
		<button type="button" aria-pressed={width === w} onclick={() => (width = w)}
			>{w * 8}-bit words</button
		>
	{/each}
</div>
{#if width}
	{#if swapped.error}
		<p class="error" role="alert">{swapped.error}</p>
	{:else}
		<dl class="readout">
			<div>
				<dt>Hex, {width * 8}-bit swapped</dt>
				<dd>{swapped.value}</dd>
				<Copy value={bytes.length ? swapped.value : ''} />
			</div>
		</dl>
	{/if}
{/if}

<h2 class="label head">Hexdump</h2>
<label
	class="drop"
	class:dragging
	ondragover={(e) => {
		e.preventDefault();
		dragging = true;
	}}
	ondragleave={() => (dragging = false)}
	ondrop={onDrop}
>
	<span class="label">Dump a file instead</span>
	<span class="hint"
		>Drop a file here or choose one. It is read on this device, nothing is uploaded.</span
	>
	<input type="file" onchange={onPick} />
</label>
{#if fileError}<p class="error" role="alert">{fileError}</p>{/if}

<div class="row between dumphead">
	<span class="label">
		{#if file}
			{file.name}, {sizeText(fileSize)}{fileSize > DUMP_LIMIT ? ', first 64 KiB shown' : ''}
		{:else}
			Input bytes{bytes.length > DUMP_LIMIT ? ', first 64 KiB shown' : ''}
		{/if}
	</span>
	<span class="row">
		{#if file}<button type="button" onclick={() => (file = null)}>Back to input</button>{/if}
		<Copy value={dumpBytes.length ? dump : ''} />
	</span>
</div>
<!-- Focusable so keyboard users can scroll the dump. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="dump" role="region" aria-label="Hexdump" tabindex="0">
	<pre>{dump}</pre>
</div>

<p class="note">
	Hex input takes pairs with or without spaces, <code>0x</code> prefixes, C arrays and
	<code>\x</code> escapes. The dump is the <code>hexdump -C</code> layout: offset, 16 bytes, and the printable
	ASCII, with a dot for anything else. Only the first 64 KiB is shown.
</p>

<style>
	.between {
		justify-content: space-between;
	}
	.opts {
		margin: 1rem 0;
	}
	.case {
		text-transform: none;
	}
	.muted {
		color: var(--ink-2);
	}
	.swap {
		margin-top: 1.25rem;
	}
	.head {
		margin: 2rem 0 0.75rem;
		font-weight: 400;
	}
	.drop {
		display: grid;
		gap: 0.4rem;
		padding: 1rem;
		border: 2px dashed var(--rule-soft);
		background: var(--field);
		cursor: pointer;
		margin-bottom: 0.75rem;
	}
	.drop.dragging {
		border-color: var(--signal);
		background: var(--hilite);
	}
	.hint {
		color: var(--ink-2);
		font-size: 0.9375rem;
	}
	.drop input {
		font: inherit;
		font-size: 0.875rem;
		max-width: 100%;
	}
	.dumphead {
		margin-bottom: 0.4rem;
	}
	.dump {
		overflow: auto;
		max-height: 32rem;
		border: 1px solid var(--rule);
		background: var(--field);
		margin-bottom: 1.25rem;
	}
	.dump pre {
		margin: 0;
		padding: 0.75rem;
		font-size: 0.8125rem;
		line-height: 1.5;
		width: max-content;
	}
	code {
		overflow-wrap: anywhere;
	}
</style>
