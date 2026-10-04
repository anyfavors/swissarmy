<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		ALL_FLAGS,
		explain,
		flagInfo,
		parseLiteral,
		segments,
		supportsFlag,
		type Flag,
		type RunResult,
		type Token
	} from './logic';

	const TIMEOUT_MS = 1000;
	/** Test text longer than this is not written to the address bar. */
	const HASH_TEXT_MAX = 2000;

	let pattern = $state('(?<word>\\w+)@(\\w+)\\.com');
	let flags = $state('g');
	let text = $state('Mail ana@example.com or bo@test.com.');
	let replacement = $state('');
	let useReplace = $state(false);
	let result = $state<RunResult | null>(null);
	let timedOut = $state(false);
	let running = $state(false);
	let ready = $state(false);
	let available = $state<Flag[]>(ALL_FLAGS.filter((f) => f !== 'v'));

	let worker: Worker | null = null;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let reqId = 0;

	function kill() {
		worker?.terminate();
		worker = null;
	}

	function run(p: string, f: string, t: string, r: string | undefined) {
		clearTimeout(timer);
		// A worker still busy with an older request is stuck or slow: replace it.
		if (running) kill();
		try {
			worker ??= new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
		} catch {
			result = {
				matches: [],
				truncated: false,
				groupNames: [],
				groupCount: 0,
				error: 'Web Workers are not available, so matching is disabled.'
			};
			return;
		}
		const id = ++reqId;
		running = true;
		worker.onmessage = (e: MessageEvent<{ id: number; result: RunResult }>) => {
			if (e.data.id !== reqId) return;
			clearTimeout(timer);
			running = false;
			timedOut = false;
			result = e.data.result;
		};
		worker.postMessage({ id, pattern: p, flags: f, text: t, replacement: r });
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
		const p = pattern;
		const f = flags;
		const t = text;
		const r = useReplace ? replacement : undefined;
		const d = setTimeout(() => run(p, f, t, r), 150);
		return () => clearTimeout(d);
	});

	const explained = $derived.by((): { tokens?: Token[]; error?: string } => {
		if (!pattern) return {};
		try {
			return { tokens: explain(pattern, flags) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	const segs = $derived(result && !result.error ? segments(text, result.matches) : []);

	function toggle(f: string) {
		const set = new Set(flags);
		if (set.has(f)) set.delete(f);
		else {
			set.add(f);
			// u and v cannot be combined.
			if (f === 'u') set.delete('v');
			if (f === 'v') set.delete('u');
		}
		flags = ALL_FLAGS.filter((x) => set.has(x)).join('');
	}

	onMount(() => {
		available = ALL_FLAGS.filter((f) => supportsFlag(f));
		const h = readHash();
		const src = h.in ?? h.p;
		if (src !== undefined) {
			const lit = parseLiteral(src);
			pattern = lit ? lit.pattern : src;
			if (lit) flags = lit.flags;
		}
		if (h.f !== undefined) flags = h.f.replace(/[^gimsuvy]/g, '');
		if (h.t !== undefined) text = h.t;
		if (h.r !== undefined) {
			replacement = h.r;
			useReplace = true;
		}
		ready = true;
		return () => {
			clearTimeout(timer);
			kill();
		};
	});

	$effect(() => {
		const state = {
			p: pattern,
			f: flags || undefined,
			t: text.length <= HASH_TEXT_MAX ? text : undefined,
			r: useReplace ? replacement : undefined
		};
		if (ready) writeHash(state);
	});
</script>

<div class="field">
	<label class="label" for="re-p">Pattern</label>
	<div class="pat mono">
		<span aria-hidden="true">/</span>
		<input
			id="re-p"
			type="text"
			bind:value={pattern}
			spellcheck="false"
			autocomplete="off"
			autocapitalize="off"
		/>
		<span aria-hidden="true">/{flags}</span>
	</div>
</div>

<div class="row opts" role="group" aria-label="Flags">
	<span class="label">Flags</span>
	{#each available as f (f)}
		<button
			type="button"
			class="flag"
			aria-pressed={flags.includes(f)}
			title={flagInfo[f]}
			aria-label={`${f}, ${flagInfo[f]}`}
			onclick={() => toggle(f)}>{f}</button
		>
	{/each}
</div>

<div class="field">
	<label class="label" for="re-t">Test text</label>
	<textarea id="re-t" bind:value={text} spellcheck="false"></textarea>
</div>

{#if timedOut}
	<p class="error" role="alert">
		Pattern took too long (possible catastrophic backtracking). Stopped after {TIMEOUT_MS / 1000} s.
	</p>
{:else if result?.error}
	<p class="error" role="alert">{result.error}</p>
{:else if result}
	<div class="row summary" aria-live="polite">
		<span class="count">{result.matches.length}{result.truncated ? '+' : ''}</span>
		<span class="label"
			>match{result.matches.length === 1 ? '' : 'es'}{result.truncated
				? `, list stops at ${result.matches.length}`
				: ''}{flags.includes('g') ? '' : ', first only without g'}</span
		>
	</div>
	<h2 class="label sub">Matches in text</h2>
	<pre class="hl">{#each segs as s, i (i)}{#if s.match < 0}{s.text}{:else if s.empty}<mark
					class="zero"
					title={`Empty match ${s.match + 1}`}></mark>{:else}<mark class={s.match % 2 ? 'odd' : ''}
					>{s.text}</mark
				>{/if}{/each}</pre>

	{#if result.matches.length}
		<div class="table-wrap">
			<table class="mono">
				<thead>
					<tr>
						<th scope="col">#</th>
						<th scope="col">Index</th>
						<th scope="col">Match</th>
						{#each Array.from({ length: result.groupCount }, (_, k) => k + 1) as g (g)}
							<th scope="col">${g}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each result.matches.slice(0, 200) as m, i (i)}
						<tr>
							<td>{i + 1}</td>
							<td>{m.index}</td>
							<td class="val">{m.text}</td>
							{#each m.groups as g, k (k)}
								<td class={g === undefined ? 'undef' : 'val'}>{g ?? 'undefined'}</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if result.matches.length > 200}
			<p class="note">Table shows the first 200 matches.</p>
		{/if}
		{#if result.groupNames.length}
			<dl class="readout named">
				{#each result.groupNames as n (n)}
					<div>
						<dt>&lt;{n}&gt; in match 1</dt>
						<dd>{result.matches[0].named[n] ?? 'undefined'}</dd>
					</div>
				{/each}
			</dl>
		{/if}
	{/if}
{:else if running}
	<p class="label">Running...</p>
{/if}

<div class="row opts replace-toggle">
	<button type="button" aria-pressed={useReplace} onclick={() => (useReplace = !useReplace)}
		>Replace</button
	>
</div>
{#if useReplace}
	<div class="field">
		<label class="label" for="re-r">Replacement ($1, $&lt;name&gt;, $&amp;, $$)</label>
		<input id="re-r" type="text" bind:value={replacement} spellcheck="false" autocomplete="off" />
	</div>
	{#if result?.replaced !== undefined && !timedOut}
		<div class="row between out-h">
			<h2 class="label sub">Result of text.replace()</h2>
			<Copy value={result.replaced} />
		</div>
		<pre class="out">{result.replaced}</pre>
	{/if}
{/if}

{#if explained.tokens?.length}
	<h2 class="label sub">Explanation</h2>
	<ol class="explain">
		{#each explained.tokens as t, i (i)}
			<li class={`d${Math.min(t.depth, 6)}`}>
				<code class={t.kind}>{t.src}</code>
				<span>{t.text}</span>
			</li>
		{/each}
	</ol>
{:else if explained.error && !result?.error}
	<p class="note">No explanation: {explained.error}.</p>
{/if}

<details class="cheat">
	<summary class="label">Syntax cheat sheet</summary>
	<dl class="readout">
		<div>
			<dt>. \d \w \s</dt>
			<dd>any char, digit, word char, whitespace (\D \W \S negate)</dd>
		</div>
		<div>
			<dt>[abc] [^abc] [a-z]</dt>
			<dd>one of, none of, range</dd>
		</div>
		<div>
			<dt>^ $ \b \B</dt>
			<dd>start, end (of line with m), word boundary, not boundary</dd>
		</div>
		<div>
			<dt>* + ? {'{n}'} {'{n,m}'}</dt>
			<dd>0+, 1+, 0 or 1, exactly n, n to m</dd>
		</div>
		<div>
			<dt>*? +? ??</dt>
			<dd>lazy: as few as possible</dd>
		</div>
		<div>
			<dt>(x) (?:x) (?&lt;n&gt;x)</dt>
			<dd>capture, group only, named capture</dd>
		</div>
		<div>
			<dt>\1 \k&lt;n&gt;</dt>
			<dd>backreference by number or name</dd>
		</div>
		<div>
			<dt>(?=x) (?!x)</dt>
			<dd>lookahead, negative lookahead</dd>
		</div>
		<div>
			<dt>(?&lt;=x) (?&lt;!x)</dt>
			<dd>lookbehind, negative lookbehind</dd>
		</div>
		<div>
			<dt>a|b</dt>
			<dd>a or b</dd>
		</div>
		<div>
			<dt>\p{'{L}'} \p{'{Script=Greek}'}</dt>
			<dd>Unicode property (u or v flag)</dd>
		</div>
		<div>
			<dt>\t \n \xHH \u{'{HHHH}'}</dt>
			<dd>tab, line feed, hex code unit, code point (u)</dd>
		</div>
		<div>
			<dt>$1 $&lt;n&gt; $&amp; $` $'</dt>
			<dd>in replacement: group, named group, whole match, before, after</dd>
		</div>
	</dl>
</details>

<p class="note">
	This is the JavaScript engine of your browser. Matching runs in a Web Worker that is stopped after {TIMEOUT_MS /
		1000} s, so a runaway pattern cannot freeze the page.
</p>

<style>
	.pat {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 1.1rem;
	}
	.pat span {
		color: var(--ink-2);
	}
	.pat input {
		flex: 1;
		min-width: 0;
	}
	.opts {
		margin: 0.75rem 0 1rem;
	}
	.flag {
		text-transform: none;
		min-width: 2.75rem;
		justify-content: center;
	}
	.summary {
		margin: 1rem 0 0.25rem;
	}
	.count {
		font-family: var(--font-mono);
		font-weight: 700;
		font-size: 1.25rem;
		color: var(--signal);
	}
	.sub {
		margin: 1.25rem 0 0.4rem;
	}
	pre {
		margin: 0;
		padding: 0.65rem 0.75rem;
		border: 1px solid var(--rule-soft);
		background: var(--field);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		font-size: 0.9375rem;
		max-height: 24rem;
		overflow-y: auto;
	}
	mark {
		background: var(--hilite);
		color: var(--ink);
		box-shadow: inset 0 -2px 0 var(--signal);
	}
	mark.odd {
		box-shadow: inset 0 -2px 0 var(--ink);
	}
	mark.zero {
		display: inline-block;
		width: 0;
		height: 1.1em;
		vertical-align: text-bottom;
		border-left: 2px solid var(--signal);
		margin: 0 -1px;
	}
	.table-wrap {
		overflow-x: auto;
		margin-top: 1rem;
	}
	table {
		border-collapse: collapse;
		width: 100%;
		font-size: 0.875rem;
		border-top: 2px solid var(--rule);
	}
	th,
	td {
		text-align: left;
		padding: 0.35rem 0.75rem 0.35rem 0;
		border-bottom: 1px solid var(--rule-soft);
		vertical-align: top;
	}
	th {
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		color: var(--ink-2);
		font-weight: 400;
	}
	td.val {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	td.undef {
		color: var(--ink-2);
		font-style: italic;
	}
	.named {
		margin-top: 1rem;
	}
	.replace-toggle {
		margin-top: 1.5rem;
	}
	.between {
		justify-content: space-between;
	}
	.out-h .sub {
		margin: 0;
	}
	.out-h {
		margin: 1rem 0 0.4rem;
	}
	.explain {
		list-style: none;
		margin: 0;
		padding: 0;
		border-top: 2px solid var(--rule);
	}
	.explain li {
		display: grid;
		grid-template-columns: minmax(4rem, max-content) 1fr;
		gap: 0.25rem 1rem;
		padding: 0.35rem 0;
		border-bottom: 1px solid var(--rule-soft);
		font-size: 0.9375rem;
	}
	.explain code {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		font-weight: 700;
	}
	.explain code.group,
	.explain code.alt {
		color: var(--signal);
	}
	.explain .d1 {
		padding-left: 1rem;
	}
	.explain .d2 {
		padding-left: 2rem;
	}
	.explain .d3 {
		padding-left: 3rem;
	}
	.explain .d4,
	.explain .d5,
	.explain .d6 {
		padding-left: 4rem;
	}
	.cheat {
		margin: 1.5rem 0 1rem;
	}
	.cheat summary {
		cursor: pointer;
		min-height: 2.75rem;
		display: flex;
		align-items: center;
	}
	.cheat .readout dt {
		text-transform: none;
		font-size: 0.875rem;
		color: var(--ink);
	}
	.cheat .readout > div {
		grid-template-columns: minmax(8rem, 14rem) 1fr;
	}
</style>
