<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		fmtCpu,
		fmtResource,
		looksLikeResources,
		memoryViews,
		parseQuantity,
		parseResources,
		qosClass,
		totals,
		warnings,
		type Kind
	} from './logic';

	const SAMPLE = `containers:
  - name: app
    resources:
      requests:
        cpu: 250m
        memory: 256Mi
      limits:
        cpu: "1"
        memory: 512Mi
  - name: sidecar
    resources:
      limits: {cpu: 100m, memory: 64Mi}`;

	type Mode = 'qty' | 'sum';
	let mode = $state<Mode>('qty');
	let qty = $state('128M');
	let kind = $state<Kind>('memory');
	let yaml = $state(SAMPLE);
	let replicas = $state('1');
	let ready = false;

	const q = $derived.by(() => {
		if (!qty.trim()) return null;
		try {
			const p = parseQuantity(qty);
			return { p, w: warnings(p, kind) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	const sum = $derived.by(() => {
		if (!yaml.trim()) return null;
		const r = parseResources(yaml);
		const n = Number(replicas || '1');
		const rep = Number.isInteger(n) && n >= 1 ? n : 1;
		return {
			r,
			rep,
			repError: rep !== n ? 'Replicas must be a whole number, 1 or more' : '',
			t: totals(r.containers, rep),
			qos: r.containers.length ? qosClass(r.containers) : null
		};
	});

	onMount(() => {
		const h = readHash();
		if (h.m === 'sum') mode = 'sum';
		if (h.k === 'cpu') kind = 'cpu';
		if (h.q) qty = h.q;
		if (h.y) yaml = h.y;
		if (h.r) replicas = h.r;
		if (h.in) {
			if (looksLikeResources(h.in)) {
				yaml = h.in;
				mode = 'sum';
			} else qty = h.in;
		}
		ready = true;
	});

	$effect(() => {
		const state = {
			m: mode === 'sum' ? 'sum' : undefined,
			q: mode === 'qty' ? qty : undefined,
			k: mode === 'qty' && kind === 'cpu' ? 'cpu' : undefined,
			y: mode === 'sum' && yaml !== SAMPLE ? yaml : undefined,
			r: mode === 'sum' && replicas !== '1' ? replicas : undefined
		};
		if (ready) writeHash(state);
	});
</script>

<div class="row modes" role="group" aria-label="Mode">
	<button type="button" aria-pressed={mode === 'qty'} onclick={() => (mode = 'qty')}
		>One quantity</button
	>
	<button type="button" aria-pressed={mode === 'sum'} onclick={() => (mode = 'sum')}
		>Sum resources</button
	>
</div>

{#if mode === 'qty'}
	<div class="field">
		<label class="label" for="k8s-q">Quantity</label>
		<input
			id="k8s-q"
			type="text"
			bind:value={qty}
			spellcheck="false"
			autocomplete="off"
			autocapitalize="off"
		/>
	</div>
	<div class="row kinds" role="group" aria-label="Resource">
		<span class="label">Resource</span>
		<button type="button" aria-pressed={kind === 'memory'} onclick={() => (kind = 'memory')}
			>Memory</button
		>
		<button type="button" aria-pressed={kind === 'cpu'} onclick={() => (kind = 'cpu')}>CPU</button>
	</div>

	{#if q?.error}
		<p class="error" role="alert">{q.error}</p>
	{:else if q?.p}
		{@const p = q.p}
		{#each q.w as w (w.text)}
			<p class="warn">{w.text}</p>
		{/each}
		{#if kind === 'cpu'}
			<dl class="readout">
				<div>
					<dt>CPU</dt>
					<dd>{fmtCpu(p.nano)}</dd>
					<Copy value={fmtCpu(p.nano)} />
				</div>
			</dl>
		{:else}
			{@const v = memoryViews(p.nano)}
			<dl class="readout">
				<div>
					<dt>Bytes</dt>
					<dd>{v.bytes}</dd>
					<Copy value={v.bytes} />
				</div>
				{#each v.binary as b (b.unit)}
					<div>
						<dt>{b.unit} (1024ⁿ)</dt>
						<dd>{b.value}{b.unit}</dd>
						<Copy value={b.value + b.unit} />
					</div>
				{/each}
				{#each v.decimal as b (b.unit)}
					<div>
						<dt>{b.unit} (1000ⁿ)</dt>
						<dd>{b.value}{b.unit}</dd>
						<Copy value={b.value + b.unit} />
					</div>
				{/each}
			</dl>
		{/if}
	{/if}
	<p class="note">
		Memory: Ki, Mi, Gi are powers of 1024, k, M, G powers of 1000. Lowercase m means milli: 400m of
		memory is 0.4 bytes. CPU: 1 is one core (vCPU), 500m is half a core, 1m is the finest step.
	</p>
{:else}
	<div class="field">
		<label class="label" for="k8s-y">resources: blocks or kubectl describe output</label>
		<textarea id="k8s-y" class="tall" bind:value={yaml} spellcheck="false"></textarea>
	</div>
	<div class="field reps">
		<label class="label" for="k8s-r">Replicas</label>
		<input id="k8s-r" type="text" inputmode="numeric" bind:value={replicas} autocomplete="off" />
	</div>

	{#if sum}
		{#each sum.r.errors as e (e)}
			<p class="error" role="alert">{e}</p>
		{/each}
		{#if sum.repError}<p class="error" role="alert">{sum.repError}</p>{/if}
		{#if sum.qos}
			<p class="say">
				QoS class <strong>{sum.qos.qos}</strong><span class="why">{sum.qos.reason}</span>
			</p>
		{/if}
		{#if sum.t.resources.length}
			<div class="scroll">
				<table>
					<caption class="label"
						>Totals for {sum.r.containers.length} container{sum.r.containers.length === 1
							? ''
							: 's'}{sum.rep > 1 ? ` × ${sum.rep} replicas` : ''}</caption
					>
					<thead>
						<tr>
							<th scope="col">Resource</th>
							<th scope="col">Requests</th>
							<th scope="col">Limits</th>
						</tr>
					</thead>
					<tbody>
						{#each sum.t.resources as r (r)}
							{@const lim = sum.t.limits[r]}
							<tr>
								<th scope="row">{r}</th>
								<td class="mono">{fmtResource(r, sum.t.requests[r])}</td>
								<td class="mono">{lim === null ? 'unbounded' : fmtResource(r, lim)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<div class="scroll">
				<table>
					<caption class="label">Per container, requests / limits</caption>
					<thead>
						<tr>
							<th scope="col">Container</th>
							{#each sum.t.resources as r (r)}<th scope="col">{r}</th>{/each}
						</tr>
					</thead>
					<tbody>
						{#each sum.r.containers as c, i (i)}
							<tr>
								<th scope="row">{c.name}</th>
								{#each sum.t.resources as r (r)}
									{@const req = c.requests[r] ?? c.limits[r]}
									<td class="mono small"
										>{req === undefined ? '–' : fmtResource(r, req)} / {c.limits[r] === undefined
											? '–'
											: fmtResource(r, c.limits[r])}</td
									>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	{/if}
	<p class="note">
		A container with only a limit gets a request equal to that limit. Guaranteed: every container
		has CPU and memory limits equal to its requests. BestEffort: no CPU or memory requests or limits
		at all. Anything else is Burstable. Under node pressure BestEffort pods are evicted first and
		Guaranteed pods are the least likely to go.
	</p>
{/if}

<style>
	.modes {
		margin-bottom: 1.25rem;
	}
	.kinds {
		margin: 0.75rem 0 1.25rem;
	}
	.warn {
		margin: 0 0 0.75rem;
		padding: 0.35rem 0.6rem;
		border-left: 4px solid var(--signal);
		background: var(--hilite);
		font-size: 0.9375rem;
		overflow-wrap: anywhere;
	}
	.readout {
		margin-bottom: 1.25rem;
	}
	.tall {
		min-height: 14rem;
	}
	.reps {
		max-width: 10rem;
		margin: 0.75rem 0 1.25rem;
	}
	.error {
		margin: 0 0 0.75rem;
	}
	.say {
		font-size: 1.25rem;
		margin: 0 0 1.25rem;
		padding: 0.5rem 0.75rem;
		border-left: 4px solid var(--signal);
		background: var(--hilite);
	}
	.why {
		display: block;
		font-size: 0.875rem;
		color: var(--ink-2);
	}
	.scroll {
		overflow-x: auto;
		margin-bottom: 1.5rem;
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
		text-transform: none;
		letter-spacing: 0;
		font-size: 0.875rem;
		color: var(--ink);
	}
	.small {
		font-size: 0.8125rem;
		white-space: nowrap;
	}
	.note {
		margin: 0 0 1rem;
	}
</style>
