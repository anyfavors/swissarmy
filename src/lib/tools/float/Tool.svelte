<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		binPattern,
		exactDecimal,
		exactValue,
		fields,
		hexFloat,
		hexPattern,
		kindLabel,
		nextDown,
		nextUp,
		parseInput,
		shortest,
		specs,
		ulpExponent,
		type Format,
		type Parsed
	} from './logic';

	let fmt = $state<Format>('f64');
	let input = $state('0.1');
	let hexIn = $state('');
	let ready = false;

	const parsed = $derived.by((): { p?: Parsed; error?: string } => {
		if (!input.trim()) return {};
		try {
			return { p: parseInput(input, fmt) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	let hexError = $state('');

	$effect(() => {
		// Keep the pattern field in step with the value field.
		if (parsed.p) {
			hexIn = hexPattern(parsed.p.bits, fmt);
			hexError = '';
		}
	});

	function onHex() {
		const t = hexIn.trim().replace(/^(0x)?/i, '0x');
		try {
			const p = parseInput(t, fmt);
			if (p.as !== 'bits') throw new Error('Enter the pattern as hex digits');
			input = hexPattern(p.bits, fmt);
			hexError = '';
		} catch (e) {
			hexError = (e as Error).message;
		}
	}

	function setFormat(f: Format) {
		if (f === fmt) return;
		const p = parsed.p;
		if (p && p.as === 'bits') input = shortest(p.bits, fmt);
		fmt = f;
	}

	const info = $derived.by(() => {
		const p = parsed.p;
		if (!p) return null;
		const s = specs[fmt];
		const d = fields(p.bits, fmt);
		const bin = binPattern(p.bits, fmt);
		const up = nextUp(p.bits, fmt);
		const down = nextDown(p.bits, fmt);
		const k = ulpExponent(p.bits, fmt);
		const ulpExact = k === null ? '' : exactDecimal(0, 1n, k);
		return {
			s,
			d,
			signBit: bin.slice(0, 1),
			expBits: bin.slice(1, 1 + s.expBits),
			fracBits: bin.slice(1 + s.expBits),
			exact: exactValue(p.bits, fmt),
			short: shortest(p.bits, fmt),
			hex: hexPattern(p.bits, fmt),
			hexf: hexFloat(p.bits, fmt),
			up: up === null ? null : { short: shortest(up, fmt), hex: hexPattern(up, fmt) },
			down: down === null ? null : { short: shortest(down, fmt), hex: hexPattern(down, fmt) },
			ulp: k === null ? null : { k, approx: String(2 ** k), exact: ulpExact }
		};
	});

	const name = (f: Format) => (f === 'f32' ? 'float32' : 'float64');

	onMount(() => {
		const h = readHash();
		if (h.f === 'f32' || h.f === 'f64') fmt = h.f;
		if (h.in !== undefined) input = h.in;
		ready = true;
	});

	$effect(() => {
		const state = { in: input, f: fmt === 'f64' ? undefined : fmt };
		if (ready) writeHash(state);
	});
</script>

<div class="row opts" role="group" aria-label="Format">
	<span class="label">Format</span>
	<button type="button" aria-pressed={fmt === 'f32'} onclick={() => setFormat('f32')}
		>float32 · single</button
	>
	<button type="button" aria-pressed={fmt === 'f64'} onclick={() => setFormat('f64')}
		>float64 · double</button
	>
</div>

<div class="grid">
	<div class="field">
		<label class="label" for="fl-in">Value</label>
		<input
			id="fl-in"
			type="text"
			bind:value={input}
			spellcheck="false"
			autocomplete="off"
			aria-invalid={!!parsed.error}
			aria-describedby={parsed.error ? 'fl-err' : undefined}
		/>
	</div>
	<div class="field">
		<label class="label" for="fl-hex">Bits, hex · {specs[fmt].bits / 4} digits</label>
		<input
			id="fl-hex"
			type="text"
			bind:value={hexIn}
			oninput={onHex}
			spellcheck="false"
			autocomplete="off"
			aria-invalid={!!hexError}
			aria-describedby={hexError ? 'fl-herr' : undefined}
		/>
	</div>
</div>
<p class="label hint">
	Accepts 0.1 · -2.5e-3 · Infinity · NaN · 0x1.8p1 · a raw pattern 0x3FB999999999999A
</p>

{#if parsed.error}<p class="error" id="fl-err" role="alert">{parsed.error}</p>{/if}
{#if hexError}<p class="error" id="fl-herr" role="alert">{hexError}</p>{/if}

{#if info && parsed.p}
	{@const d = info.d}
	<figure class="bits">
		<figcaption class="label">
			{name(fmt)} · 1 sign, {info.s.expBits} exponent, {info.s.fracBits} fraction bits
		</figcaption>
		<p class="mono strip">
			<span class="f sign" title="Sign">{info.signBit}</span><span class="f exp" title="Exponent"
				>{info.expBits}</span
			><span class="f frac" title="Fraction">{info.fracBits}</span>
		</p>
		<p class="legend label">
			<span class="key sign">Sign</span>
			<span class="key exp">Exponent</span>
			<span class="key frac">Fraction</span>
		</p>
	</figure>

	<dl class="readout">
		<div>
			<dt>Class</dt>
			<dd>
				{d.sign ? 'Negative ' : 'Positive '}{kindLabel[d.kind].toLowerCase()}{#if d.kind === 'nan'},
					{d.quiet ? 'quiet' : 'signalling'}, payload 0x{d.payload?.toString(16)}{/if}
			</dd>
		</div>
		<div>
			<dt>Sign</dt>
			<dd>{d.sign} {d.sign ? '(−)' : '(+)'}</dd>
		</div>
		<div>
			<dt>Exponent</dt>
			<dd>
				field {d.exponent}{#if d.unbiased !== null}, unbiased 2^{d.unbiased}
					{d.kind === 'subnormal' || d.kind === 'zero'
						? '(subnormal range)'
						: `(bias ${info.s.bias})`}{:else}, all ones{/if}
			</dd>
		</div>
		<div>
			<dt>Fraction</dt>
			<dd>
				0x{d.fraction.toString(16)}{#if d.kind === 'normal'}, plus the implicit leading 1{:else if d.kind === 'subnormal'},
					no implicit leading 1{/if}
			</dd>
		</div>
		<div>
			<dt>Exact stored value</dt>
			<dd class="hl">{info.exact}</dd>
			<Copy value={info.exact} />
		</div>
		<div>
			<dt>Shortest round trip</dt>
			<dd>{info.short}</dd>
			<Copy value={info.short} />
		</div>
		{#if parsed.p.as !== 'bits'}
			<div>
				<dt>Input stored</dt>
				<dd>{parsed.p.inexact ? 'rounded to the nearest, ties to even' : 'exactly'}</dd>
			</div>
		{/if}
		<div>
			<dt>Hex pattern</dt>
			<dd>{info.hex}</dd>
			<Copy value={info.hex} />
		</div>
		<div>
			<dt>Hex float (C99)</dt>
			<dd>{info.hexf}</dd>
			<Copy value={info.hexf} />
		</div>
		<div>
			<dt>Next up</dt>
			<dd>
				{#if info.up}{info.up.short} <span class="muted">{info.up.hex}</span>{:else}none for NaN{/if}
			</dd>
			{#if info.up}
				<button type="button" class="small" onclick={() => (input = info.up!.short)}>Go</button>
			{/if}
		</div>
		<div>
			<dt>Next down</dt>
			<dd>
				{#if info.down}{info.down.short} <span class="muted">{info.down.hex}</span>{:else}none for
					NaN{/if}
			</dd>
			{#if info.down}
				<button type="button" class="small" onclick={() => (input = info.down!.short)}>Go</button>
			{/if}
		</div>
		<div>
			<dt>ULP</dt>
			<dd>
				{#if info.ulp}2^{info.ulp.k} ≈ {info.ulp.approx}{#if info.ulp.exact.length <= 60}
						<span class="muted">= {info.ulp.exact}</span>{/if}{:else}undefined for {kindLabel[
						d.kind
					]}{/if}
			</dd>
		</div>
	</dl>
{/if}

<p class="note end">
	The value is rounded once from the decimal you type to the nearest {name(fmt)}, ties to even, then
	every digit of what is actually stored is shown. ULP is the gap to the next larger magnitude, as
	in Java's Math.ulp. Subnormals have exponent field 0 and lose the implicit leading 1. A NaN has an
	all-ones exponent and a non-zero fraction; the top fraction bit marks it quiet, the rest is the
	payload. Enter a raw pattern to keep a payload; JavaScript arithmetic may not preserve it.
</p>

<style>
	.opts {
		margin-bottom: 0.75rem;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
		gap: 1rem 1.25rem;
	}
	.hint {
		margin: 0.35rem 0 0.75rem;
		text-transform: none;
		letter-spacing: 0.02em;
		overflow-wrap: anywhere;
	}
	input[aria-invalid='true'] {
		border-color: var(--signal);
	}
	.error {
		margin-bottom: 0.75rem;
	}
	.bits {
		margin: 1rem 0 1.25rem;
	}
	.strip {
		margin: 0.4rem 0 0.3rem;
		font-size: clamp(0.8rem, 2.6vw, 1.05rem);
		letter-spacing: 0.08em;
		overflow-wrap: anywhere;
		word-break: break-all;
	}
	.f {
		padding: 0.1rem 0;
	}
	/* Fields told apart by weight, underline and the highlight token, not by hue. */
	.sign {
		color: var(--signal);
		font-weight: 700;
	}
	.exp {
		background: var(--hilite);
		font-weight: 700;
	}
	.frac {
		color: var(--ink);
		text-decoration: underline;
		text-decoration-color: var(--rule-soft);
		text-underline-offset: 0.25em;
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1rem;
		margin: 0;
	}
	.key {
		padding: 0 0.3rem;
	}
	.hl {
		color: var(--signal);
		font-weight: 700;
	}
	.muted {
		color: var(--ink-2);
	}
	.small {
		min-height: 2.25rem;
		padding: 0.25rem 0.6rem;
		font-size: 0.6875rem;
	}
	.end {
		margin-top: 1.5rem;
	}
</style>
