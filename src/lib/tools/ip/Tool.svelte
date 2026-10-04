<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		addressCount,
		analyse,
		formatAddr,
		ipv6Ranges,
		reverseDns,
		toBinaryGroups,
		toHex,
		type IpResult
	} from './logic';

	let input = $state('2001:0db8:0000:0000:0000:ff00:0042:8329');
	let ready = false;

	const parsed = $derived.by((): { r?: IpResult; error?: string } => {
		if (!input.trim()) return {};
		try {
			return { r: analyse(input) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	const rows = $derived.by(() => {
		const r = parsed.r;
		if (!r) return [];
		const out: [string, string][] = [
			[r.version === 6 ? 'Compressed (RFC 5952)' : 'Address', r.canonical],
			[r.version === 6 ? 'Expanded' : 'Zero-padded', r.expanded]
		];
		if (r.zone) out.push(['Zone', r.zone]);
		if (r.version === 4) out.push(['IPv4-mapped IPv6', `::ffff:${r.canonical}`]);
		for (const e of r.embedded) out.push([e.label, e.value]);
		out.push(['Integer', r.value.toString()]);
		out.push(['Hex', toHex(r.value, r.bits)]);
		out.push(['Reverse DNS', reverseDns(r.version, r.value)]);
		if (r.prefix !== undefined && r.network !== undefined && r.last !== undefined) {
			out.push(['Network', `${formatAddr(r.version, r.network)}/${r.prefix}`]);
			out.push(['First address', formatAddr(r.version, r.network)]);
			out.push(['Last address', formatAddr(r.version, r.last)]);
			out.push(['Addresses', addressCount(r.bits, r.prefix)]);
		}
		return out;
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
	<label class="label" for="ip-in">IPv6 or IPv4 address, optional /prefix</label>
	<input id="ip-in" type="text" bind:value={input} spellcheck="false" autocomplete="off" />
	<p class="label hint">
		Accepts 2001:db8::1 · fe80::1%eth0 · 2001:db8::/48 · ::ffff:192.0.2.1 · 192.0.2.1
	</p>
</div>

{#if parsed.error}
	<p class="error" role="alert">{parsed.error}</p>
{:else if parsed.r}
	{@const r = parsed.r}
	<p class="class">
		<span class="tag">{r.classification.label}</span>
		{#if r.classification.rfc}<span class="label">{r.classification.rfc}</span>{/if}
		<span class="label">IPv{r.version}{r.prefix !== undefined ? ` · /${r.prefix}` : ''}</span>
	</p>

	<dl class="readout">
		{#each rows as [k, v] (k)}
			<div>
				<dt>{k}</dt>
				<dd>{v}</dd>
				<Copy value={v} />
			</div>
		{/each}
	</dl>

	<figure class="bits">
		<figcaption class="label">
			Binary · {r.version === 6 ? '16-bit groups' : 'octets'}{r.prefix !== undefined
				? ', network part marked'
				: ''}
		</figcaption>
		<p class="mono">
			{#each toBinaryGroups(r.value, r.bits) as g, gi (gi)}<span class="grp"
					>{#each g.split('') as b, i (i)}{@const bit = gi * g.length + i}<span
							class:net={r.prefix !== undefined && bit < r.prefix}
							class:nib={i > 0 && i % 4 === 0}>{b}</span
						>{/each}</span
				>{/each}
		</p>
	</figure>
{/if}

<p class="note">
	The compressed form follows RFC 5952: lowercase, no leading zeros, the longest run of zero groups
	becomes <code>::</code> (leftmost if tied), and a single zero group is never compressed.
</p>

<details class="ranges">
	<summary class="label">IPv6 special ranges</summary>
	<dl class="readout">
		{#each ipv6Ranges as x (x.cidr)}
			<div>
				<dt class="cidr">{x.cidr}</dt>
				<dd>{x.label}</dd>
				<span class="label">{x.rfc}</span>
			</div>
		{/each}
	</dl>
</details>

<style>
	.hint {
		margin: 0;
		text-transform: none;
		letter-spacing: 0.02em;
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
		margin: 0 0 1.5rem;
	}
	.bits p {
		margin: 0.4rem 0 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1.1em;
		font-size: clamp(0.8rem, 2.4vw, 1rem);
		letter-spacing: 0.06em;
	}
	.grp {
		white-space: nowrap;
	}
	.bits span.net {
		background: var(--hilite);
		color: var(--signal);
		font-weight: 700;
	}
	.bits span.nib {
		margin-left: 0.35em;
	}
	.note {
		margin-bottom: 1.5rem;
	}
	.ranges summary {
		cursor: pointer;
		min-height: 2.75rem;
		display: flex;
		align-items: center;
	}
	.ranges .readout {
		margin-top: 0.5rem;
	}
	.readout dt.cidr {
		text-transform: none;
		letter-spacing: 0;
	}
</style>
