<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		MORSE,
		MORSE_EXTRA,
		PROSIGNS,
		atbash,
		bruteForce,
		caesar,
		fromMorse,
		looksLikeMorse,
		rot13,
		rot47,
		toMorse,
		vigenere
	} from './logic';

	type Method = 'rot13' | 'rot47' | 'caesar' | 'atbash' | 'vigenere' | 'morse';
	const methods: { id: Method; label: string }[] = [
		{ id: 'rot13', label: 'ROT13' },
		{ id: 'rot47', label: 'ROT47' },
		{ id: 'caesar', label: 'Caesar' },
		{ id: 'atbash', label: 'Atbash' },
		{ id: 'vigenere', label: 'Vigenère' },
		{ id: 'morse', label: 'Morse' }
	];

	let input = $state('');
	let method = $state<Method>('rot13');
	let shift = $state(3);
	let key = $state('');
	let decrypt = $state(false);
	let ready = false;

	const result = $derived.by((): { text: string; error: string; unknown: string[] } => {
		try {
			switch (method) {
				case 'rot13':
					return { text: rot13(input), error: '', unknown: [] };
				case 'rot47':
					return { text: rot47(input), error: '', unknown: [] };
				case 'atbash':
					return { text: atbash(input), error: '', unknown: [] };
				case 'caesar':
					return { text: caesar(input, decrypt ? -shift : shift), error: '', unknown: [] };
				case 'vigenere':
					if (!key) return { text: '', error: input ? 'Enter a key' : '', unknown: [] };
					return { text: vigenere(input, key, decrypt), error: '', unknown: [] };
				case 'morse': {
					const r = decrypt ? fromMorse(input) : toMorse(input);
					return { ...r, error: '' };
				}
			}
		} catch (e) {
			return { text: '', error: (e as Error).message, unknown: [] };
		}
	});

	const brute = $derived(method === 'caesar' && input ? bruteForce(input) : []);
	const symmetric = $derived(method === 'rot13' || method === 'rot47' || method === 'atbash');
	const decodeLabel = $derived(
		method === 'morse' ? ['Text to Morse', 'Morse to text'] : ['Encrypt', 'Decrypt']
	);

	function setShift(e: Event) {
		const n = Number((e.currentTarget as HTMLInputElement).value);
		if (Number.isInteger(n)) shift = ((n % 26) + 26) % 26;
	}

	onMount(() => {
		const h = readHash();
		if (methods.some((m) => m.id === h.m)) method = h.m as Method;
		if (h.s && /^\d+$/.test(h.s)) shift = Number(h.s) % 26;
		if (h.d === '1') decrypt = true;
		if (h.in) {
			input = h.in;
			if (!h.m && looksLikeMorse(h.in) > 0) {
				method = 'morse';
				decrypt = true;
			}
		}
		ready = true;
	});

	// Options only; the key and the text stay out of the link.
	$effect(() => {
		const state = {
			m: method === 'rot13' ? undefined : method,
			s: method === 'caesar' && shift !== 3 ? String(shift) : undefined,
			d: decrypt && !symmetric ? '1' : undefined
		};
		if (ready) writeHash(state);
	});
</script>

<div class="row opts" role="group" aria-label="Method">
	{#each methods as m (m.id)}
		<button type="button" aria-pressed={method === m.id} onclick={() => (method = m.id)}
			>{m.label}</button
		>
	{/each}
</div>

{#if !symmetric}
	<div class="row opts" role="group" aria-label="Direction">
		<button type="button" aria-pressed={!decrypt} onclick={() => (decrypt = false)}
			>{decodeLabel[0]}</button
		>
		<button type="button" aria-pressed={decrypt} onclick={() => (decrypt = true)}
			>{decodeLabel[1]}</button
		>
	</div>
{/if}

{#if method === 'caesar'}
	<div class="field small">
		<label class="label" for="ci-shift">Shift (0 to 25)</label>
		<input id="ci-shift" type="number" min="0" max="25" value={shift} oninput={setShift} />
	</div>
{:else if method === 'vigenere'}
	<div class="field small">
		<label class="label" for="ci-key">Key (letters)</label>
		<input id="ci-key" type="text" bind:value={key} autocomplete="off" spellcheck="false" />
	</div>
{/if}

<div class="grid">
	<div class="field">
		<div class="row between">
			<label class="label" for="ci-in">Input</label>
			<Copy value={input} />
		</div>
		<textarea id="ci-in" bind:value={input} spellcheck="false"></textarea>
	</div>
	<div class="field">
		<div class="row between">
			<span class="label" id="ci-out-label">Output</span>
			<Copy value={result.text} />
		</div>
		<p class="out" aria-labelledby="ci-out-label" aria-live="polite">{result.text}</p>
	</div>
</div>

{#if result.error}<p class="error" role="alert">{result.error}</p>{/if}
{#if result.unknown.length}
	<p class="note warn" role="status">
		{decrypt ? 'Unknown codes, shown as #' : 'No Morse code for, skipped'}:
		<code>{result.unknown.join(' ')}</code>
	</p>
{/if}

{#if brute.length}
	<h2 class="label head">All 25 shifts</h2>
	<dl class="readout">
		{#each brute as b (b.shift)}
			<div>
				<dt>Shift {b.shift} (back {26 - b.shift})</dt>
				<dd>{b.text}</dd>
				<Copy value={b.text} />
			</div>
		{/each}
	</dl>
{/if}

{#if method === 'morse'}
	<p class="note">
		Letters are separated by a space, words by <code>/</code>. Decoding also takes a line break, |
		or three spaces between words. Write a prosign as <code>&lt;SK&gt;</code> to send it as one run. Letters,
		digits and punctuation follow ITU-R M.1677-1; ! &amp; ; _ $ are common extensions, not ITU.
	</p>
	<h2 class="label head">Prosigns</h2>
	<dl class="readout">
		{#each PROSIGNS as p (p.sign)}
			<div>
				<dt>&lt;{p.sign}&gt;</dt>
				<dd>{p.code} <span class="muted">{p.meaning}</span></dd>
			</div>
		{/each}
	</dl>
	<h2 class="label head">Code table</h2>
	<div class="table">
		{#each Object.entries({ ...MORSE, ...MORSE_EXTRA }) as [ch, code] (ch)}
			<span class="cell"><b>{ch}</b> {code}</span>
		{/each}
	</div>
{/if}

<p class="note">
	These are puzzles and encodings, not encryption. Each falls to a few seconds of trying, or to
	letter frequencies. Use them for games, CTFs and hiding spoilers, never to protect data.
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
	.small {
		max-width: 16rem;
		margin-bottom: 1rem;
	}
	input[type='number'] {
		width: 100%;
		font: inherit;
		font-family: var(--font-mono);
		color: var(--ink);
		background: var(--field);
		border: 1px solid var(--rule);
		border-radius: 0;
		padding: 0.65rem 0.75rem;
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
	.head {
		margin: 1.5rem 0 0.75rem;
		font-weight: 400;
	}
	.readout {
		margin-bottom: 1.25rem;
	}
	.muted {
		color: var(--ink-2);
		font-family: var(--font-body);
		font-size: 0.875rem;
		margin-left: 0.5rem;
	}
	.table {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr));
		border-top: 2px solid var(--rule);
		margin-bottom: 1.25rem;
	}
	.cell {
		font-family: var(--font-mono);
		padding: 0.35rem 0;
		border-bottom: 1px solid var(--rule-soft);
	}
	.cell b {
		display: inline-block;
		min-width: 1.5rem;
	}
	code {
		overflow-wrap: anywhere;
	}
</style>
