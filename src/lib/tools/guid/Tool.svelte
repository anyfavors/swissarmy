<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import { info, parseGuid, v4, v7, versionName } from './logic';

	let input = $state('');
	let plainHex = $state<'ad' | 'rfc'>('ad');
	let generated = $state<string[]>([]);
	let genKind = $state<4 | 7>(4);
	let ready = false;

	const fromLabel = {
		string: 'GUID string',
		'ad-hex': 'Hex in AD byte order',
		'rfc-hex': 'Hex in string order',
		escaped: 'LDAP escaped bytes, AD order',
		base64: 'Base64, AD order (objectGUID::)'
	};

	const result = $derived.by(() => {
		if (!input.trim()) return null;
		try {
			const p = parseGuid(input, plainHex);
			return { p, i: info(p.rfc) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	function generate(kind: 4 | 7) {
		genKind = kind;
		generated = Array.from({ length: 5 }, () => (kind === 4 ? v4() : v7()));
	}

	onMount(() => {
		const h = readHash();
		if (h.hex === 'rfc') plainHex = 'rfc';
		input = h.in ?? '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
		ready = true;
	});

	$effect(() => {
		const state = { in: input, hex: plainHex === 'rfc' ? 'rfc' : undefined };
		if (ready) writeHash(state);
	});
</script>

<div class="field">
	<label class="label" for="guid-in">GUID, hex, LDAP escaped or Base64 objectGUID</label>
	<input
		id="guid-in"
		type="text"
		bind:value={input}
		spellcheck="false"
		autocomplete="off"
		autocapitalize="off"
	/>
</div>

<div class="row opts" role="group" aria-label="Plain hex and binary input byte order">
	<span class="label">32 hex digits are</span>
	<button type="button" aria-pressed={plainHex === 'ad'} onclick={() => (plainHex = 'ad')}
		>AD byte order</button
	>
	<button type="button" aria-pressed={plainHex === 'rfc'} onclick={() => (plainHex = 'rfc')}
		>String order</button
	>
</div>

{#if result?.error}
	<p class="error" role="alert">{result.error}</p>
{:else if result?.i}
	{@const i = result.i}
	<dl class="readout">
		<div>
			<dt>Read from</dt>
			<dd>{fromLabel[result.p.from]}</dd>
		</div>
		<div>
			<dt>GUID</dt>
			<dd>{i.guid}</dd>
			<Copy value={i.guid} />
		</div>
		<div>
			<dt>Registry style</dt>
			<dd>{i.upperBraced}</dd>
			<Copy value={i.upperBraced} />
		</div>
		<div>
			<dt>AD hex</dt>
			<dd>{i.adHex}</dd>
			<Copy value={i.adHex} />
		</div>
		<div>
			<dt>Base64</dt>
			<dd>{i.base64}</dd>
			<Copy value={i.base64} />
		</div>
		<div>
			<dt>LDAP filter</dt>
			<dd>{i.ldapFilter}</dd>
			<Copy value={i.ldapFilter} />
		</div>
		<div>
			<dt>Bind DN</dt>
			<dd>{i.bindDn}</dd>
			<Copy value={i.bindDn} />
		</div>
		<div>
			<dt>Version</dt>
			<dd>
				{i.special ?? `${i.version}${versionName[i.version] ? `, ${versionName[i.version]}` : ''}`}
			</dd>
		</div>
		<div>
			<dt>Variant</dt>
			<dd>{i.variant}</dd>
		</div>
		{#if i.time}
			<div>
				<dt>Embedded time</dt>
				<dd>{i.time}</dd>
				<Copy value={i.time} />
			</div>
		{/if}
	</dl>
{/if}

<h2 class="label sub">Generate</h2>
<div class="row" role="group" aria-label="Generate UUIDs">
	<button
		type="button"
		aria-pressed={generated.length > 0 && genKind === 4}
		onclick={() => generate(4)}>5 × v4 random</button
	>
	<button
		type="button"
		aria-pressed={generated.length > 0 && genKind === 7}
		onclick={() => generate(7)}>5 × v7 time-ordered</button
	>
</div>
{#if generated.length}
	<ul class="gen">
		{#each generated as g (g)}
			<li>
				<button type="button" class="pick" onclick={() => (input = g)}
					><span class="g">{g}</span></button
				>
				<Copy value={g} />
			</li>
		{/each}
	</ul>
{/if}

<p class="note">
	Windows stores the first three groups of a GUID little-endian, so AD's objectGUID bytes,
	ldapsearch Base64 and LDAP filters show <code>3f2504e0</code> as <code>e0 04 25 3f</code>. The
	last two groups are kept as written. Generated values use crypto.getRandomValues and never leave
	the page.
</p>

<style>
	.opts {
		margin: 0.75rem 0 1.25rem;
	}
	.opts button {
		text-transform: none;
		letter-spacing: 0;
	}
	.readout {
		margin-bottom: 1.25rem;
	}
	.sub {
		margin: 1.75rem 0 0.5rem;
	}
	.gen {
		list-style: none;
		margin: 0.75rem 0 1.5rem;
		padding: 0;
		border-top: 2px solid var(--rule);
	}
	.gen li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		border-bottom: 1px solid var(--rule-soft);
		padding: 0.25rem 0;
	}
	.pick {
		border: 0;
		text-transform: none;
		letter-spacing: 0;
		font-size: 0.9375rem;
		overflow-wrap: anywhere;
		text-align: left;
		min-width: 0;
	}
	.g {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.note {
		margin: 0 0 1rem;
	}
</style>
