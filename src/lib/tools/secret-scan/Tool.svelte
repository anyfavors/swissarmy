<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		ENTROPY_CAP,
		ENTROPY_RATIO,
		MIN_ENTROPY_LENGTH,
		MIN_SWITCH_RATE,
		redact,
		scan
	} from './logic';

	let text = $state('');
	let ready = $state(false);

	const findings = $derived(text ? scan(text) : []);
	const redacted = $derived(findings.length ? redact(text, findings) : text);
	const counts = $derived.by(() => {
		const m = new Map<string, number>();
		for (const f of findings) m.set(f.label, (m.get(f.label) ?? 0) + 1);
		return [...m.entries()];
	});

	onMount(() => {
		// The text may hold the very secrets this page looks for: never keep it in the address bar.
		const h = readHash();
		if (h.in) text = h.in;
		ready = true;
	});

	$effect(() => {
		if (ready) writeHash({});
	});
</script>

<div class="field">
	<label class="label" for="ss-in">Text to check (config, log, diff, commit message)</label>
	<textarea
		id="ss-in"
		bind:value={text}
		spellcheck="false"
		autocomplete="off"
		autocapitalize="off"
		placeholder="Paste text here"></textarea>
</div>
<p class="note">
	Scanned in this tab only. The text is not sent anywhere and not written to the address bar.
</p>

{#if text.trim()}
	<div class="summary" aria-live="polite">
		{#if findings.length}
			<p class="verdict found">
				{findings.length} likely secret{findings.length === 1 ? '' : 's'} found
			</p>
			<p class="label">
				{counts.map(([l, n]) => `${l}: ${n}`).join(' / ')}
			</p>
		{:else}
			<p class="verdict">Nothing found</p>
			<p class="note">
				No known token format, assignment or high-entropy string. That is not proof the text is
				clean: read it before you share it.
			</p>
		{/if}
	</div>

	{#if findings.length}
		<ol class="findings">
			{#each findings as f (f.start)}
				<li>
					<span class="pos mono">{f.line}:{f.column}</span>
					<span class="what">
						<strong>{f.label}</strong>
						{#if f.detail}<span class="dim">{f.detail}</span>{/if}
					</span>
					<code class="preview">{f.preview}</code>
				</li>
			{/each}
		</ol>

		<div class="field block">
			<div class="row between">
				<span class="label">Redacted copy</span>
				<Copy value={redacted} />
			</div>
			<pre>{redacted}</pre>
		</div>
	{/if}
{/if}

<p class="note">
	Known formats: AWS access key IDs (AKIA, ASIA) and a 40-character secret key next to one, GitHub
	(ghp_, gho_, ghu_, ghs_, ghr_, github_pat_), GitLab glpat-, Slack xox tokens and webhooks, Stripe
	sk_live_ and rk_live_, Google AIza keys, Azure AccountKey=, PEM private keys, JWTs, passwords in
	URLs and assignments such as password=, secret: or api_key =.
</p>
<p class="note">
	High entropy: a run of at least {MIN_ENTROPY_LENGTH} base64-type characters with letters and digits
	whose Shannon entropy (bits per character, from its own character frequencies) reaches {ENTROPY_RATIO}
	of the most a string that long can have, capped at {ENTROPY_CAP} bits, and that switches between upper
	case, lower case and digits at least {Math.round(MIN_SWITCH_RATE * 100)}% of the time. Random keys
	pass; words and camelCase names mostly do not. Hex strings (hashes, IDs) count only next to a word
	like key, secret or token. Expect some false positives.
</p>

<style>
	.note {
		margin-top: 0.75rem;
	}
	.summary {
		margin: 1.25rem 0 0.75rem;
		display: grid;
		gap: 0.35rem;
	}
	.verdict {
		margin: 0;
		font-family: var(--font-mono);
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		padding: 0.6rem 0.75rem;
		border: 2px solid var(--rule);
		background: var(--hilite);
	}
	.verdict.found {
		border-color: var(--signal);
		background: var(--signal);
		color: var(--signal-ink);
	}
	.summary .label {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.findings {
		list-style: none;
		margin: 0;
		padding: 0;
		border-top: 2px solid var(--rule);
	}
	.findings li {
		display: grid;
		grid-template-columns: 4.5rem minmax(0, 1fr);
		gap: 0.15rem 0.75rem;
		padding: 0.5rem 0;
		border-bottom: 1px solid var(--rule-soft);
	}
	.pos {
		color: var(--ink-2);
		font-size: 0.875rem;
	}
	.what {
		display: flex;
		flex-wrap: wrap;
		gap: 0 0.5rem;
		align-items: baseline;
	}
	.dim {
		color: var(--ink-2);
		font-size: 0.875rem;
	}
	.preview {
		grid-column: 2;
		overflow-wrap: anywhere;
	}
	.between {
		justify-content: space-between;
	}
	.block {
		margin: 1.25rem 0;
	}
	pre {
		margin: 0;
		padding: 0.65rem 0.75rem;
		background: var(--field);
		border: 1px solid var(--rule);
		font-size: 0.8125rem;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		max-height: 30rem;
		overflow-y: auto;
	}
</style>
