<script lang="ts">
	import { onMount } from 'svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import { READ_WPM, SPEAK_WPM, formatMinutes, smsInfo, stats, topWords } from './logic';

	let input = $state('');
	let lang = $state<'en' | 'da'>('en');
	let stop = $state(true);
	let ready = false;

	const s = $derived(stats(input, lang));
	const top = $derived(topWords(input, 12, { locale: lang, stop: stop ? ['en', 'da'] : [] }));
	const sms = $derived(smsInfo(input));
	const fmt = (n: number) => n.toLocaleString('en-US');

	onMount(() => {
		const h = readHash();
		input = h.in ?? h.text ?? '';
		if (h.lang === 'da') lang = 'da';
		if (h.stop === '0') stop = false;
		ready = true;
	});

	$effect(() => {
		const state = {
			in: input,
			lang: lang === 'en' ? undefined : lang,
			stop: stop ? undefined : '0'
		};
		if (ready) writeHash(state);
	});
</script>

<div class="field">
	<label class="label" for="ct-in">Text</label>
	<textarea id="ct-in" bind:value={input} spellcheck="false"></textarea>
</div>

<div class="row opts" role="group" aria-label="Language">
	<span class="label">Language</span>
	<button type="button" aria-pressed={lang === 'en'} onclick={() => (lang = 'en')}>English</button>
	<button type="button" aria-pressed={lang === 'da'} onclick={() => (lang = 'da')}>Danish</button>
</div>

<div class="grid">
	<dl class="readout">
		<div>
			<dt>Characters</dt>
			<dd>{fmt(s.codePoints)}</dd>
		</div>
		<div>
			<dt>Without spaces</dt>
			<dd>{fmt(s.codePointsNoSpace)}</dd>
		</div>
		<div>
			<dt>Graphemes</dt>
			<dd>{fmt(s.graphemes)}</dd>
		</div>
		<div>
			<dt>Words</dt>
			<dd>{fmt(s.words)}</dd>
		</div>
		<div>
			<dt>Sentences</dt>
			<dd>{fmt(s.sentences)}</dd>
		</div>
		<div>
			<dt>Paragraphs</dt>
			<dd>{fmt(s.paragraphs)}</dd>
		</div>
		<div>
			<dt>Lines</dt>
			<dd>{fmt(s.lines)}</dd>
		</div>
	</dl>
	<dl class="readout">
		<div>
			<dt>UTF-8</dt>
			<dd>{fmt(s.utf8Bytes)} bytes</dd>
		</div>
		<div>
			<dt>UTF-16</dt>
			<dd>{fmt(s.utf16Units)} units, {fmt(s.utf16Units * 2)} bytes</dd>
		</div>
		<div>
			<dt>Reading time</dt>
			<dd>{formatMinutes(s.readingMin)}</dd>
		</div>
		<div>
			<dt>Speaking time</dt>
			<dd>{formatMinutes(s.speakingMin)}</dd>
		</div>
		<div>
			<dt>Average word</dt>
			<dd>{s.avgWordLength.toFixed(1)} characters</dd>
		</div>
		<div>
			<dt>Longest word</dt>
			<dd>{s.longest || '-'}</dd>
		</div>
	</dl>
</div>

<h2 class="label sub">SMS</h2>
<dl class="readout">
	<div>
		<dt>Encoding</dt>
		<dd>{sms.encoding}</dd>
	</div>
	<div>
		<dt>Length</dt>
		<dd>{fmt(sms.units)} {sms.encoding === 'GSM-7' ? 'septets' : 'UTF-16 units'}</dd>
	</div>
	<div>
		<dt>Segments</dt>
		<dd>
			{sms.segments}
			{#if sms.segments}, {sms.remaining} left in the last ({sms.perSegment} per segment){/if}
		</dd>
	</div>
	{#if sms.nonGsm.length}
		<div>
			<dt>Forces UCS-2</dt>
			<dd class="chars">{sms.nonGsm.join(' ')}</dd>
		</div>
	{/if}
</dl>

<div class="row between sub">
	<h2 class="label">Most frequent words</h2>
	<button type="button" aria-pressed={stop} onclick={() => (stop = !stop)}>Skip stopwords</button>
</div>
{#if top.length}
	<ol class="top">
		{#each top as t (t.word)}
			<li><span class="w">{t.word}</span><span class="c">{t.count}</span></li>
		{/each}
	</ol>
{:else}
	<p class="note">No words yet.</p>
{/if}

<p class="note">
	Characters are Unicode code points. Graphemes are what a reader sees as one character, so 👍🏽 is
	one grapheme but two code points and four UTF-16 units. Words and sentences use the Unicode
	segmentation rules built into the browser. Times assume {READ_WPM} words per minute for silent reading
	and {SPEAK_WPM} for speaking, common rules of thumb.
</p>
<p class="note">
	SMS: one message holds 160 GSM-7 characters or 70 UCS-2 units. Longer texts are split into parts
	of 153 or 67, as each part carries a header. A single character outside the GSM alphabet, such as
	ç or an emoji, switches the whole message to UCS-2. € [ ] {'{'}
	{'}'} ~ | ^ \ count twice in GSM-7. Stopword lists are short, hand-picked English and Danish function
	words.
</p>

<style>
	.opts {
		margin: 1rem 0 1.25rem;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
		gap: 0 1.5rem;
		margin-bottom: 1.5rem;
	}
	.readout {
		margin-bottom: 1.5rem;
	}
	.grid .readout {
		margin-bottom: 0;
	}
	.sub {
		margin: 0 0 0.5rem;
	}
	.between {
		justify-content: space-between;
	}
	.chars {
		letter-spacing: 0.1em;
	}
	.top {
		margin: 0 0 1.5rem;
		padding: 0;
		list-style: none;
		border-top: 2px solid var(--rule);
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
		column-gap: 1.5rem;
	}
	.top li {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.35rem 0;
		border-bottom: 1px solid var(--rule-soft);
		font-family: var(--font-mono);
	}
	.w {
		overflow-wrap: anywhere;
	}
	.c {
		color: var(--ink-2);
	}
	.note {
		margin: 0 0 0.75rem;
	}
</style>
