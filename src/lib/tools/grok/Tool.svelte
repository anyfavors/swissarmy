<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import { compile, parsePatternFile, segments, type Compiled, type GrokRun } from './logic';
	import { CORE } from './patterns';

	const TIMEOUT_MS = 1000;
	const PATTERN_SAMPLE = '%{SYSLOGBASE} %{GREEDYDATA:message}';
	const LINES_SAMPLE = `Oct  5 08:01:02 web01 sshd[4242]: Accepted publickey for deploy from 192.0.2.5 port 50412
Oct  5 08:01:09 web01 CRON[4250]: (root) CMD (run-parts /etc/cron.hourly)
this line does not match`;

	let pattern = $state(PATTERN_SAMPLE);
	let customText = $state('');
	let lines = $state(LINES_SAMPLE);
	let result = $state<GrokRun | null>(null);
	let timedOut = $state(false);
	let running = $state(false);
	let ready = $state(false);

	const compiled = $derived.by((): { c?: Compiled; error?: string } => {
		try {
			return { c: compile(pattern.trim(), parsePatternFile(customText)) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	let worker: Worker | null = null;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let reqId = 0;

	function kill() {
		worker?.terminate();
		worker = null;
	}

	function run(c: Compiled, t: string) {
		clearTimeout(timer);
		if (running) kill();
		try {
			worker ??= new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
		} catch {
			result = {
				results: [],
				truncated: false,
				error: 'Web Workers are not available, so matching is disabled.'
			};
			return;
		}
		const id = ++reqId;
		running = true;
		worker.onmessage = (e: MessageEvent<{ id: number; result: GrokRun }>) => {
			if (e.data.id !== reqId) return;
			clearTimeout(timer);
			running = false;
			timedOut = false;
			result = e.data.result;
		};
		// Plain data only: the compiled pattern is copied into the worker.
		worker.postMessage({
			id,
			compiled: { source: c.source, flags: c.flags, captures: c.captures },
			text: t
		});
		timer = setTimeout(() => {
			if (id !== reqId) return;
			kill();
			running = false;
			timedOut = true;
			result = null;
		}, TIMEOUT_MS);
	}

	$effect(() => {
		if (!ready) return;
		const c = compiled.c;
		const t = lines;
		if (!c) {
			result = null;
			return;
		}
		const d = setTimeout(() => run(c, t), 200);
		return () => clearTimeout(d);
	});

	const matched = $derived(result ? result.results.filter((r) => r.match).length : 0);
	const groups = [...new Set(CORE.map((p) => p.group))];

	function show(v: string | number | (string | number)[]): string {
		return Array.isArray(v) ? JSON.stringify(v) : typeof v === 'number' ? String(v) : v;
	}

	onMount(() => {
		const h = readHash();
		if (h.p !== undefined) pattern = h.p;
		if (h.c !== undefined) customText = h.c;
		if (h.in !== undefined) {
			if (/%\{\w+/.test(h.in)) pattern = h.in.trim();
			else lines = h.in;
		}
		ready = true;
		return () => {
			clearTimeout(timer);
			kill();
		};
	});

	// Sample lines are log data and stay out of the address bar; the pattern does not.
	$effect(() => {
		const state = {
			p: pattern !== PATTERN_SAMPLE ? pattern : undefined,
			c: customText || undefined
		};
		if (ready) writeHash(state);
	});
</script>

<div class="field">
	<label class="label" for="gk-p">Grok pattern</label>
	<textarea id="gk-p" class="pat" bind:value={pattern} spellcheck="false" autocapitalize="off"
	></textarea>
</div>

<details class="custom" open={customText !== ''}>
	<summary class="label">Custom patterns</summary>
	<div class="field">
		<label class="label" for="gk-c">One per line: NAME regex</label>
		<textarea
			id="gk-c"
			class="short"
			bind:value={customText}
			spellcheck="false"
			autocapitalize="off"
			placeholder="POSTFIX_QUEUEID [0-9A-F]&#123;10,11&#125;"></textarea>
	</div>
</details>

{#if compiled.error}
	<p class="error" role="alert">{compiled.error}</p>
{/if}

<div class="field">
	<label class="label" for="gk-l">Sample lines</label>
	<textarea id="gk-l" bind:value={lines} spellcheck="false" autocapitalize="off" wrap="off"
	></textarea>
</div>

{#if timedOut}
	<p class="error" role="alert">
		Matching took longer than {TIMEOUT_MS / 1000} s and was stopped. The pattern probably backtracks heavily:
		replace DATA and GREEDYDATA in the middle with narrower patterns such as NOTSPACE.
	</p>
{:else if result?.error}
	<p class="error" role="alert">{result.error}</p>
{:else if result && compiled.c}
	<p class="summary label">
		{matched} of {result.results.length} line{result.results.length === 1 ? '' : 's'} matched{result.truncated
			? ', only the first 500 lines tested'
			: ''}{running ? ', updating' : ''}
	</p>
	<ol class="results">
		{#each result.results as r, i (i)}
			<li class:miss={!r.match}>
				<p class="line mono">
					{#each segments(r) as s, j (j)}{#if s.kind === 'field'}<mark class="f" title={s.field}
								>{s.text}</mark
							>{:else if s.kind === 'match'}<span class="m">{s.text}</span
							>{:else}{s.text}{/if}{/each}
				</p>
				{#if !r.match}
					<p class="nomatch">No match (Logstash tags this _grokparsefailure)</p>
				{:else if r.fields.length}
					<dl class="readout">
						{#each r.fields as f (f.field)}
							<div>
								<dt>{f.field}</dt>
								<dd>
									{show(f.value)}{#if typeof f.value === 'number'}<span class="type">
											number</span
										>{/if}
								</dd>
								<span class="pat-name">{f.pattern}</span>
							</div>
						{/each}
					</dl>
				{:else}
					<p class="nomatch">Matched, but the pattern names no fields</p>
				{/if}
			</li>
		{/each}
	</ol>
{/if}

{#if compiled.c}
	<details class="expanded">
		<summary class="label"
			>Expanded regular expression, {compiled.c.source.length} characters</summary
		>
		<div class="row head">
			<span class="label"
				>JavaScript{compiled.c.flags ? `, flags ${compiled.c.flags}` : ''}, field groups g0 to g{Math.max(
					compiled.c.captures.length - 1,
					0
				)}</span
			>
			<Copy value={compiled.c.source} />
		</div>
		<pre>{compiled.c.source}</pre>
	</details>
{/if}

<details class="library">
	<summary class="label">Built-in patterns ({CORE.length})</summary>
	{#each groups as g (g)}
		<h2 class="label">{g}</h2>
		<dl>
			{#each CORE.filter((p) => p.group === g) as p (p.name)}
				<div>
					<dt class="mono">{p.name}</dt>
					<dd class="mono">{p.regex}</dd>
					{#if p.note}<dd class="pnote">{p.note}</dd>{/if}
				</div>
			{/each}
		</dl>
	{/each}
</details>

<p class="note">
	Grok tries the pattern anywhere in the line and keeps the first match, so add ^ and $ to anchor
	it. Fields from patterns inside other patterns, such as program and pid in SYSLOGBASE, are
	captured too. Logstash uses the Oniguruma engine; here it runs in your browser's engine, with
	atomic groups emulated, in a worker that is stopped after {TIMEOUT_MS / 1000} s.
</p>

<style>
	.pat {
		min-height: 4.5rem;
	}
	.short {
		min-height: 5rem;
	}
	textarea {
		min-height: 8rem;
	}
	.custom,
	.expanded,
	.library {
		margin: 0.75rem 0 1rem;
	}
	summary {
		cursor: pointer;
		min-height: 2.75rem;
		display: flex;
		align-items: center;
	}
	.summary {
		margin: 1.25rem 0 0.5rem;
	}
	.results {
		list-style: none;
		margin: 0 0 1.5rem;
		padding: 0;
		border-top: 2px solid var(--rule);
	}
	.results > li {
		padding: 0.6rem 0;
		border-bottom: 1px solid var(--rule);
	}
	.line {
		margin: 0 0 0.5rem;
		padding: 0.4rem 0.5rem;
		background: var(--field);
		border: 1px solid var(--rule-soft);
		font-size: 0.875rem;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.m {
		background: var(--hilite);
	}
	mark.f {
		background: var(--hilite);
		color: inherit;
		border-bottom: 2px solid var(--signal);
	}
	.miss .line {
		color: var(--ink-2);
	}
	.nomatch {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		color: var(--signal);
	}
	.type,
	.pat-name {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		color: var(--ink-2);
	}
	.head {
		justify-content: space-between;
		padding: 0.35rem 0;
		border-top: 2px solid var(--rule);
		border-bottom: 1px solid var(--rule-soft);
	}
	pre {
		margin: 0;
		padding: 0.75rem;
		background: var(--field);
		font-size: 0.8125rem;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		max-height: 20rem;
		overflow-y: auto;
	}
	.library h2 {
		margin: 1rem 0 0.35rem;
		font-weight: 400;
	}
	.library dl {
		margin: 0;
		border-top: 1px solid var(--rule);
	}
	.library dl > div {
		padding: 0.35rem 0;
		border-bottom: 1px solid var(--rule-soft);
	}
	.library dt {
		font-weight: 700;
		font-size: 0.875rem;
	}
	.library dd {
		margin: 0;
		font-size: 0.75rem;
		color: var(--ink-2);
		overflow-wrap: anywhere;
	}
	.library .pnote {
		font-family: var(--font-body);
		font-style: italic;
	}
	.error {
		margin: 0.75rem 0;
	}
	.note {
		margin: 0 0 1rem;
	}
</style>
