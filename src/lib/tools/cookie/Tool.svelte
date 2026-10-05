<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		describeLifetime,
		guessKind,
		parseCookieHeader,
		parseSetCookies,
		type Finding
	} from './logic';

	type Kind = 'cookie' | 'set-cookie';
	let kind = $state<Kind>('set-cookie');
	let input = $state('');
	let now = $state(Date.now());
	let ready = false;

	const pairs = $derived(kind === 'cookie' ? parseCookieHeader(input) : []);
	const sets = $derived(kind === 'set-cookie' ? parseSetCookies(input, now) : []);

	const order: Record<Finding['level'], number> = { danger: 0, warn: 1, info: 2 };
	const sorted = (f: Finding[]) => [...f].sort((a, b) => order[a.level] - order[b.level]);

	function onInput() {
		if (/^\s*set-cookie\s*:/i.test(input)) kind = 'set-cookie';
		else if (/^\s*cookie\s*:/i.test(input)) kind = 'cookie';
	}

	onMount(() => {
		// Cookies often carry session IDs. Take a value handed over by the front page, then
		// clear the fragment so it does not stay in the address bar or the history.
		const h = readHash();
		if (h.in) {
			input = h.in;
			kind = guessKind(h.in);
		}
		ready = true;
		const t = setInterval(() => (now = Date.now()), 60_000);
		return () => clearInterval(t);
	});

	$effect(() => {
		if (ready) writeHash({});
	});
</script>

<div class="row opts" role="group" aria-label="Header type">
	<span class="label">Header</span>
	<button type="button" aria-pressed={kind === 'set-cookie'} onclick={() => (kind = 'set-cookie')}
		>Set-Cookie (response)</button
	>
	<button type="button" aria-pressed={kind === 'cookie'} onclick={() => (kind = 'cookie')}
		>Cookie (request)</button
	>
</div>

<div class="field">
	<label class="label" for="ck-in">
		{kind === 'cookie' ? 'Cookie header' : 'Set-Cookie headers, one per line'}
	</label>
	<textarea
		id="ck-in"
		bind:value={input}
		oninput={onInput}
		spellcheck="false"
		autocomplete="off"
		autocapitalize="off"
		placeholder={kind === 'cookie'
			? 'Cookie: SID=31d4d96e407aad42; lang=en-US'
			: 'Set-Cookie: __Host-SID=31d4d96e407aad42; Path=/; Secure; HttpOnly; SameSite=Lax'}
	></textarea>
</div>
<p class="note">
	Cookie values often contain session IDs. Nothing here is written to the address bar or sent
	anywhere.
</p>

{#if kind === 'cookie' && pairs.length}
	<div class="scroll">
		<table>
			<caption class="label">{pairs.length} cookie{pairs.length === 1 ? '' : 's'}</caption>
			<thead>
				<tr>
					<th scope="col">Name</th>
					<th scope="col">Value</th>
					<th scope="col"><span class="visually-hidden">Copy</span></th>
				</tr>
			</thead>
			<tbody>
				{#each pairs as p, i (i)}
					<tr>
						<th scope="row" class="mono">{p.name || '(no name)'}</th>
						<td class="mono">
							{p.value}
							{#if p.decoded}<span class="dim">URL-decoded from {p.raw}</span>{/if}
						</td>
						<td><Copy value={p.value} /></td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

{#if kind === 'set-cookie'}
	{#each sets as s, i (i)}
		{#if s.error}
			<p class="error" role="alert">Line {i + 1}: {s.error}</p>
		{:else if s.cookie}
			{@const c = s.cookie}
			<section class="cookie" aria-label="Cookie {c.name}">
				<h2 class="name mono">{c.name || '(no name)'}</h2>
				<dl class="readout">
					<div>
						<dt>Value</dt>
						<dd>{c.value || '(empty)'}</dd>
						<Copy value={c.value} />
					</div>
					<div>
						<dt>Lifetime</dt>
						<dd>
							{describeLifetime(c.lifetime)}{#if c.maxAge}, Max-Age {c.maxAge
									.raw}{/if}{#if c.expires}, Expires
								{c.expires.date ? c.expires.date.toISOString() : c.expires.raw}{/if}
						</dd>
					</div>
					<div>
						<dt>Domain</dt>
						<dd>{c.domain ?? 'Host only (the exact host that set it)'}</dd>
					</div>
					<div>
						<dt>Path</dt>
						<dd>{c.path ?? 'Default: directory of the request URL'}</dd>
					</div>
					<div>
						<dt>Secure</dt>
						<dd>{c.secure ? 'Yes, HTTPS only' : 'No'}</dd>
					</div>
					<div>
						<dt>HttpOnly</dt>
						<dd>
							{c.httpOnly ? 'Yes, hidden from JavaScript' : 'No, document.cookie can read it'}
						</dd>
					</div>
					<div>
						<dt>SameSite</dt>
						<dd>{c.sameSite?.value ?? (c.sameSite ? `invalid (${c.sameSite.raw})` : 'not set')}</dd>
					</div>
					{#if c.partitioned}
						<div>
							<dt>Partitioned</dt>
							<dd>Yes, stored per top-level site (CHIPS)</dd>
						</div>
					{/if}
					{#if c.priority}
						<div>
							<dt>Priority</dt>
							<dd>{c.priority} (Chromium only)</dd>
						</div>
					{/if}
				</dl>
				{#if c.findings.length}
					<ul class="findings">
						{#each sorted(c.findings) as f (f.text)}
							<li class={f.level}>{f.text}</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/if}
	{/each}
{/if}

<p class="note">
	__Host- cookies need Secure, Path=/ and no Domain. __Secure- cookies need Secure. Browsers cap
	Expires and Max-Age at 400 days (RFC 6265bis). Expires dates are read by the browser's date
	parser, which accepts slightly more formats than the cookie spec.
</p>

<style>
	.opts {
		margin-bottom: 1rem;
	}
	.note {
		margin: 0.75rem 0;
	}
	.scroll {
		overflow-x: auto;
		margin: 1rem 0;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		border-top: 2px solid var(--rule);
		font-size: 0.9375rem;
	}
	caption {
		text-align: left;
		padding-bottom: 0.4rem;
	}
	th,
	td {
		text-align: left;
		padding: 0.4rem 0.75rem 0.4rem 0;
		border-bottom: 1px solid var(--rule-soft);
		vertical-align: top;
		overflow-wrap: anywhere;
	}
	thead th {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-2);
		font-weight: 400;
	}
	.dim {
		display: block;
		color: var(--ink-2);
		font-size: 0.8125rem;
	}
	.cookie {
		margin: 1.5rem 0;
	}
	.name {
		font-size: 1.125rem;
		margin-bottom: 0.4rem;
		overflow-wrap: anywhere;
	}
	.findings {
		list-style: none;
		padding: 0;
		margin: 0.75rem 0 0;
		display: grid;
		gap: 0.4rem;
	}
	.findings li {
		font-size: 0.9375rem;
		border-left: 3px solid var(--rule-soft);
		padding: 0.2rem 0 0.2rem 0.6rem;
		color: var(--ink-2);
	}
	.findings .warn {
		border-left-color: var(--signal);
		color: var(--ink);
	}
	.findings .danger {
		border-left-color: var(--signal);
		color: var(--signal);
		font-weight: 700;
	}
</style>
