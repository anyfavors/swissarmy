<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		applyStep,
		defaultStep,
		parseSteps,
		splitLines,
		stepKinds,
		type Step,
		type StepKind
	} from './logic';

	let input = $state('');
	let steps = $state<Step[]>([]);
	let addKind = $state<StepKind>('sort');
	let shuffleNonce = $state(0);
	let ready = false;

	const labelOf = (k: StepKind) => stepKinds.find((s) => s.kind === k)?.label ?? k;

	const result = $derived.by((): { out: string; count: number; error?: string } => {
		void shuffleNonce;
		let lines = splitLines(input);
		try {
			for (const s of steps) lines = applyStep(lines, s);
			return { out: lines.join('\n'), count: lines.length };
		} catch (e) {
			return { out: '', count: 0, error: (e as Error).message };
		}
	});

	const inCount = $derived(splitLines(input).length);

	function add() {
		steps.push(defaultStep(addKind));
	}
	function move(i: number, d: number) {
		const j = i + d;
		if (j < 0 || j >= steps.length) return;
		[steps[i], steps[j]] = [steps[j], steps[i]];
	}
	function remove(i: number) {
		steps.splice(i, 1);
	}

	const presets: { label: string; steps: Step[] }[] = [
		{
			label: 'Clean list',
			steps: [{ kind: 'trim' }, { kind: 'blank' }, { kind: 'unique', ci: false, keep: 'first' }]
		},
		{
			label: 'Sort unique',
			steps: [
				{ kind: 'unique', ci: true, keep: 'first' },
				{ kind: 'sort', mode: 'natural', locale: 'en', reverse: false, ci: true }
			]
		},
		{
			label: 'Frequency',
			steps: [{ kind: 'trim' }, { kind: 'blank' }, { kind: 'count', ci: true }]
		},
		{
			label: 'SQL IN list',
			steps: [
				{ kind: 'trim' },
				{ kind: 'blank' },
				{ kind: 'affix', prefix: "'", suffix: "'" },
				{ kind: 'join', sep: ', ' }
			]
		}
	];

	onMount(() => {
		const h = readHash();
		input = h.in ?? h.text ?? '';
		steps = h.p ? parseSteps(h.p) : presets[0].steps.map((s) => ({ ...s }));
		ready = true;
	});

	$effect(() => {
		const state = { in: input, p: JSON.stringify(steps) };
		if (ready) writeHash(state);
	});
</script>

<div class="grid">
	<div class="field">
		<div class="row between">
			<label class="label" for="ln-in">Input</label>
			<span class="label">{inCount} lines</span>
		</div>
		<textarea id="ln-in" bind:value={input} spellcheck="false"></textarea>
	</div>
	<div class="field">
		<div class="row between">
			<label class="label" for="ln-out">Output</label>
			<span class="row"
				><span class="label">{result.count} lines</span> <Copy value={result.out} /></span
			>
		</div>
		<textarea id="ln-out" readonly value={result.out} spellcheck="false"></textarea>
	</div>
</div>

{#if result.error}<p class="error" role="alert">{result.error}</p>{/if}

<div class="row presets" role="group" aria-label="Presets">
	<span class="label">Presets</span>
	{#each presets as p (p.label)}
		<button type="button" onclick={() => (steps = p.steps.map((s) => ({ ...s })))}>{p.label}</button
		>
	{/each}
</div>

<h2 class="label head">Pipeline, top to bottom</h2>
{#if !steps.length}
	<p class="note">No steps. The output equals the input.</p>
{/if}
<ol class="steps">
	{#each steps as step, i (i)}
		<li class="step">
			<div class="row between">
				<span class="name">{i + 1}. {labelOf(step.kind)}</span>
				<span class="row">
					<button
						type="button"
						onclick={() => move(i, -1)}
						disabled={i === 0}
						aria-label="Move step {i + 1} up">Up</button
					>
					<button
						type="button"
						onclick={() => move(i, 1)}
						disabled={i === steps.length - 1}
						aria-label="Move step {i + 1} down">Down</button
					>
					<button type="button" onclick={() => remove(i)} aria-label="Remove step {i + 1}"
						>Remove</button
					>
					{#if step.kind === 'shuffle'}
						<button type="button" onclick={() => shuffleNonce++}>Reshuffle</button>
					{/if}
				</span>
			</div>
			{#if step.kind === 'sort'}
				<div class="row opts">
					<label class="label" for="s{i}-mode">Order</label>
					<select id="s{i}-mode" bind:value={step.mode}>
						<option value="alpha">Alphabetical</option>
						<option value="natural">Natural (2 before 10)</option>
						<option value="length">By length</option>
					</select>
					<label class="label" for="s{i}-loc">Language</label>
					<select id="s{i}-loc" bind:value={step.locale}>
						<option value="en">English</option>
						<option value="da">Danish (æ ø å last)</option>
					</select>
					<button
						type="button"
						aria-pressed={step.reverse}
						onclick={() => (step.reverse = !step.reverse)}>Reverse</button
					>
					<button type="button" aria-pressed={step.ci} onclick={() => (step.ci = !step.ci)}
						>Ignore case</button
					>
				</div>
			{:else if step.kind === 'unique'}
				<div class="row opts">
					<button type="button" aria-pressed={step.ci} onclick={() => (step.ci = !step.ci)}
						>Ignore case</button
					>
					<button
						type="button"
						aria-pressed={step.keep === 'first'}
						onclick={() => (step.keep = 'first')}>Keep first</button
					>
					<button
						type="button"
						aria-pressed={step.keep === 'last'}
						onclick={() => (step.keep = 'last')}>Keep last</button
					>
				</div>
			{:else if step.kind === 'count'}
				<div class="row opts">
					<button type="button" aria-pressed={step.ci} onclick={() => (step.ci = !step.ci)}
						>Ignore case</button
					>
				</div>
			{:else if step.kind === 'affix'}
				<div class="opts pair">
					<div class="field">
						<label class="label" for="s{i}-pre">Prefix</label>
						<input id="s{i}-pre" type="text" bind:value={step.prefix} spellcheck="false" />
					</div>
					<div class="field">
						<label class="label" for="s{i}-suf">Suffix</label>
						<input id="s{i}-suf" type="text" bind:value={step.suffix} spellcheck="false" />
					</div>
				</div>
			{:else if step.kind === 'number'}
				<div class="opts pair">
					<div class="field">
						<label class="label" for="s{i}-start">Start at</label>
						<input id="s{i}-start" type="number" bind:value={step.start} />
					</div>
					<div class="field">
						<label class="label" for="s{i}-nsep">After number</label>
						<input id="s{i}-nsep" type="text" bind:value={step.sep} spellcheck="false" />
					</div>
					<button type="button" aria-pressed={step.pad} onclick={() => (step.pad = !step.pad)}
						>Align</button
					>
				</div>
			{:else if step.kind === 'join' || step.kind === 'split'}
				<div class="opts pair">
					<div class="field">
						<label class="label" for="s{i}-sep">Separator</label>
						<input id="s{i}-sep" type="text" bind:value={step.sep} spellcheck="false" />
					</div>
				</div>
			{:else if step.kind === 'wrap'}
				<div class="opts pair">
					<div class="field">
						<label class="label" for="s{i}-w">Columns</label>
						<input id="s{i}-w" type="number" min="1" bind:value={step.width} />
					</div>
				</div>
			{/if}
		</li>
	{/each}
</ol>

<div class="row add">
	<label class="label" for="ln-add">Add step</label>
	<select id="ln-add" bind:value={addKind}>
		{#each stepKinds as k (k.kind)}
			<option value={k.kind}>{k.label}</option>
		{/each}
	</select>
	<button type="button" onclick={add}>Add</button>
</div>

<p class="note">
	Separators and prefixes understand <code>\n</code> for a line break and <code>\t</code> for a tab.
	Danish sorting puts æ, ø, å after z and sorts aa as å, so Aarhus comes after Ålborg. Shuffle uses
	<code>crypto.getRandomValues</code>. Count duplicates gives count, a tab, then the line.
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
	.presets {
		margin: 0 0 1.25rem;
	}
	.head {
		margin: 0 0 0.5rem;
	}
	.steps {
		list-style: none;
		margin: 0 0 1rem;
		padding: 0;
		border-top: 2px solid var(--rule);
	}
	.step {
		padding: 0.6rem 0;
		border-bottom: 1px solid var(--rule-soft);
	}
	.name {
		font-family: var(--font-mono);
		font-weight: 700;
	}
	.opts {
		margin-top: 0.5rem;
	}
	.opts select {
		width: auto;
		max-width: 100%;
	}
	.pair {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
		gap: 0.5rem 1rem;
		align-items: end;
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
	button:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.add {
		margin-bottom: 1.25rem;
	}
	.add select {
		width: auto;
		max-width: 100%;
	}
	code {
		overflow-wrap: anywhere;
	}
</style>
