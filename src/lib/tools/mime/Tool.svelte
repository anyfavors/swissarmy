<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		decodeCharset,
		decodeWords,
		domainToAscii,
		domainToUnicode,
		encodeWords,
		qpDecode,
		qpEncode,
		type Word,
		type WordCharset,
		type WordEncoding
	} from './logic';

	type Mode = 'qp' | 'words' | 'idn';
	const modes: { id: Mode; label: string }[] = [
		{ id: 'qp', label: 'Quoted-printable' },
		{ id: 'words', label: 'Header words' },
		{ id: 'idn', label: 'Punycode / IDN' }
	];
	const charsets = ['UTF-8', 'ISO-8859-1', 'windows-1252'];

	let mode = $state<Mode>('qp');
	let plain = $state('');
	let encoded = $state('');
	let error = $state('');
	let invalid = $state<string[]>([]);
	let words = $state<Word[]>([]);
	let qpCharset = $state('UTF-8');
	let wordEnc = $state<WordEncoding>('B');
	let wordCharset = $state<WordCharset>('UTF-8');
	let ready = false;

	const labels: Record<Mode, [string, string]> = {
		qp: ['Text', 'Quoted-printable'],
		words: ['Header text', 'Encoded-words'],
		idn: ['Unicode domain or address', 'ASCII (xn--)']
	};

	function fromPlain() {
		error = '';
		invalid = [];
		words = [];
		try {
			if (mode === 'qp') encoded = qpEncode(plain, '\n');
			else if (mode === 'words') encoded = encodeWords(plain, wordEnc, wordCharset, '\n ');
			else encoded = plain.trim() ? domainToAscii(plain) : '';
		} catch (e) {
			error = (e as Error).message;
		}
	}

	function fromEncoded() {
		error = '';
		invalid = [];
		words = [];
		try {
			if (mode === 'qp') {
				const r = qpDecode(encoded);
				plain = decodeCharset(r.bytes, qpCharset);
				invalid = r.invalid;
			} else if (mode === 'words') {
				const r = decodeWords(encoded);
				plain = r.text;
				words = r.words;
			} else plain = encoded.trim() ? domainToUnicode(encoded) : '';
		} catch (e) {
			error = (e as Error).message;
		}
	}

	function setMode(m: Mode) {
		mode = m;
		plain = '';
		encoded = '';
		error = '';
		invalid = [];
		words = [];
	}

	onMount(() => {
		const h = readHash();
		if (modes.some((m) => m.id === h.m)) mode = h.m as Mode;
		if (charsets.includes(h.cs)) qpCharset = h.cs;
		if (h.e === 'Q') wordEnc = 'Q';
		if (h.wc === 'ISO-8859-1') wordCharset = 'ISO-8859-1';
		if (h.in) {
			if (!h.m) {
				if (/=\?[^?\s]+\?[BbQq]\?/.test(h.in)) mode = 'words';
				else if (/(^|\.)xn--/i.test(h.in)) mode = 'idn';
			}
			encoded = h.in;
			fromEncoded();
		}
		ready = true;
	});

	// Options only. Headers and addresses can be personal, so they stay out of the link.
	$effect(() => {
		const state = {
			m: mode === 'qp' ? undefined : mode,
			cs: qpCharset === 'UTF-8' ? undefined : qpCharset,
			e: wordEnc === 'B' ? undefined : wordEnc,
			wc: wordCharset === 'UTF-8' ? undefined : wordCharset
		};
		if (ready) writeHash(state);
	});
</script>

<div class="row opts" role="group" aria-label="Encoding">
	{#each modes as m (m.id)}
		<button type="button" aria-pressed={mode === m.id} onclick={() => setMode(m.id)}
			>{m.label}</button
		>
	{/each}
</div>

{#if mode === 'qp'}
	<div class="row opts" role="group" aria-label="Charset of the decoded bytes">
		<span class="label">Decode as</span>
		{#each charsets as c (c)}
			<button
				type="button"
				class="case"
				aria-pressed={qpCharset === c}
				onclick={() => ((qpCharset = c), fromEncoded())}>{c}</button
			>
		{/each}
	</div>
{:else if mode === 'words'}
	<div class="row opts" role="group" aria-label="Encoded-word options">
		<span class="label">Encode as</span>
		<button
			type="button"
			aria-pressed={wordEnc === 'B'}
			onclick={() => ((wordEnc = 'B'), fromPlain())}>B (Base64)</button
		>
		<button
			type="button"
			aria-pressed={wordEnc === 'Q'}
			onclick={() => ((wordEnc = 'Q'), fromPlain())}>Q</button
		>
		{#each ['UTF-8', 'ISO-8859-1'] as const as c (c)}
			<button
				type="button"
				class="case"
				aria-pressed={wordCharset === c}
				onclick={() => ((wordCharset = c), fromPlain())}>{c}</button
			>
		{/each}
	</div>
{/if}

<div class="grid">
	<div class="field">
		<div class="row between">
			<label class="label" for="mime-plain">{labels[mode][0]}</label>
			<Copy value={plain} />
		</div>
		<textarea
			id="mime-plain"
			class:short={mode === 'idn'}
			bind:value={plain}
			oninput={fromPlain}
			spellcheck="false"></textarea>
	</div>
	<div class="field">
		<div class="row between">
			<label class="label" for="mime-enc">{labels[mode][1]}</label>
			<Copy value={encoded} />
		</div>
		<textarea
			id="mime-enc"
			class:short={mode === 'idn'}
			bind:value={encoded}
			oninput={fromEncoded}
			spellcheck="false"></textarea>
	</div>
</div>

{#if error}<p class="error" role="alert">{error}</p>{/if}
{#if invalid.length}
	<p class="note warn" role="status">
		Not a valid escape, kept as written: <code>{invalid.join(' ')}</code>
	</p>
{/if}

{#if words.length}
	<dl class="readout">
		{#each words as w, i (i)}
			<div>
				<dt>Word {i + 1}, {w.charset} {w.encoding}</dt>
				<dd>{w.text}</dd>
			</div>
		{/each}
	</dl>
{/if}

{#if mode === 'qp'}
	<p class="note">
		Encoding is UTF-8. Lines are kept under 76 characters with soft breaks, a trailing
		<code>=</code>, and trailing spaces become <code>=20</code>. Line breaks show as LF here; in a
		message they are CRLF.
	</p>
{:else if mode === 'words'}
	<p class="note">
		RFC 2047 encoded-words carry non-ASCII text in headers such as Subject and From. Each word stays
		within 75 characters and never splits a character. When decoding, space between two
		encoded-words is dropped, and words split in the middle of a UTF-8 character are joined.
	</p>
{:else}
	<p class="note">
		Punycode (RFC 3492) per label, with <code>xn--</code> in front. Text is NFC-normalised and lower-cased
		first, but the full IDNA2008 rules (disallowed characters, mixed scripts, bidi) are not checked, so
		a browser or registry may still refuse a name this produces. In an email address only the domain is
		converted.
	</p>
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
		margin-bottom: 1rem;
	}
	.case {
		text-transform: none;
	}
	textarea.short {
		min-height: 4.5rem;
	}
	.warn {
		border-left-color: var(--signal);
		margin-bottom: 1rem;
	}
	.readout {
		margin: 1rem 0 1.25rem;
	}
	.note {
		margin-top: 1rem;
	}
	code {
		overflow-wrap: anywhere;
	}
</style>
