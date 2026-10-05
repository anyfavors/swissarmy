<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import { JsonError, locate } from '../json/logic';
	import {
		compareCells,
		CsvError,
		delimiterName,
		DELIMITERS,
		detectHeader,
		headerNames,
		jsonToRows,
		parseCsv,
		rowsToJson,
		rowsToMarkdown,
		usesDecimalComma,
		writeCsv,
		type Delimiter
	} from './logic';

	const PAGE = 500;
	/** Above this size the conversion runs on request, so typing stays responsive. */
	const LARGE = 1_000_000;

	type Mode = 'csv' | 'json';
	type Out = 'objects' | 'arrays' | 'markdown';
	type Choice = 'auto' | 'yes' | 'no';

	let mode = $state<Mode>('csv');
	let input = $state('');
	let committed = $state('');
	let delim = $state<Delimiter | 'auto'>('auto');
	let headerChoice = $state<Choice>('auto');
	let dcChoice = $state<Choice>('auto');
	let types = $state(true);
	let out = $state<Out>('objects');
	let outDelim = $state<Delimiter>(',');
	let crlf = $state(false);
	let arrays = $state<'json' | 'index'>('json');
	let filter = $state('');
	let filterCommitted = $state('');
	let sortCol = $state(-1);
	let sortDesc = $state(false);
	let limit = $state(PAGE);
	let convertedFor = $state<string | null>(null);
	let ready = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;
	let ftimer: ReturnType<typeof setTimeout> | undefined;

	function onInput() {
		clearTimeout(timer);
		const delay = input.length > 1_000_000 ? 500 : input.length > 50_000 ? 250 : 80;
		timer = setTimeout(() => (committed = input), delay);
	}

	function onFilter() {
		clearTimeout(ftimer);
		ftimer = setTimeout(() => {
			filterCommitted = filter;
			limit = PAGE;
		}, 150);
	}

	function setMode(m: Mode) {
		if (m === mode) return;
		mode = m;
		input = committed = '';
		sortCol = -1;
		filter = filterCommitted = '';
	}

	interface Loaded {
		rows: string[][];
		error?: string;
		at?: ReturnType<typeof locate>;
		info?: ReturnType<typeof parseCsv>;
		jsonInfo?: ReturnType<typeof jsonToRows>;
	}

	const loaded = $derived.by((): Loaded => {
		if (!committed.trim()) return { rows: [] };
		try {
			if (mode === 'csv') {
				const info = parseCsv(committed, delim);
				return { rows: info.rows, info };
			}
			const jsonInfo = jsonToRows(committed, { arrays });
			return { rows: jsonInfo.rows, jsonInfo };
		} catch (e) {
			if (e instanceof CsvError || e instanceof JsonError)
				return { rows: [], error: e.message, at: locate(committed, e.pos) };
			return { rows: [], error: (e as Error).message };
		}
	});

	const header = $derived(
		mode === 'json'
			? loaded.jsonInfo?.shape !== 'arrays'
			: headerChoice === 'auto'
				? detectHeader(loaded.rows)
				: headerChoice === 'yes'
	);
	const autoDc = $derived(
		loaded.info ? usesDecimalComma(loaded.rows, loaded.info.delimiter) : false
	);
	const decimalComma = $derived(dcChoice === 'auto' ? autoDc : dcChoice === 'yes');
	const width = $derived(loaded.rows.reduce((m, r) => Math.max(m, r.length), 0));
	const columns = $derived(
		header
			? headerNames(loaded.rows[0] ?? [], width)
			: Array.from({ length: width }, (_, i) => `${i + 1}`)
	);
	const body = $derived(header ? loaded.rows.slice(1) : loaded.rows);

	const view = $derived.by(() => {
		const q = filterCommitted.trim().toLowerCase();
		let list = q ? body.filter((r) => r.some((c) => c.toLowerCase().includes(q))) : body;
		if (sortCol >= 0) {
			const col = sortCol;
			const coll = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
			const dir = sortDesc ? -1 : 1;
			list = [...list].sort((a, b) => dir * compareCells(a[col] ?? '', b[col] ?? '', coll));
		}
		return list;
	});
	const shown = $derived(view.slice(0, limit));

	function sortBy(i: number) {
		if (sortCol === i) {
			if (sortDesc) sortCol = -1;
			sortDesc = !sortDesc;
		} else {
			sortCol = i;
			sortDesc = false;
		}
		limit = PAGE;
	}

	const large = $derived(committed.length > LARGE);
	const output = $derived.by((): string => {
		if (!loaded.rows.length) return '';
		if (large && convertedFor !== committed) return '';
		if (mode === 'json')
			return writeCsv(loaded.rows, { delimiter: outDelim, eol: crlf ? '\r\n' : '\n' });
		if (out === 'markdown') return rowsToMarkdown(loaded.rows, header);
		return rowsToJson(loaded.rows, { header, shape: out, types, decimalComma });
	});

	const fmt = new Intl.NumberFormat('en-GB');
	const delimLabel = (d: Delimiter) => (d === '\t' ? 'Tab' : `${delimiterName[d]} ${d}`);

	onMount(() => {
		const h = readHash();
		if (h.mode === 'json') mode = 'json';
		const d = DELIMITERS.find((x) => delimiterName[x] === h.d);
		if (d) delim = d;
		const od = DELIMITERS.find((x) => delimiterName[x] === h.od);
		if (od) outDelim = od;
		if (h.h === 'yes' || h.h === 'no') headerChoice = h.h;
		if (h.out === 'arrays' || h.out === 'markdown') out = h.out;
		if (h.types === '0') types = false;
		if (h.arr === 'index') arrays = 'index';
		if (h.in) input = committed = h.in;
		ready = true;
		return () => {
			clearTimeout(timer);
			clearTimeout(ftimer);
		};
	});

	$effect(() => {
		const state = {
			// Input stays out of the URL: configs and data dumps often hold secrets or personal data.
			mode: mode === 'json' ? 'json' : undefined,
			d: delim === 'auto' ? undefined : delimiterName[delim],
			od: outDelim === ',' ? undefined : delimiterName[outDelim],
			h: headerChoice === 'auto' ? undefined : headerChoice,
			out: out === 'objects' ? undefined : out,
			types: types ? undefined : '0',
			arr: arrays === 'index' ? 'index' : undefined
		};
		if (ready) writeHash(state);
	});
</script>

<div class="row opts" role="group" aria-label="Direction">
	<span class="label">Input</span>
	<button type="button" aria-pressed={mode === 'csv'} onclick={() => setMode('csv')}
		>CSV to JSON</button
	>
	<button type="button" aria-pressed={mode === 'json'} onclick={() => setMode('json')}
		>JSON to CSV</button
	>
</div>

{#if mode === 'csv'}
	<div class="row opts" role="group" aria-label="Delimiter">
		<span class="label">Delimiter</span>
		<button type="button" aria-pressed={delim === 'auto'} onclick={() => (delim = 'auto')}
			>Auto{#if delim === 'auto' && loaded.info}: {delimLabel(loaded.info.delimiter)}{/if}</button
		>
		{#each DELIMITERS as d (d)}
			<button type="button" aria-pressed={delim === d} onclick={() => (delim = d)}
				>{delimLabel(d)}</button
			>
		{/each}
	</div>
{/if}

<div class="grid">
	<div class="field">
		<div class="row between">
			<label class="label" for="csv-in">{mode === 'csv' ? 'CSV input' : 'JSON input'}</label>
			{#if loaded.rows.length}<span class="label">{fmt.format(loaded.rows.length)} rows</span>{/if}
		</div>
		<textarea
			id="csv-in"
			bind:value={input}
			oninput={onInput}
			spellcheck="false"
			wrap="off"
			placeholder={mode === 'csv' ? 'name,city\nAda,London' : '[{"name": "Ada", "city": "London"}]'}
			aria-invalid={!!loaded.error}
			aria-describedby={loaded.error ? 'csv-err' : undefined}></textarea>
	</div>

	<div class="field">
		<div class="row between">
			<label class="label" for="csv-out"
				>{mode === 'json' ? 'CSV' : out === 'markdown' ? 'Markdown' : 'JSON'}</label
			>
			<Copy value={output} />
		</div>
		<textarea id="csv-out" readonly value={output} spellcheck="false" wrap="off"></textarea>
		{#if large && loaded.rows.length && convertedFor !== committed}
			<div class="row">
				<button type="button" onclick={() => (convertedFor = committed)}>Convert</button>
				<span class="label">Large input, converted on request</span>
			</div>
		{/if}
	</div>
</div>

{#if mode === 'csv'}
	<div class="row opts" role="group" aria-label="Output">
		<span class="label">Output</span>
		<button type="button" aria-pressed={out === 'objects'} onclick={() => (out = 'objects')}
			>JSON objects</button
		>
		<button type="button" aria-pressed={out === 'arrays'} onclick={() => (out = 'arrays')}
			>JSON arrays</button
		>
		<button type="button" aria-pressed={out === 'markdown'} onclick={() => (out = 'markdown')}
			>Markdown</button
		>
	</div>
	<div class="row opts" role="group" aria-label="Reading options">
		<span class="label">Read</span>
		<button
			type="button"
			aria-pressed={header}
			onclick={() => (headerChoice = header ? 'no' : 'yes')}>Header row</button
		>
		<button type="button" aria-pressed={types} onclick={() => (types = !types)}
			>Numbers and booleans</button
		>
		<button
			type="button"
			aria-pressed={decimalComma}
			onclick={() => (dcChoice = decimalComma ? 'no' : 'yes')}>Decimal comma</button
		>
	</div>
{:else}
	<div class="row opts" role="group" aria-label="CSV delimiter">
		<span class="label">Delimiter</span>
		{#each DELIMITERS as d (d)}
			<button type="button" aria-pressed={outDelim === d} onclick={() => (outDelim = d)}
				>{delimLabel(d)}</button
			>
		{/each}
	</div>
	<div class="row opts" role="group" aria-label="CSV options">
		<span class="label">Arrays</span>
		<button type="button" aria-pressed={arrays === 'json'} onclick={() => (arrays = 'json')}
			>As JSON text</button
		>
		<button type="button" aria-pressed={arrays === 'index'} onclick={() => (arrays = 'index')}
			>Indexed columns</button
		>
		<button type="button" aria-pressed={crlf} onclick={() => (crlf = !crlf)}>CRLF</button>
	</div>
{/if}

{#if loaded.error}
	<div id="csv-err" class="err" role="alert">
		<p class="error">
			{loaded.error}{#if loaded.at}, line {loaded.at.line} column {loaded.at.col}{/if}
		</p>
		{#if loaded.at}
			<pre class="excerpt" aria-hidden="true">{loaded.at.excerpt}
<span class="caret">{loaded.at.caret}</span></pre>
		{/if}
	</div>
{:else if loaded.rows.length}
	<dl class="readout">
		<div>
			<dt>Size</dt>
			<dd>{fmt.format(body.length)} data rows, {fmt.format(width)} columns</dd>
		</div>
		{#if loaded.info}
			{@const i = loaded.info}
			<div>
				<dt>Format</dt>
				<dd>
					{delimiterName[i.delimiter]} separated, {i.eol === 'none'
						? 'one line'
						: `${i.eol} line endings`}{i.bom ? ', UTF-8 BOM' : ''}
				</dd>
			</div>
			{#if i.ragged || i.strayQuotes || i.blank}
				<div>
					<dt>Irregular</dt>
					<dd class="warn">
						{[
							i.ragged && `${fmt.format(i.ragged)} rows with a different number of fields`,
							i.strayQuotes &&
								`${fmt.format(i.strayQuotes)} quotes inside unquoted fields, kept as text`,
							i.blank && `${fmt.format(i.blank)} empty lines skipped`
						]
							.filter(Boolean)
							.join('; ')}
					</dd>
				</div>
			{/if}
			{#if autoDc}
				<div>
					<dt>Decimal comma</dt>
					<dd>Numbers like 1.234,50 found, read as 1234.50</dd>
				</div>
			{/if}
		{/if}
		{#if loaded.jsonInfo}
			<div>
				<dt>Read as</dt>
				<dd>
					{loaded.jsonInfo.shape === 'objects'
						? 'array of objects, one row each, keys as columns'
						: loaded.jsonInfo.shape === 'arrays'
							? 'array of arrays, one row each'
							: loaded.jsonInfo.shape === 'object'
								? 'single object, one row'
								: 'array of values, one column'}{loaded.jsonInfo.nested
						? '. Nested values flattened, see the note'
						: ''}
				</dd>
			</div>
		{/if}
	</dl>

	<div class="field filter">
		<label class="label" for="csv-filter">Filter rows</label>
		<input
			id="csv-filter"
			type="search"
			bind:value={filter}
			oninput={onFilter}
			spellcheck="false"
			autocomplete="off"
		/>
	</div>

	<p class="label count" aria-live="polite">
		{#if view.length > shown.length}
			Showing {fmt.format(shown.length)} of {fmt.format(view.length)} rows
		{:else}
			{fmt.format(view.length)} {view.length === 1 ? 'row' : 'rows'}
		{/if}
		{#if filterCommitted.trim()}, filtered from {fmt.format(body.length)}{/if}
	</p>

	<div class="scroll" role="region" aria-label="Table view" tabindex="-1">
		<table>
			<thead>
				<tr>
					<th scope="col" class="num">#</th>
					{#each columns as c, i (i)}
						<th
							scope="col"
							aria-sort={sortCol === i ? (sortDesc ? 'descending' : 'ascending') : undefined}
						>
							<button type="button" class="sort" onclick={() => sortBy(i)}
								>{c}<span class="arrow" aria-hidden="true"
									>{sortCol === i ? (sortDesc ? '▼' : '▲') : ''}</span
								></button
							>
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each shown as r, ri (ri)}
					<tr>
						<td class="num">{ri + 1}</td>
						{#each columns as _, ci (ci)}
							<td><span class="cell">{r[ci] ?? ''}</span></td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	{#if view.length > shown.length}
		<div class="row more">
			<button type="button" onclick={() => (limit += PAGE)}>Show {PAGE} more</button>
		</div>
	{/if}
{/if}

<p class="note">
	Danish, German and other European Excel versions save CSV with semicolons and decimal commas
	(1.234,50). The delimiter is detected; turn on Decimal comma to read such numbers as JSON numbers.
	Values with leading zeros, like zip codes 0800, stay text.
</p>
{#if mode === 'json'}
	<p class="note">
		Nested objects become dot paths: <code>{'{"address": {"city": "Aarhus"}}'}</code> gives a column
		<code>address.city</code>. Arrays go into one cell as JSON text, or into indexed columns
		<code>tags.0</code>, <code>tags.1</code>. Keys from all records are combined, in the order first
		seen; missing values are empty.
	</p>
{/if}
<p class="note">
	The table shows {PAGE} rows at a time. Sorting is numeric where both values are numbers. Your input
	is never stored in the link, only the options.
</p>

<style>
	.opts {
		margin-bottom: 1rem;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
		gap: 1.25rem;
		margin-bottom: 1rem;
	}
	.grid textarea {
		min-height: 16rem;
		tab-size: 4;
	}
	.between {
		justify-content: space-between;
	}
	.err {
		margin-bottom: 1.25rem;
	}
	.excerpt {
		margin: 0.5rem 0 0;
		padding: 0.5rem 0.6rem;
		background: var(--field);
		border: 1px solid var(--rule-soft);
		font-size: 0.875rem;
		overflow-x: auto;
		white-space: pre;
	}
	.caret {
		color: var(--signal);
		font-weight: 700;
	}
	.readout {
		margin: 1rem 0 1.25rem;
	}
	.warn {
		color: var(--signal);
	}
	.filter {
		max-width: 24rem;
		margin-bottom: 0.5rem;
	}
	.count {
		margin: 0 0 0.4rem;
	}
	.scroll {
		overflow: auto;
		max-height: 36rem;
		border-top: 2px solid var(--rule);
		border-bottom: 1px solid var(--rule-soft);
		margin-bottom: 1rem;
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
		padding: 0;
		border-bottom: 1px solid var(--rule);
	}
	th.num {
		padding: 0.3rem 0.6rem;
	}
	.num {
		color: var(--ink-2);
		text-align: right;
		width: 1%;
		white-space: nowrap;
	}
	.sort {
		border: 0;
		width: 100%;
		min-height: 2.75rem;
		justify-content: space-between;
		text-align: left;
		text-transform: none;
		letter-spacing: 0;
		font-size: 0.8125rem;
		font-weight: 700;
		min-width: 9ch;
		max-width: 23rem;
		overflow-wrap: anywhere;
	}
	.arrow {
		color: var(--signal);
		min-width: 1ch;
	}
	.sort:hover .arrow {
		color: inherit;
	}
	tbody tr:hover {
		background: var(--hilite);
	}
	.more {
		margin-bottom: 1.25rem;
	}
	.note {
		margin-bottom: 0.75rem;
	}
	.note code {
		overflow-wrap: anywhere;
	}
</style>
