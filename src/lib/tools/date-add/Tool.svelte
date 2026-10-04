<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import DateField from '../date-diff/DateField.svelte';
	import {
		formatDate,
		parseDateTime,
		todayIso,
		weekday,
		weekdayNames,
		type ExtraDayOff
	} from '../date-diff/logic';
	import {
		addDuration,
		addWorkingDays,
		describeDate,
		describeDuration,
		durationSeconds,
		formatIsoDuration,
		parseIsoDuration,
		zero,
		type Duration
	} from './logic';

	type FieldUnit = 'years' | 'months' | 'weeks' | 'days' | 'hours' | 'minutes';
	const fieldUnits: FieldUnit[] = ['years', 'months', 'weeks', 'days', 'hours', 'minutes'];

	let start = $state('');
	let mode = $state<'dur' | 'wd'>('dur');
	let op = $state<1 | -1>(1);
	let fields = $state<Record<FieldUnit, string>>({
		years: '',
		months: '',
		weeks: '',
		days: '',
		hours: '',
		minutes: ''
	});
	let seconds = $state(0);
	let isoText = $state('');
	let isoSign = $state<1 | -1>(1);
	let isoError = $state('');
	let fieldError = $state('');
	let n = $state('10');
	let pub = $state(true);
	let extra = $state<Record<ExtraDayOff, boolean>>({
		grundlovsdag: false,
		juleaften: false,
		nytaarsaften: false
	});
	let ready = false;

	const extras: { key: ExtraDayOff; label: string }[] = [
		{ key: 'grundlovsdag', label: 'Grundlovsdag 5 Jun' },
		{ key: 'juleaften', label: 'Juleaften 24 Dec' },
		{ key: 'nytaarsaften', label: 'Nytårsaften 31 Dec' }
	];

	function readFields(): Duration {
		const d: Duration = { ...zero, seconds };
		for (const u of fieldUnits) {
			const t = fields[u].trim().replace(',', '.');
			if (!t) continue;
			const v = Number(t);
			if (!Number.isFinite(v) || v < 0)
				throw new Error(`${u[0].toUpperCase()}${u.slice(1)}: enter a number of 0 or more`);
			if ((u === 'years' || u === 'months') && !Number.isInteger(v))
				throw new Error(`${u[0].toUpperCase()}${u.slice(1)} must be whole numbers`);
			d[u] = v;
		}
		return d;
	}

	function fromFields() {
		try {
			const d = readFields();
			fieldError = '';
			isoSign = 1;
			isoText = formatIsoDuration(d);
			isoError = '';
		} catch (e) {
			fieldError = (e as Error).message;
		}
	}

	function fromIso() {
		if (!isoText.trim()) {
			isoError = '';
			return;
		}
		try {
			const p = parseIsoDuration(isoText);
			isoError = '';
			fieldError = '';
			isoSign = p.sign;
			for (const u of fieldUnits) fields[u] = p.duration[u] ? String(p.duration[u]) : '';
			seconds = p.duration.seconds;
		} catch (e) {
			isoError = (e as Error).message;
		}
	}

	const duration = $derived.by((): Duration | null => {
		try {
			return readFields();
		} catch {
			return null;
		}
	});

	const result = $derived.by(() => {
		if (!start.trim()) return null;
		try {
			const s = parseDateTime(start);
			if (mode === 'wd') {
				const t = n.trim();
				if (!/^[+-]?\d+$/.test(t)) throw new Error('Enter a whole number of working days');
				const r = addWorkingDays(s.day, Number(t), { publicHolidays: pub, extra });
				return {
					start: describeDate(s),
					end: describeDate({ day: r.day, secs: s.secs, hasTime: s.hasTime }),
					skipped: r.skipped
				};
			}
			if (!duration || isoError) return null;
			const end = addDuration(s, duration, (op * isoSign) as 1 | -1);
			return { start: describeDate(s), end: describeDate(end), skipped: [] };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	const facts = $derived.by(() => {
		if (!duration) return null;
		const len = durationSeconds(duration);
		return { len, text: describeDuration(duration) };
	});

	const num = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 3 });

	onMount(() => {
		const h = readHash();
		start = h.s ?? todayIso();
		if (h.m === 'wd') mode = 'wd';
		if (h.op === '-') op = -1;
		if (h.n) n = h.n;
		pub = h.hol !== '0';
		const x = (h.x ?? '').split(',');
		for (const e of extras) extra[e.key] = x.includes(e.key);
		const intake = h.in?.trim();
		if (intake && /^[+-]?P/i.test(intake)) {
			isoText = intake;
			mode = 'dur';
		} else if (intake) {
			start = intake;
			isoText = h.d ?? 'P30D';
		} else isoText = h.d ?? 'P30D';
		fromIso();
		ready = true;
	});

	$effect(() => {
		const state = {
			s: start,
			m: mode === 'wd' ? 'wd' : undefined,
			op: op < 0 ? '-' : undefined,
			d: mode === 'dur' ? isoText : undefined,
			n: mode === 'wd' ? n : undefined,
			hol: mode === 'wd' && !pub ? '0' : undefined,
			x:
				mode === 'wd'
					? extras
							.filter((e) => extra[e.key])
							.map((e) => e.key)
							.join(',') || undefined
					: undefined
		};
		if (ready) writeHash(state);
	});
</script>

<DateField id="da-start" label="Start" bind:value={start} />

<div class="row opts" role="group" aria-label="Mode">
	<span class="label">Mode</span>
	<button type="button" aria-pressed={mode === 'dur'} onclick={() => (mode = 'dur')}
		>Duration</button
	>
	<button type="button" aria-pressed={mode === 'wd'} onclick={() => (mode = 'wd')}
		>Working days</button
	>
</div>

{#if mode === 'dur'}
	<div class="row opts" role="group" aria-label="Direction">
		<button type="button" aria-pressed={op === 1} onclick={() => (op = 1)}>Add</button>
		<button type="button" aria-pressed={op === -1} onclick={() => (op = -1)}>Subtract</button>
	</div>
	<div class="units">
		{#each fieldUnits as u (u)}
			<div class="field">
				<label class="label" for={`da-${u}`}>{u}</label>
				<input
					id={`da-${u}`}
					type="text"
					inputmode="decimal"
					autocomplete="off"
					placeholder="0"
					bind:value={fields[u]}
					oninput={fromFields}
				/>
			</div>
		{/each}
	</div>
	{#if fieldError}<p class="error" role="alert">{fieldError}</p>{/if}

	<div class="field iso">
		<label class="label" for="da-iso">ISO 8601 duration</label>
		<input
			id="da-iso"
			type="text"
			spellcheck="false"
			autocomplete="off"
			placeholder="P1Y2M10DT2H30M"
			bind:value={isoText}
			oninput={fromIso}
		/>
	</div>
	{#if isoError}
		<p class="error" role="alert">{isoError}</p>
	{:else if facts}
		<dl class="readout">
			<div>
				<dt>Duration</dt>
				<dd>{isoSign < 0 ? 'minus ' : ''}{facts.text}</dd>
				<Copy value={formatIsoDuration(duration ?? zero, isoSign)} label="Copy ISO" />
			</div>
			<div>
				<dt>{facts.len.exact ? 'Length' : 'Average length'}</dt>
				<dd>
					{facts.len.exact ? '' : 'about '}{num.format(facts.len.seconds / 86400)} days, {num.format(
						facts.len.seconds
					)} s
				</dd>
			</div>
		</dl>
		{#if !facts.len.exact}
			<p class="note">
				Years and months have no fixed length. The average uses 365.2425 days per year. The result
				below uses the real calendar.
			</p>
		{/if}
	{/if}
{:else}
	<div class="field wd">
		<label class="label" for="da-n">Working days to add (negative to go back)</label>
		<input id="da-n" type="text" inputmode="numeric" autocomplete="off" bind:value={n} />
	</div>
	<div class="row opts" role="group" aria-label="Holidays">
		<button type="button" aria-pressed={pub} onclick={() => (pub = !pub)}
			>Skip Danish public holidays</button
		>
		{#each extras as e (e.key)}
			<button
				type="button"
				aria-pressed={extra[e.key]}
				onclick={() => (extra[e.key] = !extra[e.key])}>{e.label}</button
			>
		{/each}
	</div>
{/if}

{#if result?.error}
	<p class="error" role="alert">{result.error}</p>
{:else if result?.end}
	{@const r = result}
	<h2 class="label sub">Result</h2>
	<dl class="readout">
		<div>
			<dt>ISO 8601</dt>
			<dd class="hit">{r.end.iso}</dd>
			<Copy value={r.end.iso} />
		</div>
		<div>
			<dt>Weekday</dt>
			<dd>{r.end.weekday}</dd>
		</div>
		<div>
			<dt>ISO week</dt>
			<dd>{r.end.isoWeek}</dd>
			<Copy value={r.end.isoWeek} />
		</div>
		<div>
			<dt>Day of year</dt>
			<dd>{r.end.dayOfYear}</dd>
		</div>
		<div>
			<dt>Start was</dt>
			<dd>{r.start.iso}, {r.start.weekday}, {r.start.isoWeek}</dd>
		</div>
	</dl>
	{#if r.skipped.length}
		<p class="note">
			Skipped holidays on weekdays:
			{#each r.skipped as h, i (h.day + h.name)}{i ? '; ' : ''}{formatDate(h.day)}
				{weekdayNames[weekday(h.day)].slice(0, 3)}
				{h.name}{/each}.
		</p>
	{/if}
{/if}

<p class="note foot">
	{#if mode === 'dur'}
		Years and months are added first, then weeks and days, then hours and minutes. A month added to
		a day that the target month lacks lands on its last day: 31 Jan + 1 month = 28 Feb (29 in leap
		years). Times are wall-clock times with no time zone, so a day is always 24 hours.
	{:else}
		The start date is not counted: 1 working day after a Friday is the Monday. Working days are
		Monday to Friday, minus Danish public holidays (Store Bededag up to 2023) and any extra days off
		you pick.
	{/if}
</p>

<style>
	.opts {
		margin-top: 1rem;
	}
	.units {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
		gap: 0.75rem;
		margin: 1rem 0;
	}
	.iso,
	.wd {
		margin: 1rem 0;
	}
	.readout {
		margin: 1rem 0 1.25rem;
	}
	.sub {
		margin: 2rem 0 0;
	}
	.hit {
		background: var(--hilite);
		font-weight: 700;
	}
	.foot {
		margin-top: 2rem;
	}
</style>
