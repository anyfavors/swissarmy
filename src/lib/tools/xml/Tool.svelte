<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import { locate, type Located } from '../json/logic';
	import { formatXml, minifyXml, parseXml, XmlError, type XmlIndent, type XmlStats } from './logic';

	const MAX_HITS = 200;

	type Mode = 'format' | 'minify';

	let input = $state('');
	let committed = $state('');
	let mode = $state<Mode>('format');
	let indent = $state<XmlIndent>(2);
	let wrap = $state(true);
	let comments = $state(true);
	let xpath = $state('');
	let xpathCommitted = $state('');
	let ready = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;
	let xtimer: ReturnType<typeof setTimeout> | undefined;

	const indents: { v: XmlIndent; label: string }[] = [
		{ v: 2, label: '2 spaces' },
		{ v: 4, label: '4 spaces' },
		{ v: 'tab', label: 'Tab' }
	];

	function onInput() {
		clearTimeout(timer);
		const delay = input.length > 1_000_000 ? 400 : input.length > 50_000 ? 200 : 80;
		timer = setTimeout(() => (committed = input), delay);
	}

	function onXPath() {
		clearTimeout(xtimer);
		xtimer = setTimeout(() => (xpathCommitted = xpath), 200);
	}

	const result = $derived.by(
		(): { output?: string; stats?: XmlStats; doctype?: string; error?: string; at?: Located } => {
			if (!committed.trim()) return {};
			try {
				const doc = parseXml(committed);
				const output =
					mode === 'minify'
						? minifyXml(committed, { keepComments: comments })
						: formatXml(committed, { indent, wrap: wrap ? 100 : 0, keepComments: comments });
				return { output, stats: doc.stats, doctype: doc.doctype };
			} catch (e) {
				if (e instanceof XmlError) return { error: e.message, at: locate(committed, e.pos) };
				return { error: (e as Error).message };
			}
		}
	);

	interface Hit {
		kind: string;
		text: string;
	}

	/** Runs XPath 1.0 with the browser's own engine. Browser only. */
	const xpathResult = $derived.by(
		(): { hits?: Hit[]; value?: string; total?: number; error?: string } => {
			const expr = xpathCommitted.trim();
			if (!expr || !result.stats) return {};
			if (typeof DOMParser === 'undefined' || typeof XPathResult === 'undefined')
				return { error: 'XPath needs the browser' };
			if (result.stats.entities.length)
				return {
					error:
						'XPath is off for documents that declare entities, so the browser never expands them'
				};
			const doc = new DOMParser().parseFromString(committed, 'application/xml');
			if (doc.getElementsByTagName('parsererror').length)
				return { error: 'The browser could not parse this document' };
			const ns = new Map(result.stats.namespaces);
			if (ns.has('') && !ns.has('d')) ns.set('d', ns.get('')!);
			try {
				const r = doc.evaluate(
					expr,
					doc,
					(prefix) => (prefix ? (ns.get(prefix) ?? null) : null),
					XPathResult.ANY_TYPE,
					null
				);
				switch (r.resultType) {
					case XPathResult.NUMBER_TYPE:
						return { value: String(r.numberValue) };
					case XPathResult.STRING_TYPE:
						return { value: JSON.stringify(r.stringValue) };
					case XPathResult.BOOLEAN_TYPE:
						return { value: String(r.booleanValue) };
				}
				const hits: Hit[] = [];
				const ser = new XMLSerializer();
				let total = 0;
				for (let n = r.iterateNext(); n; n = r.iterateNext()) {
					total++;
					if (hits.length >= MAX_HITS) continue;
					let text: string;
					let kind: string;
					if (n.nodeType === Node.ATTRIBUTE_NODE) {
						kind = 'Attribute';
						text = `${(n as Attr).name}="${(n as Attr).value}"`;
					} else if (n.nodeType === Node.ELEMENT_NODE) {
						kind = 'Element';
						text = ser.serializeToString(n);
					} else if (n.nodeType === Node.TEXT_NODE || n.nodeType === Node.CDATA_SECTION_NODE) {
						kind = 'Text';
						text = n.nodeValue ?? '';
					} else {
						kind = n.nodeName;
						text = ser.serializeToString(n);
					}
					if (text.length > 2000) text = text.slice(0, 2000) + ' …';
					hits.push({ kind, text });
				}
				return { hits, total };
			} catch (e) {
				return { error: `XPath error: ${(e as Error).message}` };
			}
		}
	);

	const fmt = new Intl.NumberFormat('en-GB');

	onMount(() => {
		const h = readHash();
		if (h.mode === 'minify') mode = 'minify';
		if (h.ind === '4') indent = 4;
		if (h.ind === 'tab') indent = 'tab';
		if (h.wrap === '0') wrap = false;
		if (h.com === '0') comments = false;
		if (h.xp) xpath = xpathCommitted = h.xp;
		if (h.in) input = committed = h.in;
		ready = true;
		return () => {
			clearTimeout(timer);
			clearTimeout(xtimer);
		};
	});

	$effect(() => {
		const state = {
			// Input stays out of the URL: configs and data dumps often hold secrets or personal data.
			mode: mode === 'minify' ? mode : undefined,
			ind: indent === 2 ? undefined : String(indent),
			wrap: wrap ? undefined : '0',
			com: comments ? undefined : '0',
			xp: xpathCommitted || undefined
		};
		if (ready) writeHash(state);
	});
</script>

<div class="row opts" role="group" aria-label="Output">
	<span class="label">Output</span>
	<button type="button" aria-pressed={mode === 'format'} onclick={() => (mode = 'format')}
		>Format</button
	>
	<button type="button" aria-pressed={mode === 'minify'} onclick={() => (mode = 'minify')}
		>Minify</button
	>
	<button type="button" aria-pressed={comments} onclick={() => (comments = !comments)}
		>Comments</button
	>
</div>
{#if mode === 'format'}
	<div class="row opts" role="group" aria-label="Indentation">
		<span class="label">Indent</span>
		{#each indents as o (o.v)}
			<button type="button" aria-pressed={indent === o.v} onclick={() => (indent = o.v)}
				>{o.label}</button
			>
		{/each}
		<button type="button" aria-pressed={wrap} onclick={() => (wrap = !wrap)}>Wrap attributes</button
		>
	</div>
{/if}

<div class="grid">
	<div class="field">
		<div class="row between">
			<label class="label" for="xml-in">XML input</label>
			{#if result.output !== undefined}<span class="label ok">Well-formed</span>{/if}
		</div>
		<textarea
			id="xml-in"
			bind:value={input}
			oninput={onInput}
			spellcheck="false"
			aria-invalid={!!result.error}
			aria-describedby={result.error ? 'xml-err' : undefined}></textarea>
	</div>
	<div class="field">
		<div class="row between">
			<label class="label" for="xml-out">{mode === 'format' ? 'Formatted' : 'Minified'}</label>
			<Copy value={result.output ?? ''} />
		</div>
		<textarea id="xml-out" readonly value={result.output ?? ''} spellcheck="false"></textarea>
	</div>
</div>

{#if result.error}
	<div id="xml-err" class="err" role="alert">
		<p class="error">
			{result.error}{#if result.at}, line {result.at.line} column {result.at.col}{/if}
		</p>
		{#if result.at}
			<pre class="excerpt" aria-hidden="true">{result.at.excerpt}
<span class="caret">{result.at.caret}</span></pre>
		{/if}
	</div>
{:else if result.stats}
	{@const s = result.stats}
	<dl class="readout">
		<div>
			<dt>Elements</dt>
			<dd>{fmt.format(s.elements)}, depth {s.depth}</dd>
		</div>
		<div>
			<dt>Attributes</dt>
			<dd>{fmt.format(s.attributes)}</dd>
		</div>
		{#if s.comments}
			<div>
				<dt>Comments</dt>
				<dd>{fmt.format(s.comments)}</dd>
			</div>
		{/if}
		{#each [...s.namespaces] as [prefix, uri] (prefix)}
			<div>
				<dt>Namespace {prefix || '(default)'}</dt>
				<dd>{uri}</dd>
			</div>
		{/each}
		{#if result.doctype}
			<div>
				<dt>DOCTYPE</dt>
				<dd class="pre">{result.doctype}</dd>
			</div>
		{/if}
		{#if s.entities.length}
			<div>
				<dt>Entities</dt>
				<dd>
					{s.entities.join(', ')}{#if s.externalEntities.length}<span class="warn"
							>. External, never loaded: {s.externalEntities.join(', ')}</span
						>{/if}
				</dd>
			</div>
		{/if}
		{#if s.unchecked.length}
			<div>
				<dt>Not checked</dt>
				<dd>
					{s.unchecked.map((e) => `&${e};`).join(' ')}, defined in an external DTD that is not
					loaded
				</dd>
			</div>
		{/if}
	</dl>

	<div class="field xpath">
		<label class="label" for="xml-xpath">XPath</label>
		<input
			id="xml-xpath"
			type="text"
			bind:value={xpath}
			oninput={onXPath}
			spellcheck="false"
			autocomplete="off"
			autocapitalize="off"
			placeholder="//item[@id='1']/name"
		/>
	</div>
	{#if xpathResult.error}
		<p class="error" role="alert">{xpathResult.error}</p>
	{:else if xpathResult.value !== undefined}
		<p class="value mono">{xpathResult.value}</p>
	{:else if xpathResult.hits}
		<p class="label count">
			{xpathResult.total === 1
				? '1 match'
				: `${fmt.format(xpathResult.total ?? 0)} matches`}{#if (xpathResult.total ?? 0) > MAX_HITS},
				first {MAX_HITS}
				shown{/if}
		</p>
		<ol class="hits">
			{#each xpathResult.hits as h, i (i)}
				<li><span class="kind">{h.kind}</span><code>{h.text}</code></li>
			{/each}
		</ol>
	{/if}
{/if}

<p class="note">
	Text inside elements is kept exactly as written. Blank text between elements is treated as
	insignificant and replaced by indentation, as most formatters do; mark elements with
	<code>xml:space="preserve"</code> to keep it. Elements that mix text and tags are left untouched.
</p>
<p class="note">
	Nothing is ever loaded: external DTDs and entities are shown, not fetched, and entity references
	stay as written. XPath uses the browser's XPath 1.0 engine. Prefixes declared in the document can
	be used; elements in a default namespace need the prefix <code>d:</code>, as in
	<code>//d:item</code>.
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
		min-height: 18rem;
		tab-size: 2;
	}
	.between {
		justify-content: space-between;
	}
	.ok {
		color: var(--signal);
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
		margin: 1rem 0 1.5rem;
	}
	.pre {
		white-space: pre-wrap;
		font-size: 0.875rem;
	}
	.warn {
		color: var(--signal);
	}
	.xpath {
		margin-bottom: 0.75rem;
	}
	.value {
		margin: 0 0 1.25rem;
		padding: 0.5rem 0.6rem;
		background: var(--hilite);
		overflow-wrap: anywhere;
	}
	.count {
		margin: 0 0 0.4rem;
	}
	.hits {
		list-style: none;
		margin: 0 0 1.5rem;
		padding: 0;
		border-top: 2px solid var(--rule);
	}
	.hits li {
		display: grid;
		grid-template-columns: 6rem 1fr;
		gap: 0.75rem;
		padding: 0.4rem 0;
		border-bottom: 1px solid var(--rule-soft);
	}
	.hits code {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		font-size: 0.875rem;
	}
	.kind {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-2);
	}
	.note {
		margin-bottom: 0.75rem;
	}
	.note code {
		overflow-wrap: anywhere;
	}
</style>
