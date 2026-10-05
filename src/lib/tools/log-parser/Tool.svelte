<script lang="ts">
	import { onMount } from 'svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		FORMAT_NAMES,
		customFormat,
		defaultAggregations,
		parseLog,
		span,
		toJson,
		topN,
		type CustomFormat,
		type Format,
		type ParseResult
	} from './logic';

	const SAMPLE = `203.0.113.7 - - [05/Oct/2026:09:12:01 +0000] "GET / HTTP/1.1" 200 5120 "-" "Mozilla/5.0"
203.0.113.7 - - [05/Oct/2026:09:12:02 +0000] "GET /static/app.css HTTP/1.1" 200 812 "https://example.com/" "Mozilla/5.0"
198.51.100.23 - - [05/Oct/2026:09:13:44 +0000] "POST /login HTTP/1.1" 401 32 "-" "curl/8.5.0"
198.51.100.23 - - [05/Oct/2026:09:13:45 +0000] "POST /login HTTP/1.1" 401 32 "-" "curl/8.5.0"
192.0.2.10 - alice [05/Oct/2026:09:20:10 +0000] "GET /api/items?page=2 HTTP/2.0" 200 1934 "-" "app/3.1"
192.0.2.10 - alice [05/Oct/2026:09:41:57 +0000] "DELETE /api/items/7 HTTP/2.0" 500 0 "-" "app/3.1"`;

	const CUSTOM_SAMPLE = `log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                '$status $body_bytes_sent "$http_referer" '
                '"$http_user_agent" "$http_x_forwarded_for"';`;

	const FORMATS: (Format | 'auto')[] = [
		'auto',
		'combined',
		'common',
		'custom',
		'syslog5424',
		'syslog3164',
		'json',
		'logfmt'
	];
	const ROW_CAP = 200;
	const DEBOUNCE_MS = 250;

	let text = $state(SAMPLE);
	let format = $state<Format | 'auto'>('auto');
	let customDef = $state(CUSTOM_SAMPLE);
	let filter = $state('');
	let extraField = $state('');
	let chosen = $state<string[] | null>(null);
	let result = $state<ParseResult | null>(null);
	let parseError = $state('');
	let busy = $state(false);
	let ready = $state(false);

	const custom = $derived.by((): { c?: CustomFormat; error?: string } => {
		if (format !== 'custom') return {};
		try {
			return { c: customFormat(customDef) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	// Parsing a large paste on every keystroke would freeze typing, so wait for a pause.
	$effect(() => {
		if (!ready) return;
		const t = text;
		const f = format;
		const c = custom.c;
		if (f === 'custom' && !c) {
			result = null;
			return;
		}
		busy = true;
		const timer = setTimeout(() => {
			try {
				result = t.trim() ? parseLog(t, f, c) : null;
				parseError = '';
			} catch (e) {
				result = null;
				parseError = (e as Error).message;
			}
			busy = false;
		}, DEBOUNCE_MS);
		return () => clearTimeout(timer);
	});

	const aggFields = $derived.by(() => {
		if (!result) return [];
		const d = defaultAggregations(result);
		if (extraField && result.fields.includes(extraField) && !d.includes(extraField))
			d.push(extraField);
		return d;
	});

	const aggs = $derived(
		result ? aggFields.map((f) => ({ field: f, ...topN(result!.records, f, 10) })) : []
	);

	const DEFAULT_COLS = [
		'time_local',
		'timestamp',
		'time',
		'ts',
		'@timestamp',
		'remote_addr',
		'hostname',
		'severity',
		'app_name',
		'level',
		'method',
		'path',
		'status',
		'body_bytes_sent',
		'msg',
		'message'
	];

	const columns = $derived.by(() => {
		if (!result) return [];
		if (chosen) return chosen.filter((c) => result!.fields.includes(c));
		const d = DEFAULT_COLS.filter((c) => result!.fields.includes(c)).slice(0, 7);
		return d.length >= 3 ? d : result.fields.slice(0, 7);
	});

	function toggleCol(f: string) {
		const cur = [...columns];
		const i = cur.indexOf(f);
		if (i >= 0) cur.splice(i, 1);
		else cur.push(f);
		chosen = cur;
	}

	const rows = $derived.by(() => {
		if (!result) return { list: [], matched: 0 };
		const q = filter.trim().toLowerCase();
		const list = [];
		let matched = 0;
		for (const r of result.records) {
			if (q && !Object.values(r.fields).some((v) => v.toLowerCase().includes(q))) continue;
			matched++;
			if (list.length < ROW_CAP) list.push(r);
		}
		return { list, matched };
	});

	// Built on demand: stringifying 100 000 records on every render would be wasteful.
	let copied = $state(false);
	let copyTimer: ReturnType<typeof setTimeout>;
	async function copyJson() {
		if (!result) return;
		await navigator.clipboard.writeText(toJson(result));
		copied = true;
		clearTimeout(copyTimer);
		copyTimer = setTimeout(() => (copied = false), 1200);
	}

	const iso = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z');
	const pct = (n: number, of: number) => (of ? `${((n / of) * 100).toFixed(1)}%` : '');

	onMount(() => {
		const h = readHash();
		if (FORMATS.includes(h.f as Format)) format = h.f as Format;
		if (h.c) customDef = h.c;
		if (h.in) {
			text = h.in;
			if (/^\s*(?:log_format|LogFormat)\b/.test(h.in)) {
				customDef = h.in;
				format = 'custom';
				text = '';
			}
		}
		ready = true;
	});

	// Logs hold addresses and user names: only the format choice goes into the address bar.
	$effect(() => {
		const state = {
			f: format === 'auto' ? undefined : format,
			c: format === 'custom' && customDef !== CUSTOM_SAMPLE ? customDef : undefined
		};
		if (ready) writeHash(state);
	});
</script>

<div class="field">
	<label class="label" for="lp-in">Log lines</label>
	<textarea
		id="lp-in"
		class="tall"
		bind:value={text}
		spellcheck="false"
		autocapitalize="off"
		wrap="off"></textarea>
</div>

<div class="opts">
	<div class="field">
		<label class="label" for="lp-f">Format</label>
		<select id="lp-f" bind:value={format}>
			{#each FORMATS as f (f)}
				<option value={f}>{f === 'auto' ? 'Detect' : FORMAT_NAMES[f]}</option>
			{/each}
		</select>
	</div>
	<div class="field">
		<label class="label" for="lp-q">Filter rows</label>
		<input
			id="lp-q"
			type="search"
			bind:value={filter}
			spellcheck="false"
			autocomplete="off"
			autocapitalize="off"
		/>
	</div>
</div>

{#if format === 'custom'}
	<div class="field custom">
		<label class="label" for="lp-c">nginx log_format or Apache LogFormat</label>
		<textarea id="lp-c" class="short" bind:value={customDef} spellcheck="false" autocapitalize="off"
		></textarea>
	</div>
	{#if custom.error}
		<p class="error" role="alert">{custom.error}</p>
	{:else if custom.c}
		<p class="derived">
			<span class="label">Fields</span>
			{custom.c.fields.join(', ')}
		</p>
	{/if}
{/if}

{#if parseError}
	<p class="error" role="alert">{parseError}</p>
{/if}

{#if result}
	{@const r = result}
	<dl class="readout" aria-busy={busy}>
		<div>
			<dt>Format</dt>
			<dd>{r.format ? FORMAT_NAMES[r.format] : 'Not recognised, pick one above'}</dd>
			<span></span>
		</div>
		<div>
			<dt>Lines</dt>
			<dd>
				{r.records.length.toLocaleString('en-GB')} read{r.failedCount
					? `, ${r.failedCount.toLocaleString('en-GB')} not matched`
					: ''}{r.truncated
					? `, stopped after ${r.records.length + r.failedCount} of ${r.totalLines.toLocaleString('en-GB')}`
					: ''}
			</dd>
			{#if r.records.length}
				<button type="button" class="copy" onclick={copyJson} aria-live="polite"
					>{copied ? 'Copied' : 'Copy JSON'}</button
				>
			{:else}<span></span>{/if}
		</div>
		{#if r.range}
			<div>
				<dt>From</dt>
				<dd>{iso(r.range.from)}</dd>
				<span></span>
			</div>
			<div>
				<dt>To</dt>
				<dd>{iso(r.range.to)} ({span(r.range.to - r.range.from)})</dd>
				<span></span>
			</div>
		{/if}
	</dl>

	{#if r.records.length}
		<div class="aggs">
			{#each aggs as a (a.field)}
				<div class="scroll agg">
					<table>
						<caption class="label">Top {a.field}, {a.distinct} distinct</caption>
						<tbody>
							{#each a.top as t, i (i)}
								<tr>
									<td class="mono val">{t.value || '(empty)'}</td>
									<td class="mono num">{t.count}</td>
									<td class="mono num dim">{pct(t.count, r.records.length)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/each}
		</div>
		<div class="field extra">
			<label class="label" for="lp-agg">Count another field</label>
			<select id="lp-agg" bind:value={extraField}>
				<option value="">None</option>
				{#each r.fields as f (f)}<option value={f}>{f}</option>{/each}
			</select>
		</div>

		<div class="cols" role="group" aria-label="Columns">
			<span class="label">Columns</span>
			{#each r.fields as f (f)}
				<button type="button" aria-pressed={columns.includes(f)} onclick={() => toggleCol(f)}
					>{f}</button
				>
			{/each}
		</div>

		<div class="scroll">
			<table class="records">
				<caption class="label"
					>{rows.matched > rows.list.length
						? `First ${rows.list.length} of ${rows.matched.toLocaleString('en-GB')} rows`
						: `${rows.matched.toLocaleString('en-GB')} rows`}</caption
				>
				<thead>
					<tr>
						<th scope="col">Line</th>
						{#each columns as c (c)}<th scope="col">{c}</th>{/each}
					</tr>
				</thead>
				<tbody>
					{#each rows.list as rec (rec.line)}
						<tr>
							<th scope="row">{rec.line}</th>
							{#each columns as c (c)}<td class="mono">{rec.fields[c] ?? ''}</td>{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	{#if r.failed.length}
		<details class="failed">
			<summary class="label">Lines not matched ({r.failedCount})</summary>
			<ol>
				{#each r.failed as f (f.line)}
					<li><span class="ln">{f.line}</span> <code>{f.text}</code></li>
				{/each}
			</ol>
		</details>
	{/if}
{/if}

<p class="note">
	Up to {(100_000).toLocaleString('en-GB')} lines are parsed and {ROW_CAP} rows shown; filter to find
	the rest. Times without a zone count as UTC, syslog RFC 3164 times have no year and get the current
	one. Nothing is uploaded and logs are not kept in the address bar.
</p>

<style>
	.tall {
		min-height: 14rem;
		white-space: pre;
		overflow-x: auto;
	}
	.short {
		min-height: 6rem;
	}
	.opts {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
		gap: 0.75rem;
		margin: 0.75rem 0 1rem;
	}
	.custom {
		margin-bottom: 0.75rem;
	}
	.derived {
		margin: 0 0 1rem;
		font-family: var(--font-mono);
		font-size: 0.875rem;
		overflow-wrap: anywhere;
	}
	.derived .label {
		margin-right: 0.5rem;
	}
	.readout {
		margin: 1rem 0 1.5rem;
	}
	.aggs {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
		gap: 0 1.25rem;
	}
	.extra {
		max-width: 20rem;
		margin-bottom: 1.25rem;
	}
	.cols {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		align-items: center;
		margin-bottom: 1rem;
	}
	.cols .label {
		margin-right: 0.25rem;
	}
	.cols button {
		text-transform: none;
		letter-spacing: 0;
		min-height: 2.75rem;
		padding: 0.25rem 0.5rem;
		overflow-wrap: anywhere;
	}
	.scroll {
		overflow-x: auto;
		margin-bottom: 1.25rem;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		border-top: 2px solid var(--rule);
		font-size: 0.8125rem;
	}
	caption {
		text-align: left;
		padding-bottom: 0.4rem;
	}
	th,
	td {
		text-align: left;
		padding: 0.35rem 0.75rem 0.35rem 0;
		border-bottom: 1px solid var(--rule-soft);
		vertical-align: top;
	}
	th {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-2);
		font-weight: 400;
		white-space: nowrap;
	}
	.records td {
		max-width: 28rem;
		overflow-wrap: anywhere;
	}
	.val {
		overflow-wrap: anywhere;
	}
	.num {
		text-align: right;
		white-space: nowrap;
	}
	.dim {
		color: var(--ink-2);
	}
	.failed {
		margin-bottom: 1.25rem;
	}
	.failed summary {
		cursor: pointer;
		min-height: 2.75rem;
		display: flex;
		align-items: center;
	}
	.failed ol {
		list-style: none;
		margin: 0;
		padding: 0;
		font-size: 0.8125rem;
	}
	.failed li {
		padding: 0.25rem 0;
		border-bottom: 1px solid var(--rule-soft);
		overflow-wrap: anywhere;
	}
	.ln {
		font-family: var(--font-mono);
		color: var(--signal);
		margin-right: 0.5rem;
	}
	.copy {
		min-height: 2.25rem;
		padding: 0.25rem 0.6rem;
		font-size: 0.6875rem;
	}
	.error {
		margin: 0 0 1rem;
	}
	.note {
		margin: 0 0 1rem;
	}
</style>
