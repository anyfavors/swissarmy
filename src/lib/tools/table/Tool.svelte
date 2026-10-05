<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import { CsvError } from '../csv/logic';
	import {
		autoAlign,
		convertTable,
		detectFormat,
		readTable,
		type Align,
		type OutputFormat,
		type SourceFormat,
		type Table
	} from './logic';

	const PREVIEW_ROWS = 100;
	const ALIGN_COLUMNS = 24;
	/** Above this size the conversion runs on request, so typing stays responsive. */
	const LARGE = 1_000_000;

	let input = $state('');
	let committed = $state('');
	let source = $state<SourceFormat | 'auto'>('auto');
	let out = $state<OutputFormat>('markdown');
	let headerChoice = $state<'auto' | 'yes' | 'no'>('auto');
	let alignOverride = $state<Record<number, Align | 'auto'>>({});
	let ready = $state(false);
	let convertedFor = $state<string | null>(null);
	let timer: ReturnType<typeof setTimeout> | undefined;

	const sources: { v: SourceFormat | 'auto'; label: string }[] = [
		{ v: 'auto', label: 'Auto' },
		{ v: 'tsv', label: 'Spreadsheet' },
		{ v: 'csv', label: 'CSV' },
		{ v: 'markdown', label: 'Markdown' },
		{ v: 'html', label: 'HTML' }
	];
	const outputs: { v: OutputFormat; label: string }[] = [
		{ v: 'markdown', label: 'Markdown' },
		{ v: 'html', label: 'HTML' },
		{ v: 'ascii', label: 'ASCII' },
		{ v: 'unicode', label: 'Box' },
		{ v: 'csv', label: 'CSV' },
		{ v: 'tsv', label: 'TSV' },
		{ v: 'json', label: 'JSON' }
	];
	const sourceName: Record<SourceFormat, string> = {
		tsv: 'tab separated (spreadsheet)',
		csv: 'CSV',
		markdown: 'Markdown table',
		html: 'HTML table'
	};

	function onInput() {
		clearTimeout(timer);
		const delay = input.length > 1_000_000 ? 400 : input.length > 50_000 ? 200 : 80;
		timer = setTimeout(() => (committed = input), delay);
	}

	const loaded = $derived.by((): { t?: Table; error?: string } => {
		if (!committed.trim()) return {};
		try {
			return { t: readTable(committed, source) };
		} catch (e) {
			if (e instanceof CsvError) return { error: `${e.message} (CSV)` };
			return { error: (e as Error).message };
		}
	});

	const header = $derived(
		headerChoice === 'auto' ? (loaded.t?.header ?? true) : headerChoice === 'yes'
	);
	const width = $derived(loaded.t ? loaded.t.rows.reduce((m, r) => Math.max(m, r.length), 0) : 0);
	const baseAlign = $derived(
		loaded.t ? (loaded.t.align ?? autoAlign(loaded.t.rows, header)) : ([] as Align[])
	);
	const align = $derived(
		Array.from({ length: width }, (_, i) => {
			const o = alignOverride[i];
			return o === undefined || o === 'auto' ? (baseAlign[i] ?? '') : o;
		})
	);
	const large = $derived(committed.length > LARGE);
	const output = $derived(
		loaded.t && (!large || convertedFor === committed)
			? convertTable(loaded.t, out, { header, align })
			: ''
	);
	const detected = $derived(committed.trim() && source === 'auto' ? detectFormat(committed) : null);
	const columnNames = $derived(
		Array.from({ length: Math.min(width, ALIGN_COLUMNS) }, (_, i) =>
			header ? loaded.t?.rows[0]?.[i] || `Column ${i + 1}` : `Column ${i + 1}`
		)
	);

	function setAlign(i: number, v: string) {
		alignOverride = { ...alignOverride, [i]: v as Align | 'auto' };
	}

	const fmt = new Intl.NumberFormat('en-GB');

	onMount(() => {
		const h = readHash();
		if (sources.some((s) => s.v === h.src)) source = h.src as SourceFormat;
		if (outputs.some((o) => o.v === h.out)) out = h.out as OutputFormat;
		if (h.h === 'yes' || h.h === 'no') headerChoice = h.h;
		if (h.in) input = committed = h.in;
		ready = true;
		return () => clearTimeout(timer);
	});

	$effect(() => {
		const state = {
			// Input stays out of the URL: configs and data dumps often hold secrets or personal data.
			src: source === 'auto' ? undefined : source,
			out: out === 'markdown' ? undefined : out,
			h: headerChoice === 'auto' ? undefined : headerChoice
		};
		if (ready) writeHash(state);
	});
</script>

<div class="row opts" role="group" aria-label="Input format">
	<span class="label">From</span>
	{#each sources as s (s.v)}
		<button type="button" aria-pressed={source === s.v} onclick={() => (source = s.v)}
			>{s.label}</button
		>
	{/each}
</div>

<div class="field">
	<div class="row between">
		<label class="label" for="table-in">Paste a table</label>
		{#if detected}<span class="label">Read as {sourceName[detected]}</span>{/if}
	</div>
	<textarea
		id="table-in"
		bind:value={input}
		oninput={onInput}
		spellcheck="false"
		wrap="off"
		placeholder={'Copy cells in Excel or Google Sheets and paste here'}
		aria-invalid={!!loaded.error}
		aria-describedby={loaded.error ? 'table-err' : undefined}></textarea>
</div>

{#if loaded.error}
	<p id="table-err" class="error" role="alert">{loaded.error}</p>
{/if}

<div class="row opts out" role="group" aria-label="Output format">
	<span class="label">To</span>
	{#each outputs as o (o.v)}
		<button type="button" aria-pressed={out === o.v} onclick={() => (out = o.v)}>{o.label}</button>
	{/each}
	<button type="button" aria-pressed={header} onclick={() => (headerChoice = header ? 'no' : 'yes')}
		>Header row</button
	>
</div>

<div class="field">
	<div class="row between">
		<label class="label" for="table-out">Output</label>
		<Copy value={output} />
	</div>
	<textarea id="table-out" readonly value={output} spellcheck="false" wrap="off"></textarea>
	{#if large && loaded.t && convertedFor !== committed}
		<div class="row">
			<button type="button" onclick={() => (convertedFor = committed)}>Convert</button>
			<span class="label">Large input, converted on request</span>
		</div>
	{/if}
</div>

{#if loaded.t}
	{@const t = loaded.t}
	{#if ['markdown', 'html', 'ascii', 'unicode'].includes(out) && columnNames.length}
		<fieldset class="aligns">
			<legend class="label">Column alignment</legend>
			{#each columnNames as name, i (i)}
				<div class="field align">
					<label class="label" for={`table-al-${i}`}>{name}</label>
					<select
						id={`table-al-${i}`}
						value={alignOverride[i] ?? 'auto'}
						onchange={(e) => setAlign(i, e.currentTarget.value)}
					>
						<option value="auto"
							>Auto ({baseAlign[i] === 'r'
								? 'right'
								: baseAlign[i] === 'c'
									? 'center'
									: 'left'})</option
						>
						<option value="l">Left</option>
						<option value="c">Center</option>
						<option value="r">Right</option>
					</select>
				</div>
			{/each}
		</fieldset>
	{/if}

	<p class="label count">
		{fmt.format(header ? t.rows.length - 1 : t.rows.length)} rows, {width} columns{#if t.rows.length > PREVIEW_ROWS},
			preview shows the first {PREVIEW_ROWS}{/if}
	</p>
	<div class="scroll" role="region" aria-label="Preview" tabindex="-1">
		<table>
			{#if header}
				<thead>
					<tr>
						{#each Array.from({ length: width }, (_, i) => t.rows[0][i] ?? '') as c, i (i)}
							<th scope="col" class:r={align[i] === 'r'} class:c={align[i] === 'c'}
								><span class="cell">{c}</span></th
							>
						{/each}
					</tr>
				</thead>
			{/if}
			<tbody>
				{#each t.rows.slice(header ? 1 : 0, (header ? 1 : 0) + PREVIEW_ROWS) as r, ri (ri)}
					<tr>
						{#each Array.from({ length: width }, (_, i) => r[i] ?? '') as c, i (i)}
							<td class:r={align[i] === 'r'} class:c={align[i] === 'c'}
								><span class="cell">{c}</span></td
							>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<p class="note">
	Excel, Google Sheets and Numbers copy cells as tab separated text, so a paste lands here as is.
	Cells with line breaks arrive in quotes, which is handled. Markdown output escapes <code>|</code>
	and writes line breaks as <code>&lt;br&gt;</code>. Columns of numbers align right unless you
	choose otherwise. The ASCII and box tables count characters, so wide CJK characters and emoji can
	shift a column.
</p>

<style>
	.opts {
		margin-bottom: 1rem;
	}
	.out {
		margin-top: 1.25rem;
	}
	.between {
		justify-content: space-between;
	}
	textarea {
		min-height: 12rem;
		tab-size: 8;
	}
	.error {
		margin-top: 0.75rem;
	}
	.aligns {
		border: 0;
		margin: 1.25rem 0 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
		gap: 0.75rem;
	}
	.aligns legend {
		padding: 0;
		margin-bottom: 0.5rem;
	}
	.align label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		text-transform: none;
		letter-spacing: 0;
	}
	.align select {
		padding: 0.5rem;
		min-height: 2.75rem;
	}
	.count {
		margin: 1.25rem 0 0.4rem;
	}
	.scroll {
		overflow: auto;
		max-height: 30rem;
		border-top: 2px solid var(--rule);
		border-bottom: 1px solid var(--rule-soft);
		margin-bottom: 1.25rem;
	}
	table {
		border-collapse: collapse;
		font-family: var(--font-mono);
		font-size: 0.875rem;
		min-width: 100%;
	}
	th,
	td {
		text-align: left;
		vertical-align: top;
		padding: 0.3rem 0.6rem;
		border-bottom: 1px solid var(--rule-soft);
		white-space: pre-wrap;
	}
	.cell {
		display: block;
		min-width: 7ch;
		max-width: 22rem;
		overflow-wrap: anywhere;
	}
	th {
		position: sticky;
		top: 0;
		background: var(--paper);
		border-bottom: 1px solid var(--rule);
	}
	.r {
		text-align: right;
	}
	.c {
		text-align: center;
	}
	.note code {
		overflow-wrap: anywhere;
	}
</style>
