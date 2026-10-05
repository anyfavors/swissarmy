<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import { capacityBytes, encode, type Ecl, type QrCode } from './encoder';
	import {
		eclInfo,
		emailPayload,
		otpPayload,
		smsPayload,
		svgFile,
		svgPath,
		vcardPayload,
		wifiPayload,
		type Otp,
		type VCard,
		type WifiAuth
	} from './logic';

	type Preset = 'text' | 'wifi' | 'vcard' | 'otp' | 'email' | 'sms';
	const presets: { id: Preset; label: string }[] = [
		{ id: 'text', label: 'Text or URL' },
		{ id: 'wifi', label: 'Wi-Fi' },
		{ id: 'vcard', label: 'Contact' },
		{ id: 'otp', label: '2FA (otpauth)' },
		{ id: 'email', label: 'Email' },
		{ id: 'sms', label: 'SMS' }
	];
	const BORDER = 4;
	const auths: WifiAuth[] = ['WPA', 'WEP', 'nopass'];
	const algs: Otp['algorithm'][] = ['SHA1', 'SHA256', 'SHA512'];
	const ecls: Ecl[] = ['L', 'M', 'Q', 'H'];

	let preset = $state<Preset>('text');
	let ecl = $state<Ecl>('M');
	let scale = $state(10);
	let text = $state('https://fm.stephanmh.dev/');
	let wifi = $state({ ssid: '', password: '', auth: 'WPA' as WifiAuth, hidden: false });
	let vcard = $state<VCard>({
		first: '',
		last: '',
		org: '',
		title: '',
		phone: '',
		email: '',
		url: ''
	});
	let otp = $state<Otp>({
		type: 'totp',
		issuer: '',
		account: '',
		secret: '',
		algorithm: 'SHA1',
		digits: 6,
		period: 30,
		counter: 0
	});
	let email = $state({ to: '', subject: '', body: '' });
	let sms = $state({ number: '', message: '' });
	let ready = false;

	const payload = $derived.by((): { value?: string; error?: string } => {
		try {
			switch (preset) {
				case 'text':
					return { value: text };
				case 'wifi':
					return { value: wifiPayload(wifi) };
				case 'vcard':
					return { value: vcardPayload(vcard) };
				case 'otp':
					return { value: otpPayload(otp) };
				case 'email':
					return { value: emailPayload(email) };
				case 'sms':
					return { value: smsPayload(sms) };
			}
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	const result = $derived.by((): { q?: QrCode; error?: string } => {
		if (payload.value === undefined || payload.value === '') return {};
		try {
			return { q: encode(payload.value, { ecl }) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});
	const q = $derived(result.q);
	const dim = $derived(q ? q.size + BORDER * 2 : 0);
	const path = $derived(q ? svgPath(q.modules, BORDER) : '');
	const bytes = $derived(payload.value ? new TextEncoder().encode(payload.value).length : 0);
	const secretInside = $derived(preset === 'wifi' || preset === 'otp');

	function download(blob: Blob, name: string) {
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = name;
		document.body.append(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	function downloadSvg() {
		if (!q) return;
		download(new Blob([svgFile(q, BORDER, scale)], { type: 'image/svg+xml' }), 'qr-code.svg');
	}

	function downloadPng() {
		if (!q) return;
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = dim * scale;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		// QR codes are always black on white so every scanner reads them
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.fillStyle = '#000000';
		q.modules.forEach((row, y) =>
			row.forEach((dark, x) => {
				if (dark) ctx.fillRect((x + BORDER) * scale, (y + BORDER) * scale, scale, scale);
			})
		);
		canvas.toBlob((b) => b && download(b, 'qr-code.png'), 'image/png');
	}

	onMount(() => {
		const h = readHash();
		if (h.in) text = h.in;
		else if (h.t !== undefined) text = h.t;
		if (presets.some((p) => p.id === h.p)) preset = h.p as Preset;
		if (['L', 'M', 'Q', 'H'].includes(h.e)) ecl = h.e as Ecl;
		ready = true;
	});

	$effect(() => {
		// Only the plain text preset is kept in the link. Wi-Fi passwords, 2FA secrets and
		// contact details never go into the address bar.
		const state = {
			p: preset === 'text' ? undefined : preset,
			t: preset === 'text' ? text : undefined,
			e: ecl === 'M' ? undefined : ecl
		};
		if (ready) writeHash(state);
	});
</script>

<div class="row opts" role="group" aria-label="Content type">
	{#each presets as p (p.id)}
		<button type="button" aria-pressed={preset === p.id} onclick={() => (preset = p.id)}
			>{p.label}</button
		>
	{/each}
</div>

<div class="layout">
	<div class="inputs">
		{#if preset === 'text'}
			<div class="field">
				<label class="label" for="qr-text">Text or URL</label>
				<textarea id="qr-text" bind:value={text} spellcheck="false" autocomplete="off"></textarea>
			</div>
		{:else if preset === 'wifi'}
			<div class="field">
				<label class="label" for="qr-ssid">Network name (SSID)</label>
				<input
					id="qr-ssid"
					type="text"
					bind:value={wifi.ssid}
					autocomplete="off"
					spellcheck="false"
				/>
			</div>
			<div class="row" role="group" aria-label="Security">
				<span class="label">Security</span>
				{#each auths as a (a)}
					<button type="button" aria-pressed={wifi.auth === a} onclick={() => (wifi.auth = a)}
						>{a === 'nopass' ? 'None' : a === 'WPA' ? 'WPA/WPA2/WPA3' : a}</button
					>
				{/each}
			</div>
			{#if wifi.auth !== 'nopass'}
				<div class="field">
					<label class="label" for="qr-pass">Password</label>
					<input
						id="qr-pass"
						type="text"
						bind:value={wifi.password}
						autocomplete="off"
						spellcheck="false"
						autocapitalize="off"
					/>
				</div>
			{/if}
			<label class="check">
				<input type="checkbox" bind:checked={wifi.hidden} /> Hidden network
			</label>
		{:else if preset === 'vcard'}
			<div class="pair">
				<div class="field">
					<label class="label" for="qr-first">First name</label>
					<input id="qr-first" type="text" bind:value={vcard.first} autocomplete="off" />
				</div>
				<div class="field">
					<label class="label" for="qr-last">Last name</label>
					<input id="qr-last" type="text" bind:value={vcard.last} autocomplete="off" />
				</div>
			</div>
			<div class="pair">
				<div class="field">
					<label class="label" for="qr-org">Organisation</label>
					<input id="qr-org" type="text" bind:value={vcard.org} autocomplete="off" />
				</div>
				<div class="field">
					<label class="label" for="qr-title">Job title</label>
					<input id="qr-title" type="text" bind:value={vcard.title} autocomplete="off" />
				</div>
			</div>
			<div class="field">
				<label class="label" for="qr-tel">Phone</label>
				<input
					id="qr-tel"
					type="text"
					inputmode="tel"
					bind:value={vcard.phone}
					autocomplete="off"
				/>
			</div>
			<div class="field">
				<label class="label" for="qr-mail">Email</label>
				<input
					id="qr-mail"
					type="text"
					inputmode="email"
					bind:value={vcard.email}
					autocomplete="off"
				/>
			</div>
			<div class="field">
				<label class="label" for="qr-url">Website</label>
				<input id="qr-url" type="text" inputmode="url" bind:value={vcard.url} autocomplete="off" />
			</div>
		{:else if preset === 'otp'}
			<div class="pair">
				<div class="field">
					<label class="label" for="qr-iss">Issuer</label>
					<input
						id="qr-iss"
						type="text"
						bind:value={otp.issuer}
						autocomplete="off"
						placeholder="Example Co"
					/>
				</div>
				<div class="field">
					<label class="label" for="qr-acc">Account</label>
					<input
						id="qr-acc"
						type="text"
						bind:value={otp.account}
						autocomplete="off"
						placeholder="alice@example.com"
					/>
				</div>
			</div>
			<div class="field">
				<label class="label" for="qr-secret">Secret (Base32)</label>
				<input
					id="qr-secret"
					type="text"
					bind:value={otp.secret}
					autocomplete="off"
					spellcheck="false"
					autocapitalize="characters"
				/>
			</div>
			<div class="row" role="group" aria-label="Algorithm">
				<span class="label">Algorithm</span>
				{#each algs as a (a)}
					<button
						type="button"
						aria-pressed={otp.algorithm === a}
						onclick={() => (otp.algorithm = a)}>{a}</button
					>
				{/each}
			</div>
			<div class="row" role="group" aria-label="Digits">
				<span class="label">Digits</span>
				{#each [6, 8] as d (d)}
					<button type="button" aria-pressed={otp.digits === d} onclick={() => (otp.digits = d)}
						>{d}</button
					>
				{/each}
				<span class="label">Period</span>
				{#each [30, 60] as p (p)}
					<button type="button" aria-pressed={otp.period === p} onclick={() => (otp.period = p)}
						>{p} s</button
					>
				{/each}
			</div>
			<p class="note">Most authenticator apps ignore anything but SHA1, 6 digits and 30 seconds.</p>
		{:else if preset === 'email'}
			<div class="field">
				<label class="label" for="qr-to">To</label>
				<input id="qr-to" type="text" inputmode="email" bind:value={email.to} autocomplete="off" />
			</div>
			<div class="field">
				<label class="label" for="qr-subj">Subject</label>
				<input id="qr-subj" type="text" bind:value={email.subject} autocomplete="off" />
			</div>
			<div class="field">
				<label class="label" for="qr-body">Body</label>
				<textarea id="qr-body" bind:value={email.body}></textarea>
			</div>
		{:else if preset === 'sms'}
			<div class="field">
				<label class="label" for="qr-num">Phone number</label>
				<input
					id="qr-num"
					type="text"
					inputmode="tel"
					bind:value={sms.number}
					autocomplete="off"
					placeholder="+45 12 34 56 78"
				/>
			</div>
			<div class="field">
				<label class="label" for="qr-msg">Message</label>
				<textarea id="qr-msg" bind:value={sms.message}></textarea>
			</div>
		{/if}

		<div class="row" role="group" aria-label="Error correction">
			<span class="label">Error correction</span>
			{#each ecls as e (e)}
				<button type="button" aria-pressed={ecl === e} onclick={() => (ecl = e)}>{e}</button>
			{/each}
		</div>
		<p class="note">
			Level {ecl}: {eclInfo[ecl]} can be damaged and still read. Higher levels make bigger codes.
		</p>

		{#if secretInside}
			<p class="note">
				This code contains a {preset === 'wifi' ? 'password' : 'secret key'}. It is not written to
				the address bar. Treat the image like the secret itself.
			</p>
		{/if}
	</div>

	<div class="output">
		{#if payload.error}
			<p class="error" role="alert">{payload.error}</p>
		{:else if result.error}
			<p class="error" role="alert">{result.error}</p>
		{/if}
		{#if q}
			<svg
				class="code"
				viewBox="0 0 {dim} {dim}"
				shape-rendering="crispEdges"
				role="img"
				aria-label="QR code, version {q.version}"
			>
				<rect width={dim} height={dim} fill="#ffffff" />
				<path d={path} fill="#000000" />
			</svg>
			<div class="row">
				<label class="label" for="qr-scale">Pixels per module</label>
				<select id="qr-scale" bind:value={scale} class="scale">
					{#each [4, 6, 8, 10, 16, 20] as s (s)}<option value={s}
							>{s} ({(dim * s).toString()} px)</option
						>{/each}
				</select>
			</div>
			<div class="row">
				<button type="button" onclick={downloadSvg}>Download SVG</button>
				<button type="button" onclick={downloadPng}>Download PNG</button>
			</div>
			<dl class="readout">
				<div>
					<dt>Version</dt>
					<dd>{q.version} ({q.size} x {q.size} modules)</dd>
				</div>
				<div>
					<dt>Mode</dt>
					<dd>{q.mode}{q.mode === 'byte' ? ', UTF-8' : ''}</dd>
				</div>
				<div>
					<dt>Data</dt>
					<dd>{bytes} bytes, version 40 holds up to {capacityBytes(40, ecl)}</dd>
				</div>
				<div>
					<dt>Mask</dt>
					<dd>{q.mask} (lowest penalty)</dd>
				</div>
			</dl>
		{:else if !payload.error && !result.error}
			<p class="note">Fill in the fields to make a code.</p>
		{/if}
	</div>
</div>

{#if payload.value && preset !== 'text'}
	<div class="field payload">
		<div class="row between">
			<span class="label">Encoded content</span>
			<Copy value={payload.value} />
		</div>
		<pre>{payload.value}</pre>
	</div>
{/if}

<p class="note">
	Encoded on this device after ISO/IEC 18004. The code is black on white with a 4 module quiet zone
	in both editions of this page, because scanners need dark modules on a light ground.
</p>

<style>
	.opts {
		margin-bottom: 1.25rem;
	}
	.layout {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
		gap: 1.5rem;
		align-items: start;
		margin-bottom: 1.25rem;
	}
	.inputs,
	.output {
		display: grid;
		gap: 0.85rem;
		min-width: 0;
	}
	.pair {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
		gap: 0.85rem;
	}
	.check {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 2.75rem;
		cursor: pointer;
	}
	.check input {
		width: 1.25rem;
		height: 1.25rem;
		accent-color: var(--signal);
	}
	.code {
		display: block;
		width: 100%;
		max-width: 22rem;
		height: auto;
		border: 1px solid var(--rule);
	}
	.scale {
		width: auto;
	}
	.between {
		justify-content: space-between;
	}
	.payload {
		margin-bottom: 1rem;
	}
	pre {
		margin: 0;
		padding: 0.65rem 0.75rem;
		background: var(--field);
		border: 1px solid var(--rule);
		font-size: 0.875rem;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.note {
		margin: 0;
	}
</style>
