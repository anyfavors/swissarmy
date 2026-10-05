<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		ETYPES,
		STRENGTH_TEXT,
		TICKET_FLAGS,
		decodeFlags,
		lookupEtype,
		maskOf,
		parseFlags
	} from './logic';

	let input = $state('0x40e10000');
	let etIn = $state('0x17');
	let ready = false;

	const dec = $derived.by(() => {
		if (!input.trim()) return null;
		try {
			return { d: decodeFlags(parseFlags(input)) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});
	const value = $derived(dec?.d?.value ?? 0);

	const et = $derived.by(() => {
		if (!etIn.trim()) return null;
		try {
			return { r: lookupEtype(etIn) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	function toggle(bit: number) {
		const v = (value ^ maskOf(bit)) >>> 0;
		input = '0x' + v.toString(16).padStart(8, '0');
	}

	onMount(() => {
		const h = readHash();
		if (h.in) input = h.in;
		else if (h.f) input = h.f;
		if (h.e) etIn = h.e;
		ready = true;
	});

	$effect(() => {
		const s = { f: dec?.d ? dec.d.hex : input, e: etIn };
		if (ready) writeHash(s);
	});
</script>

<div class="field">
	<label class="label" for="kb-in">Ticket flags (hex, decimal or a klist line)</label>
	<input id="kb-in" type="text" bind:value={input} spellcheck="false" autocomplete="off" />
</div>

{#if dec?.error}
	<p class="error" role="alert">{dec.error}</p>
{:else if dec?.d}
	{@const d = dec.d}
	<p class="say">{d.set.length ? d.set.map((f) => f.klist).join(' ') : 'no flags set'}</p>
	<dl class="readout">
		<div>
			<dt>Hex</dt>
			<dd>{d.hex}</dd>
			<Copy value={d.hex} />
		</div>
		<div>
			<dt>Decimal</dt>
			<dd>{d.value}</dd>
		</div>
		<div>
			<dt>Windows klist</dt>
			<dd>{d.klist}</dd>
			<Copy value={d.klist} />
		</div>
		<div>
			<dt class="nt">MIT klist -f</dt>
			<dd>{d.mit || 'none'}</dd>
		</div>
		{#if d.unknown.length}
			<div>
				<dt>Undefined bits</dt>
				<dd>{d.unknown.join(', ')}</dd>
			</div>
		{/if}
	</dl>
{/if}

<ul class="flags">
	{#each TICKET_FLAGS as f (f.bit)}
		{@const on = (value & maskOf(f.bit)) !== 0}
		<li class:on>
			<button type="button" aria-pressed={on} onclick={() => toggle(f.bit)}>
				<span class="mono bit">{f.bit}</span>
				<span class="mono name">{f.klist}</span>
			</button>
			<span class="mono hex">0x{maskOf(f.bit).toString(16).padStart(8, '0')}</span>
			<span class="desc">{f.desc}{f.mit ? ` (MIT ${f.mit})` : ''}{f.note ? `. ${f.note}` : ''}</span
			>
		</li>
	{/each}
</ul>
<p class="note">
	Kerberos flags are an ASN.1 bit string: bit 0 is the most significant bit, so forwardable (bit 1)
	is 0x40000000 and name_canonicalize (bit 15) is 0x00010000. The low 16 bits are unused. A normal
	Windows TGT shows 0x40e10000. Bits 0 to 13 are RFC 4120, anonymous is RFC 8062, name_canonicalize
	RFC 6806.
</p>

<h2 class="label sub">Encryption type</h2>
<div class="field">
	<label class="label" for="kb-et">Number, hex from an event, or name</label>
	<input id="kb-et" type="text" bind:value={etIn} spellcheck="false" autocomplete="off" />
</div>
{#if et?.error}
	<p class="error" role="alert">{et.error}</p>
{:else if et?.r}
	{@const r = et.r}
	{#if r.failure}
		<p class="say">0xFFFFFFFF: no ticket issued (the request failed)</p>
	{:else if r.etype}
		<p class="say" class:bad={r.etype.strength !== 'good'}>
			{r.etype.id}: {r.etype.name}, {STRENGTH_TEXT[r.etype.strength].toLowerCase()}
		</p>
		<dl class="readout">
			<div>
				<dt>Number</dt>
				<dd>{r.etype.id} (0x{(r.etype.id >>> 0).toString(16)})</dd>
			</div>
			{#if r.etype.windows}
				<div>
					<dt>Windows name</dt>
					<dd>{r.etype.windows}</dd>
				</div>
			{/if}
			<div>
				<dt>Defined in</dt>
				<dd>{r.etype.ref}</dd>
			</div>
			<div>
				<dt>Note</dt>
				<dd>{r.etype.note}</dd>
			</div>
		</dl>
	{:else}
		<p class="note">
			{r.id} is not a type this table knows. See the IANA Kerberos Parameters registry.
		</p>
	{/if}
{/if}

<div class="scroll">
	<table>
		<caption class="label">Encryption types</caption>
		<thead>
			<tr
				><th scope="col">No.</th><th scope="col">Hex</th><th scope="col">Name</th><th scope="col"
					>Strength</th
				></tr
			>
		</thead>
		<tbody>
			{#each ETYPES as e (e.id)}
				<tr class:hit={et?.r?.etype?.id === e.id}>
					<td class="mono">{e.id}</td>
					<td class="mono">0x{(e.id >>> 0).toString(16)}</td>
					<td class="mono">{e.name}</td>
					<td class:weak={e.strength !== 'good'}>{STRENGTH_TEXT[e.strength]}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
<p class="note">
	Events 4768 and 4769 show the ticket encryption type in hex: 0x12 is AES256, 0x17 is RC4. RC4
	service tickets are worth a look: they are what Kerberoasting cracks. Which types an account
	accepts is set by msDS-SupportedEncryptionTypes (see the userAccountControl tool). Negative
	numbers are Microsoft private types.
</p>

<style>
	.say {
		font-size: 1.25rem;
		font-family: var(--font-mono);
		margin: 1rem 0;
		padding: 0.5rem 0.75rem;
		border-left: 4px solid var(--signal);
		background: var(--hilite);
		overflow-wrap: anywhere;
	}
	.say.bad {
		color: var(--signal);
	}
	.readout {
		margin-bottom: 1.25rem;
	}
	.flags {
		list-style: none;
		padding: 0;
		margin: 0 0 1rem;
		border-top: 2px solid var(--rule);
	}
	.flags li {
		display: grid;
		grid-template-columns: minmax(13rem, auto) 7rem 1fr;
		gap: 0.25rem 1rem;
		align-items: center;
		padding: 0.3rem 0;
		border-bottom: 1px solid var(--rule-soft);
	}
	.flags li.on .desc {
		color: var(--ink);
	}
	.flags button {
		justify-content: flex-start;
		text-transform: none;
		letter-spacing: 0;
		min-width: 0;
	}
	.bit {
		min-width: 1.5rem;
		color: inherit;
	}
	.name {
		overflow-wrap: anywhere;
	}
	.hex {
		font-size: 0.875rem;
		color: var(--ink-2);
	}
	.desc {
		font-size: 0.9375rem;
		color: var(--ink-2);
	}
	@media (max-width: 40rem) {
		.flags li {
			grid-template-columns: 1fr auto;
		}
		.desc {
			grid-column: 1 / -1;
		}
	}
	.sub {
		margin: 1.75rem 0 0.75rem;
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
		padding: 0.4rem 0.75rem 0.4rem 0;
		border-bottom: 1px solid var(--rule-soft);
	}
	th {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-2);
		font-weight: 400;
	}
	td.weak {
		color: var(--signal);
	}
	tr.hit td {
		background: var(--hilite);
	}
	.note {
		margin: 0 0 1rem;
	}
	.nt {
		text-transform: none;
	}
</style>
