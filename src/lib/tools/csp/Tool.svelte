<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		DIRECTIVES,
		analyse,
		build,
		defaultRows,
		describeSource,
		examples,
		parsePolicy,
		type BuilderRow,
		type Finding,
		type Policy
	} from './logic';

	type Mode = 'read' | 'build';
	let mode = $state<Mode>('read');
	let input = $state('');
	let rows = $state<BuilderRow[]>(defaultRows());
	let forMeta = $state(false);
	let ready = false;

	const parsed = $derived.by((): { p?: Policy; error?: string } => {
		if (!input.trim()) return {};
		try {
			return { p: parsePolicy(input) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});
	const findings = $derived(parsed.p ? analyse(parsed.p) : []);

	const built = $derived(build(rows, forMeta));
	const builtOut = $derived(
		forMeta
			? `<meta http-equiv="Content-Security-Policy" content="${built}">`
			: `Content-Security-Policy: ${built}`
	);
	const builtFindings = $derived.by(() => {
		try {
			const p = parsePolicy(built);
			p.fromMeta = forMeta;
			return analyse(p);
		} catch {
			return [];
		}
	});

	const order: Record<Finding['level'], number> = { danger: 0, warn: 1, info: 2 };
	const sorted = (f: Finding[]) => [...f].sort((a, b) => order[a.level] - order[b.level]);
	const levelText: Record<Finding['level'], string> = {
		danger: 'Risk',
		warn: 'Check',
		info: 'Note'
	};

	function reset() {
		rows = defaultRows();
	}

	onMount(() => {
		const h = readHash();
		if (h.in) input = h.in;
		if (h.m === 'build') mode = 'build';
		ready = true;
	});

	$effect(() => {
		const state = { in: input, m: mode === 'build' ? 'build' : undefined };
		if (ready) writeHash(state);
	});
</script>

{#snippet list(items: Finding[])}
	{#if items.length}
		<ul class="findings">
			{#each sorted(items) as f, i (i)}
				<li class={f.level}><span class="lvl">{levelText[f.level]}</span> {f.text}</li>
			{/each}
		</ul>
	{/if}
{/snippet}

<div class="row opts" role="group" aria-label="Mode">
	<button type="button" aria-pressed={mode === 'read'} onclick={() => (mode = 'read')}
		>Explain a policy</button
	>
	<button type="button" aria-pressed={mode === 'build'} onclick={() => (mode = 'build')}
		>Build a policy</button
	>
</div>

{#if mode === 'read'}
	<div class="field">
		<label class="label" for="csp-in">Policy: header value, header line or meta tag</label>
		<textarea
			id="csp-in"
			bind:value={input}
			spellcheck="false"
			autocomplete="off"
			autocapitalize="off"
			placeholder="default-src 'self'; script-src 'self' 'nonce-...'; object-src 'none'"></textarea>
	</div>
	<div class="row examples" role="group" aria-label="Examples">
		<span class="label">Examples</span>
		{#each examples as ex (ex.label)}
			<button type="button" onclick={() => (input = ex.value)}>{ex.label}</button>
		{/each}
	</div>

	{#if parsed.error}
		<p class="error" role="alert">{parsed.error}</p>
	{/if}

	{#if parsed.p}
		{@const p = parsed.p}
		<p class="label meta">
			{p.fromMeta ? 'Delivered in a meta tag' : 'Delivered as an HTTP header'}{p.reportOnly
				? ', report-only'
				: ''} · {p.directives.length} directive{p.directives.length === 1 ? '' : 's'}
		</p>
		{@render list(findings)}

		<div class="dirs">
			{#each p.directives as d, i (i)}
				<section class="dir" class:dup={d.duplicate} aria-label={d.name}>
					<h2 class="mono dname">
						{d.name}{#if d.duplicate}<span class="tag">ignored</span>{/if}
					</h2>
					<p class="dtext">{DIRECTIVES[d.name]?.text ?? 'Unknown directive.'}</p>
					{#if d.sources.length}
						<dl class="readout">
							{#each d.sources as s, j (j)}
								<div>
									<dt class="src">{s}</dt>
									<dd class="plain">{describeSource(s)}</dd>
								</div>
							{/each}
						</dl>
					{/if}
				</section>
			{/each}
		</div>
	{/if}

	<p class="note">
		Directives without their own value fall back to default-src, but base-uri, form-action and
		frame-ancestors do not. When a page has a header and a meta policy, both apply and the stricter
		wins. The examples show this site's own policy (hashes shortened).
	</p>
{:else}
	<p class="note">
		Defaults suit a site that serves all its own assets. Edit sources, untick what you do not need,
		then copy the result. Add a nonce or hash to script-src for inline scripts instead of
		'unsafe-inline'.
	</p>
	<div class="rows">
		{#each rows as r, i (r.name)}
			<div class="brow">
				<label class="check">
					<input type="checkbox" bind:checked={rows[i].on} />
					<span class="mono">{r.name}</span>
				</label>
				{#if r.name !== 'upgrade-insecure-requests'}
					<input
						type="text"
						aria-label="{r.name} sources"
						bind:value={rows[i].value}
						disabled={!r.on}
						spellcheck="false"
						autocomplete="off"
						autocapitalize="off"
					/>
				{/if}
			</div>
		{/each}
	</div>
	<div class="row opts" role="group" aria-label="Output">
		<span class="label">Deliver as</span>
		<button type="button" aria-pressed={!forMeta} onclick={() => (forMeta = false)}>Header</button>
		<button type="button" aria-pressed={forMeta} onclick={() => (forMeta = true)}>Meta tag</button>
		<button type="button" onclick={reset}>Reset defaults</button>
	</div>
	<div class="field">
		<div class="row between">
			<span class="label">Result</span>
			<div class="row">
				<Copy value={built} label="Copy value" />
				<Copy value={builtOut} label={forMeta ? 'Copy tag' : 'Copy line'} />
			</div>
		</div>
		<pre>{builtOut}</pre>
	</div>
	{#if forMeta}
		<p class="note">
			frame-ancestors, report-uri, report-to and sandbox are left out: browsers ignore them in a
			meta tag.
		</p>
	{/if}
	{@render list(builtFindings)}
{/if}

<style>
	.opts,
	.examples {
		margin: 0.75rem 0 1rem;
	}
	.between {
		justify-content: space-between;
	}
	.meta {
		margin: 1rem 0 0.5rem;
	}
	.findings {
		list-style: none;
		padding: 0;
		margin: 0.75rem 0 1.25rem;
		display: grid;
		gap: 0.4rem;
	}
	.findings li {
		font-size: 0.9375rem;
		border-left: 3px solid var(--rule-soft);
		padding: 0.2rem 0 0.2rem 0.6rem;
		color: var(--ink-2);
		overflow-wrap: anywhere;
	}
	.findings .warn {
		border-left-color: var(--signal);
		color: var(--ink);
	}
	.findings .danger {
		border-left-color: var(--signal);
		color: var(--signal);
		font-weight: 700;
	}
	.lvl {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.dirs {
		display: grid;
		gap: 1.25rem;
		margin-bottom: 1.5rem;
	}
	.dname {
		font-size: 1.0625rem;
		overflow-wrap: anywhere;
	}
	.dup {
		opacity: 0.6;
	}
	.dtext {
		margin: 0.2rem 0 0.4rem;
		color: var(--ink-2);
	}
	.src {
		text-transform: none;
		letter-spacing: 0;
		font-size: 0.875rem;
		color: var(--ink);
		overflow-wrap: anywhere;
	}
	.plain {
		font-family: var(--font-body);
		font-size: 0.9375rem;
	}
	.tag {
		margin-left: 0.5rem;
		padding: 0 0.3rem;
		font-size: 0.75rem;
		text-transform: uppercase;
		background: var(--hilite);
	}
	.rows {
		display: grid;
		gap: 0.4rem;
		margin: 1rem 0;
		border-top: 2px solid var(--rule);
		padding-top: 0.5rem;
	}
	.brow {
		display: grid;
		grid-template-columns: minmax(12rem, 16rem) 1fr;
		gap: 0.25rem 1rem;
		align-items: center;
	}
	.check {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 2.75rem;
		cursor: pointer;
	}
	.check input {
		width: 1.25rem;
		height: 1.25rem;
		accent-color: var(--signal);
	}
	input[type='text']:disabled {
		opacity: 0.45;
	}
	pre {
		margin: 0 0 1rem;
		padding: 0.65rem 0.75rem;
		background: var(--field);
		border: 1px solid var(--rule);
		font-size: 0.875rem;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	@media (max-width: 40rem) {
		.brow {
			grid-template-columns: 1fr;
		}
	}
</style>
