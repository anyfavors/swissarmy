<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		lookup,
		normaliseName,
		resolvers,
		TIMEOUT_MS,
		type LookupResult,
		type ResolverId
	} from '../dns/logic';
	import {
		buildDmarc,
		defaultFields,
		dmarcName,
		fieldsFrom,
		parseDmarc,
		policies,
		type DmarcFields,
		type ParsedDmarc
	} from './logic';

	type Mode = 'explain' | 'build';

	let mode = $state<Mode>('explain');
	let record = $state('v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com; adkim=s');
	let domain = $state('example.com');
	let fields = $state<DmarcFields>({ ...defaultFields, rua: 'dmarc@example.com' });
	let resolver = $state<ResolverId>('cloudflare');
	let busy = $state(false);
	let result = $state<LookupResult | null>(null);
	let ready = false;
	let seq = 0;

	const name = $derived(dmarcName(domain));
	const cleanDomain = $derived(
		domain
			.trim()
			.replace(/^_dmarc\./i, '')
			.replace(/\.$/, '')
	);

	const built = $derived.by((): { value?: string; error?: string } => {
		try {
			return { value: buildDmarc(fields) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	const shown = $derived(mode === 'build' ? (built.value ?? '') : record);

	const parsed = $derived.by((): { p?: ParsedDmarc; error?: string } => {
		if (!shown.trim()) return {};
		try {
			return { p: parseDmarc(shown, cleanDomain) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	const queryName = $derived.by((): { n?: string; error?: string } => {
		if (!cleanDomain) return {};
		try {
			return { n: normaliseName(`_dmarc.${cleanDomain}`) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	const found = $derived(
		result?.answer?.answer.filter((r) => r.typeName === 'TXT').map((r) => r.display) ?? []
	);
	const dmarcFound = $derived(found.filter((t) => /^v=DMARC1/i.test(t.trim())));

	async function look() {
		const n = queryName.n;
		if (!n || busy) return;
		const id = ++seq;
		busy = true;
		result = null;
		const r = await lookup(resolver, { name: n, type: 'TXT' });
		if (id !== seq) return;
		result = r;
		busy = false;
	}

	function toBuilder() {
		if (parsed.p) fields = fieldsFrom(parsed.p);
		mode = 'build';
	}

	function toExplain() {
		if (built.value) record = built.value;
		mode = 'explain';
	}

	function toggleFo(v: string) {
		fields.fo = fields.fo.includes(v) ? fields.fo.filter((x) => x !== v) : [...fields.fo, v];
	}

	onMount(() => {
		const h = readHash();
		if (h.in) record = h.in;
		if (h.d !== undefined) domain = h.d;
		if (h.r === 'google') resolver = 'google';
		if (h.m === 'build') {
			try {
				fields = fieldsFrom(parseDmarc(record));
			} catch {
				/* keep defaults */
			}
			mode = 'build';
		}
		ready = true;
	});

	$effect(() => {
		const state = {
			in: shown,
			d: domain,
			m: mode === 'build' ? 'build' : undefined,
			r: resolver === 'google' ? 'google' : undefined
		};
		if (ready) writeHash(state);
	});

	const foOptions: [string, string][] = [
		['0', 'Both fail (default)'],
		['1', 'Either fails'],
		['d', 'DKIM fails'],
		['s', 'SPF fails']
	];
</script>

<div class="row opts" role="group" aria-label="Mode">
	<span class="label">Mode</span>
	<button type="button" aria-pressed={mode === 'explain'} onclick={toExplain}>Explain</button>
	<button type="button" aria-pressed={mode === 'build'} onclick={toBuilder}>Build</button>
</div>

<div class="field">
	<label class="label" for="dmarc-domain">Domain</label>
	<input
		id="dmarc-domain"
		type="text"
		bind:value={domain}
		spellcheck="false"
		autocomplete="off"
		autocapitalize="off"
		inputmode="url"
	/>
</div>

{#if mode === 'explain'}
	<div class="field gap">
		<label class="label" for="dmarc-rec">DMARC record (TXT value)</label>
		<textarea id="dmarc-rec" rows="3" bind:value={record} spellcheck="false"></textarea>
	</div>

	<div class="row opts" role="group" aria-label="Look up">
		<span class="label">Resolver</span>
		{#each Object.values(resolvers) as r (r.id)}
			<button type="button" aria-pressed={resolver === r.id} onclick={() => (resolver = r.id)}
				>{r.label}</button
			>
		{/each}
		<button type="button" class="go" disabled={!queryName.n || busy} onclick={look}
			>{busy ? 'Looking up' : 'Look up'}</button
		>
	</div>
	{#if queryName.error}
		<p class="error" role="alert">{queryName.error}</p>
	{:else if queryName.n}
		<p class="note">
			Look up sends GET {resolvers[resolver].endpoint}?name={queryName.n}&type=TXT. Nothing is sent
			before you press it.
		</p>
	{/if}

	<div aria-live="polite">
		{#if busy}<p class="label wait">Waiting up to {TIMEOUT_MS / 1000} s</p>{/if}
	</div>

	{#if result}
		<section class="lookup">
			<h2 class="label">Queries sent (1)</h2>
			<p class="mono sent">
				GET {result.url}
				<span class="dim"
					>{result.error ? 'failed' : result.answer?.statusName} {Math.round(result.ms)} ms</span
				>
			</p>
			{#if result.error}
				<p class="error" role="alert">{result.error}</p>
			{:else if !dmarcFound.length}
				<p class="note">
					No DMARC record at {result.query.name}. Receivers then look at the organisational domain
					(the registered domain above it), and with nothing there, apply no DMARC policy.
				</p>
			{:else}
				{#if dmarcFound.length > 1}
					<p class="error" role="alert">
						{dmarcFound.length} DMARC records: receivers ignore all of them. Keep exactly one.
					</p>
				{/if}
				{#each dmarcFound as t, i (i)}
					<div class="found">
						<span class="mono">{t}</span>
						<button type="button" onclick={() => (record = t)}>Explain this</button>
					</div>
				{/each}
			{/if}
		</section>
	{/if}
{:else}
	<div class="grid gap">
		<div class="field">
			<label class="label" for="dmarc-p">Policy p=</label>
			<select id="dmarc-p" bind:value={fields.p}>
				{#each policies as p (p)}<option value={p}>{p}</option>{/each}
			</select>
		</div>
		<div class="field">
			<label class="label" for="dmarc-sp">Subdomains sp=</label>
			<select id="dmarc-sp" bind:value={fields.sp}>
				<option value="">same as p</option>
				{#each policies as p (p)}<option value={p}>{p}</option>{/each}
			</select>
		</div>
		<div class="field">
			<label class="label" for="dmarc-np">Non-existent subdomains np= (DMARCbis)</label>
			<select id="dmarc-np" bind:value={fields.np}>
				<option value="">same as sp</option>
				{#each policies as p (p)}<option value={p}>{p}</option>{/each}
			</select>
		</div>
		<div class="field">
			<label class="label" for="dmarc-pct">Percentage pct=</label>
			<input id="dmarc-pct" type="text" inputmode="numeric" bind:value={fields.pct} />
		</div>
		<div class="field">
			<label class="label" for="dmarc-adkim">DKIM alignment adkim=</label>
			<select id="dmarc-adkim" bind:value={fields.adkim}>
				<option value="r">relaxed (default)</option>
				<option value="s">strict</option>
			</select>
		</div>
		<div class="field">
			<label class="label" for="dmarc-aspf">SPF alignment aspf=</label>
			<select id="dmarc-aspf" bind:value={fields.aspf}>
				<option value="r">relaxed (default)</option>
				<option value="s">strict</option>
			</select>
		</div>
		<div class="field">
			<label class="label" for="dmarc-rua">Aggregate reports rua=</label>
			<input
				id="dmarc-rua"
				type="text"
				bind:value={fields.rua}
				placeholder="dmarc@example.com"
				spellcheck="false"
				autocapitalize="off"
			/>
		</div>
		<div class="field">
			<label class="label" for="dmarc-ruf">Failure reports ruf=</label>
			<input
				id="dmarc-ruf"
				type="text"
				bind:value={fields.ruf}
				spellcheck="false"
				autocapitalize="off"
			/>
		</div>
		<div class="field">
			<label class="label" for="dmarc-ri">Report interval ri= (seconds)</label>
			<input
				id="dmarc-ri"
				type="text"
				inputmode="numeric"
				bind:value={fields.ri}
				placeholder="86400"
			/>
		</div>
	</div>
	<div class="row opts" role="group" aria-label="Failure reporting options fo=">
		<span class="label">fo=</span>
		{#each foOptions as [v, l] (v)}
			<button type="button" aria-pressed={fields.fo.includes(v)} onclick={() => toggleFo(v)}
				>{v}: {l}</button
			>
		{/each}
	</div>

	{#if built.error}
		<p class="error" role="alert">{built.error}</p>
	{:else}
		<dl class="readout">
			<div>
				<dt>Name</dt>
				<dd>{name}</dd>
				<Copy value={name} />
			</div>
			<div>
				<dt>Type</dt>
				<dd>TXT</dd>
				<span></span>
			</div>
			<div>
				<dt>Value</dt>
				<dd>{built.value}</dd>
				<Copy value={built.value ?? ''} />
			</div>
		</dl>
	{/if}
{/if}

{#if parsed.error}
	<p class="error" role="alert">{parsed.error}</p>
{:else if parsed.p}
	{@const p = parsed.p}
	{#if p.findings.length}
		<ul class="findings">
			{#each p.findings as f, i (i)}
				<li class="lv-{f.level}"><span class="lvl">{f.level}</span> {f.text}</li>
			{/each}
		</ul>
	{/if}
	<dl class="readout tags">
		{#each p.tags as t, i (i)}
			<div class:bad={!!t.error}>
				<dt>
					{t.tag}={#if t.info}<span class="tname">{t.info.name}</span>{/if}
					{#if t.info && t.info.source !== 'RFC 7489'}<span class="src">{t.info.source}</span>{/if}
				</dt>
				<dd>
					<span class="val">{t.value}</span>
					{#if t.explain}<span class="ex">{t.explain}</span>{/if}
					{#if t.error}<span class="ex err">{t.error}</span>{/if}
				</dd>
				<span></span>
			</div>
		{/each}
	</dl>
	{#if mode === 'explain'}
		<button type="button" class="edit" onclick={toBuilder}>Edit in builder</button>
	{/if}
	<dl class="readout">
		<div>
			<dt>Effective policy</dt>
			<dd>
				domain {p.effective.p ?? 'none (record ignored)'}, subdomains {p.effective.sp ?? 'none'},
				non-existent
				{p.effective.np ?? 'none'}{p.effective.pct < 100 ? `, applied to ${p.effective.pct}%` : ''}
			</dd>
			<span></span>
		</div>
		<div>
			<dt>Alignment</dt>
			<dd>
				DKIM {p.effective.adkim === 's' ? 'strict' : 'relaxed'}, SPF {p.effective.aspf === 's'
					? 'strict'
					: 'relaxed'}
			</dd>
			<span></span>
		</div>
	</dl>
{/if}

<p class="note foot">
	DMARC passes when SPF or DKIM passes for a domain that matches the From: address (aligned). The
	record lives in TXT at _dmarc.&lt;domain&gt;. Tags marked DMARCbis come from the successor draft
	to RFC 7489 (np= also from RFC 9091); older receivers ignore them. DMARCbis drops pct, rf and ri.
</p>

<style>
	.opts {
		margin: 1rem 0;
	}
	.gap {
		margin-top: 1rem;
	}
	.note,
	.error {
		overflow-wrap: anywhere;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
		gap: 1rem 1.25rem;
	}
	.go {
		background: var(--signal);
		color: var(--signal-ink);
		border-color: var(--signal);
		font-weight: 700;
	}
	.go:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.wait {
		margin: 0.5rem 0;
	}
	.lookup {
		margin: 1rem 0;
	}
	.lookup h2 {
		margin-bottom: 0.35rem;
	}
	.lookup .error,
	.lookup .note {
		margin: 0.5rem 0;
	}
	.sent {
		font-size: 0.875rem;
		overflow-wrap: anywhere;
		margin: 0;
		border-top: 2px solid var(--rule);
		padding-top: 0.35rem;
	}
	.dim {
		color: var(--ink-2);
		margin-left: 0.5rem;
	}
	.found {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 1rem;
		padding: 0.45rem 0;
		border-bottom: 1px solid var(--rule-soft);
	}
	.found .mono {
		flex: 1 1 14rem;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.readout {
		margin: 1.25rem 0;
	}
	.tags dt {
		text-transform: none;
		font-size: 0.875rem;
		color: var(--ink);
		font-weight: 700;
	}
	.tname,
	.src {
		display: block;
		font-weight: 400;
		font-size: 0.75rem;
		color: var(--ink-2);
	}
	.src {
		color: var(--signal);
	}
	.tags dd {
		display: grid;
		gap: 0.2rem;
	}
	.ex {
		font-family: var(--font-body);
		font-size: 0.9375rem;
		color: var(--ink-2);
	}
	.ex.err {
		color: var(--signal);
		font-family: var(--font-mono);
		font-size: 0.875rem;
	}
	.tags .bad {
		background: var(--hilite);
	}
	.findings {
		list-style: none;
		margin: 1rem 0;
		padding: 0;
		display: grid;
		gap: 0.3rem;
		font-size: 0.9375rem;
	}
	.findings li {
		border-left: 3px solid var(--rule-soft);
		padding: 0.15rem 0 0.15rem 0.6rem;
		overflow-wrap: anywhere;
	}
	.findings li.lv-error {
		border-left-color: var(--signal);
		background: var(--hilite);
	}
	.findings li.lv-warn {
		border-left-color: var(--signal);
	}
	.lvl {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-2);
		margin-right: 0.25rem;
	}
	.lv-error .lvl,
	.lv-warn .lvl {
		color: var(--signal);
	}
	.foot {
		margin-top: 2rem;
	}
</style>
