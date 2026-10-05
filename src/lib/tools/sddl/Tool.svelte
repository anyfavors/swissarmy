<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		ACE_FLAGS,
		ACL_FLAGS,
		CONTEXTS,
		explainText,
		inheritText,
		parseSddl,
		rightsText,
		type Acl,
		type Context,
		type Trustee
	} from './logic';

	const sample =
		'O:DAG:DAD:PAI(A;;GA;;;SY)(A;;GA;;;DA)(OA;;CR;1131f6ad-9c07-11d1-f79f-00c04fc2dcd2;;S-1-5-21-1004336348-1177238915-682003330-1105)(A;CI;WDWO;;;AU)(A;OICI;GR;;;WD)S:AI(AU;SAFA;WDWO;;;WD)';

	let input = $state('');
	let ctx = $state<Context | 'auto'>('auto');
	let ready = false;

	const res = $derived.by(() => {
		if (!input.trim()) return null;
		try {
			return { d: parseSddl(input, ctx === 'auto' ? undefined : ctx) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	const ctxList = Object.entries(CONTEXTS) as [Context, string][];

	onMount(() => {
		const h = readHash();
		if (h.ctx && h.ctx in CONTEXTS) ctx = h.ctx as Context;
		if (h.in) input = h.in;
		ready = true;
	});

	// The SDDL itself stays out of the URL: domain SIDs and object GUIDs describe your network.
	$effect(() => {
		const s = { ctx: ctx === 'auto' ? undefined : ctx };
		if (ready) writeHash(s);
	});

	const who = (t: Trustee) =>
		t.sid && t.sid !== t.raw
			? `${t.sid}`
			: t.relative
				? `${t.alias}, domain relative`
				: t.alias
					? t.alias
					: '';
</script>

<div class="field">
	<label class="label" for="sd-in">SDDL string</label>
	<textarea
		id="sd-in"
		bind:value={input}
		spellcheck="false"
		autocomplete="off"
		placeholder="O:BAG:SYD:PAI(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;0x1200a9;;;BU)"></textarea>
</div>
<div class="row opts">
	<button type="button" onclick={() => (input = sample)}>Example</button>
	<button type="button" onclick={() => (input = '')} disabled={!input}>Clear</button>
</div>
<div class="row opts" role="group" aria-label="Object type">
	<span class="label">Object type</span>
	<button type="button" aria-pressed={ctx === 'auto'} onclick={() => (ctx = 'auto')}
		>Auto{ctx === 'auto' && res?.d ? `: ${CONTEXTS[res.d.ctx]}` : ''}</button
	>
	{#each ctxList as [id, name] (id)}
		<button type="button" aria-pressed={ctx === id} onclick={() => (ctx = id)}>{name}</button>
	{/each}
</div>

{#snippet aclBlock(label: string, acl: Acl, c: Context)}
	<h2 class="label sub">{label}</h2>
	{#if acl.flags.length}
		<ul class="aclflags">
			{#each acl.flags as f (f)}
				<li><span class="mono tok">{f}</span> {ACL_FLAGS[f]}</li>
			{/each}
		</ul>
	{/if}
	{#if acl.aces.length}
		<ol class="aces">
			{#each acl.aces as a, i (i)}
				<li class:risky={a.risks.some((r) => r.severity !== 'info')}>
					<div class="head">
						<span
							class="tag"
							class:deny={a.typeName.startsWith('Deny')}
							class:allow={a.typeName.startsWith('Allow')}>{a.typeName}</span
						>
						<span class="who">{a.trustee.name}</span>
						{#if who(a.trustee)}<span class="mono sid">{who(a.trustee)}</span>{/if}
					</div>
					<dl class="facts">
						<div>
							<dt>Rights</dt>
							<dd>
								<span class="mono">{a.rightsRaw || '0'}</span>
								{#if a.rightsRaw}= {rightsText(a, c)}{/if}
								<span class="mono hex">0x{a.mask.toString(16)}</span>
							</dd>
						</div>
						{#if a.objectGuid}
							<div>
								<dt>Object</dt>
								<dd>
									{a.objectName ?? 'unknown GUID'} <span class="mono guid">{a.objectGuid}</span>
								</dd>
							</div>
						{/if}
						{#if a.inheritGuid}
							<div>
								<dt>Only for</dt>
								<dd>
									{a.inheritName ?? 'unknown GUID'}
									<span class="mono guid">{a.inheritGuid}</span>
								</dd>
							</div>
						{/if}
						<div>
							<dt>Applies to</dt>
							<dd>
								{inheritText(a)}{a.flags.includes('ID')
									? ', inherited from parent'
									: ''}{a.flags.includes('SA') ? ', audit success' : ''}{a.flags.includes('FA')
									? ', audit failure'
									: ''}
								{#if a.flags.length}<span class="mono hex">{a.flags.join(' ')}</span>{/if}
							</dd>
						</div>
						{#if a.unknownFlags.length}
							<div>
								<dt>Unknown flags</dt>
								<dd class="mono">{a.unknownFlags.join(' ')}</dd>
							</div>
						{/if}
						{#if a.extra}
							<div>
								<dt>Condition</dt>
								<dd class="mono">{a.extra}</dd>
							</div>
						{/if}
					</dl>
					{#each a.risks as r (r.text)}
						<p class="risk" class:high={r.severity === 'high'}>
							<span class="label">{r.severity}</span>
							{r.text}
						</p>
					{/each}
					<p class="mono raw">({a.raw})</p>
				</li>
			{/each}
		</ol>
	{:else}
		<p class="note">No ACEs.</p>
	{/if}
{/snippet}

{#if res?.error}
	<p class="error" role="alert">{res.error}</p>
{:else if res?.d}
	{@const d = res.d}
	{@const high = d.risks.filter((r) => r.severity === 'high').length}
	<p class="say" class:ok={!high}>
		{high
			? `${high} risky ACE${high > 1 ? 's' : ''} or setting${high > 1 ? 's' : ''}`
			: d.risks.length
				? 'Nothing high risk, see notes below'
				: 'No risky entries found'}
	</p>
	{#if d.risks.length}
		<ul class="risks">
			{#each d.risks as r (r.text)}
				<li class:high={r.severity === 'high'}>
					<span class="label">{r.severity}</span>
					{r.text}
				</li>
			{/each}
		</ul>
	{/if}

	<dl class="readout">
		{#if d.owner}
			<div>
				<dt>Owner</dt>
				<dd>{d.owner.name}{who(d.owner) ? `, ${who(d.owner)}` : ''}</dd>
			</div>
		{/if}
		{#if d.group}
			<div>
				<dt>Primary group</dt>
				<dd>{d.group.name}{who(d.group) ? `, ${who(d.group)}` : ''}</dd>
			</div>
		{/if}
		<div>
			<dt>Read as</dt>
			<dd>{CONTEXTS[d.ctx]} rights</dd>
			<Copy value={explainText(d)} label="Copy text" />
		</div>
	</dl>

	{#if d.dacl}
		{@render aclBlock('DACL, who gets access', d.dacl, d.ctx)}
	{/if}
	{#if d.sacl}
		{@render aclBlock('SACL, auditing and labels', d.sacl, d.ctx)}
	{/if}
{/if}

<details>
	<summary class="label">ACE flags</summary>
	<ul class="aclflags">
		{#each Object.entries(ACE_FLAGS) as [k, f] (k)}
			<li><span class="mono tok">{k}</span> {f.name} (0x{f.bit.toString(16)})</li>
		{/each}
	</ul>
</details>

<p class="note">
	An ACE is (type;flags;rights;object GUID;inherit GUID;trustee). Rights are two-letter codes or a
	hex mask; the low bits mean different things per object type, so pick the type if Auto guesses
	wrong. sc sdshow output uses the AD letters with service meanings (CC is query config, RP is
	start). Domain-relative aliases such as DA resolve against the domain of the object. Risk flags
	cover broad groups (Everyone, Authenticated Users, Users, Domain Users, Domain Computers, Guests,
	Anonymous) with control rights, and replication rights (DCSync) for anyone but domain controllers
	and admins. Reference: Microsoft Learn, Security Descriptor String Format, ACE Strings and SID
	Strings. The SDDL is not written to the URL.
</p>

<style>
	textarea {
		min-height: 7rem;
		overflow-wrap: anywhere;
	}
	.opts {
		margin: 0.75rem 0;
	}
	.say {
		font-size: 1.25rem;
		font-family: var(--font-mono);
		margin: 1rem 0;
		padding: 0.5rem 0.75rem;
		border-left: 4px solid var(--signal);
		background: var(--hilite);
		overflow-wrap: anywhere;
	}
	.say.ok {
		border-left-color: var(--rule);
		background: transparent;
	}
	.risks {
		list-style: none;
		padding: 0;
		margin: 0 0 1.25rem;
	}
	.risks li,
	.risk {
		padding: 0.3rem 0 0.3rem 0.6rem;
		border-left: 3px solid var(--rule-soft);
		margin: 0 0 0.35rem;
		overflow-wrap: anywhere;
	}
	.risks li.high,
	.risk.high {
		border-left-color: var(--signal);
	}
	.risks .label,
	.risk .label {
		margin-right: 0.4rem;
	}
	.high .label {
		color: var(--signal);
	}
	.readout {
		margin-bottom: 1rem;
	}
	.sub {
		margin: 1.5rem 0 0.5rem;
	}
	.aclflags {
		list-style: none;
		padding: 0;
		margin: 0 0 0.75rem;
		font-size: 0.9375rem;
	}
	.tok {
		display: inline-block;
		min-width: 2.5rem;
		font-weight: 700;
	}
	.aces {
		list-style: none;
		padding: 0;
		margin: 0 0 1.25rem;
		border-top: 2px solid var(--rule);
	}
	.aces > li {
		padding: 0.6rem 0 0.6rem 0.6rem;
		border-bottom: 1px solid var(--rule-soft);
		border-left: 3px solid transparent;
	}
	.aces > li.risky {
		border-left-color: var(--signal);
		background: var(--hilite);
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.75rem;
		align-items: baseline;
	}
	.tag {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		padding: 0.05rem 0.35rem;
		border: 1px solid var(--rule);
	}
	.tag.allow {
		background: var(--ink);
		color: var(--paper);
	}
	.tag.deny {
		border-color: var(--signal);
		color: var(--signal);
	}
	.who {
		font-weight: 700;
		overflow-wrap: anywhere;
	}
	.sid,
	.guid,
	.hex {
		font-size: 0.8125rem;
		color: var(--ink-2);
		overflow-wrap: anywhere;
	}
	.hex {
		margin-left: 0.4rem;
	}
	.facts {
		margin: 0.35rem 0 0.25rem;
		display: grid;
		gap: 0.15rem;
		font-size: 0.9375rem;
	}
	.facts > div {
		display: grid;
		grid-template-columns: 7rem 1fr;
		gap: 0 0.75rem;
	}
	.facts dt {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-2);
		padding-top: 0.15rem;
	}
	.facts dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.raw {
		margin: 0.25rem 0 0;
		font-size: 0.8125rem;
		color: var(--ink-2);
		overflow-wrap: anywhere;
	}
	details {
		margin: 1rem 0;
	}
	summary {
		cursor: pointer;
		min-height: 2.75rem;
		display: flex;
		align-items: center;
	}
	.note {
		margin: 0 0 1rem;
	}
	@media (max-width: 30rem) {
		.facts > div {
			grid-template-columns: 1fr;
		}
	}
</style>
