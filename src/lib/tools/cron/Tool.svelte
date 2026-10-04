<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import { checkZone, compact, describe, nextRuns, parseCron, specs, type Parsed } from './logic';

	let input = $state('');
	let zoneChoice = $state<'UTC' | 'local' | 'Europe/Copenhagen' | 'other'>('UTC');
	let otherZone = $state('America/New_York');
	let now = $state(Date.now());
	let ready = false;

	const localZone =
		typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC';

	const examples = [
		'*/15 * * * *',
		'0 * * * *',
		'0 9 * * 1-5',
		'0 8-18/2 * * 1-5',
		'30 2 * * *',
		'0 0 1 * *',
		'0 0 1,15 * FRI',
		'@weekly',
		'0 30 8 * * MON-FRI'
	];

	const parsed = $derived.by((): { p?: Parsed; error?: string } => {
		if (!input.trim()) return {};
		try {
			return { p: parseCron(input) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	const zone = $derived.by((): { z?: string; error?: string } => {
		if (zoneChoice === 'local') return { z: localZone };
		if (zoneChoice === 'other') {
			try {
				return { z: checkZone(otherZone) };
			} catch (e) {
				return { error: (e as Error).message };
			}
		}
		return { z: zoneChoice };
	});

	const upcoming = $derived.by(() => {
		const p = parsed.p;
		if (!p || p.kind !== 'schedule' || !zone.z) return null;
		return nextRuns(p, zone.z, now, 10);
	});

	const rows = $derived.by(() => {
		const p = parsed.p;
		if (!p || p.kind !== 'schedule') return [];
		const fields = p.hasSeconds
			? [p.second, p.minute, p.hour, p.dom, p.month, p.dow]
			: [p.minute, p.hour, p.dom, p.month, p.dow];
		return fields.map((f) => ({
			label: f.spec.label,
			raw: f.raw,
			allowed:
				f.spec.name === 'month'
					? '1-12, JAN-DEC'
					: f.spec.name === 'dow'
						? '0-7, SUN-SAT (0 and 7 are Sunday)'
						: `${specs[f.spec.name].min}-${specs[f.spec.name].max}`,
			matches: compact(f)
		}));
	});

	onMount(() => {
		const h = readHash();
		input = h.in ?? '0 8-18/2 * * 1-5';
		if (h.tz === 'local') zoneChoice = 'local';
		else if (h.tz === 'Europe/Copenhagen') zoneChoice = 'Europe/Copenhagen';
		else if (h.tz && h.tz !== 'UTC') {
			zoneChoice = 'other';
			otherZone = h.tz;
		}
		ready = true;
		const t = setInterval(() => (now = Date.now()), 30000);
		return () => clearInterval(t);
	});

	$effect(() => {
		const state = {
			in: input,
			tz: zoneChoice === 'UTC' ? undefined : zoneChoice === 'other' ? otherZone : zoneChoice
		};
		if (ready) writeHash(state);
	});
</script>

<div class="field">
	<label class="label" for="cron-in">Cron expression</label>
	<input
		id="cron-in"
		type="text"
		bind:value={input}
		spellcheck="false"
		autocomplete="off"
		autocapitalize="off"
	/>
	<p class="label hint">minute hour day-of-month month day-of-week · or 6 fields, seconds first</p>
</div>

<div class="row examples" role="group" aria-label="Examples">
	{#each examples as ex (ex)}
		<button type="button" class="ex" aria-pressed={input.trim() === ex} onclick={() => (input = ex)}
			>{ex}</button
		>
	{/each}
</div>

{#if parsed.error}
	<p class="error" role="alert">{parsed.error}</p>
{:else if parsed.p}
	{@const p = parsed.p}
	<p class="say">{describe(p)}</p>

	{#if p.kind === 'reboot'}
		<p class="note">
			@reboot is not a schedule. The job runs once each time the cron daemon starts, usually at
			boot, so there are no next run times to show.
		</p>
	{:else}
		{#if p.macro}
			<p class="note">
				{p.macro} is short for
				<code>{p.minute.raw} {p.hour.raw} {p.dom.raw} {p.month.raw} {p.dow.raw}</code>.
			</p>
		{/if}
		{#if p.hasSeconds}
			<p class="note">
				6 fields: read as seconds first, then the usual five (Quartz and Spring style). Day-of-week
				numbers use cron numbering here, 0 or 7 for Sunday. Quartz counts 1 to 7 from Sunday, so use
				names like MON-FRI to be safe.
			</p>
		{/if}
		{#if p.command}
			<p class="note">Read as a crontab line. Command ignored: <code>{p.command}</code></p>
		{/if}

		<div class="scroll">
			<table>
				<caption class="label">Fields</caption>
				<thead>
					<tr>
						<th scope="col">Field</th>
						<th scope="col">Value</th>
						<th scope="col">Allowed</th>
						<th scope="col">Matches</th>
					</tr>
				</thead>
				<tbody>
					{#each rows as r (r.label)}
						<tr>
							<th scope="row">{r.label}</th>
							<td class="mono strong">{r.raw}</td>
							<td class="mono dim">{r.allowed}</td>
							<td class="mono">{r.matches}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<div class="row zones" role="group" aria-label="Time zone for run times">
			<span class="label">Time zone</span>
			<button type="button" aria-pressed={zoneChoice === 'UTC'} onclick={() => (zoneChoice = 'UTC')}
				>UTC</button
			>
			<button
				type="button"
				aria-pressed={zoneChoice === 'local'}
				onclick={() => (zoneChoice = 'local')}>Local</button
			>
			<button
				type="button"
				aria-pressed={zoneChoice === 'Europe/Copenhagen'}
				onclick={() => (zoneChoice = 'Europe/Copenhagen')}>Copenhagen</button
			>
			<button
				type="button"
				aria-pressed={zoneChoice === 'other'}
				onclick={() => (zoneChoice = 'other')}>Other</button
			>
		</div>
		{#if zoneChoice === 'other'}
			<div class="field zone-in">
				<label class="label" for="cron-tz">IANA time zone</label>
				<input
					id="cron-tz"
					type="text"
					bind:value={otherZone}
					spellcheck="false"
					autocomplete="off"
					autocapitalize="off"
					placeholder="America/New_York"
				/>
			</div>
		{/if}

		{#if zone.error}
			<p class="error" role="alert">{zone.error}</p>
		{:else if upcoming}
			<h2 class="label sub">Next {upcoming.runs.length || ''} runs, {zone.z}</h2>
			{#if upcoming.runs.length}
				<ol class="runs">
					{#each upcoming.runs as r (r.instant)}
						<li>
							<span class="when">{r.wall}</span>
							<span class="meta">{r.weekday.slice(0, 3)} · UTC{r.offset}</span>
							{#if r.dst}
								<span class="dst"
									>{r.dst.kind === 'gap'
										? `${r.dst.scheduled.slice(11, 16)} skipped by DST, runs at the jump`
										: `${r.dst.scheduled.slice(11, 16)} occurs twice, first one used`}</span
								>
							{/if}
							<Copy value={new Date(r.instant).toISOString()} label="Copy UTC" />
						</li>
					{/each}
				</ol>
			{/if}
			{#if upcoming.exhausted}
				<p class="note">
					{upcoming.runs.length ? 'No further runs' : 'No runs'} in the next 30 years. Check the day and
					month fields, for example 30 February never happens.
				</p>
			{/if}
		{/if}
	{/if}
{/if}

<p class="note foot">
	When both day-of-month and day-of-week are restricted, a day matches if either one matches, as in
	Vixie cron and cronie: <code>0 0 1 * FRI</code> runs on the 1st and on every Friday. If either
	field starts with *, as in <code>*/2</code>, both must match.
</p>
<p class="note foot2">
	Daylight saving: a time skipped when clocks go forward runs at the first moment after the jump
	(02:30 becomes 03:00), and runs that land on the same moment are merged. A time that occurs twice
	when clocks go back runs once, at the first occurrence. Cron daemons differ here; cronie for
	example re-runs wildcard jobs in the repeated hour.
</p>

<style>
	.hint {
		margin: 0;
	}
	.examples {
		margin: 1rem 0 1.25rem;
	}
	.ex {
		text-transform: none;
		letter-spacing: 0;
	}
	.say {
		font-size: 1.25rem;
		line-height: 1.35;
		margin: 0 0 1rem;
		padding: 0.5rem 0.75rem;
		border-left: 4px solid var(--signal);
		background: var(--hilite);
	}
	.note {
		margin: 0 0 1rem;
	}
	.note code {
		overflow-wrap: anywhere;
	}
	.scroll {
		overflow-x: auto;
		margin: 1rem 0 1.5rem;
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
		padding: 0.45rem 0.75rem 0.45rem 0;
		border-bottom: 1px solid var(--rule-soft);
		vertical-align: top;
	}
	th {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-2);
		font-weight: 400;
	}
	th[scope='row'] {
		white-space: nowrap;
	}
	.strong {
		font-weight: 700;
	}
	.dim {
		color: var(--ink-2);
		font-size: 0.8125rem;
	}
	.zones {
		margin: 1.5rem 0 1rem;
	}
	.zone-in {
		margin-bottom: 1rem;
	}
	.sub {
		margin: 1.5rem 0 0;
	}
	.runs {
		list-style: none;
		margin: 0.5rem 0 1.5rem;
		padding: 0;
		border-top: 2px solid var(--rule);
		counter-reset: run;
	}
	.runs li {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 0.25rem 1rem;
		padding: 0.4rem 0;
		border-bottom: 1px solid var(--rule-soft);
		counter-increment: run;
	}
	.runs li::before {
		content: counter(run, decimal-leading-zero);
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--ink-2);
	}
	.when {
		font-family: var(--font-mono);
	}
	.meta {
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		color: var(--ink-2);
		grid-column: 2;
	}
	.dst {
		grid-column: 2;
		font-size: 0.8125rem;
		color: var(--signal);
	}
	.runs li > :global(.copy) {
		grid-column: 3;
		grid-row: 1;
	}
	.foot {
		margin-top: 2rem;
	}
</style>
