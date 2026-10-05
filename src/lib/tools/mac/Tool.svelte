<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		analyse,
		formatMac,
		linkLocal,
		macFromIpv6,
		modifiedEui64,
		slaacAddress,
		toEui64,
		type MacInfo
	} from './logic';

	let input = $state('00:1a:2b:3c:4d:5e');
	let upper = $state(false);
	let prefix = $state('2001:db8:1:2::/64');
	let ready = false;

	const parsed = $derived.by((): { r?: MacInfo; fromIp?: boolean; error?: string } => {
		try {
			return { r: analyse(input) };
		} catch (e) {
			// An EUI-64 based IPv6 address carries the MAC: decode it instead.
			if (input.includes('::') || (input.match(/:/g) ?? []).length > 5) {
				const b = macFromIpv6(input.trim());
				if (b) return { r: analyse(formatMac(b, 'colon')), fromIp: true };
			}
			return { error: (e as Error).message };
		}
	});

	const slaac = $derived.by((): { v?: string; error?: string } => {
		if (!parsed.r || !prefix.trim()) return {};
		try {
			return { v: slaacAddress(prefix, parsed.r.bytes) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	const rows = $derived.by(() => {
		const r = parsed.r;
		if (!r) return [];
		const b = r.bytes;
		return [
			['Colon', formatMac(b, 'colon', upper)],
			['Dash (IEEE)', formatMac(b, 'dash', upper)],
			['Dot (Cisco)', formatMac(b, 'dot', upper)],
			['Bare', formatMac(b, 'bare', upper)],
			['EUI-64', formatMac(toEui64(b), 'colon', upper)],
			['Modified EUI-64', formatMac(modifiedEui64(b), 'colon', upper)],
			['IPv6 link-local', linkLocal(b)]
		] as const;
	});

	onMount(() => {
		const h = readHash();
		if (h.in) input = h.in;
		if (h.case === 'upper') upper = true;
		if (h.prefix !== undefined) prefix = h.prefix;
		ready = true;
	});

	$effect(() => {
		const state = { in: input, case: upper ? 'upper' : undefined, prefix };
		if (ready) writeHash(state);
	});
</script>

<div class="field">
	<label class="label" for="mac-in">MAC address</label>
	<input id="mac-in" type="text" bind:value={input} spellcheck="false" autocomplete="off" />
	<p class="label hint">
		00:1a:2b:3c:4d:5e · 00-1A-2B-3C-4D-5E · 001a.2b3c.4d5e · 001a2b3c4d5e · or an EUI-64 based IPv6
		address
	</p>
</div>

{#if parsed.error}
	<p class="error" role="alert">{parsed.error}</p>
{:else if parsed.r}
	{@const r = parsed.r}
	{#if parsed.fromIp}
		<p class="note">
			Recovered from the IPv6 interface identifier: ff:fe removed, U/L bit flipped back.
		</p>
	{/if}

	<div class="tags">
		<span class="tag">{r.broadcast ? 'Broadcast' : r.multicast ? 'Multicast' : 'Unicast'}</span>
		<span class="tag">{r.local ? 'Locally administered' : 'Universally administered'}</span>
		{#if r.randomised}<span class="tag signal">Likely randomised</span>{/if}
	</div>

	<dl class="readout">
		<div>
			<dt>Vendor</dt>
			<dd>
				{#if r.vendor}
					{r.vendor.name}{#if r.vendor.note}<span class="sub"> · {r.vendor.note}</span>{/if}
				{:else if r.local}
					none: locally administered addresses have no registered owner
				{:else}
					not in the built-in list (OUI {r.oui})
				{/if}
			</dd>
		</div>
		<div>
			<dt>OUI</dt>
			<dd>{r.oui}</dd>
			<Copy value={r.oui} />
		</div>
		<div>
			<dt>I/G bit</dt>
			<dd>{r.multicast ? '1, group address' : '0, individual address'}</dd>
		</div>
		<div>
			<dt>U/L bit</dt>
			<dd>{r.local ? '1, locally administered' : '0, universally administered (OUI from IEEE)'}</dd>
		</div>
		{#if r.slap}
			<div>
				<dt>SLAP quadrant</dt>
				<dd>{r.slap}</dd>
			</div>
		{/if}
	</dl>

	{#if r.randomised}
		<p class="note">
			The locally administered bit is set on a unicast address that matches no known virtual prefix.
			Phones and laptops use such random addresses for Wi-Fi privacy (iOS, Android and Windows
			private addresses), so it cannot be traced to a manufacturer.
		</p>
	{/if}

	<div class="row opts">
		<button type="button" aria-pressed={upper} onclick={() => (upper = !upper)}>Uppercase</button>
	</div>

	<dl class="readout">
		{#each rows as [k, v] (k)}
			<div>
				<dt>{k}</dt>
				<dd>{v}</dd>
				<Copy value={v} />
			</div>
		{/each}
	</dl>

	<div class="field slaac">
		<label class="label" for="mac-prefix">IPv6 /64 prefix for SLAAC</label>
		<input id="mac-prefix" type="text" bind:value={prefix} spellcheck="false" autocomplete="off" />
	</div>
	{#if slaac.error}
		<p class="error" role="alert">{slaac.error}</p>
	{:else if slaac.v}
		<dl class="readout">
			<div>
				<dt>SLAAC address (EUI-64)</dt>
				<dd>{slaac.v}</dd>
				<Copy value={slaac.v} />
			</div>
		</dl>
	{/if}

	<p class="note">
		Modified EUI-64 (RFC 4291) puts ff:fe in the middle and inverts the U/L bit, so a universal
		address gets 02 in the first byte. Most current systems use stable private (RFC 7217) or
		temporary (RFC 8981) interface IDs for global addresses instead, so the EUI-64 form is mainly
		seen on routers and in link-local addresses.
	</p>
	<p class="note">
		The vendor list is partial: virtualisation defaults, protocol addresses and a few OUIs. The full
		IEEE registry is not bundled, so an unknown OUI is not an error.
	</p>
{/if}

<style>
	.hint {
		margin: 0;
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1rem;
		margin: 1.5rem 0 0.75rem;
	}
	.tag {
		font-weight: 700;
		font-size: 1.125rem;
	}
	.tag.signal {
		color: var(--signal);
	}
	.sub {
		color: var(--ink-2);
	}
	.readout {
		margin: 0.75rem 0 1.25rem;
	}
	.opts {
		margin: 1rem 0 0;
	}
	.slaac {
		margin-top: 0.5rem;
	}
	.note + .note {
		margin-top: 0.5rem;
	}
</style>
