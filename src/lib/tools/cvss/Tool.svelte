<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		buildVector,
		metricsFor,
		parseVector,
		scoreV3,
		severity,
		v3BaseKeys,
		v4BaseKeys,
		v4Nomenclature,
		type MetricDef,
		type Version
	} from './logic';

	let vectorText = $state('');
	let version = $state<Version>('3.1');
	let values = $state<Record<string, string>>({});
	let parseError = $state('');
	let warnings = $state<string[]>([]);
	let open = $state<Record<string, boolean>>({ Base: true });
	let ready = false;

	function fromText() {
		const t = vectorText.trim();
		if (!t) {
			parseError = '';
			warnings = [];
			values = {};
			return;
		}
		try {
			const p = parseVector(t);
			version = p.version;
			values = p.values;
			warnings = p.warnings;
			parseError = '';
			for (const d of metricsFor(p.version))
				if (p.values[d.key] && p.values[d.key] !== 'X') open[d.group.split(':')[0]] = true;
		} catch (e) {
			parseError = (e as Error).message;
			warnings = [];
		}
	}

	function pick(key: string, v: string) {
		values = { ...values, [key]: v };
		vectorText = buildVector(version, values);
		parseError = '';
		warnings = version === '3.0' ? warnings : [];
	}

	function setVersion(v: Version) {
		if (v === version) return;
		version = v;
		values = {};
		vectorText = '';
		parseError = '';
		warnings = [];
	}

	const defs = $derived(metricsFor(version));
	const groups = $derived.by(() => {
		const out: { name: string; metrics: MetricDef[] }[] = [];
		for (const d of defs) {
			const top = d.group.split(':')[0];
			let g = out.find((x) => x.name === top);
			if (!g) out.push((g = { name: top, metrics: [] }));
			g.metrics.push(d);
		}
		return out;
	});
	const baseKeys = $derived(version === '4.0' ? v4BaseKeys : v3BaseKeys);
	const missing = $derived(baseKeys.filter((k) => !values[k]));
	const scores = $derived(
		version !== '4.0' && missing.length === 0 && !parseError ? scoreV3(values) : null
	);
	const canonical = $derived(missing.length === 0 ? buildVector(version, values) : '');
	const selected = $derived(defs.filter((d) => values[d.key] && values[d.key] !== 'X'));
	const hasGroup = (g: string) =>
		defs.some((d) => d.group.startsWith(g) && values[d.key] && values[d.key] !== 'X');

	onMount(() => {
		const h = readHash();
		const v = h.in ?? h.v;
		if (v) {
			vectorText = v;
			fromText();
		}
		ready = true;
	});

	$effect(() => {
		const v = vectorText.trim();
		if (ready) writeHash({ v: v || undefined });
	});
</script>

<div class="field">
	<div class="row between">
		<label class="label" for="cvss-in">Vector string</label>
		<Copy value={canonical} />
	</div>
	<input
		id="cvss-in"
		type="text"
		bind:value={vectorText}
		oninput={fromText}
		spellcheck="false"
		autocomplete="off"
		autocapitalize="off"
		placeholder="CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"
	/>
</div>
{#if parseError}<p class="error" role="alert">{parseError}</p>{/if}
{#each warnings as w (w)}<p class="note">{w}</p>{/each}

<div class="row opts" role="group" aria-label="CVSS version">
	<span class="label">Version</span>
	<button
		type="button"
		aria-pressed={version === '3.1' || version === '3.0'}
		onclick={() => setVersion('3.1')}>{version === '3.0' ? '3.0 (read as 3.1)' : '3.1'}</button
	>
	<button type="button" aria-pressed={version === '4.0'} onclick={() => setVersion('4.0')}
		>4.0</button
	>
</div>

{#if scores}
	{@const envSet = hasGroup('Environmental')}
	{@const tempSet = hasGroup('Temporal')}
	<div class="scores">
		<div class="score main">
			<span class="label">Base</span>
			<span class="num">{scores.base.toFixed(1)}</span>
			<span class="sev sev-{severity(scores.base).toLowerCase()}">{severity(scores.base)}</span>
		</div>
		<div class="score" class:dim={!tempSet}>
			<span class="label">Temporal</span>
			<span class="num">{scores.temporal.toFixed(1)}</span>
			<span class="sev sev-{severity(scores.temporal).toLowerCase()}"
				>{severity(scores.temporal)}</span
			>
		</div>
		<div class="score" class:dim={!envSet}>
			<span class="label">Environmental</span>
			<span class="num">{scores.environmental.toFixed(1)}</span>
			<span class="sev sev-{severity(scores.environmental).toLowerCase()}"
				>{severity(scores.environmental)}</span
			>
		</div>
	</div>
	<dl class="readout">
		<div>
			<dt>Impact subscore</dt>
			<dd>{scores.impact <= 0 ? '0.0' : scores.impact.toFixed(1)}</dd>
		</div>
		<div>
			<dt>Exploitability subscore</dt>
			<dd>{scores.exploitability.toFixed(1)}</dd>
		</div>
		{#if envSet}
			<div>
				<dt>Modified impact</dt>
				<dd>{scores.modifiedImpact <= 0 ? '0.0' : scores.modifiedImpact.toFixed(1)}</dd>
			</div>
			<div>
				<dt>Modified exploitability</dt>
				<dd>{scores.modifiedExploitability.toFixed(1)}</dd>
			</div>
		{/if}
		<div>
			<dt>Vector</dt>
			<dd>{canonical}</dd>
			<Copy value={canonical} />
		</div>
	</dl>
{:else if version === '4.0' && missing.length === 0 && !parseError}
	<div class="v4">
		<p class="label">{v4Nomenclature(values)}, CVSS v4.0</p>
		<p class="note">
			Scoring v4.0 is not implemented here. A v4.0 score comes from the specification's MacroVector
			lookup table and interpolation, not from a formula; use FIRST's official v4.0 calculator for
			the number. Below is what each metric in the vector means.
		</p>
	</div>
{:else if missing.length && !parseError}
	<p class="note">
		Pick every base metric (or paste a vector). Missing: {missing.join(', ')}.
	</p>
{/if}

{#if version === '4.0' && selected.length}
	<dl class="readout explain">
		{#each selected as d (d.key)}
			<div>
				<dt>{d.key}: {d.name}</dt>
				<dd>{d.values[values[d.key]]}. <span class="dim">{d.help}</span></dd>
			</div>
		{/each}
	</dl>
{/if}

{#each groups as g (g.name)}
	<details class="group" bind:open={open[g.name]}>
		<summary class="label">{g.name} metrics</summary>
		{#each g.metrics as d (d.key)}
			<div class="metric" role="group" aria-label={d.name}>
				<span class="mname"><span class="mono">{d.key}</span> {d.name}</span>
				<div class="row">
					{#each Object.entries(d.values) as [k, label] (k)}
						<button
							type="button"
							class="val"
							aria-pressed={(values[d.key] ?? (k === 'X' ? 'X' : '')) === k}
							title={label}
							onclick={() => pick(d.key, k)}>{label}</button
						>
					{/each}
				</div>
			</div>
		{/each}
	</details>
{/each}

<p class="note">
	Scores use the CVSS v3.1 specification equations, including its Roundup function, which rounds up
	to one decimal using integer arithmetic so that floating point noise cannot push a score up a
	tenth. Severity: 0.0 None, 0.1 to 3.9 Low, 4.0 to 6.9 Medium, 7.0 to 8.9 High, 9.0 to 10.0
	Critical. Temporal and environmental equal the base score until those metrics are set.
</p>

<style>
	.between {
		justify-content: space-between;
	}
	.opts {
		margin: 1rem 0;
	}
	.note {
		margin-top: 0.75rem;
	}
	.scores {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
		gap: 0.75rem;
		margin: 1.25rem 0;
	}
	.score {
		display: grid;
		gap: 0.25rem;
		padding: 0.75rem;
		border: 1px solid var(--rule);
		background: var(--field);
	}
	.score.main {
		border-width: 2px;
	}
	.score.dim {
		opacity: 0.7;
	}
	.num {
		font-family: var(--font-mono);
		font-size: 2.25rem;
		font-weight: 700;
		line-height: 1;
	}
	.sev {
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		justify-self: start;
		padding: 0.1rem 0.4rem;
		border: 1px solid var(--rule);
	}
	.sev-high {
		background: var(--hilite);
	}
	.sev-critical {
		background: var(--signal);
		color: var(--signal-ink);
		border-color: var(--signal);
	}
	.readout {
		margin: 1.25rem 0;
	}
	.dim {
		color: var(--ink-2);
	}
	.v4 {
		margin: 1.25rem 0;
	}
	.group {
		margin: 1rem 0;
		border-top: 2px solid var(--rule);
		padding-top: 0.5rem;
	}
	.group summary {
		cursor: pointer;
		min-height: 2.75rem;
		display: flex;
		align-items: center;
	}
	.metric {
		display: grid;
		gap: 0.35rem;
		padding: 0.5rem 0;
		border-bottom: 1px solid var(--rule-soft);
	}
	.mname {
		font-size: 0.9375rem;
	}
	.val {
		text-transform: none;
		letter-spacing: 0;
	}
</style>
