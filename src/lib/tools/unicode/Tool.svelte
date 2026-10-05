<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		categories,
		clean,
		forms,
		inspect,
		normalisationDiff,
		shortLabel,
		summarise,
		type CodePoint,
		type Form
	} from './logic';

	const MAX_ROWS = 1000;
	const MAX_VIEW = 5000;

	let input = $state('');
	let form = $state<Form>('NFC');
	let rmInvisible = $state(true);
	let fixLookalikes = $state(true);
	let fixSpaces = $state(true);
	let ready = false;

	const cps = $derived(inspect(input, MAX_VIEW));
	const all = $derived(cps.length < MAX_VIEW ? cps : inspect(input));
	const sum = $derived(summarise(input, all));
	const cleaned = $derived(
		clean(input, { invisible: rmInvisible, confusables: fixLookalikes, spaces: fixSpaces })
	);
	const norm = $derived(normalisationDiff(input, form));
	const normCounts = $derived(
		forms.map((f) => ({
			f,
			n: input === input.normalize(f) ? 0 : normalisationDiff(input, f).changes.length
		}))
	);
	const catName = new Map(categories);

	function shown(c: CodePoint): { text: string; tag: boolean } {
		if (c.flag && c.flag !== 'confusable') return { text: shortLabel(c.cp), tag: true };
		if (c.cat === 'Mn' || c.cat === 'Me' || c.cat === 'Mc') return { text: '◌' + c.ch, tag: false };
		return { text: c.ch, tag: false };
	}

	// Built from code points: Svelte warns about bidi controls written in source, even escaped.
	const example = String.fromCodePoint(
		...[0x50, 0x61, 0x79, 0x20, 0x61, 0x74, 0x20, 0x70, 0x430, 0x79, 0x70, 0x61, 0x6c, 0x200b],
		...[0x20, 0x63, 0x61, 0x66, 0x65, 0x301, 0x20, 0x202e, 0x65, 0x76, 0x69, 0x6c, 0x202c]
	);

	onMount(() => {
		const h = readHash();
		input = h.in ?? h.text ?? example;
		if (forms.includes(h.nf as Form)) form = h.nf as Form;
		ready = true;
	});

	$effect(() => {
		const state = { in: input, nf: form === 'NFC' ? undefined : form };
		if (ready) writeHash(state);
	});
</script>

<div class="field">
	<label class="label" for="uc-in">Text</label>
	<textarea id="uc-in" bind:value={input} spellcheck="false"></textarea>
</div>

{#if sum.bidi}
	<p class="warn" role="alert">
		{sum.bidi} bidirectional control {sum.bidi === 1 ? 'character' : 'characters'}.
		{#if sum.unbalancedBidi}At least one is left open at the end of a line.{/if}
		These can make source code display in a different order than the compiler reads it (Trojan Source,
		CVE-2021-42574). Review the logical order below.
	</p>
{/if}
{#if sum.invisible || sum.controls}
	<p class="warn" role="status">
		{sum.invisible + sum.controls} invisible or control {sum.invisible + sum.controls === 1
			? 'character'
			: 'characters'}, marked below.
	</p>
{/if}
{#if sum.confusables}
	<p class="warn" role="status">
		{sum.confusables}
		{sum.confusables === 1 ? 'character looks' : 'characters look'} like Latin letters but {sum.confusables ===
		1
			? 'is'
			: 'are'} not.
		{#if sum.mixedWords.length}
			Mixed with Latin in: <span class="mono">{sum.mixedWords.slice(0, 8).join(', ')}</span>.
		{/if}
	</p>
{/if}

<dl class="readout">
	<div>
		<dt>Code points</dt>
		<dd>{sum.codePoints}</dd>
	</div>
	<div>
		<dt>Grapheme clusters</dt>
		<dd>{sum.graphemes}</dd>
	</div>
	<div>
		<dt>UTF-8</dt>
		<dd>{sum.utf8Bytes} bytes</dd>
	</div>
	<div>
		<dt>UTF-16</dt>
		<dd>{sum.utf16Units} units</dd>
	</div>
	{#if sum.spaces}<div>
			<dt>Unusual spaces</dt>
			<dd>{sum.spaces}</dd>
		</div>{/if}
</dl>

{#if input}
	<h2 class="label sub">Logical order, hidden characters shown</h2>
	<p class="view" dir="ltr">
		{#each cps as c (c.i)}{@const s = shown(c)}{#if c.ch === '\n'}<span class="tag nl">LF</span><br
				/>{:else if s.tag}<span class="tag {c.flag}" class:emoji={c.inEmoji} title={c.name ?? c.hex}
					>{s.text}</span
				>{:else if c.flag === 'confusable'}<mark title="{c.hex}, looks like {c.looksLike}"
					>{c.ch}</mark
				>{:else}{c.ch}{/if}{/each}{#if cps.length >= MAX_VIEW}<span class="tag">...</span>{/if}
	</p>
{/if}

<section>
	<div class="row between">
		<h2 class="label sub">Cleaned</h2>
		<Copy value={cleaned} />
	</div>
	<div class="row opts" role="group" aria-label="Cleaning options">
		<button type="button" aria-pressed={rmInvisible} onclick={() => (rmInvisible = !rmInvisible)}
			>Remove invisible and bidi</button
		>
		<button type="button" aria-pressed={fixSpaces} onclick={() => (fixSpaces = !fixSpaces)}
			>Plain spaces</button
		>
		<button
			type="button"
			aria-pressed={fixLookalikes}
			onclick={() => (fixLookalikes = !fixLookalikes)}>Look-alikes to Latin</button
		>
	</div>
	<label class="visually-hidden" for="uc-clean">Cleaned text</label>
	<textarea id="uc-clean" class="small" readonly value={cleaned} spellcheck="false"></textarea>
</section>

<section>
	<div class="row between">
		<h2 class="label sub">Normalisation</h2>
		<Copy value={norm.output} />
	</div>
	<div class="row opts" role="group" aria-label="Normalisation form">
		{#each normCounts as nc (nc.f)}
			<button type="button" aria-pressed={form === nc.f} onclick={() => (form = nc.f)}>
				{nc.f} <span class="n">{nc.n ? `${nc.n} changes` : 'no change'}</span>
			</button>
		{/each}
	</div>
	<label class="visually-hidden" for="uc-norm">{form} output</label>
	<textarea id="uc-norm" class="small" readonly value={norm.output} spellcheck="false"></textarea>
	{#if norm.changes.length}
		<div class="scroll">
			<table>
				<caption class="label">What {form} changes</caption>
				<thead
					><tr><th scope="col">From</th><th scope="col">To</th><th scope="col">Times</th></tr
					></thead
				>
				<tbody>
					{#each norm.changes.slice(0, 200) as ch (ch.from)}
						<tr>
							<td
								><span class="glyph">{ch.from}</span> <span class="mono dim">{ch.fromHex}</span></td
							>
							<td><span class="glyph">{ch.to}</span> <span class="mono dim">{ch.toHex}</span></td>
							<td class="mono">{ch.count}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else if input}
		<p class="note">Already in {form}.</p>
	{/if}
</section>

{#if cps.length}
	<div class="scroll">
		<table class="cps">
			<caption class="label"
				>Code points{all.length > MAX_ROWS ? `, first ${MAX_ROWS} of ${all.length}` : ''}</caption
			>
			<thead>
				<tr>
					<th scope="col">G</th>
					<th scope="col">Char</th>
					<th scope="col">Code point</th>
					<th scope="col">Name</th>
					<th scope="col">Cat</th>
					<th scope="col">UTF-8</th>
					<th scope="col">UTF-16</th>
				</tr>
			</thead>
			<tbody>
				{#each cps.slice(0, MAX_ROWS) as c (c.i)}
					{@const s = shown(c)}
					<tr class={c.flag && !c.inEmoji ? `hit ${c.flag}` : ''}>
						<td class="mono dim">{c.g}</td>
						<td class="glyph"
							>{#if s.tag}<span class="tag {c.flag}">{s.text}</span>{:else}{s.text}{/if}</td
						>
						<td class="mono">{c.hex}</td>
						<td class="name">
							{c.name ?? ''}
							{#if c.looksLike}<span class="why">looks like {c.looksLike}</span>{/if}
							{#if c.flag === 'bidi'}<span class="why">bidi control</span>{/if}
							{#if c.inEmoji}<span class="dim">part of emoji</span>{/if}
						</td>
						<td class="mono" title={catName.get(c.cat)}>{c.cat}</td>
						<td class="mono">{c.utf8}</td>
						<td class="mono">{c.utf16}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<p class="note">
	G is the grapheme cluster, what a reader sees as one character. Names cover ASCII, Latin-1, Latin
	Extended-A, basic Greek and Cyrillic, punctuation, spaces and invisible characters, and are
	computed for Hangul and CJK ideographs. Other names are left blank: the full name list is about 2
	MB. The category comes from the browser's own Unicode data.
</p>
<p class="note">
	Look-alikes use a hand-picked subset of Unicode's confusables.txt (UTS #39): Cyrillic, Greek and
	Armenian letters that pass for Latin ones. They only matter in text meant to be Latin, such as
	domains and code. ZWJ and variation selectors inside emoji are kept by the cleaner, as they belong
	there. ZWNJ is removed, which is wrong for Persian and some Indic text. NFKC also folds fullwidth
	and mathematical letters to ASCII.
</p>

<style>
	.field {
		margin-bottom: 1rem;
	}
	.warn {
		margin: 0 0 0.75rem;
		padding: 0.4rem 0.6rem;
		border-left: 4px solid var(--signal);
		background: var(--hilite);
		font-size: 0.9375rem;
		overflow-wrap: anywhere;
	}
	.readout {
		margin: 1rem 0 1.5rem;
	}
	.sub {
		margin: 0 0 0.4rem;
	}
	.between {
		justify-content: space-between;
	}
	section {
		margin: 1.5rem 0;
	}
	.opts {
		margin: 0.25rem 0 0.75rem;
	}
	.n {
		opacity: 0.75;
		text-transform: none;
	}
	textarea.small {
		min-height: 5rem;
	}
	.view {
		margin: 0;
		padding: 0.6rem 0.75rem;
		background: var(--field);
		border: 1px solid var(--rule-soft);
		font-family: var(--font-mono);
		line-height: 1.9;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		unicode-bidi: isolate;
	}
	.tag {
		display: inline-block;
		font-size: 0.6875rem;
		line-height: 1.3;
		padding: 0 0.25rem;
		margin: 0 0.1rem;
		border: 1px solid var(--rule-soft);
		color: var(--ink-2);
		vertical-align: middle;
	}
	.tag.bidi,
	.tag.invisible,
	.tag.control {
		border-color: var(--signal);
		color: var(--signal);
		font-weight: 700;
	}
	.tag.bidi {
		background: var(--signal);
		color: var(--signal-ink);
	}
	.tag.emoji {
		border-color: var(--rule-soft);
		color: var(--ink-2);
		font-weight: 400;
		background: transparent;
	}
	.tag.nl {
		border-style: dashed;
	}
	mark {
		background: var(--hilite);
		color: var(--ink);
		outline: 2px solid var(--signal);
		outline-offset: -1px;
	}
	.scroll {
		overflow-x: auto;
		margin: 1rem 0 1.5rem;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		border-top: 2px solid var(--rule);
		font-size: 0.875rem;
	}
	caption {
		text-align: left;
		padding-bottom: 0.4rem;
	}
	th,
	td {
		text-align: left;
		padding: 0.35rem 0.6rem 0.35rem 0;
		border-bottom: 1px solid var(--rule-soft);
		vertical-align: top;
	}
	th {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-2);
		font-weight: 400;
	}
	.cps td {
		white-space: nowrap;
	}
	.cps td.name {
		white-space: normal;
		min-width: 12rem;
	}
	.glyph {
		font-size: 1.125rem;
		unicode-bidi: isolate;
	}
	.mono {
		font-family: var(--font-mono);
	}
	.dim {
		color: var(--ink-2);
	}
	.why {
		display: inline-block;
		margin-left: 0.35rem;
		color: var(--signal);
		font-family: var(--font-mono);
		font-size: 0.75rem;
	}
	tr.hit td {
		background: var(--hilite);
	}
	.note {
		margin: 0 0 0.75rem;
	}
</style>
