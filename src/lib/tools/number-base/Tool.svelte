<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		fittingWidth,
		group,
		parseAuto,
		parseInBase,
		toBase,
		twosComplement,
		widths,
		type Width
	} from './logic';

	type Key = 'bin' | 'oct' | 'dec' | 'hex' | 'custom';
	const fixed: { key: Exclude<Key, 'custom'>; base: number; label: string; prefix: string }[] = [
		{ key: 'dec', base: 10, label: 'Decimal', prefix: '' },
		{ key: 'hex', base: 16, label: 'Hexadecimal', prefix: '0x' },
		{ key: 'oct', base: 8, label: 'Octal', prefix: '0o' },
		{ key: 'bin', base: 2, label: 'Binary', prefix: '0b' }
	];

	let fields = $state<Record<Key, string>>({ bin: '', oct: '', dec: '', hex: '', custom: '' });
	let customBase = $state(36);
	let value = $state<bigint | null>(null);
	let error = $state<{ key: Key; msg: string } | null>(null);
	let width = $state<Width>(32);
	let ready = false;

	const validBase = (b: number) => Number.isInteger(b) && b >= 2 && b <= 36;
	const baseOf = (k: Key) => (k === 'custom' ? customBase : fixed.find((f) => f.key === k)!.base);

	function fill(except?: Key) {
		for (const k of ['bin', 'oct', 'dec', 'hex', 'custom'] as Key[]) {
			if (k === except) continue;
			const b = baseOf(k);
			fields[k] = value === null || !validBase(b) ? '' : toBase(value, b);
		}
	}

	/** Field value with its prefix, for copying as a literal. */
	function literal(k: Exclude<Key, 'custom'>, prefix: string): string {
		const v = fields[k];
		if (!v) return '';
		return v.startsWith('-') ? `-${prefix}${v.slice(1)}` : prefix + v;
	}

	function onInput(k: Key) {
		const raw = fields[k];
		if (!raw.trim()) {
			value = null;
			error = null;
			fill(k);
			return;
		}
		try {
			value = parseInBase(raw, baseOf(k));
			error = null;
			fill(k);
		} catch (e) {
			error = { key: k, msg: (e as Error).message };
		}
	}

	function onBase() {
		const b = Number(customBase);
		if (validBase(b)) {
			error = error?.key === 'custom' ? null : error;
			if (value !== null) fields.custom = toBase(value, b);
		} else error = { key: 'custom', msg: 'Base must be 2 to 36' };
	}

	function setWidth(w: Width) {
		width = w;
	}

	const tc = $derived.by(() => {
		if (value === null) return null;
		try {
			return { t: twosComplement(value, width) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	onMount(() => {
		const h = readHash();
		if (h.b && Number(h.b) >= 2 && Number(h.b) <= 36) customBase = Number(h.b);
		const w = Number(h.w);
		if ((widths as number[]).includes(w)) width = w as Width;
		const src = h.in ?? '255';
		try {
			value = parseAuto(src);
			fill();
			if (!h.w) width = fittingWidth(value) ?? 64;
		} catch (e) {
			fields.dec = src;
			error = { key: 'dec', msg: (e as Error).message };
		}
		ready = true;
	});

	$effect(() => {
		const state = {
			in: value === null ? undefined : value.toString(),
			w: String(width),
			b: customBase === 36 ? undefined : String(customBase)
		};
		if (ready) writeHash(state);
	});
</script>

<div class="grid">
	{#each fixed as f (f.key)}
		<div class="field">
			<div class="row between">
				<label class="label" for={`nb-${f.key}`}>{f.label} · base {f.base}</label>
				<Copy value={literal(f.key, f.prefix)} />
			</div>
			<input
				id={`nb-${f.key}`}
				type="text"
				bind:value={fields[f.key]}
				oninput={() => onInput(f.key)}
				spellcheck="false"
				autocomplete="off"
				aria-invalid={error?.key === f.key}
				aria-describedby={error?.key === f.key ? 'nb-err' : undefined}
			/>
		</div>
	{/each}
	<div class="field">
		<div class="row between">
			<span class="row tight">
				<label class="label" for="nb-custom">Base</label>
				<label class="visually-hidden" for="nb-base">Custom base, 2 to 36</label>
				<input
					id="nb-base"
					class="base"
					type="number"
					min="2"
					max="36"
					bind:value={customBase}
					oninput={onBase}
				/>
			</span>
			<Copy value={fields.custom} />
		</div>
		<input
			id="nb-custom"
			type="text"
			bind:value={fields.custom}
			oninput={() => onInput('custom')}
			spellcheck="false"
			autocomplete="off"
			aria-invalid={error?.key === 'custom'}
			aria-describedby={error?.key === 'custom' ? 'nb-err' : undefined}
		/>
	</div>
</div>

{#if error}<p class="error" id="nb-err" role="alert">{error.msg}</p>{/if}

{#if value !== null}
	<dl class="readout">
		<div>
			<dt>Bit length</dt>
			<dd>{value < 0n ? (-value).toString(2).length : value.toString(2).length} bits</dd>
		</div>
		<div>
			<dt>Hex, grouped</dt>
			<dd>{group(toBase(value, 16), 4)}</dd>
		</div>
		<div>
			<dt>Binary, grouped</dt>
			<dd>{group(toBase(value, 2), 4)}</dd>
		</div>
	</dl>

	<h2 class="label head">Two's complement</h2>
	<div class="row opts" role="group" aria-label="Width">
		<span class="label">Width</span>
		{#each widths as w (w)}
			<button type="button" aria-pressed={width === w} onclick={() => setWidth(w)}>{w} bit</button>
		{/each}
	</div>

	{#if tc?.error}
		<p class="error" role="alert">{tc.error}</p>
	{:else if tc?.t}
		{@const t = tc.t}
		<dl class="readout">
			<div>
				<dt>Signed (int{width})</dt>
				<dd>{t.signed.toString()}</dd>
				<Copy value={t.signed.toString()} />
			</div>
			<div>
				<dt>Unsigned (uint{width})</dt>
				<dd>{t.unsigned.toString()}</dd>
				<Copy value={t.unsigned.toString()} />
			</div>
			<div>
				<dt>Hex pattern</dt>
				<dd>0x{t.hex}</dd>
				<Copy value={`0x${t.hex}`} />
			</div>
		</dl>
		<figure class="bits">
			<figcaption class="label">Bits {width - 1} to 0 · sign bit marked</figcaption>
			<p class="mono">
				{#each t.bin.match(/.{4}/g) ?? [] as nib, ni (ni)}<span class="nib"
						>{#each nib.split('') as b, i (i)}<span class:sign={ni === 0 && i === 0}>{b}</span
							>{/each}</span
					>{/each}
			</p>
		</figure>
	{/if}
{/if}

<p class="note">
	All fields are linked and use arbitrary precision, so 128-bit values and beyond convert exactly.
	Input may carry 0x, 0b or 0o and use _ or spaces as separators. Two's complement accepts both the
	signed and the unsigned range of the width, and shows both readings of the same bits.
</p>

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
		gap: 1rem 1.25rem;
		margin-bottom: 1rem;
	}
	.between {
		justify-content: space-between;
	}
	.tight {
		gap: 0.4rem;
		flex-wrap: nowrap;
	}
	input.base {
		width: 4.5rem;
		min-height: 2.25rem;
		padding: 0.2rem 0.4rem;
		font: inherit;
		font-family: var(--font-mono);
		color: var(--ink);
		background: var(--field);
		border: 1px solid var(--rule);
		border-radius: 0;
	}
	input[aria-invalid='true'] {
		border-color: var(--signal);
	}
	.error {
		margin-bottom: 1rem;
	}
	.readout {
		margin: 1rem 0 1.5rem;
	}
	.head {
		margin: 1.5rem 0 0.5rem;
	}
	.opts {
		margin-bottom: 0.5rem;
	}
	.bits {
		margin: 0 0 1.5rem;
	}
	.bits p {
		margin: 0.4rem 0 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.7em;
		font-size: clamp(0.85rem, 2.6vw, 1.1rem);
		letter-spacing: 0.06em;
	}
	.bits span.sign {
		background: var(--hilite);
		color: var(--signal);
		font-weight: 700;
	}
	.note {
		margin-bottom: 1rem;
	}
</style>
