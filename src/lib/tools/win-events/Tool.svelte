<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import type { ErrorCode, LogonType, WinEvent } from './data';
	import { hex8, parseCode, search, showCode, splitHresult } from './logic';
	import { lookupEtype } from '../kerberos/logic';

	let query = $state('');
	let data = $state<{ events: WinEvent[]; logonTypes: LogonType[]; codes: ErrorCode[] } | null>(
		null
	);
	let ready = false;

	const res = $derived(data ? search(query, data) : null);
	const parsed = $derived(parseCode(query));
	const hres = $derived(parsed && parsed.value >= 0x80000000 ? splitHresult(parsed.value) : null);
	const etype = $derived.by(() => {
		if (!parsed?.hex || parsed.value > 0xff) return undefined;
		try {
			return lookupEtype(query).etype;
		} catch {
			return undefined;
		}
	});

	const examples = ['4625', '0xC000006A', '0x18', '1326', '0x80070005', 'logon type', 'group'];

	onMount(() => {
		const h = readHash();
		if (h.in) query = h.in.trim().replace(/^event\s*(id)?\s*/i, '');
		else if (h.q) query = h.q;
		ready = true;
		// Reference tables, loaded on demand to keep the page small.
		import('./data').then((m) => {
			data = { events: m.events, logonTypes: m.logonTypes, codes: m.codes };
		});
	});

	$effect(() => {
		const s = { q: query };
		if (ready) writeHash(s);
	});
</script>

<div class="field">
	<label class="label" for="we-q">Event ID, status code or words</label>
	<input
		id="we-q"
		type="search"
		bind:value={query}
		spellcheck="false"
		autocomplete="off"
		placeholder="4625, 0xC000006A, 1326, lockout"
	/>
</div>
<div class="row ex" role="group" aria-label="Examples">
	<span class="label">Try</span>
	{#each examples as e (e)}
		<button type="button" class="chip" onclick={() => (query = e)}>{e}</button>
	{/each}
</div>

{#if !res}
	<p class="label" aria-live="polite">Loading tables</p>
{:else}
	{#if parsed}
		<dl class="readout">
			<div>
				<dt>Value</dt>
				<dd>{hex8(parsed.value)} = {parsed.value} = {parsed.value | 0} signed</dd>
				<Copy value={hex8(parsed.value)} />
			</div>
			{#if hres}
				<div>
					<dt>As HRESULT</dt>
					<dd>
						{hres.severity}, facility {hres.facility}, code {hres.code}{hres.fromWin32
							? ' (a Win32 error wrapped by HRESULT_FROM_WIN32)'
							: ''}
					</dd>
				</div>
			{/if}
			{#if etype}
				<div>
					<dt>As ticket encryption type</dt>
					<dd>{etype.name}</dd>
				</div>
			{/if}
		</dl>
	{/if}

	{#if res.codes.length}
		<h2 class="label sub">Codes</h2>
		<ul class="list">
			{#each res.codes as h (h.code.kind + h.code.code + h.via)}
				<li>
					<div class="head">
						<span class="mono code">{showCode(h.code)}</span>
						<span class="mono name">{h.code.name}</span>
						<span class="tag">{h.code.kind}</span>
					</div>
					<p class="meaning">{h.code.text}</p>
					{#if h.code.seen || h.via !== 'value'}
						<p class="seen">
							{h.code.seen ? `Seen in ${h.code.seen}.` : ''}
							{h.via !== 'value' && h.via !== 'text' ? `Matched via ${h.via}.` : ''}
						</p>
					{/if}
				</li>
			{/each}
		</ul>
	{:else if parsed}
		<p class="note">
			Not in this table. The table is a curated set; for anything else look the value up in
			[MS-ERREF].
		</p>
	{/if}

	{#if res.logonTypes.length}
		<div class="scroll">
			<table>
				<caption class="label">Logon types (4624, 4625)</caption>
				<thead>
					<tr><th scope="col">Type</th><th scope="col">Name</th><th scope="col">Meaning</th></tr>
				</thead>
				<tbody>
					{#each res.logonTypes as l (l.type)}
						<tr>
							<td class="mono">{l.type}</td>
							<td class="mono">{l.name}</td>
							<td class="wrap">{l.text}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	{#if res.events.length}
		<h2 class="label sub">Events</h2>
		<ul class="list">
			{#each res.events as e (e.id)}
				<li>
					<div class="head">
						<span class="mono code">{e.id}</span>
						<span class="name">{e.title}</span>
						{#if e.log !== 'Security'}<span class="tag">{e.log} log</span>{/if}
					</div>
					<p class="meaning">{e.why}</p>
					{#if e.fields}
						<p class="seen"><span class="label">Read</span> {e.fields.join(' · ')}</p>
					{/if}
					{#if e.see}
						<p class="seen">
							<span class="label">See also</span>
							{#each e.see as id, i (id)}{i ? ', ' : ''}<button
									type="button"
									class="link"
									onclick={() => (query = String(id))}>{id}</button
								>{/each}
						</p>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if !res.events.length && !res.codes.length && !res.logonTypes.length}
		<p class="note">No match. Try an event ID, a code like 0xC0000234, or a word like lockout.</p>
	{/if}
{/if}

<p class="note">
	Events from the Microsoft Learn security auditing reference, one page per event ID. Codes from
	[MS-ERREF] (NTSTATUS, Win32, HRESULT) and RFC 4120 (Kerberos). In 4625 and 4776 the Status and Sub
	Status are NTSTATUS values: when Status is 0xC000006D the Sub Status gives the real reason. 4768,
	4769 and 4771 use Kerberos codes in hex: 0x18 is a wrong password. Many events need the matching
	audit policy turned on first.
</p>

<style>
	.ex {
		margin: 0.75rem 0 1rem;
	}
	.chip {
		min-height: 2.75rem;
		padding: 0.25rem 0.6rem;
		font-size: 0.75rem;
		text-transform: none;
		letter-spacing: 0;
	}
	.readout {
		margin-bottom: 1.25rem;
	}
	.sub {
		margin: 1.5rem 0 0.5rem;
	}
	.list {
		list-style: none;
		padding: 0;
		margin: 0 0 1.25rem;
		border-top: 2px solid var(--rule);
	}
	.list li {
		padding: 0.7rem 0;
		border-bottom: 1px solid var(--rule-soft);
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.75rem;
		align-items: baseline;
	}
	.code {
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--signal);
	}
	.name {
		font-weight: 700;
		overflow-wrap: anywhere;
	}
	.tag {
		padding: 0 0.3rem;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		text-transform: uppercase;
		background: var(--hilite);
	}
	.meaning {
		margin: 0.25rem 0 0.25rem;
		overflow-wrap: anywhere;
	}
	.seen {
		margin: 0.15rem 0 0;
		font-size: 0.9375rem;
		color: var(--ink-2);
		overflow-wrap: anywhere;
	}
	.link {
		min-height: 2.75rem;
		padding: 0 0.4rem;
		border: none;
		text-decoration: underline;
		text-underline-offset: 0.2em;
		font-size: 0.9375rem;
	}
	.scroll {
		overflow-x: auto;
		margin: 1rem 0 1.25rem;
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
		vertical-align: top;
		padding: 0.4rem 0.75rem 0.4rem 0;
		border-bottom: 1px solid var(--rule-soft);
	}
	td.wrap {
		min-width: 12rem;
	}
	th {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-2);
		font-weight: 400;
	}
	.note {
		margin: 0 0 1rem;
	}
</style>
