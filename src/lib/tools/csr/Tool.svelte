<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		algorithms,
		emptySubject,
		encodeSubject,
		generateCsr,
		opensslCommand,
		parseSans,
		subjectFields,
		supportsEd25519,
		type CsrResult,
		type KeyAlg,
		type Subject
	} from './logic';

	let alg = $state<KeyAlg>('p-256');
	let subject = $state<Subject>(emptySubject());
	let sanText = $state('');
	let ed25519 = $state<boolean | null>(null);
	let busy = $state(false);
	let genError = $state('');
	let result = $state<CsrResult | null>(null);
	/** The inputs the current result was made from, to flag stale output. */
	let resultFor = $state('');
	let ready = false;

	const parsed = $derived.by(() => {
		try {
			const sans = parseSans(sanText);
			const count = encodeSubject(subject).count;
			if (count === 0 && sans.length === 0) return { sans, error: '', empty: true as const };
			return { sans, error: '', empty: false as const };
		} catch (e) {
			return { sans: [], error: (e as Error).message, empty: false as const };
		}
	});

	const fingerprint = $derived(JSON.stringify([alg, subject, parsed.sans]));
	const stale = $derived(result !== null && resultFor !== fingerprint);
	const command = $derived(
		parsed.error || parsed.empty ? '' : opensslCommand({ alg, subject, sans: parsed.sans })
	);
	const algUnavailable = $derived(alg === 'ed25519' && ed25519 === false);

	async function generate() {
		if (parsed.error || parsed.empty || busy || algUnavailable) return;
		busy = true;
		genError = '';
		const fp = fingerprint;
		try {
			result = await generateCsr({ alg, subject: { ...subject }, sans: parsed.sans });
			resultFor = fp;
		} catch (e) {
			genError = (e as Error).message;
		} finally {
			busy = false;
		}
	}

	function discard() {
		result = null;
		resultFor = '';
	}

	function download(name: string, text: string) {
		const url = URL.createObjectURL(new Blob([text], { type: 'application/x-pem-file' }));
		const a = document.createElement('a');
		a.href = url;
		a.download = name;
		document.body.append(a);
		a.click();
		a.remove();
		// Give the browser a moment to start the download, then drop the object URL.
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	onMount(() => {
		const h = readHash();
		if (algorithms.some((a) => a.id === h.alg)) alg = h.alg as KeyAlg;
		const s = emptySubject();
		for (const f of subjectFields) if (h[f.key]) s[f.key] = h[f.key];
		subject = s;
		if (h.san) sanText = h.san;
		ready = true;
		supportsEd25519().then((ok) => (ed25519 = ok));
	});

	// Key type, subject and SANs go into the link. The key and the request never do.
	$effect(() => {
		const state: Record<string, string> = { alg, san: sanText };
		for (const f of subjectFields) state[f.key] = subject[f.key];
		if (ready) writeHash(state);
	});
</script>

<div class="row opts" role="group" aria-label="Key type">
	<span class="label">Key</span>
	{#each algorithms as a (a.id)}
		<button
			type="button"
			aria-pressed={alg === a.id}
			disabled={a.id === 'ed25519' && ed25519 === false}
			onclick={() => (alg = a.id)}>{a.label}</button
		>
	{/each}
</div>
{#if ed25519 === false}
	<p class="note">This browser's WebCrypto has no Ed25519, so that option is off.</p>
{/if}

<h2 class="label section-h">Subject</h2>
<div class="grid">
	{#each subjectFields as f (f.key)}
		<div class="field">
			<label class="label" for="csr-{f.key}">{f.label}</label>
			<input
				id="csr-{f.key}"
				type="text"
				bind:value={subject[f.key]}
				spellcheck="false"
				autocomplete="off"
				autocapitalize="off"
				maxlength={f.key === 'C' ? 2 : undefined}
			/>
		</div>
	{/each}
</div>

<div class="field block">
	<label class="label" for="csr-san">Subject alternative names (one per line)</label>
	<textarea
		id="csr-san"
		bind:value={sanText}
		spellcheck="false"
		autocomplete="off"
		autocapitalize="off"
		placeholder={'example.com\n*.example.com\n192.0.2.10\n2001:db8::10\nadmin@example.com'}
	></textarea>
</div>
<p class="note">
	Types are inferred: IPv4 and IPv6 addresses become IP, anything with @ an email (rfc822Name), the
	rest DNS. Force a type with a DNS:, IP: or email: prefix. Internationalised names are converted to
	punycode. Browsers ignore the CN and match only the SANs, so list every host name here, the CN
	included.
</p>

{#if parsed.error}
	<p class="error" role="alert">{parsed.error}</p>
{:else if parsed.sans.some((s) => s.input)}
	<dl class="readout block">
		{#each parsed.sans.filter((s) => s.input) as s (s.value)}
			<div>
				<dt>{s.type} as encoded</dt>
				<dd>{s.input} → {s.value}</dd>
			</div>
		{/each}
	</dl>
{/if}

<div class="row block">
	<button
		type="button"
		class="primary"
		onclick={generate}
		disabled={busy || !!parsed.error || parsed.empty || algUnavailable}
	>
		{busy ? 'Generating' : result ? 'Generate new key and CSR' : 'Generate key and CSR'}
	</button>
	{#if result}
		<button type="button" onclick={discard}>Discard key and CSR</button>
	{/if}
</div>
{#if parsed.empty && !parsed.error}
	<p class="note">Fill in at least a common name or one subject alternative name.</p>
{/if}
{#if genError}<p class="error" role="alert">{genError}</p>{/if}

{#if result}
	{#if stale}
		<p class="error" role="alert">
			The fields changed after generating. The output below does not match them; generate again.
		</p>
	{/if}

	<div class="field block">
		<div class="row between">
			<span class="label">Certificate request (PKCS#10 PEM)</span>
			<div class="row">
				<Copy value={result.csrPem} />
				<button
					type="button"
					class="small"
					onclick={() => result && download('request.csr', result.csrPem)}>Download CSR</button
				>
			</div>
		</div>
		<pre>{result.csrPem}</pre>
	</div>

	<div class="keybox">
		<p class="warn" role="alert">
			Private key. Anyone who has this can impersonate the certificate holder. Save it now to a
			protected location (file mode 600, or a secrets store) and do not paste it into chats, tickets
			or email. It is not encrypted, it exists only in this tab and is gone when you leave or
			discard it.
		</p>
		<div class="row between">
			<span class="label">Private key (PKCS#8 PEM, unencrypted)</span>
			<div class="row">
				<Copy value={result.keyPem} />
				<button
					type="button"
					class="small"
					onclick={() => result && download('key.pem', result.keyPem)}>Download key</button
				>
			</div>
		</div>
		<pre>{result.keyPem}</pre>
	</div>
{/if}

{#if command}
	<div class="field block">
		<div class="row between">
			<span class="label">OpenSSL equivalent</span>
			<Copy value={command} />
		</div>
		<pre>{command}</pre>
	</div>
	<p class="note">
		The same request made locally with OpenSSL 1.1.1 or later. -nodes leaves the key unencrypted,
		like the key above; drop it to be asked for a passphrase.
	</p>
{/if}

<p class="note">
	The key pair is made by the browser's WebCrypto (crypto.subtle.generateKey) and the request is
	encoded and signed on this page. Nothing is sent or stored, and only the key type, subject and
	SANs go into the link. Signatures: SHA-256 with RSA, SHA-256 with P-256, SHA-384 with P-384, pure
	Ed25519. Not every CA accepts Ed25519 yet.
</p>

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
		gap: 0.75rem 1.25rem;
	}
	.opts {
		margin: 0 0 1rem;
	}
	.between {
		justify-content: space-between;
	}
	.block {
		margin: 1rem 0;
	}
	.section-h {
		margin: 1.5rem 0 0.75rem;
		border-top: 2px solid var(--rule);
		padding-top: 0.5rem;
	}
	.note {
		margin-top: 0.75rem;
	}
	button:disabled {
		opacity: 0.4;
		cursor: default;
	}
	button:disabled:hover {
		background: transparent;
		color: var(--ink);
	}
	.primary {
		border-width: 2px;
		font-weight: 700;
	}
	.small {
		min-height: 2.25rem;
		padding: 0.25rem 0.6rem;
		font-size: 0.6875rem;
	}
	pre {
		margin: 0;
		padding: 0.65rem 0.75rem;
		background: var(--field);
		border: 1px solid var(--rule);
		font-size: 0.8125rem;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.keybox {
		display: grid;
		gap: 0.5rem;
		margin: 1.5rem 0;
		padding: 0.75rem;
		border: 2px solid var(--signal);
		background: var(--hilite);
	}
	.warn {
		margin: 0;
		padding: 0.5rem 0.65rem;
		background: var(--signal);
		color: var(--signal-ink);
		font-weight: 700;
	}
</style>
