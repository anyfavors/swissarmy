<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import { bytesToBase64, DOMAIN_RIDS, ldapFilter, parseAny, toHex } from './logic';

	let input = $state('');
	let ready = false;

	const examples = [
		'S-1-5-18',
		'S-1-5-32-544',
		'S-1-5-21-2127521184-1604012920-1887927527-512',
		'AQUAAAAAAAUVAAAAoGXPfnhLm1/nfIdwCRwBAA=='
	];

	const formatLabel = {
		string: 'SID string',
		hex: 'Hex',
		escaped: 'LDAP escaped bytes',
		base64: 'Base64 (objectSid::)'
	};

	const result = $derived.by(() => {
		if (!input.trim()) return null;
		try {
			return { r: parseAny(input) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	const ridTable = Object.entries(DOMAIN_RIDS).map(([rid, v]) => ({ rid, ...v }));

	onMount(() => {
		const h = readHash();
		input = h.in ?? 'S-1-5-21-2127521184-1604012920-1887927527-512';
		ready = true;
	});

	$effect(() => {
		const state = { in: input };
		if (ready) writeHash(state);
	});
</script>

<div class="field">
	<label class="label" for="sid-in">SID, hex or Base64 objectSid</label>
	<textarea id="sid-in" class="short" bind:value={input} spellcheck="false" autocomplete="off"
	></textarea>
</div>

<div class="row examples" role="group" aria-label="Examples">
	{#each examples as ex (ex)}
		<button type="button" class="ex" aria-pressed={input.trim() === ex} onclick={() => (input = ex)}
			>{ex.length > 24 ? ex.slice(0, 22) + '…' : ex}</button
		>
	{/each}
</div>

{#if result?.error}
	<p class="error" role="alert">{result.error}</p>
{:else if result?.r}
	{@const e = result.r.e}
	<p class="say" class:priv={e.priv}>
		{e.name ?? e.kind}{e.priv ? ', privileged' : ''}
	</p>
	<dl class="readout">
		<div>
			<dt>Read from</dt>
			<dd>{formatLabel[result.r.format]}</dd>
		</div>
		<div>
			<dt>SID</dt>
			<dd>{e.string}</dd>
			<Copy value={e.string} />
		</div>
		<div>
			<dt>Hex</dt>
			<dd>{toHex(e.bytes)}</dd>
			<Copy value={toHex(e.bytes)} />
		</div>
		<div>
			<dt>Base64</dt>
			<dd>{bytesToBase64(e.bytes)}</dd>
			<Copy value={bytesToBase64(e.bytes)} />
		</div>
		<div>
			<dt>LDAP filter</dt>
			<dd>{ldapFilter(e)}</dd>
			<Copy value={ldapFilter(e)} />
		</div>
		<div>
			<dt>Kind</dt>
			<dd>{e.kind}</dd>
		</div>
		<div>
			<dt>Authority</dt>
			<dd>{e.sid.authority.toString()}, {e.authorityName}</dd>
		</div>
		{#if e.domain}
			<div>
				<dt>Domain SID</dt>
				<dd>{e.domain}</dd>
				<Copy value={e.domain} />
			</div>
		{/if}
		{#if e.rid !== undefined}
			<div>
				<dt>RID</dt>
				<dd>{e.rid} (0x{e.rid.toString(16)})</dd>
			</div>
		{/if}
		<div>
			<dt>Sub-authorities</dt>
			<dd>{e.sid.subs.length ? e.sid.subs.join(' · ') : 'none'}</dd>
		</div>
		<div>
			<dt>Size</dt>
			<dd>{e.bytes.length} bytes</dd>
		</div>
	</dl>
	{#each e.notes as n (n)}
		<p class="note">{n}</p>
	{/each}
{/if}

<details>
	<summary class="label">Well-known domain RIDs</summary>
	<div class="scroll">
		<table>
			<thead>
				<tr><th scope="col">RID</th><th scope="col">Name</th><th scope="col">Note</th></tr>
			</thead>
			<tbody>
				{#each ridTable as r (r.rid)}
					<tr class:priv={r.priv}>
						<td class="mono">{r.rid}</td>
						<td>{r.name}</td>
						<td class="dim"
							>{[r.priv ? 'privileged' : '', r.scope ?? ''].filter(Boolean).join(', ')}</td
						>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</details>

<p class="note">
	A SID is a revision, a 48-bit authority and up to 15 32-bit sub-authorities. In binary the
	authority is big-endian and the sub-authorities little-endian, which is why the hex looks
	scrambled. Domain accounts are S-1-5-21-<i>domain</i>-<i>RID</i>. AD also accepts the string form
	directly: <code>(objectSid=S-1-5-21-…)</code>. Names follow Microsoft's "Well-known SIDs" list.
</p>

<style>
	.short {
		min-height: 4.5rem;
	}
	.examples {
		margin: 0.75rem 0 1.25rem;
	}
	.ex {
		text-transform: none;
		letter-spacing: 0;
	}
	.say {
		font-size: 1.25rem;
		line-height: 1.35;
		margin: 0 0 1rem;
		padding: 0.5rem 0.75rem;
		border-left: 4px solid var(--rule);
		overflow-wrap: anywhere;
	}
	.say.priv {
		border-left-color: var(--signal);
		background: var(--hilite);
	}
	.readout {
		margin-bottom: 1rem;
	}
	.note {
		margin: 0 0 1rem;
	}
	.note code {
		overflow-wrap: anywhere;
	}
	details {
		margin: 1.5rem 0;
	}
	summary {
		cursor: pointer;
		min-height: 2.75rem;
		display: flex;
		align-items: center;
	}
	.scroll {
		overflow-x: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		border-top: 2px solid var(--rule);
		font-size: 0.9375rem;
	}
	th,
	td {
		text-align: left;
		padding: 0.4rem 0.75rem 0.4rem 0;
		border-bottom: 1px solid var(--rule-soft);
		vertical-align: top;
	}
	th {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-2);
		font-weight: 400;
	}
	tr.priv td:first-child {
		color: var(--signal);
		font-weight: 700;
	}
	.dim {
		color: var(--ink-2);
		font-size: 0.8125rem;
	}
</style>
