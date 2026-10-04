<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		averageSeconds,
		charSpace,
		charsFor,
		generateChars,
		generatePhrase,
		humanDuration,
		log2Big,
		OFFLINE_RATE,
		phraseBits,
		ONLINE_RATE,
		strengthLabel,
		type SetName
	} from './logic';

	type Mode = 'chars' | 'phrase';
	const COUNT = 5;

	const setLabels: Record<SetName, string> = {
		lower: 'a-z',
		upper: 'A-Z',
		digits: '0-9',
		symbols: 'Symbols'
	};
	const allSets: SetName[] = ['lower', 'upper', 'digits', 'symbols'];
	const separators: { value: string; label: string; key: string }[] = [
		{ value: '-', label: 'Hyphen -', key: 'hyphen' },
		{ value: ' ', label: 'Space', key: 'space' },
		{ value: '.', label: 'Period .', key: 'period' },
		{ value: '_', label: 'Underscore _', key: 'underscore' }
	];

	let mode = $state<Mode>('chars');
	let length = $state(20);
	let sets = $state<SetName[]>(['lower', 'upper', 'digits', 'symbols']);
	let excludeAmbiguous = $state(false);
	let requireEach = $state(true);
	let wordCount = $state(6);
	let sepKey = $state('hyphen');
	let capitalise = $state(false);
	let digit = $state(false);

	let wordlist = $state<readonly string[] | null>(null);
	let listError = $state('');
	let nonce = $state(0);
	let candidates = $state<string[]>([]);
	let ready = $state(false);

	const separator = $derived(separators.find((s) => s.key === sepKey)?.value ?? '-');
	const charOpts = $derived({
		length,
		sets: allSets.filter((s) => sets.includes(s)),
		excludeAmbiguous,
		requireEach
	});
	const phraseOpts = $derived({ words: wordCount, separator, capitalise, digit });

	const stats = $derived.by(() => {
		try {
			if (mode === 'chars') {
				const alphabet = charOpts.sets.reduce(
					(a, s) => a + charsFor(s, excludeAmbiguous).length,
					0
				);
				return {
					bits: log2Big(charSpace(charOpts)),
					space: requireEach
						? `${alphabet}^${length} minus strings missing a set`
						: `${alphabet}^${length}`
				};
			}
			const n = wordlist?.length ?? 7776;
			return {
				bits: phraseBits(n, phraseOpts),
				space: `${n}^${wordCount}${digit ? ' x 10' : ''}`
			};
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	async function loadWords() {
		if (wordlist) return;
		try {
			wordlist = (await import('./eff-large')).words;
		} catch (e) {
			listError = `Could not load the wordlist: ${(e as Error).message}`;
		}
	}

	$effect(() => {
		if (mode === 'phrase') loadWords();
	});

	// Regenerate when an option changes or on Generate. Nothing is stored.
	$effect(() => {
		void nonce;
		if (!ready) return;
		try {
			if (mode === 'chars') {
				const o = charOpts;
				candidates = Array.from({ length: COUNT }, () => generateChars(o));
			} else if (wordlist) {
				const list = wordlist;
				const o = phraseOpts;
				candidates = Array.from({ length: COUNT }, () => generatePhrase(list, o));
			} else {
				candidates = [];
			}
		} catch {
			candidates = [];
		}
	});

	function toggleSet(s: SetName) {
		sets = sets.includes(s) ? sets.filter((x) => x !== s) : [...sets, s];
	}

	const clamp = (v: string | undefined, lo: number, hi: number, d: number) => {
		const n = Number(v);
		return Number.isInteger(n) && n >= lo && n <= hi ? n : d;
	};

	onMount(() => {
		const h = readHash();
		if (h.mode === 'phrase') mode = 'phrase';
		length = clamp(h.len, 8, 128, length);
		if (h.sets) {
			const s = h.sets.split(',').filter((x): x is SetName => allSets.includes(x as SetName));
			if (s.length) sets = s;
		}
		if (h.amb === '1') excludeAmbiguous = true;
		if (h.req === '0') requireEach = false;
		wordCount = clamp(h.words, 4, 12, wordCount);
		if (separators.some((s) => s.key === h.sep)) sepKey = h.sep;
		if (h.cap === '1') capitalise = true;
		if (h.digit === '1') digit = true;
		ready = true;
	});

	// Only the options go into the link. Generated passwords never do.
	$effect(() => {
		const state =
			mode === 'chars'
				? {
						len: String(length),
						sets: sets.join(','),
						amb: excludeAmbiguous ? '1' : undefined,
						req: requireEach ? undefined : '0'
					}
				: {
						mode: 'phrase',
						words: String(wordCount),
						sep: sepKey,
						cap: capitalise ? '1' : undefined,
						digit: digit ? '1' : undefined
					};
		if (ready) writeHash(state);
	});
</script>

<div class="row opts" role="group" aria-label="Kind">
	<span class="label">Kind</span>
	<button type="button" aria-pressed={mode === 'chars'} onclick={() => (mode = 'chars')}
		>Random characters</button
	>
	<button type="button" aria-pressed={mode === 'phrase'} onclick={() => (mode = 'phrase')}
		>Passphrase</button
	>
</div>

{#if mode === 'chars'}
	<div class="field">
		<label class="label" for="pw-len">Length: {length} characters</label>
		<input id="pw-len" type="range" min="8" max="128" step="1" bind:value={length} />
	</div>
	<div class="row opts" role="group" aria-label="Character sets">
		<span class="label">Sets</span>
		{#each allSets as s (s)}
			<button
				type="button"
				class="case"
				aria-pressed={sets.includes(s)}
				onclick={() => toggleSet(s)}>{setLabels[s]}</button
			>
		{/each}
	</div>
	<div class="row opts" role="group" aria-label="Rules">
		<span class="label">Rules</span>
		<button
			type="button"
			aria-pressed={excludeAmbiguous}
			onclick={() => (excludeAmbiguous = !excludeAmbiguous)}>No 0 O 1 l I |</button
		>
		<button type="button" aria-pressed={requireEach} onclick={() => (requireEach = !requireEach)}
			>One of each set</button
		>
	</div>
{:else}
	<div class="field">
		<label class="label" for="pw-words">Words: {wordCount}</label>
		<input id="pw-words" type="range" min="4" max="12" step="1" bind:value={wordCount} />
	</div>
	<div class="row opts" role="group" aria-label="Separator">
		<span class="label">Separator</span>
		{#each separators as s (s.key)}
			<button
				type="button"
				class="case"
				aria-pressed={sepKey === s.key}
				onclick={() => (sepKey = s.key)}>{s.label}</button
			>
		{/each}
	</div>
	<div class="row opts" role="group" aria-label="Options">
		<span class="label">Options</span>
		<button type="button" aria-pressed={capitalise} onclick={() => (capitalise = !capitalise)}
			>Capitalise</button
		>
		<button type="button" aria-pressed={digit} onclick={() => (digit = !digit)}>Append digit</button
		>
	</div>
	{#if listError}<p class="error" role="alert">{listError}</p>{/if}
{/if}

{#if stats.error}
	<p class="error" role="alert">{stats.error}</p>
{:else}
	<div class="row between head">
		<h2 class="label">Candidates</h2>
		<button type="button" onclick={() => nonce++}>Generate new</button>
	</div>
	<ol class="candidates" aria-live="polite">
		{#each candidates as c, i (i + c)}
			<li>
				<code>{c}</code>
				<Copy value={c} />
			</li>
		{:else}
			<li class="loading"><span class="mono">Loading wordlist</span></li>
		{/each}
	</ol>

	{#if stats.bits !== undefined}
		{@const bits = stats.bits}
		<dl class="readout">
			<div>
				<dt>Entropy</dt>
				<dd>{bits.toFixed(1)} bits</dd>
			</div>
			<div>
				<dt>Generation space</dt>
				<dd>{stats.space}</dd>
			</div>
			<div>
				<dt>Offline, 10^10 guesses/s</dt>
				<dd>{humanDuration(averageSeconds(bits, OFFLINE_RATE))} on average</dd>
			</div>
			<div>
				<dt>Online, 100 guesses/hour</dt>
				<dd>{humanDuration(averageSeconds(bits, ONLINE_RATE))} on average</dd>
			</div>
			<div>
				<dt>Rough rating</dt>
				<dd>{strengthLabel(bits)}</dd>
			</div>
		</dl>
	{/if}
{/if}

<p class="note">
	Entropy is counted from the generator, not guessed from the output: the attacker is assumed to
	know the method, the character sets or wordlist and every option, and only the random choices are
	secret. Times are the average, half the space. 10^10 guesses per second is a GPU rig against a
	fast unsalted hash such as MD5 or NTLM. A slow hash (bcrypt, scrypt, Argon2) makes offline attacks
	many orders of magnitude slower. 100 per hour is an online login with throttling.
</p>
<p class="note">
	Randomness comes from crypto.getRandomValues with rejection sampling, so every character or word
	is equally likely. Nothing is stored or sent; only the options go into the link.
</p>
{#if mode === 'phrase'}
	<p class="note">
		Wordlist: EFF Large Wordlist (7776 words), by the Electronic Frontier Foundation, CC BY 3.0 US.
		Capitalising and the separator are fixed rules and add no entropy; the digit adds 3.3 bits.
	</p>
{/if}

<style>
	.opts {
		margin: 1rem 0;
	}
	.case {
		text-transform: none;
	}
	.between {
		justify-content: space-between;
	}
	.head {
		margin: 1.5rem 0 0.5rem;
	}
	input[type='range'] {
		width: 100%;
		min-height: 2.75rem;
		accent-color: var(--signal);
	}
	.candidates {
		list-style: none;
		margin: 0;
		padding: 0;
		border-top: 2px solid var(--rule);
	}
	.candidates li {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.5rem 1rem;
		align-items: center;
		padding: 0.45rem 0;
		border-bottom: 1px solid var(--rule-soft);
	}
	.candidates code {
		font-size: 1.0625rem;
		overflow-wrap: anywhere;
		white-space: pre-wrap;
	}
	.loading {
		color: var(--ink-2);
	}
	.readout {
		margin: 1.5rem 0;
	}
	.note + .note {
		margin-top: 0.5rem;
	}
</style>
