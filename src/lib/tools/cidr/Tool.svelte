<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import { formatIPv4, parseCidr, toBinary, type CidrResult } from './logic';

	let input = $state('192.168.10.0/22');
	let ready = false;

	const parsed = $derived.by((): { r?: CidrResult; error?: string } => {
		try {
			return { r: parseCidr(input) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	const fmt = new Intl.NumberFormat('en-GB');

	const rows = $derived.by(() => {
		const r = parsed.r;
		if (!r) return [];
		return [
			['CIDR', `${formatIPv4(r.network)}/${r.prefix}`],
			['Network', formatIPv4(r.network)],
			['Broadcast', r.prefix >= 31 ? 'n/a' : formatIPv4(r.broadcast)],
			['Netmask', formatIPv4(r.mask)],
			['Wildcard (ACL)', formatIPv4(r.wildcard)],
			['First host', formatIPv4(r.firstHost)],
			['Last host', formatIPv4(r.lastHost)],
			['Usable hosts', fmt.format(r.usable)],
			['Total addresses', fmt.format(r.total)],
			['Range', `${formatIPv4(r.network)} to ${formatIPv4(r.broadcast)}`]
		] as const;
	});

	/** Splits the 32 bits into network and host parts for the bit diagram. */
	const bits = $derived.by(() => {
		const r = parsed.r;
		if (!r) return null;
		const b = toBinary(r.input).replace(/\./g, '');
		return { net: b.slice(0, r.prefix), host: b.slice(r.prefix) };
	});

	onMount(() => {
		const h = readHash();
		if (h.in) input = h.in;
		ready = true;
	});

	$effect(() => {
		const state = { in: input };
		if (ready) writeHash(state);
	});
</script>

<div class="field">
	<label class="label" for="cidr-in">Address with prefix or netmask</label>
	<input
		id="cidr-in"
		type="text"
		bind:value={input}
		spellcheck="false"
		autocomplete="off"
		inputmode="decimal"
	/>
	<p class="label hint">
		Accepts 10.0.0.0/8 · 10.1.2.3 255.255.252.0 · 10.1.2.3/255.255.252.0 · a bare address
	</p>
</div>

{#if parsed.error}
	<p class="error" role="alert">{parsed.error}</p>
{:else if parsed.r}
	{@const r = parsed.r}
	<p class="class">
		<span class="tag">{r.classification.label}</span>
		{#if r.classification.rfc}<span class="label">{r.classification.rfc}</span>{/if}
		<span class="label">/{r.prefix} · {32 - r.prefix} host bits</span>
	</p>
	{#if r.note}<p class="note">{r.note}</p>{/if}

	<dl class="readout">
		{#each rows as [k, v] (k)}
			<div>
				<dt>{k}</dt>
				<dd>{v}</dd>
				<Copy value={v} />
			</div>
		{/each}
	</dl>

	{#if bits}
		<figure class="bits">
			<figcaption class="label">Address bits · network part marked</figcaption>
			<p
				class="mono"
				aria-label={`${r.prefix} network bits followed by ${32 - r.prefix} host bits`}
			>
				{#each (bits.net + bits.host).split('') as b, i (i)}<span
						class:net={i < r.prefix}
						class:gap={i % 8 === 0 && i > 0}>{b}</span
					>{/each}
			</p>
		</figure>
	{/if}
{/if}

<style>
	.hint {
		margin: 0;
	}
	.class {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 1rem;
		margin: 1.5rem 0 0.75rem;
	}
	.tag {
		font-weight: 700;
		font-size: 1.25rem;
	}
	.readout {
		margin: 1rem 0 1.5rem;
	}
	.bits {
		margin: 0;
	}
	.bits p {
		margin: 0.4rem 0 0;
		font-size: clamp(0.85rem, 2.6vw, 1.15rem);
		letter-spacing: 0.08em;
		overflow-wrap: anywhere;
	}
	.bits span.net {
		background: var(--hilite);
		color: var(--signal);
		font-weight: 700;
	}
	.bits span.gap {
		margin-left: 0.6em;
	}
</style>
