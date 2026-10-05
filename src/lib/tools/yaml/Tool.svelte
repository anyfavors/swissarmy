<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import { JsonError, locate, type Indent, type Located } from '../json/logic';
	import { jsonToYaml, YamlError, yamlToJson, type YamlToJson } from './logic';

	type Dir = 'to-json' | 'to-yaml';

	let dir = $state<Dir>('to-json');
	let input = $state('');
	let committed = $state('');
	let indent = $state<Indent>(2);
	let multi = $state<'array' | 'first'>('array');
	let ready = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	const indents: { v: Indent; label: string }[] = [
		{ v: 2, label: '2 spaces' },
		{ v: 4, label: '4 spaces' },
		{ v: 'min', label: 'Minify' }
	];

	function onInput() {
		clearTimeout(timer);
		const delay = input.length > 1_000_000 ? 400 : input.length > 50_000 ? 200 : 80;
		timer = setTimeout(() => (committed = input), delay);
	}

	function setDir(d: Dir) {
		if (d === dir) return;
		// Carry the current output over as the new input, so the two directions chain.
		const carry = result.output;
		dir = d;
		input = committed = carry ?? input;
	}

	interface Result {
		output?: string;
		info?: YamlToJson;
		error?: string;
		at?: Located;
		warnings?: { line: number; message: string }[];
	}

	const result = $derived.by((): Result => {
		if (!committed.trim()) return {};
		try {
			if (dir === 'to-yaml') return { output: jsonToYaml(committed) };
			const info = yamlToJson(committed, { indent, multi });
			return {
				output: info.json,
				info,
				warnings: info.warnings.map((w) => ({
					line: locate(committed, w.pos).line,
					message: w.message
				}))
			};
		} catch (e) {
			if (e instanceof YamlError || e instanceof JsonError)
				return { error: e.message, at: locate(committed, e.pos) };
			return { error: (e as Error).message };
		}
	});

	onMount(() => {
		const h = readHash();
		if (h.dir === 'to-yaml') dir = 'to-yaml';
		if (h.ind === '4') indent = 4;
		if (h.ind === 'min') indent = 'min';
		if (h.multi === 'first') multi = 'first';
		if (h.in) input = committed = h.in;
		ready = true;
		return () => clearTimeout(timer);
	});

	$effect(() => {
		const state = {
			// Input stays out of the URL: configs and data dumps often hold secrets or personal data.
			dir: dir === 'to-yaml' ? dir : undefined,
			ind: indent === 2 ? undefined : String(indent),
			multi: multi === 'first' ? multi : undefined
		};
		if (ready) writeHash(state);
	});
</script>

<div class="row opts" role="group" aria-label="Direction">
	<span class="label">Convert</span>
	<button type="button" aria-pressed={dir === 'to-json'} onclick={() => setDir('to-json')}
		>YAML to JSON</button
	>
	<button type="button" aria-pressed={dir === 'to-yaml'} onclick={() => setDir('to-yaml')}
		>JSON to YAML</button
	>
</div>

{#if dir === 'to-json'}
	<div class="row opts" role="group" aria-label="JSON output">
		<span class="label">Indent</span>
		{#each indents as o (o.v)}
			<button type="button" aria-pressed={indent === o.v} onclick={() => (indent = o.v)}
				>{o.label}</button
			>
		{/each}
		{#if result.info && result.info.documents > 1}
			<span class="label">Documents</span>
			<button type="button" aria-pressed={multi === 'array'} onclick={() => (multi = 'array')}
				>All, as array</button
			>
			<button type="button" aria-pressed={multi === 'first'} onclick={() => (multi = 'first')}
				>First only</button
			>
		{/if}
	</div>
{/if}

<div class="grid">
	<div class="field">
		<div class="row between">
			<label class="label" for="yaml-in">{dir === 'to-json' ? 'YAML' : 'JSON'}</label>
			{#if result.output !== undefined}<span class="label ok">Valid</span>{/if}
		</div>
		<textarea
			id="yaml-in"
			bind:value={input}
			oninput={onInput}
			spellcheck="false"
			aria-invalid={!!result.error}
			aria-describedby={result.error ? 'yaml-err' : undefined}></textarea>
	</div>
	<div class="field">
		<div class="row between">
			<label class="label" for="yaml-out">{dir === 'to-json' ? 'JSON' : 'YAML'}</label>
			<Copy value={result.output ?? ''} />
		</div>
		<textarea id="yaml-out" readonly value={result.output ?? ''} spellcheck="false"></textarea>
	</div>
</div>

{#if result.error}
	<div id="yaml-err" class="err" role="alert">
		<p class="error">
			{result.error}{#if result.at}, line {result.at.line} column {result.at.col}{/if}
		</p>
		{#if result.at}
			<pre class="excerpt" aria-hidden="true">{result.at.excerpt}
<span class="caret">{result.at.caret}</span></pre>
		{/if}
	</div>
{:else if result.info}
	<dl class="readout">
		<div>
			<dt>Documents</dt>
			<dd>
				{result.info.documents}{#if result.info.documents > 1}, {multi === 'array'
						? 'shown as a JSON array'
						: 'first one shown'}{/if}
			</dd>
		</div>
		<div>
			<dt>Warnings</dt>
			<dd class:warn={result.warnings?.length}>{result.warnings?.length || 'None'}</dd>
		</div>
	</dl>
	{#if result.warnings?.length}
		<ul class="warnings">
			{#each result.warnings as w, i (i)}
				<li><span class="line">Line {w.line}</span> {w.message}</li>
			{/each}
		</ul>
	{/if}
{/if}

<p class="note">
	Values are read with the YAML 1.2 core schema. Older YAML 1.1 parsers (PyYAML, go-yaml v2, many
	Ansible and Helm setups) read <code>no</code>, <code>off</code> and <code>y</code> as booleans,
	<code>0644</code>
	as octal and <code>22:22</code> as a base 60 number: the Norway problem. Such values are flagged above.
	JSON to YAML quotes every string either version could misread.
</p>
<p class="note">
	Anchors, aliases and merge keys (<code>&lt;&lt;</code>) are expanded. Custom tags like
	<code>!Ref</code>, binary data and complex keys have no JSON form and are reported as errors.
	Numbers keep their digits. Your input is never stored in the link, only the options.
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
		margin: 1rem 0 1rem;
	}
	.warn {
		color: var(--signal);
	}
	.warnings {
		list-style: none;
		margin: 0 0 1.5rem;
		padding: 0;
		font-size: 0.9375rem;
	}
	.warnings li {
		padding: 0.4rem 0 0.4rem 0.6rem;
		border-left: 3px solid var(--signal);
		border-bottom: 1px solid var(--rule-soft);
		overflow-wrap: anywhere;
	}
	.line {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-2);
		margin-right: 0.4rem;
	}
	.note {
		margin-bottom: 0.75rem;
	}
</style>
