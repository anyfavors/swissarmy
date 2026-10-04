<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		checkChain,
		decodeInput,
		fingerprint,
		formatTime,
		gnText,
		keyText,
		serialText,
		validityStatus,
		type ParsedCertificate
	} from './logic';

	let input = $state('');
	let now = $state(Date.now());
	let prints = $state<Record<number, { sha1: string; sha256: string }>>({});

	const result = $derived(decodeInput(input));

	const chain = $derived.by(() => {
		const certs = result.items.filter((i) => i.parsed?.kind === 'certificate');
		return checkChain(
			certs.map((i) => i.parsed as ParsedCertificate),
			certs.map((i) => i.index)
		);
	});

	$effect(() => {
		const items = result.items;
		let cancelled = false;
		Promise.all(
			items.map(async (i) =>
				i.parsed
					? ([
							i.index,
							{
								sha1: await fingerprint(i.parsed.der, 'SHA-1'),
								sha256: await fingerprint(i.parsed.der, 'SHA-256')
							}
						] as const)
					: null
			)
		).then((rows) => {
			if (cancelled) return;
			const next: Record<number, { sha1: string; sha256: string }> = {};
			for (const r of rows) if (r) next[r[0]] = r[1];
			prints = next;
		});
		return () => (cancelled = true);
	});

	onMount(() => {
		// The intake hands input over in the hash. Take it, then clear the hash:
		// certificates can be large and do not belong in the address bar.
		const h = readHash();
		if (h.in) input = h.in;
		writeHash({});
		const t = setInterval(() => (now = Date.now()), 60_000);
		return () => clearInterval(t);
	});
</script>

<div class="field">
	<div class="row between">
		<label class="label" for="cert-in">PEM certificate, chain or CSR, or Base64 DER</label>
		<button type="button" class="small" onclick={() => (input = '')} disabled={!input}>Clear</button
		>
	</div>
	<textarea
		id="cert-in"
		bind:value={input}
		spellcheck="false"
		autocomplete="off"
		placeholder="-----BEGIN CERTIFICATE-----"></textarea>
</div>

{#if result.privateKey}
	<div class="warn" role="alert">
		<p class="warn-h">Private key detected ({result.privateKey}). Nothing was decoded.</p>
		<p>
			Private keys should not be pasted into websites, even ones that run locally like this one.
			Clear the field, remove the key from your paste, and treat the key as exposed if it was copied
			anywhere you do not control.
		</p>
	</div>
{/if}

{#if chain}
	<p class={chain.ok ? 'chain ok' : 'chain bad'} role={chain.ok ? 'status' : 'alert'}>
		<span class="label">Chain of {chain.links.length + 1}</span>
		{chain.message}.
	</p>
{/if}

{#each result.items as item (item.index)}
	<section class="cert">
		<h2 class="label head">
			<span class="no">#{item.index}</span>
			{item.parsed?.kind === 'csr' ? 'Certificate request (PKCS#10)' : item.label}
		</h2>
		{#if item.error}
			<p class="error" role="alert">{item.error}</p>
		{:else if item.parsed}
			{@const p = item.parsed}
			{@const fp = prints[item.index]}
			<dl class="readout">
				<div>
					<dt>Subject</dt>
					<dd>{p.subject.text || '(empty)'}</dd>
					<Copy value={p.subject.text} />
				</div>
				{#if p.kind === 'certificate'}
					{@const v = validityStatus(p.notBefore, p.notAfter, now)}
					<div>
						<dt>Issuer</dt>
						<dd>
							{p.issuer.text || '(empty)'}{#if p.selfIssued}<span class="tag">self-issued</span
								>{/if}
						</dd>
						<Copy value={p.issuer.text} />
					</div>
					<div>
						<dt>Serial</dt>
						<dd>{serialText(p.serial)}</dd>
						<Copy value={p.serial} />
					</div>
					<div>
						<dt>Not before</dt>
						<dd>{formatTime(p.notBefore)}</dd>
						<Copy value={formatTime(p.notBefore)} />
					</div>
					<div>
						<dt>Not after</dt>
						<dd>{formatTime(p.notAfter)}</dd>
						<Copy value={formatTime(p.notAfter)} />
					</div>
					<div>
						<dt>Status</dt>
						<dd class={v.state === 'valid' ? '' : 'bad'}>{v.text}</dd>
					</div>
				{/if}
				<div>
					<dt>Public key</dt>
					<dd>{keyText(p.publicKey)}</dd>
				</div>
				<div>
					<dt>Signature</dt>
					<dd>{p.signatureAlgorithm}</dd>
				</div>
				{#if p.kind === 'certificate'}
					<div>
						<dt>Version</dt>
						<dd>v{p.version}</dd>
					</div>
				{/if}
				<div>
					<dt>SHA-256 fingerprint</dt>
					<dd>{fp?.sha256 ?? '...'}</dd>
					<Copy value={fp?.sha256 ?? ''} />
				</div>
				<div>
					<dt>SHA-1 fingerprint</dt>
					<dd>{fp?.sha1 ?? '...'}</dd>
					<Copy value={fp?.sha1 ?? ''} />
				</div>
			</dl>

			{#if p.san.length}
				<h3 class="label sub">Subject alternative names ({p.san.length})</h3>
				<ul class="names mono">
					{#each p.san as g, k (k)}<li>{gnText(g)}</li>{/each}
				</ul>
			{/if}

			{#if p.extensions.length}
				<h3 class="label sub">
					{p.kind === 'csr' ? 'Requested extensions' : 'Extensions'}
				</h3>
				<dl class="readout">
					{#each p.extensions as e, k (k)}
						<div>
							<dt>
								{e.name}{#if e.critical}<span class="crit">critical</span>{/if}
							</dt>
							<dd>
								{#each e.lines as line, j (j)}<span class="line">{line}</span>{/each}
							</dd>
						</div>
					{/each}
				</dl>
			{/if}
		{/if}
	</section>
{/each}

<p class="note">
	Everything is decoded in this page. OCSP, CRL and CA issuer URLs are shown as text and never
	fetched. The chain check compares names and key identifiers in the order pasted; it does not
	verify signatures or trust.
</p>

<style>
	.between {
		justify-content: space-between;
	}
	.small {
		min-height: 2.25rem;
		padding: 0.25rem 0.6rem;
		font-size: 0.6875rem;
	}
	.small:disabled {
		opacity: 0.35;
		cursor: default;
	}
	textarea {
		min-height: 12rem;
	}
	.warn {
		margin: 1.25rem 0;
		padding: 0.75rem 1rem;
		border: 2px solid var(--signal);
		background: var(--hilite);
	}
	.warn p {
		margin: 0;
	}
	.warn .warn-h {
		font-weight: 700;
		color: var(--signal);
		margin-bottom: 0.4rem;
	}
	.chain {
		margin: 1.25rem 0 0;
		padding: 0.5rem 0.75rem;
		border-left: 3px solid var(--rule);
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.75rem;
		align-items: baseline;
	}
	.chain.bad {
		border-left-color: var(--signal);
		color: var(--signal);
	}
	.cert {
		margin: 1.75rem 0;
	}
	.head {
		margin: 0 0 0.5rem;
		font-size: 0.875rem;
		color: var(--ink);
	}
	.no {
		color: var(--signal);
		font-weight: 700;
		margin-right: 0.4rem;
	}
	.sub {
		margin: 1.25rem 0 0.4rem;
		font-size: 0.75rem;
	}
	.tag,
	.crit {
		display: inline-block;
		margin-left: 0.5rem;
		padding: 0 0.35rem;
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		border: 1px solid var(--rule-soft);
		color: var(--ink-2);
	}
	.crit {
		border-color: var(--signal);
		color: var(--signal);
	}
	.bad {
		color: var(--signal);
		font-weight: 700;
	}
	.line {
		display: block;
	}
	.names {
		list-style: none;
		margin: 0;
		padding: 0;
		border-top: 2px solid var(--rule);
	}
	.names li {
		padding: 0.3rem 0;
		border-bottom: 1px solid var(--rule-soft);
		overflow-wrap: anywhere;
	}
</style>
