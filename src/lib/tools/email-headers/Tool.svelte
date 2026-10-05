<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		analyse,
		decodeWords,
		formatDuration,
		formatUtc,
		SLOW_HOP,
		type Address,
		type Analysis,
		type AuthResults,
		type MailDate
	} from './logic';

	let raw = $state('');

	const result = $derived.by((): { a?: Analysis; error?: string } => {
		if (!raw.trim()) return {};
		try {
			return { a: analyse(raw) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	const addr = (x?: Address) =>
		x ? (x.display ? `${x.display} <${x.address}>` : x.address || '<> (null sender)') : '';
	const when = (d: MailDate | null) =>
		d ? formatUtc(d.ms) + (d.zoneUnknown ? ' (zone unknown, read as UTC)' : '') : 'unreadable';
	const resultClass = (r: string) =>
		r === 'pass' ? 'r-pass' : ['fail', 'permerror', 'softfail'].includes(r) ? 'r-fail' : 'r-other';

	onMount(() => {
		// The front page intake may pass the text in the fragment. Headers contain addresses,
		// so take it and clear the fragment right away.
		const h = readHash();
		if (h.in) raw = h.in;
		writeHash({});
	});
</script>

{#snippet authBlock(a: AuthResults, title: string)}
	<div class="auth">
		<p class="label">{title} <span class="mono srv">{a.authserv || 'unknown'}</span></p>
		{#if !a.results.length}
			<p class="note">No results (none).</p>
		{/if}
		<ul class="results">
			{#each a.results as r, i (i)}
				<li>
					<div class="rhead">
						<span class="mono method">{r.method}{r.version ? `/${r.version}` : ''}</span>
						<span class="res {resultClass(r.result)}">{r.result}</span>
						{#each r.props as p, j (j)}
							<span class="mono prop"><span class="dim">{p.key}=</span>{p.value}</span>
						{/each}
					</div>
					<p class="explain">{r.explain}</p>
					{#if r.reason}<p class="dim small">Reason: {r.reason}</p>{/if}
					{#each r.comments as c, j (j)}<p class="dim small mono">({c})</p>{/each}
				</li>
			{/each}
		</ul>
	</div>
{/snippet}

<div class="field">
	<label class="label" for="eh-in">Raw headers</label>
	<textarea
		id="eh-in"
		bind:value={raw}
		spellcheck="false"
		autocomplete="off"
		autocapitalize="off"
		placeholder="Received: from ..."></textarea>
</div>
<p class="note">
	In Gmail: Show original. In Outlook: File, Properties, Internet headers. In Apple Mail: View,
	Message, All Headers. Everything stays in this tab and is never written to the address bar.
</p>

{#if result.error}
	<p class="error" role="alert">{result.error}</p>
{:else if result.a}
	{@const a = result.a}

	<section>
		<h2 class="label">Message</h2>
		<dl class="readout">
			{#if a.subject !== undefined}
				<div>
					<dt>Subject</dt>
					<dd>{a.subject}</dd>
					<Copy value={a.subject} />
				</div>
			{/if}
			{#if a.from}<div>
					<dt>From</dt>
					<dd>{addr(a.from)}</dd>
					<span></span>
				</div>{/if}
			{#if a.sender}<div>
					<dt>Sender</dt>
					<dd>{addr(a.sender)}</dd>
					<span></span>
				</div>{/if}
			{#if a.replyTo}<div>
					<dt>Reply-To</dt>
					<dd>{addr(a.replyTo)}</dd>
					<span></span>
				</div>{/if}
			{#if a.returnPath}
				<div>
					<dt>Return-Path</dt>
					<dd>{addr(a.returnPath)}</dd>
					<span></span>
				</div>
			{/if}
			{#if a.to !== undefined}<div>
					<dt>To</dt>
					<dd>{a.to}</dd>
					<span></span>
				</div>{/if}
			{#if a.date}
				<div>
					<dt>Date</dt>
					<dd>{a.date.raw}<span class="sub">{when(a.date.parsed)}</span></dd>
					<span></span>
				</div>
			{/if}
			{#if a.messageId}
				<div>
					<dt>Message-ID</dt>
					<dd>
						{a.messageId.raw}{#if a.messageId.domain}<span class="sub"
								>domain {a.messageId.domain}</span
							>{/if}
					</dd>
					<Copy value={a.messageId.raw} />
				</div>
			{/if}
			{#if a.originatingIp}
				<div>
					<dt>X-Originating-IP</dt>
					<dd>{a.originatingIp}<span class="sub">client IP of the person who sent it</span></dd>
					<Copy value={a.originatingIp} />
				</div>
			{/if}
		</dl>
	</section>

	{#if a.findings.length}
		<section>
			<h2 class="label">Findings</h2>
			<ul class="findings">
				{#each a.findings as f, i (i)}
					<li class="lv-{f.level}"><span class="lvl">{f.level}</span> {f.text}</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if a.hops.length}
		<section>
			<h2 class="label">Route, {a.hops.length} hops, oldest first</h2>
			<dl class="readout">
				{#if a.transit.total !== undefined}
					<div>
						<dt>Total transit</dt>
						<dd>
							{formatDuration(a.transit.total)}<span class="sub">first to last Received</span>
						</dd>
						<span></span>
					</div>
				{/if}
				{#if a.transit.fromDate !== undefined}
					<div>
						<dt>Date to first hop</dt>
						<dd>
							{formatDuration(a.transit.fromDate)}<span class="sub"
								>depends on the sender clock</span
							>
						</dd>
						<span></span>
					</div>
				{/if}
			</dl>
			<ol class="hops">
				{#each a.hops as h (h.n)}
					<li class:slow={h.flag === 'slow'} class:skew={h.flag === 'skew'}>
						<div class="hhead">
							<span class="hn mono">{h.n}</span>
							<span class="mono when"
								>{h.date ? formatUtc(h.date.ms) : (h.dateRaw ?? 'no date')}</span
							>
							{#if h.delay !== undefined}
								<span class="delay mono"
									>{h.delay >= 0 ? '+' : ''}{formatDuration(h.delay)}{h.flag === 'slow'
										? ' slow'
										: h.flag === 'skew'
											? ' clock skew'
											: ''}</span
								>
							{/if}
						</div>
						<dl class="hop">
							{#if h.from}
								<div>
									<dt>from</dt>
									<dd>
										{h.from}{#if h.fromIp}<span class="ip">{h.fromIp}</span>{/if}
										{#if h.fromInfo}<span class="sub">({h.fromInfo})</span>{/if}
									</dd>
								</div>
							{/if}
							{#if h.by}<div>
									<dt>by</dt>
									<dd>{h.by}</dd>
								</div>{/if}
							{#if h.with}<div>
									<dt>with</dt>
									<dd>{h.with}</dd>
								</div>{/if}
							{#if h.id}<div>
									<dt>id</dt>
									<dd>{h.id}</dd>
								</div>{/if}
							{#if h.for}<div>
									<dt>for</dt>
									<dd>{h.for}</dd>
								</div>{/if}
						</dl>
						<details>
							<summary class="label">Raw</summary>
							<p class="mono rawline">{h.raw}</p>
						</details>
					</li>
				{/each}
			</ol>
			<p class="note">
				Each server adds a Received line on top, so the bottom one is the first hop. Times are the
				receiving server's clock. Delays over {SLOW_HOP / 60} minutes are marked slow; a negative delay
				means the clocks disagree. Lines below the first server you trust can be forged.
			</p>
		</section>
	{/if}

	{#if a.auth.length || a.receivedSpf.length}
		<section>
			<h2 class="label">Authentication</h2>
			{#each a.auth as ar, i (i)}
				{@render authBlock(ar, `Authentication-Results ${a.auth.length > 1 ? i + 1 : ''} by`)}
			{/each}
			{#each a.receivedSpf as s, i (i)}
				<div class="auth">
					<p class="label">Received-SPF</p>
					<div class="rhead">
						<span class="mono method">spf</span>
						<span class="res {resultClass(s.result)}">{s.result}</span>
						{#each s.pairs as p, j (j)}
							<span class="mono prop"><span class="dim">{p.key}=</span>{p.value}</span>
						{/each}
					</div>
					<p class="explain">{s.explain}</p>
					{#if s.comment}<p class="dim small mono">({s.comment})</p>{/if}
				</div>
			{/each}
			{#if a.auth.length > 1}
				<p class="note">
					Several Authentication-Results headers: only trust the one added by your own receiving
					server (its name is the first word). Anything below it may have been written by the
					sender.
				</p>
			{/if}
		</section>
	{/if}

	{#if a.dkim.length}
		<section>
			<h2 class="label">DKIM signatures ({a.dkim.length})</h2>
			{#each a.dkim as d, i (i)}
				<dl class="readout sig">
					<div>
						<dt>Domain d=</dt>
						<dd>{d.domain ?? 'missing'}</dd>
						<span></span>
					</div>
					<div>
						<dt>Selector s=</dt>
						<dd>{d.selector ?? 'missing'}</dd>
						<span></span>
					</div>
					{#if d.keyName}
						<div>
							<dt>Key record</dt>
							<dd>{d.keyName}<span class="sub">TXT, look it up with the DNS tool</span></dd>
							<Copy value={d.keyName} />
						</div>
					{/if}
					<div>
						<dt>Algorithm a=</dt>
						<dd>
							{d.algorithm ?? 'missing'}{#if d.bits}<span class="sub">signature {d.bits} bits</span
								>{/if}
						</dd>
						<span></span>
					</div>
					{#if d.tags.c}<div>
							<dt>Canonicalization c=</dt>
							<dd>{d.tags.c}</dd>
							<span></span>
						</div>{/if}
					{#if d.tags.i}<div>
							<dt>Identity i=</dt>
							<dd>{d.tags.i}</dd>
							<span></span>
						</div>{/if}
					{#if d.signedAt !== undefined}
						<div>
							<dt>Signed t=</dt>
							<dd>{formatUtc(d.signedAt * 1000)}</dd>
							<span></span>
						</div>
					{/if}
					{#if d.expires !== undefined}
						<div>
							<dt>Expires x=</dt>
							<dd>{formatUtc(d.expires * 1000)}</dd>
							<span></span>
						</div>
					{/if}
					{#if d.tags.l}<div>
							<dt>Body length l=</dt>
							<dd>{d.tags.l}</dd>
							<span></span>
						</div>{/if}
					<div>
						<dt>Signed headers h=</dt>
						<dd class="chips">
							{#each d.signedHeaders as s, j (j)}<span class="chip">{s}</span>{/each}
						</dd>
						<span></span>
					</div>
					{#if d.tags.bh}<div>
							<dt>Body hash bh=</dt>
							<dd>{d.tags.bh}</dd>
							<Copy value={d.tags.bh} />
						</div>{/if}
				</dl>
			{/each}
			<p class="note">
				The tool cannot verify signatures: that needs the exact original message and the public key
				from DNS. It reads what was signed and by whom. The verdict is in Authentication-Results.
			</p>
		</section>
	{/if}

	{#if a.arc.sets.length}
		<section>
			<h2 class="label">ARC chain ({a.arc.sets.length} sets)</h2>
			{#each a.arc.sets as s (s.instance)}
				<div class="arc">
					<p class="arch">
						<span class="mono hn">i={s.instance}</span>
						{#if s.seal}
							<span class="mono">cv=</span><span
								class="res {s.seal.cv === 'fail'
									? 'r-fail'
									: s.seal.cv === 'pass'
										? 'r-pass'
										: 'r-other'}">{s.seal.cv ?? '?'}</span
							>
							<span class="mono prop"><span class="dim">d=</span>{s.seal.d}</span>
							<span class="mono prop"><span class="dim">s=</span>{s.seal.s}</span>
						{/if}
					</p>
					{#each s.warnings as w, j (j)}<p class="error">{w}</p>{/each}
					{#if s.results}{@render authBlock(s.results, 'Results recorded by')}{/if}
				</div>
			{/each}
			<p class="note">
				ARC lets forwarders and mailing lists record what they saw before they changed the message.
				cv= is that hop's view of the chain so far: none for the first set, pass after.
			</p>
		</section>
	{/if}

	{#if a.xHeaders.length}
		<section>
			<h2 class="label">X- headers ({a.xHeaders.length})</h2>
			<dl class="readout">
				{#each a.xHeaders as h (h.index)}
					<div>
						<dt>{h.name}</dt>
						<dd>{decodeWords(h.value)}</dd>
						<span></span>
					</div>
				{/each}
			</dl>
		</section>
	{/if}

	<details class="allh">
		<summary class="label">All {a.headers.length} headers, unfolded</summary>
		<dl class="readout">
			{#each a.headers as h (h.index)}
				<div>
					<dt>{h.name}</dt>
					<dd>{h.value}</dd>
					<span></span>
				</div>
			{/each}
		</dl>
		{#if a.skipped.length}
			<p class="note">{a.skipped.length} lines skipped that were not headers.</p>
		{/if}
	</details>
{/if}

<style>
	textarea {
		min-height: 12rem;
	}
	.field + .note {
		margin-top: 0.5rem;
	}
	section {
		margin: 1.75rem 0;
	}
	.note,
	.error {
		overflow-wrap: anywhere;
	}
	h2 {
		margin-bottom: 0.5rem;
	}
	.readout dt {
		overflow-wrap: anywhere;
	}
	.sub {
		display: block;
		color: var(--ink-2);
		font-size: 0.8125rem;
	}
	.findings {
		list-style: none;
		margin: 0;
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
	.hops {
		list-style: none;
		margin: 0.75rem 0;
		padding: 0;
	}
	.hops > li {
		border-top: 2px solid var(--rule);
		padding: 0.4rem 0 0.25rem;
		margin-bottom: 0.5rem;
	}
	.hops > li.slow,
	.hops > li.skew {
		background: var(--hilite);
	}
	.hhead {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 0.75rem;
	}
	.hn {
		font-weight: 700;
		border: 1px solid var(--rule);
		padding: 0 0.4rem;
	}
	.when {
		overflow-wrap: anywhere;
	}
	.delay {
		font-weight: 700;
	}
	.slow .delay,
	.skew .delay {
		color: var(--signal);
	}
	.hop {
		margin: 0.35rem 0 0;
		display: grid;
		gap: 0.15rem;
	}
	.hop > div {
		display: grid;
		grid-template-columns: 3.5rem 1fr;
		gap: 0.5rem;
	}
	.hop dt {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--ink-2);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		padding-top: 0.15rem;
	}
	.hop dd {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.9375rem;
		overflow-wrap: anywhere;
		min-width: 0;
	}
	.ip {
		margin-left: 0.5rem;
		font-weight: 700;
	}
	.rawline {
		font-size: 0.8125rem;
		overflow-wrap: anywhere;
		margin: 0.25rem 0;
		color: var(--ink-2);
	}
	details summary {
		cursor: pointer;
		min-height: 2.75rem;
		display: flex;
		align-items: center;
	}
	.auth {
		border-top: 2px solid var(--rule);
		padding-top: 0.35rem;
		margin-bottom: 1rem;
	}
	.auth > .label {
		margin: 0 0 0.35rem;
	}
	.srv {
		text-transform: none;
		color: var(--ink);
		overflow-wrap: anywhere;
	}
	.results {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.results li {
		padding: 0.35rem 0;
		border-bottom: 1px solid var(--rule-soft);
	}
	.rhead,
	.arch {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 0.6rem;
		margin: 0;
	}
	.method {
		font-weight: 700;
	}
	.res {
		font-family: var(--font-mono);
		font-weight: 700;
		font-size: 0.8125rem;
		padding: 0 0.4rem;
		border: 1px solid var(--rule);
	}
	.r-fail {
		color: var(--signal);
		border-color: var(--signal);
		background: var(--hilite);
	}
	.r-pass {
		background: var(--ink);
		color: var(--paper);
	}
	.prop {
		font-size: 0.8125rem;
		overflow-wrap: anywhere;
		min-width: 0;
	}
	.dim {
		color: var(--ink-2);
	}
	.explain {
		margin: 0.2rem 0 0;
		font-size: 0.9375rem;
	}
	.small {
		font-size: 0.8125rem;
		margin: 0.15rem 0 0;
		overflow-wrap: anywhere;
	}
	.sig {
		margin-bottom: 1rem;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}
	.chip {
		font-size: 0.8125rem;
		border: 1px solid var(--rule-soft);
		padding: 0 0.3rem;
	}
	.arc {
		margin-bottom: 1rem;
	}
	.arc .error {
		margin: 0.35rem 0;
	}
	.allh {
		margin: 1.5rem 0;
	}
</style>
