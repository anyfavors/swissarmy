<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import { decompose, fromRoman, parseInteger, toRoman } from './logic';

	let num = $state('');
	let roman = $state('');
	let value = $state<number | null>(null);
	let error = $state<{ key: 'num' | 'roman'; msg: string } | null>(null);
	let ready = false;

	const parts = $derived(value === null ? [] : decompose(value));

	function onNum() {
		if (!num.trim()) {
			value = null;
			roman = '';
			error = null;
			return;
		}
		try {
			value = parseInteger(num);
			roman = toRoman(value);
			error = null;
		} catch (e) {
			value = null;
			error = { key: 'num', msg: (e as Error).message };
		}
	}

	function onRoman() {
		if (!roman.trim()) {
			value = null;
			num = '';
			error = null;
			return;
		}
		try {
			value = fromRoman(roman).value;
			num = String(value);
			error = null;
		} catch (e) {
			value = null;
			error = { key: 'roman', msg: (e as Error).message };
		}
	}

	onMount(() => {
		const src = (readHash().in ?? '2026').trim();
		if (/^[\d\s_+-]+$/.test(src)) {
			num = src;
			onNum();
		} else {
			roman = src;
			onRoman();
		}
		ready = true;
	});

	$effect(() => {
		const state = { in: value === null ? undefined : String(value) };
		if (ready) writeHash(state);
	});
</script>

<div class="grid">
	<div class="field">
		<div class="row between">
			<label class="label" for="rn-num">Number · 1 to 3999</label>
			<Copy value={value === null ? '' : String(value)} />
		</div>
		<input
			id="rn-num"
			type="text"
			inputmode="numeric"
			bind:value={num}
			oninput={onNum}
			autocomplete="off"
			aria-invalid={error?.key === 'num'}
			aria-describedby={error?.key === 'num' ? 'rn-err' : undefined}
		/>
	</div>
	<div class="field">
		<div class="row between">
			<label class="label" for="rn-roman">Roman numeral</label>
			<Copy value={value === null ? '' : toRoman(value)} />
		</div>
		<input
			id="rn-roman"
			class="big"
			type="text"
			bind:value={roman}
			oninput={onRoman}
			spellcheck="false"
			autocomplete="off"
			autocapitalize="characters"
			aria-invalid={error?.key === 'roman'}
			aria-describedby={error?.key === 'roman' ? 'rn-err' : undefined}
		/>
	</div>
</div>

{#if error}<p class="error" id="rn-err" role="alert">{error.msg}</p>{/if}

{#if value !== null}
	<h2 class="label head">Decomposition</h2>
	<dl class="readout">
		{#each parts as p (p.value)}
			<div>
				<dt>{p.value}</dt>
				<dd>
					<span class="num">{p.numeral}</span>
					<span class="sub">{p.explain}{p.subtractive ? ', subtractive pair' : ''}</span>
				</dd>
			</div>
		{/each}
		<div class="total">
			<dt>Total</dt>
			<dd>
				{parts.map((p) => p.value).join(' + ')} = {value} = <strong>{toRoman(value)}</strong>
			</dd>
		</div>
	</dl>
{/if}

<p class="note">
	Letters: I 1, V 5, X 10, L 50, C 100, D 500, M 1000. Each decimal digit is written on its own,
	largest first. Only six subtractive pairs exist: IV, IX, XL, XC, CD, CM. I, X and C repeat at most
	three times, V, L and D never repeat and are never subtracted. Clock faces often show IIII for 4
	by tradition; this tool reads only the standard form and rejects IIII.
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
	input.big {
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	input[aria-invalid='true'] {
		border-color: var(--signal);
	}
	.error {
		margin-bottom: 1rem;
	}
	.head {
		margin: 1.5rem 0 0.5rem;
	}
	.readout {
		margin-bottom: 1.5rem;
	}
	.num {
		font-weight: 700;
		letter-spacing: 0.08em;
		margin-right: 0.75rem;
	}
	.sub {
		color: var(--ink-2);
		font-size: 0.875rem;
	}
	.total strong {
		color: var(--signal);
		letter-spacing: 0.08em;
	}
</style>
