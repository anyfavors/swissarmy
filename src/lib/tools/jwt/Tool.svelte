<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		algInfo,
		claimNames,
		decodeToken,
		identityClaims,
		secretBytes,
		timeClaims,
		verifyJws,
		type SecretEncoding
	} from './logic';

	let token = $state('');
	let secret = $state('');
	let secretEnc = $state<SecretEncoding>('text');
	let publicKey = $state('');
	let now = $state(Date.now());
	let ready = false;

	type Verdict =
		| { state: 'none' }
		| { state: 'busy' }
		| { state: 'valid' | 'invalid'; notes: string[] }
		| { state: 'error'; message: string };
	let verdict = $state<Verdict>({ state: 'none' });
	let run = 0;

	const decoded = $derived.by(() => {
		if (!token.trim()) return null;
		try {
			return { d: decodeToken(token) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	const jws = $derived(decoded?.d?.kind === 'jws' ? decoded.d : null);
	const jwe = $derived(decoded?.d?.kind === 'jwe' ? decoded.d : null);
	const alg = $derived(decoded?.d ? decoded.d.header.alg : undefined);
	const info = $derived(algInfo(alg));
	const times = $derived(jws?.payload ? timeClaims(jws.payload, now) : []);
	const ids = $derived(jws?.payload ? identityClaims(jws.payload) : []);

	const pretty = (v: unknown) => JSON.stringify(v, null, 2);

	const statusText: Record<string, string> = {
		ok: '',
		expired: 'Expired',
		'not-yet-valid': 'Not yet valid',
		'future-iat': 'Issued in the future',
		invalid: 'Not a NumericDate'
	};

	$effect(() => {
		const j = jws;
		const fam = info?.family;
		const s = secret;
		const se = secretEnc;
		const pk = publicKey;
		const id = ++run;
		if (!j || !fam) {
			verdict = { state: 'none' };
			return;
		}
		let key: Uint8Array | string;
		if (fam === 'HS') {
			if (!s) {
				verdict = { state: 'none' };
				return;
			}
			try {
				key = secretBytes(s, se);
			} catch (e) {
				verdict = { state: 'error', message: (e as Error).message };
				return;
			}
		} else {
			if (!pk.trim()) {
				verdict = { state: 'none' };
				return;
			}
			key = pk;
		}
		verdict = { state: 'busy' };
		verifyJws(j, key).then(
			(r) => {
				if (id === run) verdict = { state: r.valid ? 'valid' : 'invalid', notes: r.notes };
			},
			(e: Error) => {
				if (id === run) verdict = { state: 'error', message: e.message };
			}
		);
	});

	onMount(() => {
		// The front page intake hands the token over in the fragment. Read it, then drop it:
		// a token is a credential and must not stay in the address bar or the history.
		const h = readHash();
		if (h.in) token = h.in;
		ready = true;
		const t = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(t);
	});

	$effect(() => {
		if (ready) writeHash({});
	});
</script>

<div class="field">
	<label class="label" for="jwt-in">Token (JWS compact or JWE)</label>
	<textarea
		id="jwt-in"
		bind:value={token}
		spellcheck="false"
		autocomplete="off"
		autocapitalize="off"
		placeholder="eyJ..."></textarea>
</div>
<p class="note">
	The token stays in this tab. It is not written to the address bar, and a token passed in from the
	front page is removed from it.
</p>

{#if decoded?.error}
	<p class="error" role="alert">{decoded.error}</p>
{/if}

{#if decoded?.d}
	{#if decoded.d.warnings.length}
		<ul class="warnings">
			{#each decoded.d.warnings as w (w.text)}
				<li
					class={w.level === 'danger' ? 'error' : 'note'}
					role={w.level === 'danger' ? 'alert' : undefined}
				>
					{w.text}
				</li>
			{/each}
		</ul>
	{/if}
{/if}

{#if jwe}
	<p class="note">
		This is a JWE (5 parts): the content is encrypted. Only the header can be read. Decrypting needs
		the recipient's private key or the shared key, which this page does not ask for.
	</p>
	<div class="field block">
		<div class="row between">
			<span class="label">Header</span>
			<Copy value={pretty(jwe.header)} />
		</div>
		<pre>{pretty(jwe.header)}</pre>
	</div>
{/if}

{#if jws}
	<dl class="readout">
		<div>
			<dt>Algorithm</dt>
			<dd>{typeof alg === 'string' ? alg : pretty(alg)}</dd>
		</div>
		{#if jws.header.typ !== undefined}
			<div>
				<dt>Type (typ)</dt>
				<dd>{String(jws.header.typ)}</dd>
			</div>
		{/if}
		{#if jws.header.kid !== undefined}
			<div>
				<dt>Key ID (kid)</dt>
				<dd>{typeof jws.header.kid === 'string' ? jws.header.kid : pretty(jws.header.kid)}</dd>
				<Copy value={String(jws.header.kid)} />
			</div>
		{/if}
		{#each times as c (c.name)}
			<div class:flag={c.status !== 'ok'}>
				<dt>{claimNames[c.name]} ({c.name})</dt>
				<dd>
					{#if c.ms === null}
						{pretty(c.value)}
					{:else}
						{c.iso}, {c.relative}
					{/if}
					{#if c.status !== 'ok'}<span class="tag">{statusText[c.status]}</span>{/if}
				</dd>
			</div>
		{/each}
		{#each ids as c (c.name)}
			<div>
				<dt>{claimNames[c.name]} ({c.name})</dt>
				<dd>{c.value}</dd>
				<Copy value={c.value} />
			</div>
		{/each}
	</dl>

	<div class="grid">
		<div class="field block">
			<div class="row between">
				<span class="label">Header</span>
				<Copy value={pretty(jws.header)} />
			</div>
			<pre>{pretty(jws.header)}</pre>
		</div>
		<div class="field block">
			<div class="row between">
				<span class="label">Payload</span>
				<Copy value={jws.payload ? pretty(jws.payload) : jws.payloadText} />
			</div>
			<pre>{jws.payload ? pretty(jws.payload) : jws.payloadText}</pre>
		</div>
	</div>

	<div class="field block">
		<div class="row between">
			<span class="label">Signature (base64url, {jws.signature.length} bytes)</span>
			<Copy value={jws.signatureB64} />
		</div>
		<pre>{jws.signatureB64 || '(empty)'}</pre>
	</div>

	<h2 class="label section-h">Verify signature</h2>
	<p class="note">
		Decoding is not verification. Anyone can write a token with these contents. Only a valid
		signature from a key you trust shows who issued it.
	</p>

	{#if info?.family === 'HS'}
		<div class="field">
			<div class="row between">
				<label class="label" for="jwt-secret">Shared secret for {String(alg)}</label>
				<div class="row" role="group" aria-label="Secret encoding">
					<button
						type="button"
						aria-pressed={secretEnc === 'text'}
						onclick={() => (secretEnc = 'text')}>UTF-8 text</button
					>
					<button
						type="button"
						aria-pressed={secretEnc === 'base64'}
						onclick={() => (secretEnc = 'base64')}>Base64</button
					>
				</div>
			</div>
			<input
				id="jwt-secret"
				type="text"
				bind:value={secret}
				spellcheck="false"
				autocomplete="off"
				autocapitalize="off"
			/>
		</div>
	{:else if info}
		<div class="field">
			<label class="label" for="jwt-key"
				>Public key for {String(alg)}: PEM (SPKI or certificate) or JWK / JWK Set</label
			>
			<textarea
				id="jwt-key"
				bind:value={publicKey}
				spellcheck="false"
				autocomplete="off"
				placeholder="-----BEGIN PUBLIC KEY-----"></textarea>
		</div>
	{:else}
		<p class="note">
			Verification here supports HS256/384/512, RS256/384/512, PS256/384/512 and ES256/384/512.
		</p>
	{/if}

	<div class="verdict {verdict.state}" aria-live="polite">
		{#if verdict.state === 'valid'}
			Signature verified with {String(alg)}
		{:else if verdict.state === 'invalid'}
			Signature does NOT match
		{:else if verdict.state === 'busy'}
			Checking
		{:else}
			Not verified
		{/if}
	</div>
	{#if verdict.state === 'error'}
		<p class="error" role="alert">{verdict.message}</p>
	{/if}
	{#if (verdict.state === 'valid' || verdict.state === 'invalid') && verdict.notes.length}
		{#each verdict.notes as n (n)}<p class="note">{n}</p>{/each}
	{/if}
	{#if verdict.state === 'valid'}
		<p class="note">
			The algorithm comes from the token header. A real verifier must pin the expected algorithm and
			also check exp, nbf, iss and aud. The signature check here does not cover the claims.
		</p>
	{/if}
{/if}

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
		gap: 1.25rem;
	}
	.between {
		justify-content: space-between;
	}
	.block {
		margin: 1rem 0;
	}
	.note {
		margin-top: 0.75rem;
	}
	pre {
		margin: 0;
		padding: 0.65rem 0.75rem;
		background: var(--field);
		border: 1px solid var(--rule);
		font-size: 0.875rem;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.warnings {
		list-style: none;
		padding: 0;
		margin: 1rem 0 0;
		display: grid;
		gap: 0.5rem;
	}
	.readout {
		margin: 1.25rem 0;
	}
	.flag {
		background: var(--hilite);
	}
	.tag {
		margin-left: 0.5rem;
		padding: 0 0.3rem;
		background: var(--signal);
		color: var(--signal-ink);
		white-space: nowrap;
	}
	.section-h {
		margin: 2rem 0 0.5rem;
		border-top: 2px solid var(--rule);
		padding-top: 0.5rem;
	}
	.field + .verdict,
	.note + .verdict {
		margin-top: 1rem;
	}
	.verdict {
		font-family: var(--font-mono);
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		padding: 0.6rem 0.75rem;
		border: 1px solid var(--rule-soft);
		color: var(--ink-2);
		margin-top: 1rem;
	}
	.verdict.valid {
		border: 2px solid var(--rule);
		color: var(--ink);
		background: var(--hilite);
	}
	.verdict.invalid {
		border: 2px solid var(--signal);
		color: var(--signal-ink);
		background: var(--signal);
	}
</style>
