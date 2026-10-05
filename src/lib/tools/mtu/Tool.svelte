<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		computeStack,
		decodeStack,
		encodeStack,
		espCiphers,
		layerKinds,
		mssFor,
		newLayer,
		presets,
		type EspCipher,
		type Layer,
		type LayerKind,
		type OuterIp,
		type StackResult
	} from './logic';

	let baseText = $state('1500');
	let layers = $state<Layer[]>(decodeStack('pppoe,wg:4'));
	let addKind = $state<LayerKind>('wireguard');
	let timestamps = $state(true);
	let ready = false;

	const result = $derived.by((): { r?: StackResult; error?: string } => {
		try {
			return { r: computeStack(Number(baseText.trim()), layers) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	const opts = $derived(timestamps ? 12 : 0);
	const mss4 = $derived(result.r ? mssFor(result.r.inner, 4, opts) : null);
	const mss6 = $derived(result.r ? mssFor(result.r.inner, 6, opts) : null);

	function patch(i: number, p: Record<string, unknown>) {
		layers[i] = { ...layers[i], ...p } as Layer;
	}
	function move(i: number, d: -1 | 1) {
		const j = i + d;
		if (j < 0 || j >= layers.length) return;
		const next = layers.slice();
		[next[i], next[j]] = [next[j], next[i]];
		layers = next;
	}
	function remove(i: number) {
		layers = layers.filter((_, k) => k !== i);
	}
	function add() {
		layers = [...layers, newLayer(addKind)];
	}
	function usePreset(p: (typeof presets)[number]) {
		baseText = String(p.base);
		layers = decodeStack(p.stack);
	}

	const ipVersions: OuterIp[] = [4, 6];
	const hasOuter = (l: Layer): l is Extract<Layer, { outer: OuterIp }> => 'outer' in l;

	onMount(() => {
		const h = readHash();
		const b = h.in ?? h.base;
		if (b && /^\d+$/.test(b.trim())) baseText = b.trim();
		if (h.stack !== undefined) layers = decodeStack(h.stack);
		if (h.ts === '0') timestamps = false;
		ready = true;
	});

	$effect(() => {
		const state = {
			base: baseText,
			stack: encodeStack(layers) || '-',
			ts: timestamps ? undefined : '0'
		};
		if (ready) writeHash(state);
	});
</script>

<div class="grid">
	<div class="field">
		<label class="label" for="mtu-base">Link MTU (IP packet size on the underlay)</label>
		<input id="mtu-base" type="text" inputmode="numeric" bind:value={baseText} autocomplete="off" />
		<div class="row" role="group" aria-label="Common link MTUs">
			{#each [1500, 1492, 9000, 9216] as m (m)}
				<button
					type="button"
					aria-pressed={baseText.trim() === String(m)}
					onclick={() => (baseText = String(m))}>{m}</button
				>
			{/each}
		</div>
	</div>
	<div class="field">
		<span class="label" id="mtu-presets">Presets</span>
		<div class="row" role="group" aria-labelledby="mtu-presets">
			{#each presets as p (p.label)}
				<button type="button" onclick={() => usePreset(p)}>{p.label}</button>
			{/each}
		</div>
	</div>
</div>

<h2 class="label head">Encapsulation, outermost first</h2>

{#if result.error}
	<p class="error" role="alert">{result.error}</p>
{/if}

<ol class="stack">
	{#each layers as layer, i (i)}
		{@const a = result.r?.layers[i]}
		<li>
			<div class="layer-head">
				<span class="title">{a?.title ?? layer.kind}</span>
				{#if a}
					<span class="mono over">−{a.overhead} → {a.inner}</span>
				{/if}
			</div>
			{#if a?.estimate}<p class="label est">Estimate</p>{/if}

			<div class="row controls">
				{#if hasOuter(layer)}
					<div class="row" role="group" aria-label="Outer IP version, layer {i + 1}">
						{#each ipVersions as v (v)}
							<button
								type="button"
								aria-pressed={layer.outer === v}
								onclick={() => patch(i, { outer: v })}>Outer IPv{v}</button
							>
						{/each}
					</div>
				{/if}
				{#if layer.kind === 'mpls'}
					<label class="label" for="mtu-labels-{i}">Labels</label>
					<input
						id="mtu-labels-{i}"
						class="small"
						type="number"
						min="1"
						max="10"
						value={layer.labels}
						oninput={(e) =>
							patch(i, { labels: Math.max(1, Math.min(10, Number(e.currentTarget.value) || 1)) })}
					/>
				{:else if layer.kind === 'gre'}
					<button
						type="button"
						aria-pressed={layer.key}
						onclick={() => patch(i, { key: !layer.key })}>Key</button
					>
					<button
						type="button"
						aria-pressed={layer.seq}
						onclick={() => patch(i, { seq: !layer.seq })}>Sequence</button
					>
					<button
						type="button"
						aria-pressed={layer.tap}
						onclick={() => patch(i, { tap: !layer.tap })}>Ethernet (TAP)</button
					>
				{:else if layer.kind === 'esp'}
					<label class="visually-hidden" for="mtu-cipher-{i}">Cipher</label>
					<select
						id="mtu-cipher-{i}"
						class="auto"
						value={layer.cipher}
						onchange={(e) => patch(i, { cipher: e.currentTarget.value as EspCipher })}
					>
						{#each Object.entries(espCiphers) as [id, c] (id)}
							<option value={id}>{c.label}</option>
						{/each}
					</select>
					<button
						type="button"
						aria-pressed={layer.natt}
						onclick={() => patch(i, { natt: !layer.natt })}>NAT-T (UDP 4500)</button
					>
				{:else if layer.kind === 'geneve'}
					<label class="label" for="mtu-gopt-{i}">Option bytes</label>
					<input
						id="mtu-gopt-{i}"
						class="small"
						type="number"
						min="0"
						max="252"
						step="4"
						value={layer.options}
						oninput={(e) => patch(i, { options: Number(e.currentTarget.value) || 0 })}
					/>
				{:else if layer.kind === 'openvpn'}
					<button
						type="button"
						aria-pressed={layer.cipher === 'aead'}
						onclick={() => patch(i, { cipher: 'aead' })}>AEAD</button
					>
					<button
						type="button"
						aria-pressed={layer.cipher === 'cbc-sha1'}
						onclick={() => patch(i, { cipher: 'cbc-sha1' })}>CBC + SHA1</button
					>
					<button
						type="button"
						aria-pressed={layer.tap}
						onclick={() => patch(i, { tap: !layer.tap })}>TAP</button
					>
				{/if}
				<span class="spacer"></span>
				<button
					type="button"
					onclick={() => move(i, -1)}
					disabled={i === 0}
					aria-label="Move layer {i + 1} out">Up</button
				>
				<button
					type="button"
					onclick={() => move(i, 1)}
					disabled={i === layers.length - 1}
					aria-label="Move layer {i + 1} in">Down</button
				>
				<button type="button" onclick={() => remove(i)} aria-label="Remove layer {i + 1}"
					>Remove</button
				>
			</div>

			{#if a}
				<p class="mono parts">{a.parts.join(' + ')}</p>
				{#if a.note}<p class="note">{a.note}</p>{/if}
				<p class="label src">Source: {a.source}</p>
			{/if}
		</li>
	{:else}
		<li class="empty"><p class="note">No encapsulation: the inner MTU is the link MTU.</p></li>
	{/each}
</ol>

<div class="row add">
	<label class="label" for="mtu-add">Add layer</label>
	<select id="mtu-add" class="auto" bind:value={addKind}>
		{#each layerKinds as [k, label] (k)}<option value={k}>{label}</option>{/each}
	</select>
	<button type="button" onclick={add}>Add</button>
</div>

{#if result.r && mss4 && mss6}
	{@const r = result.r}
	<p class="big">
		<span class="label">Inner MTU</span>
		<span class="mono value">{r.inner}</span>
		<span class="label">{r.base - r.inner} bytes of overhead</span>
	</p>

	<div class="row">
		<button type="button" aria-pressed={timestamps} onclick={() => (timestamps = !timestamps)}
			>TCP timestamps (12 bytes)</button
		>
	</div>

	<dl class="readout">
		<div>
			<dt>MSS, inner IPv4</dt>
			<dd>{mss4.mss}{opts ? ` · ${mss4.payload} payload with options` : ''}</dd>
			<Copy value={String(mss4.mss)} />
		</div>
		<div>
			<dt>MSS, inner IPv6</dt>
			<dd>{mss6.mss}{opts ? ` · ${mss6.payload} payload with options` : ''}</dd>
			<Copy value={String(mss6.mss)} />
		</div>
		<div>
			<dt>iptables clamp (IPv4)</dt>
			<dd>
				iptables -t mangle -A FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --set-mss {mss4.mss}
			</dd>
			<Copy
				value={`iptables -t mangle -A FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --set-mss ${mss4.mss}`}
			/>
		</div>
		<div>
			<dt>Interface MTU</dt>
			<dd>ip link set dev wg0 mtu {r.inner}</dd>
			<Copy value={`ip link set dev wg0 mtu ${r.inner}`} />
		</div>
	</dl>
	{#each [...mss4.warnings, ...mss6.warnings] as w (w)}
		<p class="error" role="alert">{w}</p>
	{/each}
	<p class="note">
		MSS is the inner MTU minus the IP header (20 or 40) and the 20-byte TCP header. Options such as
		timestamps are not part of the MSS value (RFC 6691); they shrink the payload of each segment
		instead. Rename wg0 to your interface.
	</p>
{/if}

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
		gap: 1.25rem;
		margin-bottom: 1.25rem;
	}
	.head {
		margin: 0 0 0.5rem;
		font-weight: 400;
	}
	.stack {
		list-style: none;
		margin: 0;
		padding: 0;
		border-top: 2px solid var(--rule);
	}
	.stack li {
		padding: 0.75rem 0;
		border-bottom: 1px solid var(--rule-soft);
		display: grid;
		gap: 0.4rem;
	}
	.layer-head {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 0.25rem 1rem;
		align-items: baseline;
	}
	.title {
		font-weight: 700;
	}
	.over {
		color: var(--signal);
		font-weight: 700;
	}
	.est {
		margin: 0;
		color: var(--signal);
	}
	.controls {
		gap: 0.4rem;
	}
	.spacer {
		flex: 1 1 0;
	}
	.small {
		width: 5rem;
		font: inherit;
		font-family: var(--font-mono);
		color: var(--ink);
		background: var(--field);
		border: 1px solid var(--rule);
		border-radius: 0;
		padding: 0.5rem;
		min-height: 2.75rem;
	}
	.auto {
		width: auto;
		max-width: 100%;
	}
	.parts {
		margin: 0;
		font-size: 0.875rem;
		overflow-wrap: anywhere;
	}
	.src {
		margin: 0;
		text-transform: none;
		letter-spacing: 0.02em;
	}
	.add {
		margin: 1rem 0 1.5rem;
	}
	.big {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 1rem;
		margin: 0 0 1rem;
	}
	.value {
		font-size: 2.25rem;
		font-weight: 700;
		color: var(--signal);
		line-height: 1;
	}
	.readout {
		margin: 1rem 0;
	}
	.error {
		margin: 0.5rem 0;
	}
	button:disabled {
		opacity: 0.35;
		cursor: default;
	}
	button:disabled:hover {
		background: transparent;
		color: var(--ink);
	}
</style>
