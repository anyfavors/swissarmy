<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		ENC_FLAGS,
		ENC_PRESETS,
		UAC_FLAGS,
		UAC_PRESETS,
		decode,
		encWarnings,
		hex,
		ldapFilter,
		parseFlags
	} from './logic';

	type Attr = 'uac' | 'enc';
	type FilterMode = 'all' | 'any' | 'none';
	let attr = $state<Attr>('uac');
	let input = $state('66048');
	let encInput = $state('28');
	let fmode = $state<FilterMode>('all');
	let ready = false;

	const table = $derived(attr === 'uac' ? UAC_FLAGS : ENC_FLAGS);
	const presets = $derived(attr === 'uac' ? UAC_PRESETS : ENC_PRESETS);
	const attrName = $derived(
		attr === 'uac' ? 'userAccountControl' : 'msDS-SupportedEncryptionTypes'
	);
	const raw = $derived(attr === 'uac' ? input : encInput);

	const parsed = $derived.by(() => {
		if (!raw.trim()) return null;
		try {
			const v = parseFlags(raw);
			return { d: decode(v, table) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});
	const value = $derived(parsed?.d?.value ?? 0);
	const warnings = $derived(attr === 'enc' && parsed?.d ? encWarnings(value) : []);
	const filter = $derived(value ? ldapFilter(attrName, value, fmode) : '');

	function setValue(v: number) {
		if (attr === 'uac') input = String(v >>> 0);
		else encInput = String(v >>> 0);
	}
	function toggle(bit: number) {
		setValue((value ^ bit) >>> 0);
	}

	const riskLabel = { high: 'risk', medium: 'caution', info: '', good: 'hardening' };

	onMount(() => {
		const h = readHash();
		if (h.a === 'enc') attr = 'enc';
		if (h.in) {
			if (attr === 'enc') encInput = h.in;
			else input = h.in;
		}
		if (h.f === 'any' || h.f === 'none') fmode = h.f;
		ready = true;
	});

	$effect(() => {
		const state = {
			a: attr === 'enc' ? 'enc' : undefined,
			in: attr === 'uac' ? input : encInput,
			f: fmode === 'all' ? undefined : fmode
		};
		if (ready) writeHash(state);
	});
</script>

<div class="row attrs" role="group" aria-label="Attribute">
	<button type="button" aria-pressed={attr === 'uac'} onclick={() => (attr = 'uac')}
		>userAccountControl</button
	>
	<button type="button" aria-pressed={attr === 'enc'} onclick={() => (attr = 'enc')}
		>msDS-SupportedEncryptionTypes</button
	>
</div>

<div class="field">
	<label class="label" for="uac-in">{attrName}, decimal or 0x hex</label>
	{#if attr === 'uac'}
		<input id="uac-in" type="text" bind:value={input} spellcheck="false" autocomplete="off" />
	{:else}
		<input id="uac-in" type="text" bind:value={encInput} spellcheck="false" autocomplete="off" />
	{/if}
</div>

<div class="row presets" role="group" aria-label="Common values">
	{#each presets as p (p.value)}
		<button
			type="button"
			class="ex"
			aria-pressed={value === p.value}
			onclick={() => setValue(p.value)}>{p.label} <span class="num">{p.value}</span></button
		>
	{/each}
</div>

{#if parsed?.error}
	<p class="error" role="alert">{parsed.error}</p>
{:else if parsed?.d}
	{@const d = parsed.d}
	<dl class="readout">
		<div>
			<dt>Decimal</dt>
			<dd>{d.value}</dd>
			<Copy value={String(d.value)} />
		</div>
		<div>
			<dt>Hex</dt>
			<dd>{hex(d.value)}</dd>
			<Copy value={hex(d.value)} />
		</div>
		<div>
			<dt>Flags set</dt>
			<dd>{d.set.map((f) => f.name).join(' | ') || 'none'}</dd>
			<Copy value={d.set.map((f) => f.name).join(' | ')} />
		</div>
		{#if d.unknown}
			<div>
				<dt>Unknown bits</dt>
				<dd>{hex(d.unknown)}</dd>
			</div>
		{/if}
	</dl>

	{#each warnings as w (w.text)}
		<p class={w.level === 'good' ? 'note' : 'warn'}>{w.text}</p>
	{/each}
	{#each d.set.filter((f) => f.note && f.risk !== 'good') as f (f.name)}
		<p class={f.risk === 'high' ? 'warn' : 'note'}><strong>{f.name}</strong>: {f.note}</p>
	{/each}
{/if}

<fieldset class="flags">
	<legend class="label">Flags</legend>
	{#each table as f (f.value)}
		<label class="flag" class:on={(value & f.value) !== 0}>
			<input type="checkbox" checked={(value & f.value) !== 0} onchange={() => toggle(f.value)} />
			<span class="fname">{f.name}</span>
			<span class="fval">{hex(f.value)} · {f.value}</span>
			<span class="fdesc"
				>{f.desc}{#if f.risk && riskLabel[f.risk]}<span class="risk {f.risk}"
						>{riskLabel[f.risk]}</span
					>{/if}</span
			>
		</label>
	{/each}
</fieldset>

<h2 class="label sub">LDAP filter</h2>
<div class="row" role="group" aria-label="Filter match">
	<button type="button" aria-pressed={fmode === 'all'} onclick={() => (fmode = 'all')}
		>All set</button
	>
	<button type="button" aria-pressed={fmode === 'any'} onclick={() => (fmode = 'any')}
		>Any set</button
	>
	<button type="button" aria-pressed={fmode === 'none'} onclick={() => (fmode = 'none')}
		>Not set</button
	>
</div>
{#if filter}
	<dl class="readout filt">
		<div>
			<dt>Filter</dt>
			<dd>{filter}</dd>
			<Copy value={filter} />
		</div>
	</dl>
{:else}
	<p class="note filt">Tick at least one flag to get a filter.</p>
{/if}

<p class="note">
	Filters use the bitwise matching rules: 1.2.840.113556.1.4.803 (AND, all bits set) and .804 (OR,
	any bit set). Combine them, for example enabled users without pre-authentication:
	<code
		>(&amp;(objectCategory=person)(objectClass=user)(userAccountControl:1.2.840.113556.1.4.803:=4194304)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))</code
	>
</p>
<p class="note">
	Flag names and values follow Microsoft's userAccountControl table and MS-ADTS 2.2.16; encryption
	types follow MS-KILE 2.2.7.
</p>

<style>
	.attrs {
		margin-bottom: 1rem;
	}
	.attrs button {
		text-transform: none;
		letter-spacing: 0;
	}
	.presets {
		margin: 0.75rem 0 1.25rem;
	}
	.ex {
		text-transform: none;
		letter-spacing: 0;
	}
	.num {
		font-size: 0.75rem;
		opacity: 0.75;
	}
	.readout {
		margin-bottom: 1rem;
	}
	.warn {
		margin: 0 0 0.75rem;
		padding: 0.35rem 0.6rem;
		border-left: 4px solid var(--signal);
		background: var(--hilite);
		font-size: 0.9375rem;
	}
	.note {
		margin: 0 0 0.75rem;
	}
	.note code {
		overflow-wrap: anywhere;
	}
	.flags {
		border: 0;
		border-top: 2px solid var(--rule);
		margin: 1.5rem 0 0;
		padding: 0;
		min-width: 0;
	}
	legend {
		padding: 0 0 0.4rem;
	}
	.flag {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0 0.6rem;
		align-items: center;
		min-height: 2.75rem;
		padding: 0.35rem 0;
		border-bottom: 1px solid var(--rule-soft);
		cursor: pointer;
	}
	.flag.on {
		background: var(--hilite);
	}
	.flag input {
		width: 1.15rem;
		height: 1.15rem;
		margin: 0 0.25rem;
		accent-color: var(--signal);
		grid-row: span 3;
	}
	.fname {
		font-family: var(--font-mono);
		font-weight: 700;
		overflow-wrap: anywhere;
	}
	.fval {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--ink-2);
	}
	.fdesc {
		font-size: 0.875rem;
	}
	.risk {
		margin-left: 0.5rem;
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		padding: 0 0.3rem;
		border: 1px solid var(--rule-soft);
		color: var(--ink-2);
	}
	.risk.high {
		border-color: var(--signal);
		color: var(--signal);
	}
	.sub {
		margin: 1.75rem 0 0.5rem;
	}
	.filt {
		margin: 0.75rem 0 1.25rem;
	}
</style>
