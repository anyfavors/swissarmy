<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		contrast,
		formatRatio,
		formats,
		nameOf,
		parseColor,
		toHex,
		verdicts,
		type Parsed,
		type Rgba
	} from './logic';

	let fgText = $state('#1e3a5f');
	let bgText = $state('#f3f0e8');
	let ready = false;

	function tryParse(s: string): { p?: Parsed; error?: string } {
		try {
			return { p: parseColor(s) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	}

	const fg = $derived(tryParse(fgText));
	const bg = $derived(tryParse(bgText));
	const ratio = $derived(fg.p && bg.p ? contrast(fg.p.color, bg.p.color) : null);
	const checks = $derived(ratio === null ? [] : verdicts(ratio));

	/** SVG paint: opaque hex plus separate opacity, understood by every SVG renderer. */
	const paint = (c: Rgba) => toHex({ ...c, a: 1 });

	function swap() {
		[fgText, bgText] = [bgText, fgText];
	}

	onMount(() => {
		const h = readHash();
		if (h.in) fgText = h.in;
		else if (h.fg) fgText = h.fg;
		if (h.bg) bgText = h.bg;
		ready = true;
	});

	$effect(() => {
		const state = { fg: fgText, bg: bgText };
		if (ready) writeHash(state);
	});
</script>

{#snippet colourCard(
	id: string,
	label: string,
	r: { p?: Parsed; error?: string },
	set: (v: string) => void,
	value: string
)}
	<section class="card" aria-labelledby="{id}-h">
		<div class="row between">
			<label class="label" id="{id}-h" for="{id}-in">{label}</label>
			<input
				class="picker"
				type="color"
				aria-label="{label} picker"
				value={r.p ? toHex({ ...r.p.color, a: 1 }) : '#000000'}
				oninput={(e) => set((e.currentTarget as HTMLInputElement).value)}
			/>
		</div>
		<input
			id="{id}-in"
			type="text"
			{value}
			oninput={(e) => set((e.currentTarget as HTMLInputElement).value)}
			spellcheck="false"
			autocomplete="off"
			autocapitalize="off"
		/>
		{#if r.error}
			<p class="error" role="alert">{r.error}</p>
		{:else if r.p}
			{@const c = r.p.color}
			<svg
				class="swatch"
				viewBox="0 0 100 24"
				preserveAspectRatio="none"
				role="img"
				aria-label="Swatch {toHex(c)}"
			>
				<rect class="check" x="0" y="0" width="100" height="24" />
				<rect x="0" y="0" width="100" height="24" fill={paint(c)} fill-opacity={c.a} />
			</svg>
			<dl class="readout">
				{#each formats(c) as f (f.id)}
					<div>
						<dt>{f.label}</dt>
						<dd>{f.value}</dd>
						<Copy value={f.value} />
					</div>
				{/each}
				{#if nameOf(c)}
					<div>
						<dt>CSS name</dt>
						<dd>{nameOf(c)}</dd>
						<Copy value={nameOf(c) ?? ''} />
					</div>
				{/if}
			</dl>
			{#if r.p.outOfGamut}
				<p class="note">Outside the sRGB gamut. The sRGB formats show the clipped colour.</p>
			{/if}
		{/if}
	</section>
{/snippet}

<div class="grid">
	{@render colourCard('fg', 'Text colour', fg, (v) => (fgText = v), fgText)}
	{@render colourCard('bg', 'Background', bg, (v) => (bgText = v), bgText)}
</div>

<div class="row swap">
	<button type="button" onclick={swap}>Swap colours</button>
</div>

{#if fg.p && bg.p && ratio !== null}
	{@const f = fg.p.color}
	{@const b = bg.p.color}
	<h2 class="label section-h">WCAG 2 contrast</h2>
	<div class="contrast">
		<svg
			class="sample"
			viewBox="0 0 320 120"
			role="img"
			aria-label="Sample text in the text colour on the background"
		>
			<rect x="0" y="0" width="320" height="120" fill="#ffffff" />
			<rect x="0" y="0" width="320" height="120" fill={paint(b)} fill-opacity={b.a} />
			<text x="16" y="34" font-size="16" fill={paint(f)} fill-opacity={f.a}>Normal text, 16 px</text
			>
			<text x="16" y="72" font-size="24" fill={paint(f)} fill-opacity={f.a}>Large text 24 px</text>
			<text x="16" y="104" font-size="19" font-weight="700" fill={paint(f)} fill-opacity={f.a}
				>Bold 19 px is large too</text
			>
		</svg>
		<div>
			<p class="ratio mono" aria-live="polite">{formatRatio(ratio)}</p>
			<dl class="readout">
				{#each checks as v (v.id)}
					<div class:fail={!v.pass}>
						<dt>{v.label}</dt>
						<dd>{v.pass ? 'Pass' : 'Fail'}, needs {v.need}:1</dd>
					</div>
				{/each}
			</dl>
		</div>
	</div>
	<p class="note">
		Large text is at least 24 px, or 18.66 px bold. A translucent text colour is blended over the
		background first; a translucent background is blended over white. The ratio is rounded down so a
		fail never shows as a pass. APCA (the WCAG 3 draft method) is not included.
	</p>
{/if}

<p class="note">
	CMYK here is the naive formula without an ICC profile. Real print values depend on the press
	profile, so ask the printer. OKLCH colours outside sRGB are clipped per channel, not gamut mapped.
</p>

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
		gap: 1.5rem;
	}
	.card {
		display: grid;
		gap: 0.5rem;
		align-content: start;
	}
	.between {
		justify-content: space-between;
	}
	.picker {
		width: 3rem;
		height: 2.75rem;
		padding: 0.15rem;
		border: 1px solid var(--rule);
		background: var(--field);
		cursor: pointer;
	}
	.swatch {
		display: block;
		width: 100%;
		height: 4rem;
		border: 1px solid var(--rule);
	}
	.check {
		fill: var(--field);
	}
	.swap {
		margin: 1.25rem 0;
	}
	.section-h {
		margin: 1.5rem 0 0.75rem;
		border-top: 2px solid var(--rule);
		padding-top: 0.5rem;
	}
	.contrast {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
		gap: 1.25rem;
		align-items: start;
		margin-bottom: 1rem;
	}
	.sample {
		display: block;
		width: 100%;
		max-width: 20rem;
		height: auto;
		border: 1px solid var(--rule);
		font-family: var(--font-body);
	}
	.ratio {
		font-size: 2.5rem;
		font-weight: 700;
		margin: 0 0 0.5rem;
		line-height: 1;
	}
	.fail dd {
		color: var(--signal);
		font-weight: 700;
	}
	.note {
		margin: 0.75rem 0;
	}
	.error {
		margin: 0;
	}
</style>
