<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		formatDay,
		formatGB,
		parseDay,
		plan,
		rules,
		storage,
		weekdayNames,
		weekdayOf,
		type Chain,
		type Gfs,
		type Plan,
		type Storage
	} from './logic';

	let daily = $state('14');
	let weekly = $state('4');
	let monthly = $state('12');
	let yearly = $state('3');
	let weekday = $state(0);
	let today = $state('');
	let full = $state('500');
	let change = $state('3');
	let reduction = $state('2');
	let chain = $state<Chain>('forever');
	let checked = $state<string[]>([]);
	let ready = false;

	function int(s: string): number {
		return s.trim() === '' ? 0 : Number(s);
	}

	const gfs = $derived<Gfs>({
		daily: int(daily),
		weekly: int(weekly),
		monthly: int(monthly),
		yearly: int(yearly),
		weekday
	});

	const res = $derived.by((): { p?: Plan; s?: Storage; error?: string; serror?: string } => {
		if (!today) return {};
		let p: Plan;
		try {
			p = plan(gfs, parseDay(today));
		} catch (e) {
			return { error: (e as Error).message };
		}
		try {
			const s = storage(p, gfs, {
				full: Number(full.replace(',', '.')),
				change: Number(change.replace(',', '.')),
				reduction: Number(reduction.replace(',', '.')),
				chain
			});
			return { p, s };
		} catch (e) {
			return { p, serror: (e as Error).message };
		}
	});

	const score = $derived(rules.filter((r) => checked.includes(r.id)).length);

	function toggle(id: string) {
		checked = checked.includes(id) ? checked.filter((c) => c !== id) : [...checked, id];
	}

	onMount(() => {
		const h = readHash();
		today = new Date().toISOString().slice(0, 10);
		if (h.d) daily = h.d;
		if (h.w) weekly = h.w;
		if (h.m) monthly = h.m;
		if (h.y) yearly = h.y;
		if (/^[0-6]$/.test(h.wd ?? '')) weekday = Number(h.wd);
		if (h.t) today = h.t;
		if (h.f) full = h.f;
		if (h.c) change = h.c;
		if (h.r) reduction = h.r;
		if (h.ch === 'weekly') chain = 'weekly';
		if (h.k) checked = rules.filter((r) => h.k.split('').includes(r.id)).map((r) => r.id);
		ready = true;
	});

	$effect(() => {
		const state = {
			d: daily,
			w: weekly,
			m: monthly,
			y: yearly,
			wd: String(weekday),
			t: today === new Date().toISOString().slice(0, 10) ? undefined : today,
			f: full,
			c: change,
			r: reduction,
			ch: chain === 'weekly' ? 'weekly' : undefined,
			k: checked.join('') || undefined
		};
		if (ready) writeHash(state);
	});
</script>

<h2 class="label sect first">GFS scheme</h2>
<div class="inputs">
	<div class="field">
		<label class="label" for="ret-d">Daily</label>
		<input id="ret-d" type="text" inputmode="numeric" bind:value={daily} autocomplete="off" />
	</div>
	<div class="field">
		<label class="label" for="ret-w">Weekly</label>
		<input id="ret-w" type="text" inputmode="numeric" bind:value={weekly} autocomplete="off" />
	</div>
	<div class="field">
		<label class="label" for="ret-m">Monthly</label>
		<input id="ret-m" type="text" inputmode="numeric" bind:value={monthly} autocomplete="off" />
	</div>
	<div class="field">
		<label class="label" for="ret-y">Yearly</label>
		<input id="ret-y" type="text" inputmode="numeric" bind:value={yearly} autocomplete="off" />
	</div>
	<div class="field">
		<label class="label" for="ret-wd">Weekly backup on</label>
		<select id="ret-wd" bind:value={weekday}>
			{#each weekdayNames as n, i (n)}
				<option value={i}>{n}</option>
			{/each}
		</select>
	</div>
	<div class="field">
		<label class="label" for="ret-t">As of</label>
		<input id="ret-t" type="text" bind:value={today} placeholder="YYYY-MM-DD" autocomplete="off" />
	</div>
</div>

{#if res.error}
	<p class="error" role="alert">{res.error}</p>
{:else if res.p}
	{@const p = res.p}
	<dl class="readout out">
		<div>
			<dt>Restore points</dt>
			<dd class="strong">{p.points.length}</dd>
			<Copy value={String(p.points.length)} />
		</div>
		<div>
			<dt>Oldest restore point</dt>
			<dd>
				{p.oldest !== undefined
					? `${formatDay(p.oldest)}, ${weekdayNames[weekdayOf(p.oldest)]}`
					: 'n/a'}
			</dd>
			<Copy value={p.oldest !== undefined ? formatDay(p.oldest) : ''} />
		</div>
		<div>
			<dt>By kind</dt>
			<dd>
				{p.counts.daily} daily · {p.counts.weekly} weekly · {p.counts.monthly} monthly · {p.counts
					.yearly} yearly
			</dd>
		</div>
	</dl>
	{#if p.points.length < gfs.daily + gfs.weekly + gfs.monthly + gfs.yearly}
		<p class="note">
			{gfs.daily + gfs.weekly + gfs.monthly + gfs.yearly - p.points.length} points qualify twice (a daily
			that is also the weekly, a 1 January that is also the monthly) and are stored once.
		</p>
	{/if}
	<details class="list">
		<summary class="label">All restore points</summary>
		<div class="scroll">
			<table>
				<thead>
					<tr><th scope="col">Date</th><th scope="col">Day</th><th scope="col">Kept as</th></tr>
				</thead>
				<tbody>
					{#each p.points as pt (pt.day)}
						<tr>
							<td class="mono">{formatDay(pt.day)}</td>
							<td>{weekdayNames[weekdayOf(pt.day)].slice(0, 3)}</td>
							<td>{pt.kinds.join(', ')}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</details>

	<h2 class="label sect">Storage estimate</h2>
	<div class="inputs">
		<div class="field">
			<label class="label" for="ret-f">Full backup, GB</label>
			<input id="ret-f" type="text" inputmode="decimal" bind:value={full} autocomplete="off" />
		</div>
		<div class="field">
			<label class="label" for="ret-c">Daily change, %</label>
			<input id="ret-c" type="text" inputmode="decimal" bind:value={change} autocomplete="off" />
		</div>
		<div class="field">
			<label class="label" for="ret-r">Dedupe and compression, x:1</label>
			<input id="ret-r" type="text" inputmode="decimal" bind:value={reduction} autocomplete="off" />
		</div>
	</div>
	<div class="row opts" role="group" aria-label="Daily chain">
		<span class="label">Daily chain</span>
		<button type="button" aria-pressed={chain === 'forever'} onclick={() => (chain = 'forever')}
			>Forever incremental</button
		>
		<button type="button" aria-pressed={chain === 'weekly'} onclick={() => (chain = 'weekly')}
			>Weekly full</button
		>
	</div>
	{#if res.serror}
		<p class="error" role="alert">{res.serror}</p>
	{:else if res.s}
		{@const s = res.s}
		<dl class="readout">
			<div>
				<dt>Estimated storage</dt>
				<dd class="strong">{formatGB(s.stored)}</dd>
				<Copy value={formatGB(s.stored)} />
			</div>
			<div>
				<dt>Fulls · incrementals</dt>
				<dd>{s.fulls} · {s.incrementals}</dd>
			</div>
			<div>
				<dt>Before reduction</dt>
				<dd>{formatGB(s.logical)}</dd>
			</div>
			<div>
				<dt>Upper bound, all fulls</dt>
				<dd>{formatGB(s.allFulls)}</dd>
			</div>
		</dl>
		<p class="note">
			Model: the daily points are one chain, either one full plus incrementals, or a new full every
			{weekdayNames[weekday]} plus the full the oldest incrementals still need. Weekly, monthly and yearly
			points outside that chain are fulls. Block cloning (ReFS, XFS) or a deduplicating target stores
			those GFS fulls for much less; raise the factor to match. No data growth is assumed.
		</p>
	{/if}
{/if}

<h2 class="label sect">3-2-1-1-0 check</h2>
<ul class="rules">
	{#each rules as r (r.id)}
		<li>
			<button
				type="button"
				aria-pressed={checked.includes(r.id)}
				onclick={() => toggle(r.id)}
				class="rule"><span class="digit mono">{r.rule}</span> {r.text}</button
			>
		</li>
	{/each}
</ul>
<p class="read" aria-live="polite">
	<span class="mono strong">{score} of {rules.length}</span>
	<span class="label"
		>{score === rules.length
			? 'all rules met'
			: checked.includes('3') && checked.includes('2') && checked.includes('o')
				? '3-2-1 met'
				: 'gaps remain'}</span
	>
</p>
<p class="note">
	3-2-1 is usually credited to Peter Krogh (The DAM Book, 2009). The extra 1 (offline or immutable,
	against ransomware) and 0 (verified restores) are a later industry extension popularised by Veeam.
	Press a rule to mark it as met.
</p>

<style>
	.sect {
		margin: 2rem 0 0.75rem;
	}
	.first {
		margin-top: 0;
	}
	.inputs {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
		gap: 1rem;
	}
	.out {
		margin-top: 1.25rem;
	}
	.strong {
		font-weight: 700;
		color: var(--signal);
	}
	.opts {
		margin: 1rem 0;
	}
	.note {
		margin: 1rem 0;
	}
	.list {
		margin: 1rem 0;
	}
	.list summary {
		cursor: pointer;
		min-height: 2.75rem;
		display: flex;
		align-items: center;
	}
	.scroll {
		overflow-x: auto;
		max-height: 24rem;
		overflow-y: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		border-top: 2px solid var(--rule);
		font-size: 0.9375rem;
	}
	th,
	td {
		text-align: left;
		padding: 0.35rem 0.75rem 0.35rem 0;
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
	.rules {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 0.5rem;
	}
	.rule {
		width: 100%;
		text-align: left;
		text-transform: none;
		letter-spacing: 0;
		font-family: var(--font-body);
		font-size: 1rem;
		justify-content: flex-start;
	}
	.digit {
		font-weight: 700;
		min-width: 1.5rem;
		font-size: 1.25rem;
	}
	.read {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.75rem;
		align-items: baseline;
		margin: 1rem 0;
	}
</style>
