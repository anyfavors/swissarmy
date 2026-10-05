<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		buildFilter,
		builtinContainers,
		escapeDnValue,
		escapeFilterValue,
		filterOps,
		formatDn,
		fromCanonical,
		parseDn,
		toCanonical,
		unescapeDnValue,
		unescapeFilterValue,
		type Condition,
		type ParsedDn
	} from './logic';

	let dn = $state('CN=Smith\\, John,OU=Staff,OU=Oslo,DC=corp,DC=example,DC=com');
	let canonical = $state('corp.example.com/Users/Jane Doe');
	let leaf = $state<'CN' | 'OU'>('CN');
	let value = $state('Smith, John (Oslo)*');
	let unescape = $state(false);
	let nonAscii = $state(false);
	let conds = $state<Condition[]>([
		{ attr: 'objectClass', op: 'equals', value: 'user' },
		{ attr: 'sAMAccountName', op: 'equals', value: 'j*smith' }
	]);
	let combine = $state<'&' | '|'>('&');
	let ready = false;

	const parsed = $derived.by((): { p?: ParsedDn; error?: string } => {
		try {
			return { p: parseDn(dn) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	function attempt(f: () => string): { v?: string; error?: string } {
		try {
			return { v: f() };
		} catch (e) {
			return { error: (e as Error).message };
		}
	}

	const canon = $derived(parsed.p?.rdns.length ? attempt(() => toCanonical(dn)) : {});
	const normal = $derived(parsed.p?.rdns.length ? formatDn(parsed.p.rdns) : '');
	const fromCanon = $derived(canonical.trim() ? attempt(() => fromCanonical(canonical, leaf)) : {});
	const dnOut = $derived(attempt(() => (unescape ? unescapeDnValue(value) : escapeDnValue(value))));
	const filterOut = $derived(
		attempt(() => (unescape ? unescapeFilterValue(value) : escapeFilterValue(value, nonAscii)))
	);
	const filter = $derived(attempt(() => buildFilter(conds, combine)));

	/** Root first, for the tree. */
	const top = $derived(parsed.p ? [...parsed.p.rdns].reverse() : []);

	function addCond() {
		conds.push({ attr: '', op: 'equals', value: '' });
	}

	onMount(() => {
		const h = readHash();
		if (h.in) dn = h.in;
		if (h.cn) canonical = h.cn;
		if (h.leaf === 'OU') leaf = 'OU';
		ready = true;
	});

	$effect(() => {
		const state = { in: dn, cn: canonical, leaf: leaf === 'OU' ? 'OU' : undefined };
		if (ready) writeHash(state);
	});
</script>

{#snippet level(i: number)}
	{#if i < top.length}
		<li>
			<span class="rdn">
				{#each top[i] as a, j (j)}
					{#if j}<span class="plus">+</span>{/if}
					<span class="mono type">{a.type}</span><span class="mono eq">=</span><span
						class="mono val"
						class:hexv={a.hex}>{a.value}</span
					>
				{/each}
			</span>
			{#if i + 1 < top.length}
				<ul>{@render level(i + 1)}</ul>
			{/if}
		</li>
	{/if}
{/snippet}

<section>
	<h2 class="label">Distinguished name</h2>
	<div class="field">
		<label class="label" for="ldap-dn">DN</label>
		<textarea id="ldap-dn" rows="2" bind:value={dn} spellcheck="false" autocapitalize="off"
		></textarea>
	</div>
	{#if parsed.error}
		<p class="error" role="alert">{parsed.error}</p>
	{:else if parsed.p && parsed.p.rdns.length}
		{#each parsed.p.notes as n, i (i)}<p class="note">{n}</p>{/each}
		<ul class="tree" aria-label="RDNs from the root down">{@render level(0)}</ul>
		<dl class="readout">
			<div>
				<dt>RDNs</dt>
				<dd>
					{parsed.p.rdns.length}{parsed.p.rdns.some((r) => r.length > 1)
						? ', some multi-valued'
						: ''}
				</dd>
				<span></span>
			</div>
			<div>
				<dt>Normalised (RFC 4514)</dt>
				<dd>{normal}</dd>
				<Copy value={normal} />
			</div>
			<div>
				<dt>Parent</dt>
				<dd>{formatDn(parsed.p.rdns.slice(1)) || 'none'}</dd>
				<Copy value={formatDn(parsed.p.rdns.slice(1))} />
			</div>
			<div>
				<dt>Canonical name</dt>
				<dd>{canon.v ?? canon.error}</dd>
				<Copy value={canon.v ?? ''} />
			</div>
		</dl>
	{/if}
</section>

<section>
	<h2 class="label">Canonical name to DN</h2>
	<div class="field">
		<label class="label" for="ldap-cn">Canonical name (domain/path/name)</label>
		<input
			id="ldap-cn"
			type="text"
			bind:value={canonical}
			spellcheck="false"
			autocomplete="off"
			autocapitalize="off"
		/>
	</div>
	<div class="row opts" role="group" aria-label="Last element is">
		<span class="label">Last element is</span>
		<button type="button" aria-pressed={leaf === 'CN'} onclick={() => (leaf = 'CN')}
			>CN (object)</button
		>
		<button type="button" aria-pressed={leaf === 'OU'} onclick={() => (leaf = 'OU')}>OU</button>
	</div>
	{#if fromCanon.error}
		<p class="error" role="alert">{fromCanon.error}</p>
	{:else if fromCanon.v}
		<dl class="readout">
			<div>
				<dt>DN</dt>
				<dd>{fromCanon.v}</dd>
				<Copy value={fromCanon.v} />
			</div>
		</dl>
		<p class="note">
			A canonical name does not say which parts are OUs. Parts in between become OU, except the
			default containers directly under the domain ({builtinContainers.join(', ')}), which are CN.
		</p>
	{/if}
</section>

<section>
	<h2 class="label">Escape a value</h2>
	<div class="row opts" role="group" aria-label="Direction">
		<button type="button" aria-pressed={!unescape} onclick={() => (unescape = false)}>Escape</button
		>
		<button type="button" aria-pressed={unescape} onclick={() => (unescape = true)}>Unescape</button
		>
		{#if !unescape}
			<button type="button" aria-pressed={nonAscii} onclick={() => (nonAscii = !nonAscii)}
				>Filter: non-ASCII as hex</button
			>
		{/if}
	</div>
	<div class="field">
		<label class="label" for="ldap-val">{unescape ? 'Escaped value' : 'Raw value'}</label>
		<input
			id="ldap-val"
			type="text"
			bind:value
			spellcheck="false"
			autocomplete="off"
			autocapitalize="off"
		/>
	</div>
	<dl class="readout">
		<div>
			<dt>{unescape ? 'From DN form' : 'For a DN (RFC 4514)'}</dt>
			<dd class:err={!!dnOut.error}>{dnOut.v ?? dnOut.error}</dd>
			<Copy value={dnOut.v ?? ''} />
		</div>
		<div>
			<dt>{unescape ? 'From filter form' : 'For a filter (RFC 4515)'}</dt>
			<dd class:err={!!filterOut.error}>{filterOut.v ?? filterOut.error}</dd>
			<Copy value={filterOut.v ?? ''} />
		</div>
	</dl>
	<p class="note">
		The two are different. A DN escapes , + " \ &lt; &gt; ; and a leading # or space with a
		backslash. A filter escapes * ( ) \ and NUL as \2a \28 \29 \5c \00. Using the wrong one, or
		none, lets input change the query (LDAP injection).
	</p>
</section>

<section>
	<h2 class="label">Build a search filter</h2>
	<div class="row opts" role="group" aria-label="Combine conditions with">
		<span class="label">Match</span>
		<button type="button" aria-pressed={combine === '&'} onclick={() => (combine = '&')}
			>All (&amp;)</button
		>
		<button type="button" aria-pressed={combine === '|'} onclick={() => (combine = '|')}
			>Any (|)</button
		>
	</div>
	<ol class="conds">
		{#each conds as c, i (i)}
			<li>
				<div class="field">
					<label class="label" for="ldap-a{i}">Attribute</label>
					<input
						id="ldap-a{i}"
						type="text"
						bind:value={c.attr}
						spellcheck="false"
						autocomplete="off"
						autocapitalize="off"
					/>
				</div>
				<div class="field">
					<label class="label" for="ldap-o{i}">Test</label>
					<select id="ldap-o{i}" bind:value={c.op}>
						{#each filterOps as o (o.id)}<option value={o.id}>{o.label}</option>{/each}
					</select>
				</div>
				<div class="field">
					<label class="label" for="ldap-v{i}">Value</label>
					<input
						id="ldap-v{i}"
						type="text"
						bind:value={c.value}
						disabled={c.op === 'present'}
						spellcheck="false"
						autocomplete="off"
						autocapitalize="off"
					/>
				</div>
				<div class="row acts">
					<button type="button" aria-pressed={!!c.not} onclick={() => (c.not = !c.not)}>Not</button>
					<button
						type="button"
						onclick={() => conds.splice(i, 1)}
						aria-label="Remove condition {i + 1}">Remove</button
					>
				</div>
			</li>
		{/each}
	</ol>
	<button type="button" onclick={addCond}>Add condition</button>
	{#if filter.error}
		<p class="error" role="alert">{filter.error}</p>
	{:else}
		<dl class="readout">
			<div>
				<dt>Filter</dt>
				<dd>{filter.v}</dd>
				<Copy value={filter.v ?? ''} />
			</div>
		</dl>
	{/if}
	<p class="note">Values are escaped, so * in a value matches a literal star, not anything.</p>
</section>

<style>
	section {
		margin: 0 0 2rem;
	}
	h2 {
		margin-bottom: 0.5rem;
		border-bottom: 2px solid var(--rule);
		padding-bottom: 0.25rem;
	}
	textarea {
		min-height: 4rem;
	}
	.opts {
		margin: 0.75rem 0;
	}
	.readout {
		margin: 1rem 0 0.75rem;
	}
	.note,
	.error {
		overflow-wrap: anywhere;
	}
	.err {
		color: var(--signal);
	}
	.note + .note,
	.error {
		margin-top: 0.5rem;
	}
	.tree,
	.tree ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.tree {
		margin: 1rem 0 0;
	}
	.tree ul {
		padding-left: 1rem;
		margin-left: 0.4rem;
		border-left: 1px solid var(--rule-soft);
	}
	.tree li {
		padding-top: 0.3rem;
		min-width: 0;
	}
	.rdn {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: baseline;
		max-width: 100%;
		border: 1px solid var(--rule);
		background: var(--field);
		padding: 0.15rem 0.5rem;
	}
	.type {
		color: var(--ink-2);
		font-size: 0.8125rem;
	}
	.eq {
		color: var(--ink-2);
	}
	.val {
		font-weight: 700;
		overflow-wrap: anywhere;
		white-space: pre-wrap;
	}
	.hexv {
		font-weight: 400;
	}
	.plus {
		color: var(--signal);
		font-weight: 700;
		margin: 0 0.35rem;
	}
	.conds {
		list-style: none;
		margin: 0 0 0.75rem;
		padding: 0;
	}
	.conds li {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
		gap: 0.5rem 1rem;
		align-items: end;
		padding: 0.6rem 0;
		border-bottom: 1px solid var(--rule-soft);
	}
	.acts {
		flex-wrap: nowrap;
	}
	input:disabled {
		opacity: 0.45;
	}
</style>
