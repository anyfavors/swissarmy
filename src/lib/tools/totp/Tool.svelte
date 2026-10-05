<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		base32Decode,
		buildOtpauth,
		hotp,
		otpAlgorithms,
		parseOtpauth,
		randomSecret,
		secondsRemaining,
		secretWarnings,
		timeStep,
		type OtpAlgorithm
	} from './logic';

	let mode = $state<'totp' | 'hotp'>('totp');
	let secretInput = $state('');
	let issuer = $state('');
	let account = $state('');
	let algorithm = $state<OtpAlgorithm>('SHA1');
	let digits = $state(6);
	let period = $state(30);
	let counter = $state(0);
	let uriError = $state('');
	let uriWarnings = $state<string[]>([]);
	let now = $state(Date.now() / 1000);
	let ready = false;

	type Codes = { prev: string; cur: string; next: string } | null;
	let codes = $state<Codes>(null);
	let run = 0;

	/** A pasted otpauth:// URI fills the fields and leaves only the secret in the box. */
	function onSecretInput() {
		const v = secretInput.trim();
		if (!/^otpauth:/i.test(v)) {
			uriError = '';
			uriWarnings = [];
			return;
		}
		try {
			const { config, warnings } = parseOtpauth(v);
			mode = config.type;
			secretInput = config.secret;
			issuer = config.issuer;
			account = config.account;
			algorithm = config.algorithm;
			digits = config.digits;
			period = config.period;
			counter = config.counter;
			uriWarnings = warnings;
			uriError = '';
		} catch (e) {
			uriError = (e as Error).message;
			uriWarnings = [];
		}
	}

	const key = $derived.by(() => {
		if (!secretInput.trim() || /^otpauth:/i.test(secretInput.trim())) return null;
		try {
			return { bytes: base32Decode(secretInput) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	const periodOk = $derived(Number.isInteger(period) && period >= 1 && period <= 3600);
	const counterOk = $derived(Number.isSafeInteger(counter) && counter >= 0);
	const step = $derived(periodOk ? timeStep(now, period) : 0);
	const remaining = $derived(periodOk ? secondsRemaining(now, period) : 0);

	$effect(() => {
		const k = key?.bytes;
		const id = ++run;
		if (!k || (mode === 'totp' && !periodOk) || (mode === 'hotp' && !counterOk)) {
			codes = null;
			return;
		}
		const base = mode === 'totp' ? step : counter;
		const d = digits;
		const a = algorithm;
		const at = (c: number) => (c < 0 ? Promise.resolve('') : hotp(k, c, d, a));
		Promise.all([at(base - 1), at(base), at(base + 1)]).then(
			([prev, cur, next]) => {
				if (id === run) codes = { prev, cur, next };
			},
			() => {
				if (id === run) codes = null;
			}
		);
	});

	const uri = $derived.by(() => {
		if (!key?.bytes) return { value: '' };
		try {
			return {
				value: buildOtpauth({
					type: mode,
					secret: secretInput,
					issuer: issuer.trim(),
					account: account.trim(),
					algorithm,
					digits,
					period,
					counter
				})
			};
		} catch (e) {
			return { value: '', error: (e as Error).message };
		}
	});

	const fmt = (c: string) =>
		c.length === 8 ? `${c.slice(0, 4)} ${c.slice(4)}` : `${c.slice(0, 3)} ${c.slice(3)}`;

	onMount(() => {
		const h = readHash();
		if (h.mode === 'hotp') mode = 'hotp';
		if (otpAlgorithms.includes(h.alg as OtpAlgorithm)) algorithm = h.alg as OtpAlgorithm;
		if (h.digits === '8') digits = 8;
		const p = Number(h.period);
		if (Number.isInteger(p) && p >= 1 && p <= 3600) period = p;
		// An otpauth:// URI handed over by the front page: use it, then drop it from the address bar.
		if (h.in) {
			secretInput = h.in;
			onSecretInput();
		}
		ready = true;
		const t = setInterval(() => (now = Date.now() / 1000), 1000);
		return () => clearInterval(t);
	});

	// Only the options go into the link. The secret, issuer and account never do.
	$effect(() => {
		const state = {
			mode: mode === 'hotp' ? 'hotp' : undefined,
			alg: algorithm === 'SHA1' ? undefined : algorithm,
			digits: digits === 6 ? undefined : String(digits),
			period: period === 30 ? undefined : String(period)
		};
		if (ready) writeHash(state);
	});
</script>

<div class="row opts" role="group" aria-label="Mode">
	<span class="label">Mode</span>
	<button type="button" aria-pressed={mode === 'totp'} onclick={() => (mode = 'totp')}
		>TOTP (time)</button
	>
	<button type="button" aria-pressed={mode === 'hotp'} onclick={() => (mode = 'hotp')}
		>HOTP (counter)</button
	>
</div>

<div class="field">
	<div class="row between">
		<label class="label" for="otp-secret">Secret (base32) or otpauth:// URI</label>
		<button
			type="button"
			class="small"
			onclick={() => ((secretInput = randomSecret()), onSecretInput())}>New random secret</button
		>
	</div>
	<input
		id="otp-secret"
		type="text"
		bind:value={secretInput}
		oninput={onSecretInput}
		spellcheck="false"
		autocomplete="off"
		autocapitalize="off"
		placeholder="JBSW Y3DP EHPK 3PXP"
	/>
</div>
{#if uriError}<p class="error" role="alert">{uriError}</p>{/if}
{#if key?.error}<p class="error" role="alert">{key.error}</p>{/if}
{#each uriWarnings as w (w)}<p class="note warn">{w}</p>{/each}
{#if key?.bytes}
	{#each secretWarnings(key.bytes) as w (w)}<p class="note warn">{w}</p>{/each}
{/if}

<div class="row opts" role="group" aria-label="Algorithm">
	<span class="label">HMAC</span>
	{#each otpAlgorithms as a (a)}
		<button type="button" aria-pressed={algorithm === a} onclick={() => (algorithm = a)}>{a}</button
		>
	{/each}
</div>
<div class="row opts" role="group" aria-label="Digits">
	<span class="label">Digits</span>
	{#each [6, 8] as d (d)}
		<button type="button" aria-pressed={digits === d} onclick={() => (digits = d)}>{d}</button>
	{/each}
</div>

<div class="grid">
	{#if mode === 'totp'}
		<div class="field">
			<label class="label" for="otp-period">Period (seconds)</label>
			<input id="otp-period" type="number" min="1" max="3600" step="1" bind:value={period} />
		</div>
	{:else}
		<div class="field">
			<label class="label" for="otp-counter">Counter</label>
			<div class="row nowrap">
				<input id="otp-counter" type="number" min="0" step="1" bind:value={counter} />
				<button
					type="button"
					aria-label="Previous counter"
					onclick={() => (counter = Math.max(0, counter - 1))}>-1</button
				>
				<button type="button" aria-label="Next counter" onclick={() => (counter = counter + 1)}
					>+1</button
				>
			</div>
		</div>
	{/if}
</div>
{#if mode === 'totp' && !periodOk}<p class="error" role="alert">
		Period must be 1 to 3600 seconds.
	</p>{/if}
{#if mode === 'hotp' && !counterOk}<p class="error" role="alert">
		Counter must be a whole number from 0.
	</p>{/if}

{#if codes}
	<div class="codes" aria-live="off">
		<div class="current">
			<span class="label">{mode === 'totp' ? 'Current code' : `Code for counter ${counter}`}</span>
			<div class="row between">
				<output class="code" for="otp-secret">{fmt(codes.cur)}</output>
				<Copy value={codes.cur} />
			</div>
			{#if mode === 'totp'}
				<label class="label" for="otp-left">{remaining} s remaining</label>
				<progress id="otp-left" max={period} value={remaining}></progress>
			{/if}
		</div>
		<dl class="readout">
			<div>
				<dt>{mode === 'totp' ? 'Previous' : `Counter ${counter - 1}`}</dt>
				<dd>{codes.prev ? fmt(codes.prev) : '(none)'}</dd>
				{#if codes.prev}<Copy value={codes.prev} />{/if}
			</div>
			<div>
				<dt>{mode === 'totp' ? 'Next' : `Counter ${counter + 1}`}</dt>
				<dd>{fmt(codes.next)}</dd>
				<Copy value={codes.next} />
			</div>
			{#if mode === 'totp'}
				<div>
					<dt>Time step T</dt>
					<dd>{step} (Unix time / {period})</dd>
				</div>
			{/if}
		</dl>
	</div>
{/if}

<h2 class="label section-h">otpauth URI</h2>
<div class="grid">
	<div class="field">
		<label class="label" for="otp-issuer">Issuer</label>
		<input id="otp-issuer" type="text" bind:value={issuer} autocomplete="off" spellcheck="false" />
	</div>
	<div class="field">
		<label class="label" for="otp-account">Account</label>
		<input
			id="otp-account"
			type="text"
			bind:value={account}
			autocomplete="off"
			autocapitalize="off"
			spellcheck="false"
		/>
	</div>
</div>
{#if uri.error && key?.bytes}<p class="error" role="alert">{uri.error}</p>{/if}
{#if uri.value}
	<div class="field block">
		<div class="row between">
			<span class="label">URI (contains the secret)</span>
			<Copy value={uri.value} />
		</div>
		<pre>{uri.value}</pre>
	</div>
{/if}

<p class="note">
	Codes follow RFC 6238 (TOTP) and RFC 4226 (HOTP) and are computed with this device's clock: if it
	is off by more than a few seconds the codes will not match the server. Previous and next codes are
	what most servers also accept to allow for drift. The secret, issuer and account stay in this tab;
	only the mode, algorithm, digits and period go into the link.
</p>

<style>
	.opts {
		margin: 1rem 0;
	}
	.between {
		justify-content: space-between;
	}
	.nowrap {
		flex-wrap: nowrap;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
		gap: 0.75rem 1.25rem;
	}
	.block {
		margin: 1rem 0;
	}
	.small {
		min-height: 2.25rem;
		padding: 0.25rem 0.6rem;
		font-size: 0.6875rem;
	}
	input[type='number'] {
		width: 100%;
		font: inherit;
		font-family: var(--font-mono);
		color: var(--ink);
		background: var(--field);
		border: 1px solid var(--rule);
		border-radius: 0;
		padding: 0.65rem 0.75rem;
		min-width: 0;
	}
	.note {
		margin-top: 0.75rem;
	}
	.warn {
		border-left-color: var(--signal);
		background: var(--hilite);
		color: var(--ink);
	}
	.codes {
		margin: 1.5rem 0;
		display: grid;
		gap: 1rem;
	}
	.current {
		display: grid;
		gap: 0.35rem;
		padding: 0.75rem;
		border: 2px solid var(--rule);
		background: var(--field);
	}
	.code {
		font-family: var(--font-mono);
		font-size: clamp(2rem, 9vw, 3rem);
		font-weight: 700;
		letter-spacing: 0.08em;
		white-space: nowrap;
	}
	progress {
		width: 100%;
		height: 0.5rem;
		accent-color: var(--signal);
	}
	.section-h {
		margin: 2rem 0 0.75rem;
		border-top: 2px solid var(--rule);
		padding-top: 0.5rem;
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
</style>
