<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		decodePlan,
		DK_HOURS,
		ectsToHours,
		encodePlan,
		fmt,
		hoursToEcts,
		parseNum,
		plan,
		weeklyHours,
		YEAR_ECTS,
		type PlanResult
	} from './logic';

	interface Row {
		name: string;
		ects: string;
		weeks: string;
	}

	const rates = [
		{ v: '25', label: '25 h' },
		{ v: '27.5', label: '27.5 h (Denmark)' },
		{ v: '30', label: '30 h' }
	];

	let rate = $state('27.5');
	let ects = $state('7.5');
	let hours = $state('206.25');
	let wEcts = $state('7.5');
	let weeks = $state('14');
	let rows = $state<Row[]>([
		{ name: 'Course 1', ects: '7.5', weeks: '14' },
		{ name: 'Course 2', ects: '7.5', weeks: '14' },
		{ name: 'Course 3', ects: '15', weeks: '20' }
	]);
	let ready = false;

	const per = $derived.by((): { v?: number; error?: string } => {
		try {
			const v = parseNum(rate, 'hours per ECTS');
			if (!(v > 0)) return { error: 'Hours per ECTS must be above zero' };
			return { v };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	let convError = $state('');

	function fromEcts() {
		if (!per.v) return;
		try {
			hours = String(Number(ectsToHours(parseNum(ects, 'ECTS'), per.v).toFixed(2)));
			convError = '';
		} catch (e) {
			convError = (e as Error).message;
		}
	}

	function fromHours() {
		if (!per.v) return;
		try {
			ects = String(Number(hoursToEcts(parseNum(hours, 'hours'), per.v).toFixed(2)));
			convError = '';
		} catch (e) {
			convError = (e as Error).message;
		}
	}

	// Keep hours in step when the rate changes.
	$effect(() => {
		void per.v;
		if (ready) untrack(fromEcts);
	});

	const share = $derived(Number(ects.trim().replace(',', '.') || 'x') / YEAR_ECTS);

	const weekly = $derived.by((): { v?: number; error?: string } => {
		if (!per.v) return {};
		try {
			return { v: weeklyHours(parseNum(wEcts, 'ECTS'), parseNum(weeks, 'weeks'), per.v) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	const planned = $derived.by((): { r?: PlanResult; error?: string } => {
		if (!per.v) return {};
		try {
			return {
				r: plan(
					rows.map((r) => ({
						name: r.name,
						ects: Number(r.ects.replace(',', '.')),
						weeks: Number(r.weeks.replace(',', '.'))
					})),
					per.v
				)
			};
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	onMount(() => {
		const h = readHash();
		if (h.r) rate = h.r;
		if (h.in) ects = h.in;
		if (h.we) wEcts = h.we;
		if (h.w) weeks = h.w;
		if (h.p) {
			const p = decodePlan(h.p);
			if (p.length) rows = p;
		}
		ready = true;
		fromEcts();
	});

	$effect(() => {
		const state = {
			r: rate === '27.5' ? undefined : rate,
			in: ects,
			we: wEcts,
			w: weeks,
			p: encodePlan(rows)
		};
		if (ready) writeHash(state);
	});
</script>

<div class="row opts" role="group" aria-label="Hours per ECTS">
	<span class="label">Hours per ECTS</span>
	{#each rates as r (r.v)}
		<button type="button" aria-pressed={rate === r.v} onclick={() => (rate = r.v)}>{r.label}</button
		>
	{/each}
</div>
<div class="field narrow">
	<label class="label" for="ects-rate">Custom hours per ECTS</label>
	<input id="ects-rate" type="text" inputmode="decimal" bind:value={rate} autocomplete="off" />
</div>
{#if per.error}<p class="error" role="alert">{per.error}</p>{/if}

<h2 class="label sect">ECTS and hours</h2>
<div class="inputs">
	<div class="field">
		<label class="label" for="ects-e">ECTS</label>
		<input
			id="ects-e"
			type="text"
			inputmode="decimal"
			bind:value={ects}
			oninput={fromEcts}
			autocomplete="off"
		/>
	</div>
	<div class="field">
		<label class="label" for="ects-h">Hours</label>
		<input
			id="ects-h"
			type="text"
			inputmode="decimal"
			bind:value={hours}
			oninput={fromHours}
			autocomplete="off"
		/>
	</div>
</div>
{#if convError}<p class="error" role="alert">{convError}</p>{/if}
<dl class="readout out">
	<div>
		<dt>Hours</dt>
		<dd class="strong">{hours}</dd>
		<Copy value={hours} />
	</div>
	{#if Number.isFinite(share)}
		<div>
			<dt>Share of a year</dt>
			<dd>{fmt(share * 100)} % of 60 ECTS (FTE)</dd>
		</div>
	{/if}
	{#if per.v}
		<div>
			<dt>Full-time year</dt>
			<dd>60 ECTS = {fmt(ectsToHours(60, per.v))} hours</dd>
		</div>
	{/if}
</dl>

<h2 class="label sect">Weekly load for one course</h2>
<div class="inputs">
	<div class="field">
		<label class="label" for="ects-we">ECTS</label>
		<input id="ects-we" type="text" inputmode="decimal" bind:value={wEcts} autocomplete="off" />
	</div>
	<div class="field">
		<label class="label" for="ects-w">Over weeks</label>
		<input id="ects-w" type="text" inputmode="decimal" bind:value={weeks} autocomplete="off" />
	</div>
</div>
{#if weekly.error}
	<p class="error" role="alert">{weekly.error}</p>
{:else if weekly.v !== undefined}
	<dl class="readout out">
		<div>
			<dt>Per week</dt>
			<dd class="strong">{fmt(weekly.v)} hours</dd>
			<Copy value={fmt(weekly.v)} />
		</div>
	</dl>
{/if}

<h2 class="label sect">Semester planner</h2>
<div class="courses">
	{#each rows as r, i (i)}
		<fieldset class="course">
			<legend class="visually-hidden">Course {i + 1}</legend>
			<div class="field">
				<label class="label" for="ects-pn-{i}">Course</label>
				<input id="ects-pn-{i}" type="text" bind:value={r.name} autocomplete="off" />
			</div>
			<div class="field">
				<label class="label" for="ects-pe-{i}">ECTS</label>
				<input
					id="ects-pe-{i}"
					type="text"
					inputmode="decimal"
					bind:value={r.ects}
					autocomplete="off"
				/>
			</div>
			<div class="field">
				<label class="label" for="ects-pw-{i}">Weeks</label>
				<input
					id="ects-pw-{i}"
					type="text"
					inputmode="decimal"
					bind:value={r.weeks}
					autocomplete="off"
				/>
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
	<button
		type="button"
		onclick={() => rows.push({ name: `Course ${rows.length + 1}`, ects: '5', weeks: '14' })}
		>Add course</button
	>
</div>
{#if planned.error}
	<p class="error" role="alert">{planned.error}</p>
{:else if planned.r}
	{@const p = planned.r}
	<dl class="readout out">
		{#each p.rows as row, i (i)}
			<div>
				<dt>{row.course.name || `Course ${i + 1}`}</dt>
				<dd>{fmt(row.hours)} h · {fmt(row.weekly)} h/week</dd>
			</div>
		{/each}
		<div>
			<dt>Total</dt>
			<dd class="strong">{fmt(p.ects, 2)} ECTS · {fmt(p.hours)} hours</dd>
			<Copy value={`${fmt(p.ects, 2)} ECTS, ${fmt(p.hours)} hours`} />
		</div>
		<div>
			<dt>Peak week</dt>
			<dd>{fmt(p.weekly)} hours, if all courses run at once</dd>
		</div>
		<div>
			<dt>Load</dt>
			<dd>{fmt(p.semesterShare * 100)} % of a full-time semester (30 ECTS)</dd>
		</div>
	</dl>
{/if}

<p class="note foot">
	60 ECTS is one full-time year. Denmark counts 1 ECTS as {DK_HOURS} hours, 1,650 hours a year (Ministry
	of Higher Education and Science, and the university education orders). The ECTS Users' Guide (European
	Commission, 2015) allows 25 to 30 hours per credit, so other countries differ. The hours cover everything:
	teaching, reading, assignments and exams.
</p>

<style>
	.opts {
		margin: 0 0 0.75rem;
	}
	.narrow {
		max-width: 16rem;
	}
	.sect {
		margin: 2rem 0 0.75rem;
	}
	.inputs {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
		gap: 1rem;
	}
	.out {
		margin-top: 1rem;
	}
	.strong {
		font-weight: 700;
		color: var(--signal);
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
	.foot {
		margin-top: 2rem;
	}
</style>
