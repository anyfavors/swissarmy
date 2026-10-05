<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		bin,
		bytes,
		clearBit,
		clz,
		compute,
		ctz,
		fromPattern,
		hex,
		maskFromBits,
		parseBit,
		parseOperand,
		parseShift,
		popcount,
		setBit,
		testBit,
		toggleBit,
		toPattern,
		widths,
		type Width
	} from './logic';

	let aIn = $state('0xC3');
	let bIn = $state('0b10101010');
	let shiftIn = $state('2');
	let width = $state<Width>(8);
	let signed = $state(false);
	let selected = $state('and');
	let maskIn = $state('0, 4-6');
	let bitIn = $state('7');
	let ready = false;

	function operand(raw: string, w: Width): { p?: bigint; error?: string } {
		try {
			return { p: toPattern(parseOperand(raw), w) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	}

	const a = $derived(operand(aIn, width));
	const b = $derived(operand(bIn, width));
	const shift = $derived.by((): { n?: number; error?: string } => {
		try {
			return { n: parseShift(shiftIn) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	const results = $derived(
		a.p !== undefined && b.p !== undefined && shift.n !== undefined
			? compute(a.p, b.p, shift.n, width, signed)
			: null
	);
	const sel = $derived(results?.find((r) => r.id === selected) ?? results?.[0]);

	const dec = (p: bigint) => fromPattern(p, width, signed).toString();

	const mask = $derived.by((): { m?: bigint; error?: string } => {
		try {
			return { m: maskFromBits(maskIn, width) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});
	const bit = $derived.by((): { n?: number; error?: string } => {
		try {
			return { n: parseBit(bitIn, width) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	onMount(() => {
		const h = readHash();
		if (h.in !== undefined) aIn = h.in;
		if (h.b !== undefined) bIn = h.b;
		if (h.n !== undefined) shiftIn = h.n;
		const w = Number(h.w);
		if ((widths as number[]).includes(w)) width = w as Width;
		if (h.s === '1') signed = true;
		if (h.op) selected = h.op;
		if (h.m !== undefined) maskIn = h.m;
		if (h.bit !== undefined) bitIn = h.bit;
		ready = true;
	});

	$effect(() => {
		const state = {
			in: aIn,
			b: bIn,
			n: shiftIn,
			w: String(width),
			s: signed ? '1' : undefined,
			op: selected,
			m: maskIn,
			bit: bitIn
		};
		if (ready) writeHash(state);
	});
</script>

<div class="grid">
	<div class="field">
		<label class="label" for="bw-a">Operand A</label>
		<input
			id="bw-a"
			type="text"
			bind:value={aIn}
			spellcheck="false"
			autocomplete="off"
			aria-invalid={!!a.error}
			aria-describedby={a.error ? 'bw-aerr' : undefined}
		/>
	</div>
	<div class="field">
		<label class="label" for="bw-b">Operand B</label>
		<input
			id="bw-b"
			type="text"
			bind:value={bIn}
			spellcheck="false"
			autocomplete="off"
			aria-invalid={!!b.error}
			aria-describedby={b.error ? 'bw-berr' : undefined}
		/>
	</div>
	<div class="field">
		<label class="label" for="bw-n">Shift / rotate by</label>
		<input
			id="bw-n"
			type="text"
			inputmode="numeric"
			bind:value={shiftIn}
			autocomplete="off"
			aria-invalid={!!shift.error}
		/>
	</div>
</div>

<div class="row opts" role="group" aria-label="Width">
	<span class="label">Width</span>
	{#each widths as w (w)}
		<button type="button" aria-pressed={width === w} onclick={() => (width = w)}>{w} bit</button>
	{/each}
</div>
<div class="row opts" role="group" aria-label="Signedness">
	<span class="label">Read as</span>
	<button type="button" aria-pressed={!signed} onclick={() => (signed = false)}>Unsigned</button>
	<button type="button" aria-pressed={signed} onclick={() => (signed = true)}>Signed</button>
</div>

{#if a.error}<p class="error" id="bw-aerr" role="alert">A: {a.error}</p>{/if}
{#if b.error}<p class="error" id="bw-berr" role="alert">B: {b.error}</p>{/if}
{#if shift.error}<p class="error" role="alert">{shift.error}</p>{/if}

{#if a.p !== undefined && b.p !== undefined}
	<dl class="readout ops">
		{#each [{ k: 'A', p: a.p }, { k: 'B', p: b.p }] as o (o.k)}
			<div>
				<dt>{o.k}</dt>
				<dd>
					<span class="dec">{dec(o.p)}</span>
					<span class="hex">{hex(o.p, width)}</span>
					<span class="bin">{bin(o.p, width)}</span>
					<span class="muted"
						>popcount {popcount(o.p)} · leading zeros {clz(o.p, width)} · trailing zeros {ctz(
							o.p,
							width
						)}</span
					>
				</dd>
			</div>
		{/each}
	</dl>
{/if}

{#if results}
	<h2 class="label head">Results · {width} bit {signed ? 'signed' : 'unsigned'}</h2>
	<dl class="readout ops">
		{#each results as r (r.id)}
			<div class:sel={sel?.id === r.id}>
				<dt>{r.label}</dt>
				<dd>
					<span class="dec">{dec(r.pattern)}</span>
					<span class="hex">{hex(r.pattern, width)}</span>
					<span class="bin">{bin(r.pattern, width)}</span>
				</dd>
				<span class="acts">
					<button
						type="button"
						class="small"
						aria-pressed={sel?.id === r.id}
						aria-label={`Show bits of ${r.label}`}
						onclick={() => (selected = r.id)}>Bits</button
					>
					<Copy value={hex(r.pattern, width)} />
				</span>
			</div>
		{/each}
	</dl>

	{#if sel && a.p !== undefined && b.p !== undefined}
		{@const rows = [
			{ k: 'A', p: a.p, res: false },
			...(sel.usesB ? [{ k: 'B', p: b.p, res: false }] : []),
			{ k: '=', p: sel.pattern, res: true }
		]}
		<figure class="bits">
			<figcaption class="label">{sel.label} · bits {width - 1} to 0</figcaption>
			<div class="bytes">
				{#each bytes(0n, width) as _, bi (bi)}
					<div
						class="byte"
						role="group"
						aria-label={`Bits ${width - 1 - bi * 8} to ${width - 8 - bi * 8}`}
					>
						<span class="idx rowlab"></span>
						{#each Array(8) as __, i (i)}<span class="idx">{width - 1 - bi * 8 - i}</span>{/each}
						{#each rows as row (row.k)}
							<span class="rowlab">{row.k}</span>
							{#each bytes(row.p, width)[bi].split('') as d, i (i)}<span
									class="cell"
									class:one={d === '1'}
									class:res={row.res}>{d}</span
								>{/each}
						{/each}
					</div>
				{/each}
			</div>
		</figure>
	{/if}
{/if}

<h2 class="label head">Masks and single bits</h2>
<div class="grid">
	<div class="field">
		<label class="label" for="bw-mask">Mask from bit positions</label>
		<input id="bw-mask" type="text" bind:value={maskIn} spellcheck="false" autocomplete="off" />
	</div>
	<div class="field">
		<label class="label" for="bw-bit">Bit of A</label>
		<input id="bw-bit" type="text" inputmode="numeric" bind:value={bitIn} autocomplete="off" />
	</div>
</div>
{#if mask.error}<p class="error" role="alert">{mask.error}</p>{/if}
{#if bit.error}<p class="error" role="alert">{bit.error}</p>{/if}
<dl class="readout ops">
	{#if mask.m !== undefined}
		<div>
			<dt>Mask</dt>
			<dd>
				<span class="dec">{dec(mask.m)}</span>
				<span class="hex">{hex(mask.m, width)}</span>
				<span class="bin">{bin(mask.m, width)}</span>
			</dd>
			<Copy value={hex(mask.m, width)} />
		</div>
		{#if a.p !== undefined}
			<div>
				<dt>A AND mask</dt>
				<dd>
					<span class="hex">{hex(a.p & mask.m, width)}</span>
					<span class="muted"
						>{(a.p & mask.m) === mask.m && mask.m
							? 'all mask bits set in A'
							: a.p & mask.m
								? 'some mask bits set in A'
								: 'no mask bits set in A'}</span
					>
				</dd>
			</div>
		{/if}
	{/if}
	{#if bit.n !== undefined && a.p !== undefined}
		<div>
			<dt>Bit {bit.n} of A</dt>
			<dd class="hl">{testBit(a.p, bit.n) ? '1, set' : '0, clear'}</dd>
		</div>
		<div>
			<dt>A, set bit {bit.n}</dt>
			<dd>
				<span class="dec">{dec(setBit(a.p, bit.n))}</span>
				<span class="hex">{hex(setBit(a.p, bit.n), width)}</span>
			</dd>
			<Copy value={hex(setBit(a.p, bit.n), width)} />
		</div>
		<div>
			<dt>A, clear bit {bit.n}</dt>
			<dd>
				<span class="dec">{dec(clearBit(a.p, bit.n))}</span>
				<span class="hex">{hex(clearBit(a.p, bit.n), width)}</span>
			</dd>
			<Copy value={hex(clearBit(a.p, bit.n), width)} />
		</div>
		<div>
			<dt>A, toggle bit {bit.n}</dt>
			<dd>
				<span class="dec">{dec(toggleBit(a.p, bit.n))}</span>
				<span class="hex">{hex(toggleBit(a.p, bit.n), width)}</span>
			</dd>
			<Copy value={hex(toggleBit(a.p, bit.n), width)} />
		</div>
	{/if}
</dl>

<p class="note end">
	Operands are decimal or carry 0x, 0b or 0o, and may be negative. They are cut to the chosen width
	as two's complement, so -1 and 255 are the same 8-bit pattern. With Signed, decimals are read as
	two's complement and &gt;&gt; is arithmetic (copies the sign bit); &gt;&gt;&gt; always shifts in
	zeros. Shifting by the width or more clears every bit (JavaScript and x86 would take the count
	modulo 32 or 64). Mask positions count from bit 0, the least significant, and take ranges like
	4-7.
</p>

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
		gap: 1rem 1.25rem;
		margin-bottom: 0.75rem;
	}
	.opts {
		margin-bottom: 0.5rem;
	}
	input[aria-invalid='true'] {
		border-color: var(--signal);
	}
	.error {
		margin: 0.5rem 0;
	}
	.head {
		margin: 1.75rem 0 0.5rem;
	}
	.ops {
		margin-top: 1rem;
	}
	.ops dd {
		display: flex;
		flex-wrap: wrap;
		gap: 0.15rem 1rem;
		align-items: baseline;
	}
	.dec {
		min-width: 6ch;
		font-weight: 700;
	}
	.bin {
		color: var(--ink-2);
		letter-spacing: 0.04em;
	}
	.muted {
		color: var(--ink-2);
		font-size: 0.8125rem;
	}
	.hl {
		color: var(--signal);
		font-weight: 700;
	}
	.acts {
		display: flex;
		gap: 0.35rem;
	}
	.small {
		min-height: 2.25rem;
		padding: 0.25rem 0.6rem;
		font-size: 0.6875rem;
	}
	.readout > div.sel {
		background: var(--hilite);
	}
	.bits {
		margin: 1rem 0 0;
	}
	.bytes {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem 1rem;
		margin-top: 0.5rem;
	}
	.byte {
		display: grid;
		grid-template-columns: 1.4rem repeat(8, 1.6rem);
		font-family: var(--font-mono);
		text-align: center;
		border-top: 2px solid var(--rule);
	}
	.idx {
		font-size: 0.625rem;
		color: var(--ink-2);
		padding: 0.15rem 0;
	}
	.rowlab {
		color: var(--ink-2);
		font-size: 0.8125rem;
		text-align: left;
		align-self: center;
	}
	.cell {
		padding: 0.15rem 0;
		color: var(--ink-2);
		border-bottom: 1px solid var(--rule-soft);
	}
	.cell.one {
		color: var(--ink);
		font-weight: 700;
	}
	.cell.res {
		background: var(--hilite);
	}
	.cell.res.one {
		color: var(--signal);
	}
	.end {
		margin-top: 1.75rem;
	}
</style>
