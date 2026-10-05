<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { writeHash } from '#lib/util/hash.ts';
	import {
		formatRange,
		openFile,
		percent,
		readReport,
		sortRows,
		summarise,
		topFailing,
		type Report,
		type SortKey,
		type SourceRow,
		type Summary,
		type XEl,
		type XmlFile
	} from './logic';

	const PAGE = 100;

	let files = $state<XmlFile[]>([]);
	let chosen = $state(0);
	let fileName = $state('');
	let status = $state('');
	let error = $state('');
	let dragging = $state(false);
	let pasted = $state('');
	let report = $state.raw<Report | null>(null);
	let summary = $state.raw<Summary | null>(null);
	let sortKey = $state<SortKey>('count');
	let shown = $state(PAGE);
	let job = 0;

	const sorted = $derived(summary ? sortRows(summary.rows, sortKey) : []);
	const failing = $derived(summary ? topFailing(summary.rows) : []);

	async function load(f: File | undefined) {
		if (!f) return;
		const id = ++job;
		error = '';
		report = null;
		summary = null;
		files = [];
		fileName = f.name;
		status = 'Reading file';
		try {
			const bytes = new Uint8Array(await f.arrayBuffer());
			status = 'Decompressing';
			const list = await openFile(f.name, bytes);
			if (id !== job) return;
			files = list;
			chosen = 0;
			await show(list[0], id);
		} catch (e) {
			if (id !== job) return;
			error = (e as Error).message;
			status = '';
		}
	}

	async function show(file: XmlFile, id = ++job) {
		error = '';
		report = null;
		summary = null;
		shown = PAGE;
		status = 'Parsing XML';
		// let the status paint before the synchronous parse
		await new Promise((r) => setTimeout(r, 0));
		try {
			const doc = new DOMParser().parseFromString(file.text, 'application/xml');
			const perr = doc.getElementsByTagName('parsererror')[0];
			if (perr)
				throw new Error(
					`The XML is not well-formed: ${perr.textContent?.trim().split('\n')[0] ?? ''}`
				);
			const r = await readReport(doc.documentElement as unknown as XEl, (done, total) => {
				if (id === job) status = `Reading records ${done} of ${total}`;
			});
			if (id !== job) return;
			status = 'Counting';
			await new Promise((res) => setTimeout(res, 0));
			const s = summarise(r.records);
			if (id !== job) return;
			report = r;
			summary = s;
			status = '';
		} catch (e) {
			if (id !== job) return;
			error = (e as Error).message;
			status = '';
		}
	}

	function pick(i: number) {
		chosen = i;
		show(files[i]);
	}

	function usePasted() {
		if (!pasted.trim()) return;
		files = [{ name: 'pasted', text: pasted }];
		fileName = 'pasted XML';
		chosen = 0;
		show(files[0]);
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		load(e.dataTransfer?.files[0]);
	}

	const entries = (m: Record<string, number>) => Object.entries(m).sort((a, b) => b[1] - a[1]);
	const pct = (n: number) => percent(n, summary?.total ?? 0);

	onMount(() => {
		// Reports name your mail sources: keep the address bar clean.
		writeHash({});
	});
</script>

{#snippet results(m: Record<string, number>)}
	{#each entries(m) as [k, n] (k)}
		<span class="res" class:bad={/(fail|error|none|neutral|not signed)$/.test(k)}
			>{k}{Object.keys(m).length > 1 ? ` ×${n}` : ''}</span
		>
	{/each}
{/snippet}

{#snippet rowCells(r: SourceRow)}
	<td class="mono ip">{r.ip}</td>
	<td class="mono num">{r.count}</td>
	<td class="mono num">{r.pass}</td>
	<td class="mono num" class:hot={r.fail > 0}>{r.fail}</td>
	<td class="mono">
		{#each entries(r.dispositions) as [d, n] (d)}<span class="res" class:bad={d !== 'none'}
				>{d}{Object.keys(r.dispositions).length > 1 ? ` ×${n}` : ''}</span
			>{/each}
	</td>
	<td class="mono num">{r.dkimAligned}</td>
	<td class="mono num">{r.spfAligned}</td>
	<td class="mono small">{@render results(r.dkimResults)}</td>
	<td class="mono small">{@render results(r.spfResults)}</td>
	<td class="mono small">
		{r.headerFrom.join(', ')}
		{#if r.reasons.length}<span class="reason">override: {r.reasons.join('; ')}</span>{/if}
	</td>
{/snippet}

<div
	class="drop"
	class:dragging
	role="group"
	aria-label="Report file"
	ondragover={(e) => {
		e.preventDefault();
		dragging = true;
	}}
	ondragleave={() => (dragging = false)}
	ondrop={onDrop}
>
	<label class="label" for="dr-file">Drop a report here or choose one (.xml, .xml.gz, .zip)</label>
	<input
		id="dr-file"
		type="file"
		accept=".xml,.gz,.zip,application/xml,text/xml,application/gzip,application/zip"
		onchange={(e) => load((e.currentTarget as HTMLInputElement).files?.[0])}
	/>
</div>
<details class="paste">
	<summary class="label">Or paste the XML</summary>
	<div class="field">
		<label class="label" for="dr-xml">Report XML</label>
		<textarea id="dr-xml" bind:value={pasted} spellcheck="false"></textarea>
	</div>
	<button type="button" onclick={usePasted} disabled={!pasted.trim()}>Read pasted XML</button>
</details>
<p class="note">
	The file is unpacked and read inside this tab. Nothing is uploaded and no IP address is looked up.
</p>

<div aria-live="polite">
	{#if status}<p class="label status">{status}</p>{/if}
</div>
{#if error}<p class="error" role="alert">{error}</p>{/if}

{#if files.length > 1}
	<div class="row opts" role="group" aria-label="Report in archive">
		<span class="label">{files.length} reports in {fileName}</span>
		{#each files as f, i (i)}
			<button type="button" aria-pressed={chosen === i} onclick={() => pick(i)}>{f.name}</button>
		{/each}
	</div>
{/if}

{#if report && summary}
	{@const s = summary}
	<section>
		<h2 class="label">Report</h2>
		<dl class="readout">
			<div>
				<dt>From</dt>
				<dd>
					{report.meta.orgName ?? 'unknown'}{report.meta.email ? ` (${report.meta.email})` : ''}
				</dd>
				<span></span>
			</div>
			<div>
				<dt>Report ID</dt>
				<dd>{report.meta.reportId ?? 'none'}</dd>
				<Copy value={report.meta.reportId ?? ''} />
			</div>
			<div>
				<dt>Period</dt>
				<dd>{formatRange(report.meta.begin, report.meta.end)}</dd>
				<span></span>
			</div>
			{#each report.meta.errors as e, i (i)}
				<div>
					<dt>Reporter error</dt>
					<dd>{e}</dd>
					<span></span>
				</div>
			{/each}
		</dl>
	</section>

	<section>
		<h2 class="label">Policy published</h2>
		<dl class="readout">
			{#each Object.entries(report.policy) as [k, v] (k)}
				<div>
					<dt>{k}</dt>
					<dd>{v}</dd>
					<span></span>
				</div>
			{/each}
		</dl>
	</section>

	<section>
		<h2 class="label">Totals</h2>
		<dl class="readout totals">
			<div>
				<dt>Messages</dt>
				<dd>{s.total} from {s.sources} source IPs</dd>
				<span></span>
			</div>
			<div>
				<dt>DMARC pass</dt>
				<dd>{s.pass} ({pct(s.pass)})</dd>
				<span></span>
			</div>
			<div class:hotrow={s.fail > 0}>
				<dt>DMARC fail</dt>
				<dd>{s.fail} ({pct(s.fail)})</dd>
				<span></span>
			</div>
			<div>
				<dt>DKIM aligned pass</dt>
				<dd>{s.dkimAligned} ({pct(s.dkimAligned)})</dd>
				<span></span>
			</div>
			<div>
				<dt>SPF aligned pass</dt>
				<dd>{s.spfAligned} ({pct(s.spfAligned)})</dd>
				<span></span>
			</div>
			<div>
				<dt>Both aligned</dt>
				<dd>{s.both} ({pct(s.both)})</dd>
				<span></span>
			</div>
			<div>
				<dt>Disposition</dt>
				<dd>
					{entries(s.dispositions)
						.map(([d, n]) => `${d} ${n}`)
						.join(', ')}
				</dd>
				<span></span>
			</div>
		</dl>
		<div class="bar" aria-hidden="true">
			<span class="pass w{Math.round((s.pass / Math.max(1, s.total)) * 20)}"></span>
		</div>
	</section>

	{#if failing.length}
		<section>
			<h2 class="label">Top failing sources</h2>
			<ol class="failing">
				{#each failing as r (r.ip)}
					<li>
						<span class="mono ip">{r.ip}</span>
						<span class="mono">{r.fail} failed of {r.count}</span>
						<span class="small dim"
							>SPF: {Object.keys(r.spfResults).join(', ') || 'none'}; DKIM: {Object.keys(
								r.dkimResults
							).join(', ')}</span
						>
					</li>
				{/each}
			</ol>
			<p class="note">
				Failing sources are either spoofers, or your own services that need SPF or DKIM set up for
				your domain. Look the IPs up yourself (reverse DNS, whois) to tell them apart.
			</p>
		</section>
	{/if}

	<section>
		<h2 class="label">By source IP</h2>
		<div class="row opts" role="group" aria-label="Sort by">
			<span class="label">Sort</span>
			<button type="button" aria-pressed={sortKey === 'count'} onclick={() => (sortKey = 'count')}
				>Messages</button
			>
			<button type="button" aria-pressed={sortKey === 'fail'} onclick={() => (sortKey = 'fail')}
				>Failures</button
			>
			<button type="button" aria-pressed={sortKey === 'ip'} onclick={() => (sortKey = 'ip')}
				>IP</button
			>
		</div>
		<div class="scroll">
			<table>
				<thead>
					<tr>
						<th scope="col">Source IP</th>
						<th scope="col">Msgs</th>
						<th scope="col">Pass</th>
						<th scope="col">Fail</th>
						<th scope="col">Disposition</th>
						<th scope="col">DKIM aligned</th>
						<th scope="col">SPF aligned</th>
						<th scope="col">DKIM auth</th>
						<th scope="col">SPF auth</th>
						<th scope="col">Header From</th>
					</tr>
				</thead>
				<tbody>
					{#each sorted.slice(0, shown) as r (r.ip)}
						<tr class:failrow={r.fail > 0}>{@render rowCells(r)}</tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if sorted.length > shown}
			<div class="row more">
				<span class="label">Showing {shown} of {sorted.length}</span>
				<button type="button" onclick={() => (shown += PAGE)}
					>Show {Math.min(PAGE, sorted.length - shown)} more</button
				>
				<button type="button" onclick={() => (shown = sorted.length)}>Show all</button>
			</div>
		{/if}
		<p class="note">
			Aligned columns come from policy_evaluated: the check passed for the From: domain. The auth
			columns show the raw SPF and DKIM results, which may pass for another domain and still not
			count for DMARC.
		</p>
	</section>
{/if}

<style>
	.drop {
		display: grid;
		gap: 0.5rem;
		padding: 1rem;
		border: 1px dashed var(--rule);
		background: var(--field);
		margin-bottom: 0.75rem;
	}
	.drop.dragging {
		border-style: solid;
		background: var(--hilite);
	}
	.drop input {
		font: inherit;
		font-family: var(--font-mono);
		font-size: 0.875rem;
		color: var(--ink);
		max-width: 100%;
	}
	.paste {
		margin-bottom: 0.75rem;
	}
	.paste summary {
		cursor: pointer;
		min-height: 2.75rem;
		display: flex;
		align-items: center;
	}
	.paste .field {
		margin-bottom: 0.5rem;
	}
	.paste button:disabled {
		opacity: 0.45;
	}
	.error,
	.note {
		overflow-wrap: anywhere;
	}
	.status {
		margin: 1rem 0 0;
	}
	.error {
		margin-top: 1rem;
	}
	.opts {
		margin: 1rem 0;
	}
	.opts button {
		overflow-wrap: anywhere;
		max-width: 100%;
	}
	section {
		margin: 1.75rem 0;
	}
	h2 {
		margin-bottom: 0.5rem;
	}
	.hotrow {
		background: var(--hilite);
	}
	.bar {
		height: 0.6rem;
		border: 1px solid var(--rule);
		margin: 0.75rem 0 0;
		background: var(--hilite);
	}
	.bar .pass {
		display: block;
		height: 100%;
		background: var(--ink);
	}
	.w0 {
		width: 0;
	}
	.w1 {
		width: 5%;
	}
	.w2 {
		width: 10%;
	}
	.w3 {
		width: 15%;
	}
	.w4 {
		width: 20%;
	}
	.w5 {
		width: 25%;
	}
	.w6 {
		width: 30%;
	}
	.w7 {
		width: 35%;
	}
	.w8 {
		width: 40%;
	}
	.w9 {
		width: 45%;
	}
	.w10 {
		width: 50%;
	}
	.w11 {
		width: 55%;
	}
	.w12 {
		width: 60%;
	}
	.w13 {
		width: 65%;
	}
	.w14 {
		width: 70%;
	}
	.w15 {
		width: 75%;
	}
	.w16 {
		width: 80%;
	}
	.w17 {
		width: 85%;
	}
	.w18 {
		width: 90%;
	}
	.w19 {
		width: 95%;
	}
	.w20 {
		width: 100%;
	}
	.failing {
		list-style: none;
		margin: 0 0 0.75rem;
		padding: 0;
		border-top: 2px solid var(--rule);
	}
	.failing li {
		display: flex;
		flex-wrap: wrap;
		gap: 0.15rem 0.75rem;
		align-items: baseline;
		padding: 0.4rem 0;
		border-bottom: 1px solid var(--rule-soft);
	}
	.failing .small {
		flex: 1 1 100%;
		overflow-wrap: anywhere;
	}
	.ip {
		font-weight: 700;
		overflow-wrap: anywhere;
	}
	.scroll {
		overflow-x: auto;
		max-width: 100%;
		border-top: 2px solid var(--rule);
	}
	table {
		border-collapse: collapse;
		min-width: 56rem;
		width: 100%;
		font-size: 0.875rem;
	}
	th,
	td {
		text-align: left;
		vertical-align: top;
		padding: 0.4rem 0.6rem 0.4rem 0;
		border-bottom: 1px solid var(--rule-soft);
	}
	th {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-2);
		font-weight: 400;
	}
	.num {
		text-align: right;
		white-space: nowrap;
	}
	.hot {
		color: var(--signal);
		font-weight: 700;
	}
	.failrow {
		background: var(--hilite);
	}
	.small {
		font-size: 0.8125rem;
	}
	td.small {
		max-width: 16rem;
		overflow-wrap: anywhere;
	}
	.dim {
		color: var(--ink-2);
	}
	.res {
		display: inline-block;
		margin: 0 0.3rem 0.2rem 0;
		padding: 0 0.3rem;
		border: 1px solid var(--rule-soft);
	}
	.res.bad {
		border-color: var(--signal);
		color: var(--signal);
	}
	.reason {
		display: block;
		color: var(--ink-2);
		margin-top: 0.2rem;
	}
	.more {
		margin: 0.75rem 0;
	}
	section > .note {
		margin-top: 0.75rem;
	}
</style>
