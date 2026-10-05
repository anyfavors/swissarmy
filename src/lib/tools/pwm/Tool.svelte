<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import { parseValue } from '../resistor/logic';
	import { fmt } from '../ohms-law/logic';
	import {
		PRESCALERS,
		STANDARD_BAUDS,
		UART_STYLES,
		adcToVolts,
		baudFor,
		compareFor,
		dutyFor,
		lsb,
		parseInt2,
		pwm,
		timerFits,
		uartFit,
		voltsToAdc,
		type PrescalerSet,
		type TimerMode,
		type UartStyle
	} from './logic';

	type Mode = 'pwm' | 'timer' | 'uart' | 'adc';
	const modes: { id: Mode; label: string }[] = [
		{ id: 'pwm', label: 'PWM' },
		{ id: 'timer', label: 'Timer' },
		{ id: 'uart', label: 'UART baud' },
		{ id: 'adc', label: 'ADC' }
	];
	let mode = $state<Mode>('pwm');

	let duty = $state('25');
	let vHigh = $state('5');
	let vAvg = $state('');
	let top = $state('255');

	let clk = $state('16M');
	let tf = $state('1k');
	let tbits = $state('16');
	let pset = $state<PrescalerSet>('avr');
	let tmode = $state<TimerMode>('fast');

	let uclk = $state('16M');
	let baud = $state('115200');
	let os = $state(16);
	let ustyle = $state<UartStyle>('avr');
	let ureg = $state('');

	let bits = $state('10');
	let vref = $state('5');
	let reading = $state('512');
	let vin = $state('');
	let ready = false;

	const num = (s: string, what: string) => {
		const t = s.trim().replace(',', '.').replace(/\s*%$/, '');
		if (!t) throw new Error(`Enter ${what}`);
		const v = Number(t);
		if (!Number.isFinite(v)) throw new Error(`"${s.trim()}" is not a number`);
		return v;
	};
	const hz = (s: string, what: string) => {
		if (!s.trim()) throw new Error(`Enter ${what}`);
		return parseValue(s, ['Hz', 'hertz']);
	};

	function run<T>(f: () => T): { ok?: T; error?: string } {
		try {
			return { ok: f() };
		} catch (e) {
			return { error: (e as Error).message };
		}
	}

	const pw = $derived(
		run(() => {
			const vh = num(vHigh, 'the high level');
			const d = vAvg.trim()
				? dutyFor(num(vAvg, 'an average'), vh)
				: num(duty, 'a duty cycle') / 100;
			const p = pwm(d, vh);
			const t = top.trim() ? num(top, 'TOP') : undefined;
			return { ...p, cmp: t !== undefined ? compareFor(d, t) : undefined, t };
		})
	);

	const tm = $derived(
		run(() =>
			timerFits(
				hz(clk, 'a clock'),
				hz(tf, 'a target frequency'),
				num(tbits, 'counter bits'),
				pset,
				tmode
			)
		)
	);

	const ua = $derived(
		run(() => {
			const c = hz(uclk, 'a clock');
			const fit = uartFit(c, num(baud, 'a baud rate'), os, ustyle);
			const table = STANDARD_BAUDS.map((b) => {
				try {
					return { b, f: uartFit(c, b, os, ustyle) };
				} catch {
					return { b, f: undefined };
				}
			});
			const own = ureg.trim() ? baudFor(c, num(ureg, 'a register value'), os, ustyle) : undefined;
			return { fit, table, own };
		})
	);

	const adc = $derived(
		run(() => {
			const n = num(bits, 'bits');
			const vr = num(vref, 'Vref');
			const code = reading.trim() ? parseInt2(reading) : undefined;
			const v = vin.trim() ? num(vin, 'a voltage') : undefined;
			return {
				lsb: lsb(n, vr),
				max: 2 ** n - 1,
				volts: code !== undefined ? adcToVolts(code, n, vr) : undefined,
				code: v !== undefined ? voltsToAdc(v, n, vr) : undefined,
				v
			};
		})
	);

	const pct = (x: number, d = 2) => (x > 0 ? '+' : '') + x.toFixed(d) + ' %';
	const regName = $derived(ustyle === 'avr' ? 'UBRR' : ustyle === 'frac' ? 'BRR' : 'Divisor');

	onMount(() => {
		const h = readHash();
		if (modes.some((m) => m.id === h.m)) mode = h.m as Mode;
		if (h.d) duty = h.d;
		if (h.vh) vHigh = h.vh;
		if (h.va) vAvg = h.va;
		if (h.top !== undefined) top = h.top;
		if (h.clk) clk = h.clk;
		if (h.tf) tf = h.tf;
		if (h.tb) tbits = h.tb;
		if (h.ps && h.ps in PRESCALERS) pset = h.ps as PrescalerSet;
		if (h.tm === 'phase') tmode = 'phase';
		if (h.uc) uclk = h.uc;
		if (h.b) baud = h.b;
		if (h.os === '8') os = 8;
		if (h.us && h.us in UART_STYLES) ustyle = h.us as UartStyle;
		if (h.ur) ureg = h.ur;
		if (h.bits) bits = h.bits;
		if (h.vref) vref = h.vref;
		if (h.rd !== undefined) reading = h.rd;
		if (h.vin) vin = h.vin;
		ready = true;
	});

	$effect(() => {
		const s: Record<string, string | undefined> = { m: mode === 'pwm' ? undefined : mode };
		if (mode === 'pwm') Object.assign(s, { d: duty, vh: vHigh, va: vAvg, top });
		if (mode === 'timer')
			Object.assign(s, { clk, tf, tb: tbits, ps: pset, tm: tmode === 'fast' ? undefined : tmode });
		if (mode === 'uart')
			Object.assign(s, {
				uc: uclk,
				b: baud,
				os: os === 16 ? undefined : '8',
				us: ustyle,
				ur: ureg
			});
		if (mode === 'adc') Object.assign(s, { bits, vref, rd: reading, vin });
		if (ready) writeHash(s);
	});
</script>

<div class="row modes" role="group" aria-label="Calculator">
	{#each modes as m (m.id)}
		<button type="button" aria-pressed={mode === m.id} onclick={() => (mode = m.id)}
			>{m.label}</button
		>
	{/each}
</div>

{#if mode === 'pwm'}
	<div class="grid">
		<div class="field">
			<label class="label" for="pw-d">Duty cycle %</label>
			<input id="pw-d" type="text" inputmode="decimal" bind:value={duty} autocomplete="off" />
		</div>
		<div class="field">
			<label class="label" for="pw-vh">High level V</label>
			<input id="pw-vh" type="text" inputmode="decimal" bind:value={vHigh} autocomplete="off" />
		</div>
		<div class="field">
			<label class="label" for="pw-va">Or target average V</label>
			<input id="pw-va" type="text" inputmode="decimal" bind:value={vAvg} autocomplete="off" />
		</div>
		<div class="field">
			<label class="label" for="pw-top">Counter TOP / ARR</label>
			<input id="pw-top" type="text" inputmode="numeric" bind:value={top} autocomplete="off" />
		</div>
	</div>
	{#if pw.error}
		<p class="error" role="alert">{pw.error}</p>
	{:else if pw.ok}
		{@const p = pw.ok}
		<p class="say">{(p.duty * 100).toFixed(2)} % → {fmt(p.avg, 'V')} average</p>
		<dl class="readout">
			<div>
				<dt>Duty</dt>
				<dd>{(p.duty * 100).toFixed(3)} %</dd>
				<Copy value={(p.duty * 100).toFixed(3)} />
			</div>
			<div>
				<dt>Average</dt>
				<dd>{fmt(p.avg, 'V')}</dd>
			</div>
			<div>
				<dt>RMS</dt>
				<dd>{fmt(p.rms, 'V')}</dd>
			</div>
			{#if p.cmp !== undefined && p.t !== undefined}
				<div>
					<dt>Compare value (OCR / CCR)</dt>
					<dd>{p.cmp} of {p.t + 1} counts</dd>
					<Copy value={String(p.cmp)} />
				</div>
			{/if}
		</dl>
	{/if}
	<p class="note">
		Average = duty × high level, low level 0 V. A motor or an RC filter sees the average; a resistor
		heats with the RMS. Compare value = duty × (TOP + 1), the STM32 convention; AVR fast PWM gives
		(OCR + 1) / (TOP + 1), so subtract one there, and OCR = 0 is never fully off.
	</p>
{:else if mode === 'timer'}
	<div class="grid">
		<div class="field">
			<label class="label" for="tm-clk">Timer clock</label>
			<input id="tm-clk" type="text" bind:value={clk} spellcheck="false" autocomplete="off" />
		</div>
		<div class="field">
			<label class="label" for="tm-f">Target frequency</label>
			<input id="tm-f" type="text" bind:value={tf} spellcheck="false" autocomplete="off" />
		</div>
		<div class="field">
			<label class="label" for="tm-b">Counter bits</label>
			<input id="tm-b" type="text" inputmode="numeric" bind:value={tbits} autocomplete="off" />
		</div>
	</div>
	<div class="row opts" role="group" aria-label="Prescalers">
		<span class="label">Prescaler</span>
		{#each Object.entries(PRESCALERS) as [id, p] (id)}
			<button
				type="button"
				aria-pressed={pset === id}
				title={p.name}
				onclick={() => (pset = id as PrescalerSet)}>{p.short}</button
			>
		{/each}
	</div>
	<p class="label sets">{PRESCALERS[pset].name}</p>
	<div class="row opts" role="group" aria-label="Counting mode">
		<span class="label">Mode</span>
		<button type="button" aria-pressed={tmode === 'fast'} onclick={() => (tmode = 'fast')}
			>Up counting (fast PWM, CTC)</button
		>
		<button type="button" aria-pressed={tmode === 'phase'} onclick={() => (tmode = 'phase')}
			>Up-down (phase correct)</button
		>
	</div>
	{#if tm.error}
		<p class="error" role="alert">{tm.error}</p>
	{:else if tm.ok}
		{@const best = tm.ok[0]}
		<p class="say">
			{pset === 'any' ? `PSC ${best.prescaler - 1}` : `÷${best.prescaler}`}, {pset === 'any'
				? 'ARR'
				: 'TOP'}
			{best.top}
		</p>
		<div class="scroll">
			<table>
				<thead>
					<tr>
						<th scope="col">Prescaler</th>
						{#if pset === 'any'}<th scope="col">PSC</th>{/if}
						<th scope="col">{pset === 'any' ? 'ARR' : 'TOP'}</th>
						<th scope="col">Frequency</th>
						<th scope="col">Error</th>
						<th scope="col">Resolution</th>
					</tr>
				</thead>
				<tbody>
					{#each tm.ok as f, i (f.prescaler)}
						<tr class:best={i === 0}>
							<td class="mono">÷{f.prescaler}</td>
							{#if pset === 'any'}<td class="mono">{f.prescaler - 1}</td>{/if}
							<td class="mono">{f.top}</td>
							<td class="mono">{fmt(f.freq, 'Hz')}</td>
							<td class="mono">{Math.abs(f.error) < 1e-9 ? 'exact' : pct(f.error, 3)}</td>
							<td class="mono">{f.bits.toFixed(1)} bit</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
	<p class="note">
		Up counting: f = clock / (N × (TOP + 1)). Phase correct: f = clock / (2 × N × TOP). STM32 writes
		N − 1 into PSC and TOP into ARR. A CTC pin toggle gives half the frequency. Clock is the timer
		input clock: on STM32 that is the APB timer clock, doubled when the APB prescaler is not 1.
	</p>
{:else if mode === 'uart'}
	<div class="grid">
		<div class="field">
			<label class="label" for="ua-clk">Peripheral clock</label>
			<input id="ua-clk" type="text" bind:value={uclk} spellcheck="false" autocomplete="off" />
		</div>
		<div class="field">
			<label class="label" for="ua-b">Baud rate</label>
			<input id="ua-b" type="text" inputmode="numeric" bind:value={baud} autocomplete="off" />
		</div>
		<div class="field">
			<label class="label" for="ua-r">Or check a {regName} value</label>
			<input id="ua-r" type="text" inputmode="numeric" bind:value={ureg} autocomplete="off" />
		</div>
	</div>
	<div class="row opts" role="group" aria-label="Divisor style">
		<span class="label">Divisor</span>
		{#each Object.entries(UART_STYLES) as [id, s] (id)}
			<button
				type="button"
				aria-pressed={ustyle === id}
				title={s}
				onclick={() => (ustyle = id as UartStyle)}
				>{id === 'avr' ? 'AVR UBRR' : id === 'frac' ? 'STM32 fractional' : 'Integer'}</button
			>
		{/each}
	</div>
	<div class="row opts" role="group" aria-label="Oversampling">
		<span class="label">Oversampling</span>
		<button type="button" aria-pressed={os === 16} onclick={() => (os = 16)}>16×</button>
		<button type="button" aria-pressed={os === 8} onclick={() => (os = 8)}
			>8× {ustyle === 'avr' ? '(U2X)' : ''}</button
		>
	</div>
	{#if ua.error}
		<p class="error" role="alert">{ua.error}</p>
	{:else if ua.ok}
		{@const u = ua.ok}
		<p class="say" class:bad={Math.abs(u.fit.error) > 2}>
			{regName}
			{u.fit.reg}, {pct(u.fit.error)}
		</p>
		<dl class="readout">
			<div>
				<dt>{regName}</dt>
				<dd>{u.fit.reg}{ustyle === 'frac' ? ` (USARTDIV ${u.fit.divisor})` : ''}</dd>
				<Copy value={String(u.fit.reg)} />
			</div>
			<div>
				<dt>Actual baud</dt>
				<dd>{Number(u.fit.actual.toPrecision(7))}</dd>
			</div>
			<div>
				<dt>Error</dt>
				<dd>
					{pct(u.fit.error)}{Math.abs(u.fit.error) > 2 ? ', over 2 %, unreliable' : ''}
				</dd>
			</div>
			{#if u.own !== undefined}
				<div>
					<dt>{regName} {ureg} gives</dt>
					<dd>{Number(u.own.toPrecision(7))} baud</dd>
				</div>
			{/if}
		</dl>
		<div class="scroll">
			<table>
				<caption class="label">Standard rates at this clock</caption>
				<thead>
					<tr
						><th scope="col">Baud</th><th scope="col">{regName}</th><th scope="col">Actual</th><th
							scope="col">Error</th
						></tr
					>
				</thead>
				<tbody>
					{#each u.table as r (r.b)}
						<tr class:bad-row={r.f && Math.abs(r.f.error) > 2}>
							<td class="mono">{r.b}</td>
							<td class="mono">{r.f ? r.f.reg : 'n/a'}</td>
							<td class="mono">{r.f ? Number(r.f.actual.toPrecision(6)) : ''}</td>
							<td class="mono">{r.f ? pct(r.f.error) : ''}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
	<p class="note">
		Both ends sample mid-bit, so the combined clock error over a 10-bit frame must stay small. Keep
		each side within about ±2 %. Crystals like 14.7456 MHz or 18.432 MHz divide exactly into the
		standard rates.
	</p>
{:else}
	<div class="grid">
		<div class="field">
			<label class="label" for="ad-b">Resolution, bits</label>
			<input id="ad-b" type="text" inputmode="numeric" bind:value={bits} autocomplete="off" />
		</div>
		<div class="field">
			<label class="label" for="ad-vr">Vref V</label>
			<input id="ad-vr" type="text" inputmode="decimal" bind:value={vref} autocomplete="off" />
		</div>
		<div class="field">
			<label class="label" for="ad-rd">Reading (dec, 0x, 0b)</label>
			<input id="ad-rd" type="text" bind:value={reading} spellcheck="false" autocomplete="off" />
		</div>
		<div class="field">
			<label class="label" for="ad-vin">Or input voltage V</label>
			<input id="ad-vin" type="text" inputmode="decimal" bind:value={vin} autocomplete="off" />
		</div>
	</div>
	{#if adc.error}
		<p class="error" role="alert">{adc.error}</p>
	{:else if adc.ok}
		{@const a = adc.ok}
		<dl class="readout">
			{#if a.volts !== undefined}
				<div>
					<dt>Reading {reading.trim()}</dt>
					<dd>{fmt(a.volts, 'V')}</dd>
					<Copy value={String(Number(a.volts.toPrecision(8)))} />
				</div>
			{/if}
			{#if a.code !== undefined && a.v !== undefined}
				<div>
					<dt>{a.v} V reads</dt>
					<dd>{a.code} (0x{a.code.toString(16).toUpperCase()})</dd>
					<Copy value={String(a.code)} />
				</div>
			{/if}
			<div>
				<dt>LSB size</dt>
				<dd>{fmt(a.lsb, 'V')}</dd>
			</div>
			<div>
				<dt>Full scale</dt>
				<dd>0 to {a.max}</dd>
			</div>
		</dl>
	{/if}
	<p class="note">
		V = reading × Vref / 2^n, as in most datasheets, so the top code is one LSB below Vref. Some
		libraries divide by 2^n − 1 instead; the difference is one LSB at full scale.
	</p>
{/if}

<style>
	.modes {
		margin-bottom: 1.25rem;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
		gap: 0.75rem 1rem;
		margin-bottom: 1rem;
	}
	.opts {
		margin: 0 0 1rem;
	}
	.sets {
		margin: -0.5rem 0 1rem;
	}
	.say {
		font-size: 1.375rem;
		font-family: var(--font-mono);
		margin: 0 0 1rem;
		padding: 0.5rem 0.75rem;
		border-left: 4px solid var(--signal);
		background: var(--hilite);
		overflow-wrap: anywhere;
	}
	.say.bad {
		color: var(--signal);
	}
	.readout {
		margin-bottom: 1.25rem;
	}
	.scroll {
		overflow-x: auto;
		margin-bottom: 1.25rem;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		border-top: 2px solid var(--rule);
		font-size: 0.9375rem;
	}
	caption {
		text-align: left;
		padding-bottom: 0.4rem;
	}
	th,
	td {
		text-align: left;
		padding: 0.4rem 0.75rem 0.4rem 0;
		border-bottom: 1px solid var(--rule-soft);
		white-space: nowrap;
	}
	th {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-2);
		font-weight: 400;
	}
	tr.best td {
		background: var(--hilite);
	}
	tr.bad-row td {
		color: var(--signal);
	}
	.note {
		margin: 0 0 1rem;
	}
</style>
