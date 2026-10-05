<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		achieved,
		allowedDowntime,
		allPeriods,
		calendarMonths,
		composite,
		decodeTiers,
		encodeTiers,
		findPeriod,
		formatDuration,
		formatPercent,
		fromMtbf,
		nines,
		parseDuration,
		parsePercent,
		periods,
		YEAR
	} from './logic';

	interface Row {
		name: string;
		a: string;
		n: string;
	}

	let pct = $state('99.9');
	let down = $state('4h');
	let periodId = $state('month');
	let rows = $state<Row[]>([
		{ name: 'Load balancer', a: '99.99', n: '1' },
		{ name: 'Web server', a: '99.5', n: '2' },
		{ name: 'Database', a: '99.95', n: '1' }
	]);
	let mtbf = $state('8760');
	let mttr = $state('4');
	let ready = false;

	const avail = $derived.by((): { p?: number; error?: string } => {
		try {
			return { p: parsePercent(pct) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	function ninesText(p: number): string {
		const n = nines(p);
		return Number.isFinite(n) ? `${Number(n.toFixed(2))} nines` : 'no downtime';
	}

	const back = $derived.by((): { p?: number; error?: string } => {
		const period = findPeriod(periodId);
		if (!period) return {};
		try {
			return { p: achieved(parseDuration(down), period.seconds) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	const tiers = $derived(
		rows.map((r) => ({
			name: r.name,
			availability: Number(r.a.replace(',', '.')),
			count: Number(r.n)
		}))
	);

	const comp = $derived.by(() => {
		try {
			for (const t of tiers) {
				if (!Number.isInteger(t.count) || t.count < 1 || t.count > 99)
					throw new Error(
						`${t.name || 'Component'}: instances must be a whole number from 1 to 99`
					);
			}
			return { r: composite(tiers) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	const mt = $derived.by((): { f?: number; error?: string } => {
		const a = Number(mtbf.replace(',', '.'));
		const b = Number(mttr.replace(',', '.'));
		if (!mtbf.trim() || !mttr.trim()) return {};
		if (!Number.isFinite(a) || !Number.isFinite(b)) return { error: 'Enter hours as numbers' };
		try {
			return { f: fromMtbf(a, b) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	function addRow() {
		rows.push({ name: `Component ${rows.length + 1}`, a: '99.9', n: '1' });
	}

	function removeRow(i: number) {
		rows.splice(i, 1);
	}

	onMount(() => {
		const h = readHash();
		if (h.in) pct = h.in;
		if (h.d) down = h.d;
		if (h.p && findPeriod(h.p)) periodId = h.p;
		if (h.c) {
			const t = decodeTiers(h.c);
			if (t.length)
				rows = t.map((x) => ({ name: x.name, a: String(x.availability), n: String(x.count) }));
		}
		if (h.mtbf) mtbf = h.mtbf;
		if (h.mttr) mttr = h.mttr;
		ready = true;
	});

	$effect(() => {
		const valid = tiers.every((t) => Number.isFinite(t.availability));
		const state = {
			in: pct,
			d: down,
			p: periodId,
			c: valid ? encodeTiers(tiers) : undefined,
			mtbf,
			mttr
		};
		if (ready) writeHash(state);
	});
</script>

<h2 class="label sect first">Availability to downtime</h2>
<div class="field narrow">
	<label class="label" for="sla-pct">Availability, percent</label>
	<input
		id="sla-pct"
		type="text"
		inputmode="decimal"
		bind:value={pct}
		spellcheck="false"
		autocomplete="off"
	/>
</div>
<div class="row presets" role="group" aria-label="Common targets">
	{#each ['99', '99.5', '99.9', '99.95', '99.99', '99.999'] as v (v)}
		<button type="button" aria-pressed={pct === v} onclick={() => (pct = v)}>{v}</button>
	{/each}
</div>

{#if avail.error}
	<p class="error" role="alert">{avail.error}</p>
{:else if avail.p !== undefined}
	{@const p = avail.p}
	<p class="read">
		<span class="mono strong">{formatPercent(p)}</span><span class="label">{ninesText(p)}</span>
	</p>
	<dl class="readout">
		{#each periods as per (per.id)}
			{@const v = formatDuration(allowedDowntime(p, per.seconds))}
			<div>
				<dt>{per.label}</dt>
				<dd>{v}</dd>
				<Copy value={v} />
			</div>
		{/each}
	</dl>
	<h3 class="label sub">Calendar months</h3>
	<dl class="readout">
		{#each calendarMonths as per (per.id)}
			{@const v = formatDuration(allowedDowntime(p, per.seconds))}
			<div>
				<dt>{per.label}</dt>
				<dd>{v}</dd>
				<Copy value={v} />
			</div>
		{/each}
	</dl>
	<p class="note">
		A year here is 365.25 days ({YEAR.toLocaleString('en-GB')} s), the average including leap years; quarter
		and average month are a quarter and a twelfth of it. An SLA measured per calendar month allows less
		downtime in February than in March, so check which the contract uses.
	</p>
{/if}

<h2 class="label sect">Downtime to availability</h2>
<div class="inputs">
	<div class="field">
		<label class="label" for="sla-down">Downtime</label>
		<input id="sla-down" type="text" bind:value={down} spellcheck="false" autocomplete="off" />
	</div>
	<div class="field">
		<label class="label" for="sla-period">Within</label>
		<select id="sla-period" bind:value={periodId}>
			{#each allPeriods as per (per.id)}
				<option value={per.id}>{per.label}</option>
			{/each}
		</select>
	</div>
</div>
<p class="label hint">Accepts 4h 30m · 52 min · 1.5h · 01:30:00 · a bare number is minutes</p>
{#if back.error}
	<p class="error" role="alert">{back.error}</p>
{:else if back.p !== undefined}
	{@const v = formatPercent(back.p, 5)}
	<dl class="readout">
		<div>
			<dt>Achieved</dt>
			<dd class="strong">{v}</dd>
			<Copy value={v} />
		</div>
		<div>
			<dt>Nines</dt>
			<dd>{ninesText(back.p)}</dd>
		</div>
	</dl>
{/if}

<h2 class="label sect">Composite availability</h2>
<p class="note">
	Tiers in series multiply. Inside a tier, N redundant instances give 1 - (1 - a)<sup>N</sup>. This
	assumes independent failures and instant, perfect failover, so real systems do worse.
</p>
<div class="tiers">
	{#each rows as r, i (i)}
		<fieldset class="tier">
			<legend class="visually-hidden">Component {i + 1}</legend>
			<div class="field">
				<label class="label" for="sla-n-{i}">Component</label>
				<input id="sla-n-{i}" type="text" bind:value={r.name} autocomplete="off" />
			</div>
			<div class="field">
				<label class="label" for="sla-a-{i}">Availability %</label>
				<input id="sla-a-{i}" type="text" inputmode="decimal" bind:value={r.a} autocomplete="off" />
			</div>
			<div class="field">
				<label class="label" for="sla-c-{i}">Instances</label>
				<input id="sla-c-{i}" type="text" inputmode="numeric" bind:value={r.n} autocomplete="off" />
			</div>
			<button
				type="button"
				class="rm"
				onclick={() => removeRow(i)}
				aria-label="Remove {r.name || `component ${i + 1}`}">Remove</button
			>
		</fieldset>
	{/each}
</div>
<div class="row">
	<button type="button" onclick={addRow}>Add component</button>
</div>
{#if comp.error}
	<p class="error" role="alert">{comp.error}</p>
{:else if comp.r}
	{@const r = comp.r}
	<dl class="readout out">
		{#each r.tiers as t, i (i)}
			<div>
				<dt>{t.tier.name || `Component ${i + 1}`}{t.tier.count > 1 ? ` × ${t.tier.count}` : ''}</dt>
				<dd>{formatPercent(t.fraction * 100, 6)}</dd>
			</div>
		{/each}
		<div>
			<dt>System</dt>
			<dd class="strong">{formatPercent(r.fraction * 100, 6)}</dd>
			<Copy value={formatPercent(r.fraction * 100, 6)} />
		</div>
		<div>
			<dt>Downtime per year</dt>
			<dd>{formatDuration(allowedDowntime(r.fraction * 100, YEAR))}</dd>
		</div>
	</dl>
{/if}

<h2 class="label sect">MTBF and MTTR</h2>
<div class="inputs">
	<div class="field">
		<label class="label" for="sla-mtbf">MTBF, hours</label>
		<input id="sla-mtbf" type="text" inputmode="decimal" bind:value={mtbf} autocomplete="off" />
	</div>
	<div class="field">
		<label class="label" for="sla-mttr">MTTR, hours</label>
		<input id="sla-mttr" type="text" inputmode="decimal" bind:value={mttr} autocomplete="off" />
	</div>
</div>
{#if mt.error}
	<p class="error" role="alert">{mt.error}</p>
{:else if mt.f !== undefined}
	{@const v = formatPercent(mt.f * 100, 6)}
	<dl class="readout out">
		<div>
			<dt>Availability</dt>
			<dd class="strong">{v}</dd>
			<Copy value={v} />
		</div>
		<div>
			<dt>Downtime per year</dt>
			<dd>{formatDuration(allowedDowntime(mt.f * 100, YEAR))}</dd>
		</div>
	</dl>
	<p class="note">A = MTBF / (MTBF + MTTR). Steady state, averaged over many failures.</p>
{/if}

<style>
	.sect {
		margin: 2rem 0 0.75rem;
	}
	.first {
		margin-top: 0;
	}
	.sub {
		margin: 1.25rem 0 0.5rem;
	}
	.narrow {
		max-width: 20rem;
	}
	.presets {
		margin: 0.75rem 0;
	}
	.inputs {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
		gap: 1rem;
	}
	.hint {
		margin: 0.35rem 0 0.75rem;
		text-transform: none;
		letter-spacing: 0.02em;
	}
	.read {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.75rem;
		align-items: baseline;
		margin: 0.75rem 0;
	}
	.strong {
		font-weight: 700;
		color: var(--signal);
	}
	.note {
		margin: 1rem 0;
	}
	.tiers {
		display: grid;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}
	.tier {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
		gap: 0.5rem 0.75rem;
		align-items: end;
		border: 0;
		border-bottom: 1px solid var(--rule-soft);
		padding: 0 0 0.75rem;
		margin: 0;
		min-width: 0;
	}
	.rm {
		justify-self: start;
	}
	.out {
		margin-top: 1rem;
	}
</style>
