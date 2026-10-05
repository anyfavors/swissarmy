<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		bdpBytes,
		cities,
		cityById,
		FIBRE_FACTOR,
		formatBytes,
		formatMs,
		formatRate,
		greatCircleKm,
		mathisBps,
		minRttMs,
		oneWayMs,
		pairs,
		parseBytes,
		parseLoss,
		parseRate,
		parseTime,
		sig,
		windowLimitedBps,
		windowScale
	} from './logic';

	let from = $state('cph');
	let to = $state('lon');
	let customKm = $state('');
	let medium = $state<'fibre' | 'vacuum'>('fibre');
	let stretchText = $state('1');
	let rttText = $state('30 ms');
	let rateText = $state('1 Gbit/s');
	let windowText = $state('64 KiB');
	let mssText = $state('1460');
	let lossText = $state('0.1%');
	let ready = false;

	const run = <T,>(f: () => T): { v?: T; error?: string } => {
		try {
			return { v: f() };
		} catch (e) {
			return { error: (e as Error).message };
		}
	};

	const dist = $derived(
		run(() => {
			const factor = medium === 'fibre' ? FIBRE_FACTOR : 1;
			const stretch = Number(stretchText.trim());
			if (!(stretch >= 1 && stretch <= 10)) throw new Error('Path factor must be 1 to 10');
			let gc: number;
			if (customKm.trim()) {
				gc = Number(customKm.trim().replace(/\s*km$/i, ''));
				if (!(gc >= 0)) throw new Error('Distance must be a number of kilometres');
			} else {
				const a = cityById(from);
				const b = cityById(to);
				if (!a || !b) throw new Error('Pick two cities');
				gc = greatCircleKm(a, b);
			}
			const path = gc * stretch;
			return { gc, path, one: oneWayMs(path, factor), rtt: minRttMs(path, factor) };
		})
	);

	const rtt = $derived(run(() => parseTime(rttText)));
	const bdp = $derived(
		run(() => {
			const r = parseRate(rateText);
			const ms = parseTime(rttText);
			const b = bdpBytes(r, ms);
			return { rate: r, bytes: b, scale: windowScale(b) };
		})
	);
	const win = $derived(
		run(() => {
			const w = parseBytes(windowText);
			if (!(w > 0)) throw new Error('Window must be above zero');
			return { w, bps: windowLimitedBps(w, parseTime(rttText)) };
		})
	);
	const mathis = $derived(
		run(() => {
			const mss = Number(mssText.trim());
			if (!Number.isFinite(mss)) throw new Error('MSS must be a number of bytes');
			return mathisBps(mss, parseTime(rttText), parseLoss(lossText));
		})
	);

	function usePair(a: string, b: string) {
		from = a;
		to = b;
		customKm = '';
	}

	function useRtt() {
		if (dist.v) rttText = `${sig(dist.v.rtt)} ms`.replace(/,/g, '');
	}

	const cityName = (id: string) => cityById(id)?.name ?? id;

	onMount(() => {
		const h = readHash();
		if (h.from && cityById(h.from)) from = h.from;
		if (h.to && cityById(h.to)) to = h.to;
		if (h.km) customKm = h.km;
		if (h.medium === 'vacuum') medium = 'vacuum';
		if (h.stretch) stretchText = h.stretch;
		if (h.rtt) rttText = h.rtt;
		if (h.rate) rateText = h.rate;
		if (h.win) windowText = h.win;
		if (h.mss) mssText = h.mss;
		if (h.loss) lossText = h.loss;
		ready = true;
	});

	$effect(() => {
		const state = {
			from,
			to,
			km: customKm,
			medium: medium === 'fibre' ? undefined : medium,
			stretch: stretchText === '1' ? undefined : stretchText,
			rtt: rttText,
			rate: rateText,
			win: windowText,
			mss: mssText,
			loss: lossText
		};
		if (ready) writeHash(state);
	});
</script>

<section>
	<h2 class="label head">Distance to minimum round-trip time</h2>
	<div class="row" role="group" aria-label="City pairs">
		{#each pairs as [a, b] (a + b)}
			<button
				type="button"
				aria-pressed={!customKm.trim() && from === a && to === b}
				onclick={() => usePair(a, b)}>{cityName(a)}–{cityName(b)}</button
			>
		{/each}
	</div>
	<div class="grid">
		<div class="field">
			<label class="label" for="lt-from">From</label>
			<select id="lt-from" bind:value={from} onchange={() => (customKm = '')}>
				{#each cities as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
			</select>
		</div>
		<div class="field">
			<label class="label" for="lt-to">To</label>
			<select id="lt-to" bind:value={to} onchange={() => (customKm = '')}>
				{#each cities as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
			</select>
		</div>
		<div class="field">
			<label class="label" for="lt-km">Or distance in km</label>
			<input
				id="lt-km"
				type="text"
				inputmode="decimal"
				bind:value={customKm}
				placeholder="e.g. 1200"
				autocomplete="off"
			/>
		</div>
		<div class="field">
			<label class="label" for="lt-stretch">Path factor (route length ÷ great circle)</label>
			<input
				id="lt-stretch"
				type="text"
				inputmode="decimal"
				bind:value={stretchText}
				autocomplete="off"
			/>
		</div>
	</div>
	<div class="row" role="group" aria-label="Medium">
		<button type="button" aria-pressed={medium === 'fibre'} onclick={() => (medium = 'fibre')}
			>Fibre, 2/3 c</button
		>
		<button type="button" aria-pressed={medium === 'vacuum'} onclick={() => (medium = 'vacuum')}
			>Vacuum or radio, c</button
		>
	</div>
	{#if dist.error}
		<p class="error" role="alert">{dist.error}</p>
	{:else if dist.v}
		{@const d = dist.v}
		<dl class="readout">
			<div>
				<dt>Great-circle distance</dt>
				<dd>{sig(d.gc)} km</dd>
			</div>
			{#if d.path !== d.gc}
				<div>
					<dt>Path length</dt>
					<dd>{sig(d.path)} km</dd>
				</div>
			{/if}
			<div>
				<dt>One-way delay</dt>
				<dd>{formatMs(d.one)}</dd>
			</div>
			<div class="hi">
				<dt>Minimum RTT</dt>
				<dd>{formatMs(d.rtt)}</dd>
				<button type="button" class="use" onclick={useRtt}>Use below</button>
			</div>
		</dl>
		<p class="note">
			Light in glass fibre moves at about 2/3 of c, close to 200,000 km/s, or 1 ms of round trip per
			100 km. City distances are great circles between city centres. Real fibre follows roads, rails
			and sea cables, so it is longer, and routers and queues add delay: measured RTTs are higher.
			Raise the path factor to model a longer route.
		</p>
	{/if}
</section>

<section>
	<h2 class="label head">Round-trip time for the TCP figures</h2>
	<div class="field narrow">
		<label class="label" for="lt-rtt">RTT</label>
		<input id="lt-rtt" type="text" bind:value={rttText} autocomplete="off" />
	</div>
	{#if rtt.error}<p class="error" role="alert">{rtt.error}</p>{/if}
</section>

<div class="grid cards">
	<section>
		<h2 class="label head">Bandwidth-delay product</h2>
		<div class="field">
			<label class="label" for="lt-rate">Link rate or target throughput</label>
			<input id="lt-rate" type="text" bind:value={rateText} autocomplete="off" />
		</div>
		{#if bdp.error}
			<p class="error" role="alert">{bdp.error}</p>
		{:else if bdp.v}
			<dl class="readout">
				<div class="hi">
					<dt>Window needed</dt>
					<dd>{formatBytes(bdp.v.bytes)}</dd>
					<Copy value={String(Math.ceil(bdp.v.bytes))} />
				</div>
				<div>
					<dt>Window scale</dt>
					<dd>
						{bdp.v.scale.fits
							? `shift ${bdp.v.scale.shift} (RFC 7323)`
							: 'beyond the 1 GiB TCP maximum'}
					</dd>
				</div>
			</dl>
			<p class="note">
				Data in flight that fills the pipe. A single TCP flow needs a send and receive window at
				least this large to reach the rate.
			</p>
		{/if}
	</section>

	<section>
		<h2 class="label head">Window-limited throughput</h2>
		<div class="field">
			<label class="label" for="lt-win">TCP window</label>
			<input id="lt-win" type="text" bind:value={windowText} autocomplete="off" />
		</div>
		{#if win.error}
			<p class="error" role="alert">{win.error}</p>
		{:else if win.v}
			<dl class="readout">
				<div class="hi">
					<dt>Maximum per flow</dt>
					<dd>{formatRate(win.v.bps)}</dd>
				</div>
			</dl>
			<p class="note">Window ÷ RTT. Without window scaling the window stops at 65,535 bytes.</p>
		{/if}
	</section>

	<section>
		<h2 class="label head">Throughput under packet loss</h2>
		<div class="grid tight">
			<div class="field">
				<label class="label" for="lt-mss">MSS, bytes</label>
				<input
					id="lt-mss"
					type="text"
					inputmode="numeric"
					bind:value={mssText}
					autocomplete="off"
				/>
			</div>
			<div class="field">
				<label class="label" for="lt-loss">Loss rate</label>
				<input id="lt-loss" type="text" bind:value={lossText} autocomplete="off" />
			</div>
		</div>
		{#if mathis.error}
			<p class="error" role="alert">{mathis.error}</p>
		{:else if mathis.v !== undefined}
			<dl class="readout">
				<div class="hi">
					<dt>Mathis limit</dt>
					<dd>{formatRate(mathis.v)}</dd>
				</div>
			</dl>
			<p class="note">
				Mathis et al. (1997): rate ≤ (MSS ÷ RTT) × (1.22 ÷ √p). It assumes a long-lived Reno-style
				flow in congestion avoidance, random independent loss, no timeouts and no window limit.
				CUBIC and BBR behave differently; use it as an order of magnitude.
			</p>
		{/if}
	</section>
</div>

<style>
	section {
		margin-bottom: 1.5rem;
	}
	.head {
		margin: 0 0 0.6rem;
		font-weight: 400;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
		gap: 1rem;
		margin: 1rem 0;
	}
	.cards {
		gap: 1.5rem;
		align-items: start;
	}
	.cards section {
		margin: 0;
	}
	.tight {
		grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
		margin: 0;
	}
	.narrow {
		max-width: 16rem;
	}
	.readout {
		margin: 1rem 0 0.75rem;
	}
	.hi dd {
		color: var(--signal);
		font-weight: 700;
	}
	.use {
		min-height: 2.25rem;
		padding: 0.25rem 0.6rem;
		font-size: 0.6875rem;
	}
	.error {
		margin-top: 0.75rem;
	}
</style>
