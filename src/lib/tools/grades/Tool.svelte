<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		decodeCourses,
		ectsLetters,
		encodeCourses,
		lookup,
		seven,
		thirteen,
		weightedAverage,
		type Average,
		type Equivalent,
		type Scale
	} from './logic';

	interface Row {
		name: string;
		ects: string;
		grade: string;
	}

	const scales: { id: Scale; label: string; grades: string[] }[] = [
		{ id: '7', label: '7-point', grades: seven.map((g) => g.label) },
		{ id: 'ects', label: 'ECTS', grades: ectsLetters },
		{ id: '13', label: '13-scale', grades: thirteen.map((t) => t.label) }
	];

	let scale = $state<Scale>('7');
	let grade = $state('7');
	let rows = $state<Row[]>([
		{ name: 'Networks', ects: '7.5', grade: '12' },
		{ name: 'Databases', ects: '15', grade: '7' },
		{ name: 'Statistics', ects: '5', grade: '10' },
		{ name: 'Project', ects: '15', grade: 'pass' }
	]);
	let ready = false;

	const current = $derived(scales.find((s) => s.id === scale)!);

	const eq = $derived.by((): Equivalent | undefined => {
		try {
			return lookup(scale, grade);
		} catch {
			return undefined;
		}
	});

	const avg = $derived.by((): { a?: Average; error?: string } => {
		try {
			return {
				a: weightedAverage(
					rows.map((r) => ({
						name: r.name,
						ects: Number(r.ects.replace(',', '.')),
						grade: r.grade
					}))
				)
			};
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	function setScale(s: Scale) {
		scale = s;
		grade = scales.find((x) => x.id === s)!.grades[2];
	}

	function fmt(n: number, d = 2): string {
		return n.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
	}

	onMount(() => {
		const h = readHash();
		if (h.s === '13' || h.s === 'ects') scale = h.s;
		grade = h.g && current.grades.includes(h.g) ? h.g : current.grades[2];
		if (h.c) {
			const cs = decodeCourses(h.c);
			if (cs.length) rows = cs;
		}
		ready = true;
	});

	$effect(() => {
		const state = { s: scale === '7' ? undefined : scale, g: grade, c: encodeCourses(rows) };
		if (ready) writeHash(state);
	});
</script>

<h2 class="label sect first">Convert a grade</h2>
<div class="row opts" role="group" aria-label="Scale">
	<span class="label">Scale</span>
	{#each scales as s (s.id)}
		<button type="button" aria-pressed={scale === s.id} onclick={() => setScale(s.id)}
			>{s.label}</button
		>
	{/each}
</div>
<div class="row opts" role="group" aria-label="Grade">
	<span class="label">Grade</span>
	{#each current.grades as g (g)}
		<button type="button" class="g" aria-pressed={grade === g} onclick={() => (grade = g)}
			>{g}</button
		>
	{/each}
</div>

{#if eq}
	<dl class="readout">
		<div>
			<dt>7-point scale</dt>
			<dd class="strong">{eq.seven.label}</dd>
			<Copy value={eq.seven.label} />
		</div>
		<div>
			<dt>ECTS grade</dt>
			<dd class="strong">{eq.seven.ects}</dd>
			<Copy value={eq.seven.ects} />
		</div>
		<div>
			<dt>Name</dt>
			<dd>{eq.seven.da} · {eq.seven.en}</dd>
		</div>
		<div>
			<dt>Result</dt>
			<dd>{eq.seven.pass ? 'Pass' : 'Fail'}</dd>
		</div>
		<div>
			<dt>From 13-scale</dt>
			<dd>{eq.from13.join(', ')}</dd>
		</div>
	</dl>
{/if}

<div class="scroll">
	<table>
		<caption class="label">The three scales</caption>
		<thead>
			<tr>
				<th scope="col">7-point</th>
				<th scope="col">ECTS</th>
				<th scope="col">13-scale</th>
				<th scope="col">Name</th>
			</tr>
		</thead>
		<tbody>
			{#each seven as g (g.label)}
				<tr class:hit={eq?.seven.label === g.label} class:fail={!g.pass}>
					<td class="mono strongcell">{g.label}</td>
					<td class="mono">{g.ects}</td>
					<td class="mono"
						>{thirteen
							.filter((t) => t.to7 === g.label)
							.map((t) => t.label)
							.join(', ')}</td
					>
					<td>{g.da} <span class="dim">{g.en}</span></td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
<p class="note">
	ECTS letters as the Ministry of Higher Education and Science (UFM) pairs them with the 7-point
	scale; 02 is the lowest pass. The 13-scale column is the official conversion from 2007 (BEK nr 262
	af 20/03/2007, bilag 2), used when old grades go into a new average. It runs one way only: a 7 on
	the new scale does not tell you whether the old grade was 8 or 9.
</p>

<h2 class="label sect">Weighted average</h2>
<div class="courses">
	{#each rows as r, i (i)}
		<fieldset class="course">
			<legend class="visually-hidden">Course {i + 1}</legend>
			<div class="field">
				<label class="label" for="gr-n-{i}">Course</label>
				<input id="gr-n-{i}" type="text" bind:value={r.name} autocomplete="off" />
			</div>
			<div class="field">
				<label class="label" for="gr-e-{i}">ECTS</label>
				<input
					id="gr-e-{i}"
					type="text"
					inputmode="decimal"
					bind:value={r.ects}
					autocomplete="off"
				/>
			</div>
			<div class="field">
				<label class="label" for="gr-g-{i}">Grade</label>
				<select id="gr-g-{i}" bind:value={r.grade}>
					<optgroup label="7-point scale">
						{#each seven as g (g.label)}<option value={g.label}>{g.label}</option>{/each}
					</optgroup>
					<optgroup label="13-scale, converted">
						{#each thirteen as t (t.label)}<option value="13:{t.label}"
								>{t.label} (13) = {t.to7}</option
							>{/each}
					</optgroup>
					<option value="pass">Passed, no grade</option>
				</select>
			</div>
			<button
				type="button"
				onclick={() => rows.splice(i, 1)}
				aria-label="Remove {r.name || `course ${i + 1}`}">Remove</button
			>
		</fieldset>
	{/each}
</div>
<div class="row">
	<button type="button" onclick={() => rows.push({ name: '', ects: '5', grade: '7' })}
		>Add course</button
	>
</div>

{#if avg.error}
	<p class="error" role="alert">{avg.error}</p>
{:else if avg.a}
	{@const a = avg.a}
	<dl class="readout out">
		<div>
			<dt>Weighted average</dt>
			<dd class="strong">{fmt(a.rounded)}</dd>
			<Copy value={fmt(a.rounded)} />
		</div>
		<div>
			<dt>Unrounded</dt>
			<dd>{a.exact.toFixed(6)}</dd>
		</div>
		<div>
			<dt>Graded ECTS</dt>
			<dd>{fmt(a.graded, 1)}</dd>
		</div>
		<div>
			<dt>Total ECTS</dt>
			<dd>
				{fmt(a.total, 1)}{a.passOnly ? ` (${fmt(a.passOnly, 1)} pass/fail, not averaged)` : ''}
			</dd>
		</div>
	</dl>
	<p class="note">
		Sum of grade × ECTS divided by the graded ECTS, rounded half up to 2 decimals, the way Danish
		transcripts commonly show it. Your institution's rules decide which courses count (usually only
		passed, final grades) and the rounding; check them before relying on the figure.
	</p>
{/if}

<p class="note foot">
	US GPA and UK degree classes have no official conversion from the Danish scale. Each receiving
	institution or credential evaluator uses its own, so none is offered here.
</p>

<style>
	.sect {
		margin: 2rem 0 0.75rem;
	}
	.first {
		margin-top: 0;
	}
	.opts {
		margin: 0 0 0.75rem;
	}
	.g {
		min-width: 2.75rem;
		justify-content: center;
	}
	.strong {
		font-weight: 700;
		color: var(--signal);
	}
	.scroll {
		overflow-x: auto;
		margin: 1.5rem 0 1rem;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		border-top: 2px solid var(--rule);
		font-size: 0.9375rem;
	}
	caption {
		text-align: left;
		padding-bottom: 0.4rem;
	}
	th,
	td {
		text-align: left;
		padding: 0.4rem 0.75rem 0.4rem 0;
		border-bottom: 1px solid var(--rule-soft);
	}
	th {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-2);
		font-weight: 400;
	}
	tr.hit td {
		background: var(--hilite);
	}
	.strongcell {
		font-weight: 700;
	}
	tr.fail td {
		color: var(--ink-2);
	}
	.dim {
		color: var(--ink-2);
		font-size: 0.875rem;
	}
	.note {
		margin: 1rem 0;
	}
	.courses {
		display: grid;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}
	.course {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
		gap: 0.5rem 0.75rem;
		align-items: end;
		border: 0;
		border-bottom: 1px solid var(--rule-soft);
		padding: 0 0 0.75rem;
		margin: 0;
		min-width: 0;
	}
	.course button {
		justify-self: start;
	}
	.out {
		margin-top: 1rem;
	}
	.foot {
		margin-top: 2rem;
	}
</style>
