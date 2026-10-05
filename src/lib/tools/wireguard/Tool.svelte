<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import { encode } from '../qr/encoder';
	import { svgPath } from '../qr/logic';
	import {
		buildConfigs,
		derivePublic,
		generateKeyPair,
		generatePsk,
		type KeyPair,
		type KeySource,
		type WgConfigs
	} from './logic';

	let subnet4 = $state('10.8.0.0/24');
	let subnet6 = $state('fd00:8::/64');
	let countText = $state('3');
	let endpoint = $state('vpn.example.com');
	let portText = $state('51820');
	let dns = $state('1.1.1.1, 2606:4700:4700::1111');
	let allowed = $state('0.0.0.0/0, ::/0');
	let keepaliveText = $state('25');
	let mtuText = $state('');
	let usePsk = $state(true);

	let server = $state<KeyPair | null>(null);
	let clientKeys = $state<(KeyPair & { psk?: string })[]>([]);
	let source = $state<KeySource | null>(null);
	let generating = false;

	let selected = $state(0);
	let showQr = $state(false);
	let derivePriv = $state('');
	let ready = $state(false);

	const count = $derived(Number(countText.trim()));

	const wanted = () => (Number.isInteger(count) && count > 0 && count <= 250 ? count : 0);
	const short = () =>
		!server || clientKeys.length < wanted() || (usePsk && clientKeys.some((c) => !c.psk));

	async function fill(regenerate = false) {
		if (generating) return;
		generating = true;
		try {
			if (regenerate) {
				server = null;
				clientKeys = [];
				showQr = false;
			}
			if (!server) {
				const k = await generateKeyPair();
				server = { privateKey: k.privateKey, publicKey: k.publicKey };
				source = k.source;
			}
			const want = wanted();
			const next = clientKeys.slice();
			while (next.length < want) {
				const k = await generateKeyPair();
				next.push({ privateKey: k.privateKey, publicKey: k.publicKey });
			}
			clientKeys = next.map((c) => (usePsk && !c.psk ? { ...c, psk: generatePsk() } : c));
		} finally {
			generating = false;
		}
		// The count may have grown while keys were being made.
		if (short()) void fill();
	}

	$effect(() => {
		// Top up keys when the client count grows or preshared keys are switched on.
		void count;
		void usePsk;
		if (ready) untrack(() => void fill());
	});

	const configs = $derived.by((): { c?: WgConfigs; error?: string } => {
		if (!server) return {};
		try {
			const mtu = mtuText.trim() ? Number(mtuText.trim()) : undefined;
			if (mtu !== undefined && !(Number.isInteger(mtu) && mtu >= 1280 && mtu <= 9000))
				throw new Error('MTU must be 1280 to 9000, or empty for automatic');
			return {
				c: buildConfigs(
					{
						subnet4,
						subnet6,
						clients: count,
						endpoint,
						listenPort: Number(portText.trim()),
						dns,
						clientAllowed: allowed,
						keepalive: keepaliveText.trim() ? Number(keepaliveText.trim()) : 0,
						mtu
					},
					{
						server,
						clients: clientKeys.map((k) => ({ ...k, psk: usePsk ? k.psk : undefined }))
					}
				)
			};
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	const client = $derived(configs.c?.clients[Math.min(selected, configs.c.clients.length - 1)]);

	const qr = $derived.by(() => {
		if (!showQr || !client) return null;
		try {
			const q = encode(client.conf, { ecl: 'L' });
			return { dim: q.size + 8, path: svgPath(q.modules, 4), version: q.version };
		} catch {
			return null;
		}
	});

	const pubFromPriv = $derived.by((): { pub?: string; error?: string } => {
		if (!derivePriv.trim()) return {};
		try {
			return { pub: derivePublic(derivePriv) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	function download(text: string, name: string) {
		const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
		const a = document.createElement('a');
		a.href = url;
		a.download = name;
		document.body.append(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	onMount(() => {
		const h = readHash();
		if (h.v4 !== undefined) subnet4 = h.v4 === '-' ? '' : h.v4;
		if (h.v6 !== undefined) subnet6 = h.v6 === '-' ? '' : h.v6;
		if (h.n) countText = h.n;
		if (h.port) portText = h.port;
		if (h.dns !== undefined) dns = h.dns === '-' ? '' : h.dns;
		if (h.allowed) allowed = h.allowed;
		if (h.ka !== undefined) keepaliveText = h.ka;
		if (h.mtu) mtuText = h.mtu;
		if (h.psk === '0') usePsk = false;
		ready = true;
	});

	$effect(() => {
		// Options only. Keys and the endpoint never go into the URL.
		const state = {
			v4: subnet4 || '-',
			v6: subnet6 || '-',
			n: countText,
			port: portText,
			dns: dns || '-',
			allowed,
			ka: keepaliveText,
			mtu: mtuText,
			psk: usePsk ? undefined : '0'
		};
		if (ready) writeHash(state);
	});
</script>

<p class="warn" role="note">
	Private keys are made in this tab and never leave it. They are not put in the address bar. Anyone
	who gets a config file or its QR code can join the tunnel, so handle them like passwords.
</p>

<div class="grid">
	<div class="field">
		<label class="label" for="wg-endpoint">Endpoint (server public address)</label>
		<input
			id="wg-endpoint"
			type="text"
			bind:value={endpoint}
			placeholder="vpn.example.com"
			spellcheck="false"
			autocomplete="off"
		/>
	</div>
	<div class="field">
		<label class="label" for="wg-port">Listen port</label>
		<input id="wg-port" type="text" inputmode="numeric" bind:value={portText} autocomplete="off" />
	</div>
	<div class="field">
		<label class="label" for="wg-v4">Tunnel subnet, IPv4</label>
		<input id="wg-v4" type="text" bind:value={subnet4} spellcheck="false" autocomplete="off" />
	</div>
	<div class="field">
		<label class="label" for="wg-v6">Tunnel subnet, IPv6 (optional)</label>
		<input id="wg-v6" type="text" bind:value={subnet6} spellcheck="false" autocomplete="off" />
	</div>
	<div class="field">
		<label class="label" for="wg-n">Clients</label>
		<input id="wg-n" type="text" inputmode="numeric" bind:value={countText} autocomplete="off" />
	</div>
	<div class="field">
		<label class="label" for="wg-dns">DNS for clients (optional)</label>
		<input id="wg-dns" type="text" bind:value={dns} spellcheck="false" autocomplete="off" />
	</div>
	<div class="field">
		<label class="label" for="wg-allowed">Client AllowedIPs</label>
		<input id="wg-allowed" type="text" bind:value={allowed} spellcheck="false" autocomplete="off" />
		<div class="row" role="group" aria-label="AllowedIPs presets">
			<button
				type="button"
				aria-pressed={allowed === '0.0.0.0/0, ::/0'}
				onclick={() => (allowed = '0.0.0.0/0, ::/0')}>Full tunnel</button
			>
			<button
				type="button"
				aria-pressed={allowed === [subnet4, subnet6].filter(Boolean).join(', ')}
				onclick={() => (allowed = [subnet4, subnet6].filter(Boolean).join(', '))}
				>Tunnel only</button
			>
		</div>
	</div>
	<div class="field">
		<label class="label" for="wg-ka">PersistentKeepalive, seconds (0 off)</label>
		<input
			id="wg-ka"
			type="text"
			inputmode="numeric"
			bind:value={keepaliveText}
			autocomplete="off"
		/>
	</div>
	<div class="field">
		<label class="label" for="wg-mtu">MTU (optional)</label>
		<input
			id="wg-mtu"
			type="text"
			inputmode="numeric"
			bind:value={mtuText}
			placeholder="automatic"
			autocomplete="off"
		/>
	</div>
</div>

<div class="row opts">
	<button type="button" aria-pressed={usePsk} onclick={() => (usePsk = !usePsk)}
		>Preshared keys</button
	>
	<button type="button" onclick={() => fill(true)}>New keys</button>
	{#if source}
		<span class="label"
			>Keys from {source === 'webcrypto' ? 'WebCrypto X25519' : 'built-in X25519 (RFC 7748)'}</span
		>
	{/if}
</div>

<p class="note">
	Full tunnel sends all traffic through the server. To keep LAN ranges local, build the list in
	<a href={`${resolve('/[tool]', { tool: 'cidr-sets' })}#mode=exclude&preset=wg-rfc1918`}
		>CIDR aggregation and exclusion (FM 2-05)</a
	>. Keepalive 25 keeps NAT mappings open for clients behind NAT.
</p>

{#if configs.error}
	<p class="error" role="alert">{configs.error}</p>
{:else if configs.c}
	{@const c = configs.c}
	<section>
		<div class="row between">
			<h2 class="label">Server · wg0.conf</h2>
			<div class="row">
				<Copy value={c.server} />
				<button type="button" onclick={() => download(c.server, 'wg0.conf')}>Download</button>
			</div>
		</div>
		<pre class="conf">{c.server}</pre>
		<p class="note">
			On Linux, also enable forwarding (net.ipv4.ip_forward=1) and NAT or routing for the tunnel
			subnet if clients should reach the internet through the server.
		</p>
	</section>

	{#if client}
		<section>
			<div class="row client-pick" role="group" aria-label="Client">
				{#each c.clients as cl, i (cl.name)}
					<button
						type="button"
						aria-pressed={client.name === cl.name}
						onclick={() => (selected = i)}>{cl.name}</button
					>
				{/each}
			</div>
			<div class="row between">
				<h2 class="label">{client.name}.conf · {client.address}</h2>
				<div class="row">
					<Copy value={client.conf} />
					<button type="button" onclick={() => download(client.conf, `${client.name}.conf`)}
						>Download</button
					>
					<button type="button" aria-pressed={showQr} onclick={() => (showQr = !showQr)}
						>QR code</button
					>
				</div>
			</div>
			<pre class="conf">{client.conf}</pre>
			{#if showQr && qr}
				<figure class="qr">
					<svg
						viewBox="0 0 {qr.dim} {qr.dim}"
						shape-rendering="crispEdges"
						role="img"
						aria-label="QR code with the {client.name} config, version {qr.version}"
					>
						<rect width={qr.dim} height={qr.dim} fill="#ffffff" />
						<path d={qr.path} fill="#000000" />
					</svg>
					<figcaption class="label">
						Scan in the WireGuard mobile app: add tunnel, scan from QR code. Contains the private
						key.
					</figcaption>
				</figure>
			{/if}
		</section>
	{/if}
{/if}

<section class="derive">
	<h2 class="label">Public key from a private key (wg pubkey)</h2>
	<div class="field">
		<label class="label" for="wg-priv">Private key</label>
		<input
			id="wg-priv"
			type="password"
			bind:value={derivePriv}
			spellcheck="false"
			autocomplete="off"
		/>
	</div>
	{#if pubFromPriv.error}
		<p class="error" role="alert">{pubFromPriv.error}</p>
	{:else if pubFromPriv.pub}
		<dl class="readout">
			<div>
				<dt>Public key</dt>
				<dd>{pubFromPriv.pub}</dd>
				<Copy value={pubFromPriv.pub} />
			</div>
		</dl>
	{/if}
</section>

<style>
	.warn {
		margin: 0 0 1.25rem;
		padding: 0.6rem 0.75rem;
		border: 1px solid var(--signal);
		border-left-width: 4px;
		background: var(--hilite);
		font-size: 0.9375rem;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
		gap: 1rem 1.25rem;
		margin-bottom: 1rem;
	}
	.grid .row {
		margin-top: 0.25rem;
	}
	.opts {
		margin-bottom: 0.75rem;
	}
	section {
		margin-top: 1.5rem;
	}
	.between {
		justify-content: space-between;
	}
	h2.label {
		margin: 0;
		font-weight: 400;
		overflow-wrap: anywhere;
	}
	.client-pick {
		margin-bottom: 0.75rem;
	}
	.conf {
		margin: 0.5rem 0 0.75rem;
		padding: 0.75rem;
		background: var(--field);
		border-top: 2px solid var(--rule);
		border-bottom: 1px solid var(--rule-soft);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		font-size: 0.875rem;
	}
	.qr {
		margin: 0.5rem 0 0;
		display: grid;
		gap: 0.5rem;
	}
	.qr svg {
		display: block;
		width: 100%;
		max-width: 20rem;
		height: auto;
		border: 1px solid var(--rule);
	}
	input[type='password'] {
		width: 100%;
		font: inherit;
		font-family: var(--font-mono);
		font-size: 1rem;
		color: var(--ink);
		background: var(--field);
		border: 1px solid var(--rule);
		border-radius: 0;
		padding: 0.65rem 0.75rem;
	}
	input[type='password']:focus {
		outline: 3px solid var(--signal);
		outline-offset: -1px;
	}
	.derive {
		margin-top: 2rem;
		display: grid;
		gap: 0.75rem;
	}
</style>
