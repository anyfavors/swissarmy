<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		certValidity,
		hashedHostMatches,
		isError,
		parseKeys,
		type LineResult,
		type ParsedKey
	} from './logic';

	let input = $state('');
	let results = $state<LineResult[]>([]);
	let hostQuery = $state('');
	let matches = $state<Set<string>>(new Set());
	let ready = $state(false);
	let run = 0;

	const sourceText: Record<ParsedKey['source'], string> = {
		public: 'Public key',
		authorized_keys: 'authorized_keys line',
		known_hosts: 'known_hosts line',
		rfc4716: 'RFC 4716 block'
	};

	$effect(() => {
		const text = input;
		const id = ++run;
		parseKeys(text).then((r) => {
			if (id === run) results = r;
		});
	});

	const hashed = $derived(
		results.flatMap((r) =>
			isError(r) ? [] : (r.hosts ?? []).filter((h) => h.hashed).map((h) => ({ r, h }))
		)
	);

	const query = $derived.by(() => {
		const q = hostQuery.trim();
		if (!q) return null;
		const m = q.match(/^\[(.+)\]:(\d+)$/) ?? q.match(/^([^:]+):(\d+)$/);
		const port = m ? Number(m[2]) : 22;
		if (m && (port < 1 || port > 65535)) return { error: 'Port must be 1 to 65535' };
		return { host: m ? m[1] : q, port };
	});

	let hostRun = 0;
	$effect(() => {
		const q = query;
		const list = hashed;
		const id = ++hostRun;
		if (!q || 'error' in q) {
			matches = new Set();
			return;
		}
		Promise.all(list.map((x) => hashedHostMatches(x.h, q.host!, q.port))).then((ok) => {
			if (id !== hostRun) return;
			matches = new Set(list.filter((_, i) => ok[i]).map((x) => x.h.text));
		});
	});

	onMount(() => {
		// Keys are public, but comments and host lists say who and where. Keep them out of the link.
		const h = readHash();
		if (h.in) input = h.in;
		ready = true;
	});

	$effect(() => {
		if (ready) writeHash({});
	});

	const count = $derived(results.filter((r) => !isError(r)).length);
</script>

<div class="field">
	<label class="label" for="ssh-in">Public keys, authorized_keys or known_hosts lines</label>
	<textarea
		id="ssh-in"
		bind:value={input}
		spellcheck="false"
		autocomplete="off"
		autocapitalize="off"
		placeholder="ssh-ed25519 AAAAC3Nza... user@host"></textarea>
</div>
<p class="note">
	One key per line. Options in front of the key (authorized_keys), host lists and @markers
	(known_hosts), hashed hosts and RFC 4716 blocks are understood. Lines starting with # are skipped.
</p>

{#if count > 1}
	<p class="label count">{count} keys</p>
{/if}

{#each results as r (r.line)}
	<section class="key" aria-label="Line {r.line}">
		{#if isError(r)}
			<p class="label">Line {r.line}</p>
			<p class="error" role="alert">{r.error}</p>
			<pre>{r.text.length > 120 ? r.text.slice(0, 120) + '...' : r.text}</pre>
		{:else}
			<p class="label">Line {r.line}: {sourceText[r.source]}</p>
			{#each r.flags as f, i (i)}
				<p
					class={f.level === 'danger' ? 'error' : f.level === 'warn' ? 'note warn' : 'note'}
					role={f.level === 'danger' ? 'alert' : undefined}
				>
					{f.text}
				</p>
			{/each}
			<dl class="readout">
				<div>
					<dt>Type</dt>
					<dd>{r.label}, {r.bits} bit <span class="dim">({r.type})</span></dd>
				</div>
				<div>
					<dt>SHA256</dt>
					<dd>{r.sha256}</dd>
					<Copy value={r.sha256} />
				</div>
				<div>
					<dt>MD5 (legacy)</dt>
					<dd>{r.md5}</dd>
					<Copy value={r.md5} />
				</div>
				<div>
					<dt>Comment</dt>
					<dd>{r.comment || '(none)'}</dd>
				</div>
				{#if r.marker}
					<div>
						<dt>Marker</dt>
						<dd>{r.marker}</dd>
					</div>
				{/if}
				{#if r.hosts}
					<div>
						<dt>Hosts</dt>
						<dd>
							{#each r.hosts as h, i (i)}
								<span class="item" class:hit={matches.has(h.text)}
									>{h.hashed ? 'hashed: ' : ''}{h.text}{matches.has(h.text)
										? ' (matches)'
										: ''}</span
								>
							{/each}
						</dd>
					</div>
				{/if}
				{#if r.options}
					<div>
						<dt>Options</dt>
						<dd>
							{#each r.options as o, i (i)}
								<span class="item">{o.name}{o.value !== undefined ? `="${o.value}"` : ''}</span>
							{/each}
						</dd>
					</div>
				{/if}
				{#if r.cert}
					<div>
						<dt>Certificate</dt>
						<dd>{r.cert.kind} certificate, serial {r.cert.serial.toString()}</dd>
					</div>
					<div>
						<dt>Key ID</dt>
						<dd>{r.cert.keyId || '(empty)'}</dd>
					</div>
					<div>
						<dt>Principals</dt>
						<dd>{r.cert.principals.length ? r.cert.principals.join(', ') : '(none: any)'}</dd>
					</div>
					<div>
						<dt>Valid</dt>
						<dd>{certValidity(r.cert)}</dd>
					</div>
					<div>
						<dt>Signing CA</dt>
						<dd>{r.cert.caType} {r.cert.caSha256}</dd>
					</div>
					{#if r.cert.criticalOptions.length}
						<div>
							<dt>Critical options</dt>
							<dd>{r.cert.criticalOptions.join(', ')}</dd>
						</div>
					{/if}
					<div>
						<dt>Extensions</dt>
						<dd>{r.cert.extensions.join(', ') || '(none)'}</dd>
					</div>
				{/if}
			</dl>
		{/if}
	</section>
{/each}

{#if hashed.length}
	<div class="field block">
		<label class="label" for="ssh-host">Check a host against the hashed entries</label>
		<input
			id="ssh-host"
			type="text"
			bind:value={hostQuery}
			spellcheck="false"
			autocomplete="off"
			autocapitalize="off"
			placeholder="host.example.com or [host]:2222"
		/>
	</div>
	{#if query && 'error' in query}
		<p class="error" role="alert">{query.error}</p>
	{:else if query}
		<p class="note" aria-live="polite">
			{matches.size
				? `${matches.size} hashed ${matches.size === 1 ? 'entry matches' : 'entries match'}, marked above.`
				: 'No hashed entry matches.'}
		</p>
	{/if}
	<p class="note">
		Hashed hosts (|1|salt|hash) are HMAC-SHA1 of the host name with a per-entry salt. They cannot be
		reversed, only tested. A port other than 22 is hashed as [host]:port.
	</p>
{/if}

<p class="note">
	Fingerprints match ssh-keygen -l: SHA256 over the key blob in base64 without padding, and the
	legacy MD5 form (ssh-keygen -E md5) as colon hex. For certificates the fingerprint is that of the
	certified key. RSA below 3072 bits is flagged as below current guidance, DSA as deprecated.
</p>

<style>
	.key {
		margin: 1.25rem 0;
		display: grid;
		gap: 0.5rem;
	}
	.count {
		margin: 1rem 0 0;
	}
	.note {
		margin-top: 0.75rem;
	}
	.key .note,
	.key .error {
		margin: 0;
	}
	.warn {
		border-left-color: var(--signal);
		background: var(--hilite);
		color: var(--ink);
	}
	.dim {
		color: var(--ink-2);
	}
	.item {
		display: block;
	}
	.hit {
		background: var(--hilite);
		font-weight: 700;
	}
	.block {
		margin: 1.5rem 0 0;
	}
	pre {
		margin: 0;
		padding: 0.5rem 0.75rem;
		background: var(--field);
		border: 1px solid var(--rule-soft);
		font-size: 0.8125rem;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
</style>
