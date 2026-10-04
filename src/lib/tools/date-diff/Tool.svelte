<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import DateField from './DateField.svelte';
	import {
		dateDiff,
		formatDate,
		parseDateTime,
		splitRange,
		todayIso,
		weekday,
		weekdayNames,
		type DiffResult,
		type ExtraDayOff
	} from './logic';

	let a = $state('');
	let b = $state('');
	let inclusive = $state(false);
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

	const result = $derived.by((): { r?: DiffResult; error?: string; hasTime?: boolean } => {
		if (!a.trim() || !b.trim()) return {};
		try {
			const s = parseDateTime(a);
			const e = parseDateTime(b);
			return {
				r: dateDiff(s, e, { inclusive, publicHolidays: pub, extra }),
				hasTime: s.hasTime || e.hasTime
			};
		} catch (err) {
			return { error: (err as Error).message };
		}
	});

	const fmt = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 3 });
	const n = (v: number) => fmt.format(v);
	const plural = (v: number, unit: string) => `${n(v)} ${unit}${v === 1 ? '' : 's'}`;

	function calendarText(r: DiffResult, withTime: boolean): string {
		const parts = [plural(r.years, 'year'), plural(r.months, 'month'), plural(r.days, 'day')];
		if (withTime)
			parts.push(plural(r.hours, 'hour'), plural(r.minutes, 'minute'), plural(r.seconds, 'second'));
		return (r.negative ? 'minus ' : '') + parts.join(', ');
	}

	const sign = (r: DiffResult) => (r.negative ? '-' : '');

	onMount(() => {
		const h = readHash();
		const today = todayIso();
		const range = h.in ? splitRange(h.in) : null;
		if (range) [a, b] = range;
		else {
			a = h.a ?? today;
			b = h.b ?? `${today.slice(0, 4)}-12-31`;
		}
		inclusive = h.incl === '1';
		pub = h.hol !== '0';
		const x = (h.x ?? '').split(',');
		for (const e of extras) extra[e.key] = x.includes(e.key);
		ready = true;
	});

	$effect(() => {
		const state = {
			a,
			b,
			incl: inclusive ? '1' : undefined,
			hol: pub ? undefined : '0',
			x:
				extras
					.filter((e) => extra[e.key])
					.map((e) => e.key)
					.join(',') || undefined
		};
		if (ready) writeHash(state);
	});

	function swap() {
		[a, b] = [b, a];
	}
</script>

<div class="grid">
	<DateField id="dd-a" label="Start" bind:value={a} />
	<DateField id="dd-b" label="End" bind:value={b} />
</div>

<div class="row opts" role="group" aria-label="Counting options">
	<button type="button" onclick={swap}>Swap</button>
	<button type="button" aria-pressed={inclusive} onclick={() => (inclusive = !inclusive)}
		>Include end date</button
	>
	<button type="button" aria-pressed={pub} onclick={() => (pub = !pub)}
		>Exclude Danish public holidays</button
	>
</div>
<div class="row opts last" role="group" aria-label="Common days off, not public holidays">
	<span class="label">Also off</span>
	{#each extras as e (e.key)}
		<button type="button" aria-pressed={extra[e.key]} onclick={() => (extra[e.key] = !extra[e.key])}
			>{e.label}</button
		>
	{/each}
</div>

{#if result.error}
	<p class="error" role="alert">{result.error}</p>
{:else if result.r}
	{@const r = result.r}
	{@const s = sign(r)}
	{@const days = r.totalSeconds / 86400}
	{@const wholeDays = Math.floor(days)}
	<p class="note">
		{inclusive
			? 'End date included: the range runs to the end of the end date.'
			: 'End date excluded: the range stops at the start of the end date. 1 Jan to 2 Jan is 1 day.'}
		{#if r.negative}End is before start, so the figures are negative.{/if}
	</p>

	<dl class="readout">
		<div>
			<dt>Calendar</dt>
			<dd>{calendarText(r, !!result.hasTime)}</dd>
			<Copy value={calendarText(r, !!result.hasTime)} />
		</div>
		<div>
			<dt>Total days</dt>
			<dd>{s}{n(days)}</dd>
			<Copy value={`${s}${days}`} />
		</div>
		<div>
			<dt>Weeks and days</dt>
			<dd>
				{s}{plural(Math.floor(wholeDays / 7), 'week')}, {plural(
					wholeDays % 7,
					'day'
				)}{#if days !== wholeDays}
					and {n((days - wholeDays) * 24)} h{/if}
			</dd>
		</div>
		<div>
			<dt>Total hours</dt>
			<dd>{s}{n(r.totalSeconds / 3600)}</dd>
			<Copy value={`${s}${r.totalSeconds / 3600}`} />
		</div>
		<div>
			<dt>Total minutes</dt>
			<dd>{s}{n(r.totalSeconds / 60)}</dd>
			<Copy value={`${s}${r.totalSeconds / 60}`} />
		</div>
		<div>
			<dt>Total seconds</dt>
			<dd>{s}{n(r.totalSeconds)}</dd>
			<Copy value={`${s}${r.totalSeconds}`} />
		</div>
	</dl>

	<h2 class="label sub">
		Working days, {formatDate(r.from)} to {formatDate(r.toExclusive - 1)} inclusive
	</h2>
	<dl class="readout">
		<div>
			<dt>Working days</dt>
			<dd class="hit">{s}{n(r.workingDays)}</dd>
			<Copy value={`${s}${r.workingDays}`} />
		</div>
		<div>
			<dt>Mon to Fri</dt>
			<dd>{s}{n(r.weekdays)}</dd>
		</div>
		<div>
			<dt>Sat and Sun</dt>
			<dd>{s}{n(r.weekendDays)}</dd>
		</div>
		<div>
			<dt>Holidays on weekdays</dt>
			<dd>{n(r.weekdays - r.workingDays)}</dd>
		</div>
	</dl>
	{#if result.hasTime}
		<p class="note">Working days count whole calendar dates. Times are ignored for this part.</p>
	{/if}

	{#if r.holidays.length}
		{@const shown = r.holidays.slice(0, 200)}
		<div class="scroll">
			<table>
				<caption class="label">Holidays and days off in the range</caption>
				<thead>
					<tr><th scope="col">Date</th><th scope="col">Day</th><th scope="col">Name</th></tr>
				</thead>
				<tbody>
					{#each shown as h (h.day + h.name)}
						{@const wd = weekday(h.day)}
						<tr class:muted={wd >= 5}>
							<td>{formatDate(h.day)}</td>
							<td>{weekdayNames[wd].slice(0, 3)}</td>
							<td
								>{h.name}{#if h.extra}<span class="tag">not official</span>{/if}{#if wd >= 5}<span
										class="tag">weekend</span
									>{/if}</td
							>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if r.holidays.length > shown.length}
			<p class="note">Showing the first {shown.length} of {n(r.holidays.length)}.</p>
		{/if}
	{/if}
{/if}

<p class="note foot">
	Dates are plain calendar dates and times are wall-clock times with no time zone, so every day has
	24 hours. Months are counted so that start plus the result gives the end: 31 Jan to 28 Feb is 1
	month. Public holidays are those in Danish law. Store Bededag counts up to 2023, it was abolished
	from 2024. Grundlovsdag, juleaften and nytårsaften are not public holidays, but many workplaces
	close, so they are optional.
</p>

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
		gap: 1.25rem;
	}
	.opts {
		margin-top: 1rem;
	}
	.last {
		margin-bottom: 1.25rem;
	}
	.readout {
		margin: 1rem 0 1.5rem;
	}
	.note {
		margin-top: 1rem;
	}
	.sub {
		margin: 2rem 0 0;
	}
	.hit {
		background: var(--hilite);
		font-weight: 700;
	}
	.scroll {
		overflow-x: auto;
		margin: 1rem 0;
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
	th {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-2);
		font-weight: 400;
		text-align: left;
	}
	th,
	td {
		padding: 0.4rem 0.75rem 0.4rem 0;
		border-bottom: 1px solid var(--rule-soft);
		vertical-align: top;
	}
	td:first-child,
	td:nth-child(2) {
		font-family: var(--font-mono);
		white-space: nowrap;
	}
	.muted {
		color: var(--ink-2);
	}
	.tag {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		border: 1px solid var(--rule-soft);
		padding: 0 0.3rem;
		margin-left: 0.4rem;
		white-space: nowrap;
	}
	.foot {
		margin-top: 2rem;
	}
</style>
