<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		allFields,
		cryptoRng,
		fieldLabels,
		generate,
		seededRng,
		toCsv,
		toJson,
		type Field,
		type NameSet
	} from './logic';

	type Format = 'csv' | 'json';

	let count = $state('10');
	let fields = $state<Field[]>(['name', 'email', 'phone', 'address']);
	let names = $state<NameSet>('mixed');
	let format = $state<Format>('csv');
	let seed = $state('');
	let nonce = $state(0);
	let output = $state('');
	let error = $state('');
	let ready = $state(false);

	const nameSets: { id: NameSet; label: string }[] = [
		{ id: 'dk', label: 'Danish' },
		{ id: 'intl', label: 'International' },
		{ id: 'mixed', label: 'Mixed' }
	];

	function toggle(f: Field) {
		fields = fields.includes(f) ? fields.filter((x) => x !== f) : [...fields, f];
	}

	$effect(() => {
		void nonce;
		if (!ready) return;
		try {
			const rng = seed.trim() ? seededRng(seed.trim()) : cryptoRng();
			const rows = generate(rng, {
				count: Number(count),
				fields,
				names,
				year: new Date().getFullYear()
			});
			output = format === 'csv' ? toCsv(rows) : toJson(rows);
			error = '';
		} catch (e) {
			error = (e as Error).message;
			output = '';
		}
	});

	onMount(() => {
		const h = readHash();
		if (h.n) count = h.n;
		if (h.f !== undefined) fields = allFields.filter((f) => h.f.split(',').includes(f));
		if (h.ns === 'dk' || h.ns === 'intl') names = h.ns;
		if (h.o === 'json') format = 'json';
		if (h.seed) seed = h.seed;
		ready = true;
	});

	$effect(() => {
		const state = {
			n: count,
			f: fields.join(','),
			ns: names === 'mixed' ? undefined : names,
			o: format === 'json' ? 'json' : undefined,
			seed: seed.trim() || undefined
		};
		if (ready) writeHash(state);
	});
</script>

<div class="row opts" role="group" aria-label="Fields">
	<span class="label">Fields</span>
	{#each allFields as f (f)}
		<button type="button" aria-pressed={fields.includes(f)} onclick={() => toggle(f)}
			>{fieldLabels[f]}</button
		>
	{/each}
</div>

<div class="row opts" role="group" aria-label="Names">
	<span class="label">Names</span>
	{#each nameSets as s (s.id)}
		<button type="button" aria-pressed={names === s.id} onclick={() => (names = s.id)}
			>{s.label}</button
		>
	{/each}
</div>

<div class="inputs">
	<div class="field">
		<label class="label" for="td-n">Rows, 1 to 1000</label>
		<input id="td-n" type="text" inputmode="numeric" bind:value={count} autocomplete="off" />
	</div>
	<div class="field">
		<label class="label" for="td-seed">Seed, optional</label>
		<input
			id="td-seed"
			type="text"
			bind:value={seed}
			spellcheck="false"
			autocomplete="off"
			placeholder="random"
		/>
	</div>
</div>

<div class="row opts">
	<div class="row" role="group" aria-label="Format">
		<button type="button" aria-pressed={format === 'csv'} onclick={() => (format = 'csv')}
			>CSV</button
		>
		<button type="button" aria-pressed={format === 'json'} onclick={() => (format = 'json')}
			>JSON</button
		>
	</div>
	<button type="button" onclick={() => nonce++} disabled={!!seed.trim()}>Generate again</button>
</div>

{#if error}<p class="error" role="alert">{error}</p>{/if}

<div class="field">
	<div class="row between">
		<label class="label" for="td-out">{format.toUpperCase()}</label>
		<Copy value={output} />
	</div>
	<textarea id="td-out" readonly value={output} spellcheck="false" class="out"></textarea>
</div>

<p class="note">
	{seed.trim()
		? 'Seeded: the same seed gives the same data. The seeded generator (sfc32) is not cryptographic.'
		: 'Random from crypto.getRandomValues. Set a seed to get reproducible data.'}
</p>
<ul class="note facts">
	<li>Emails use only example.com, .org and .net, reserved for testing by RFC 2606.</li>
	<li>
		Phone numbers are random +45 numbers. Denmark has no reserved fictional range that we know of,
		so a generated number may belong to someone. Do not call or text them.
	</li>
	<li>Street names are invented; postcodes and towns are real.</li>
	<li>
		IBANs are synthetic DK numbers with a correct mod 97 checksum and a random registration number.
		They are not checked against any bank and must not be used for payments.
	</li>
	<li>
		Card numbers are only the published test numbers from <a
			href="https://docs.stripe.com/testing"
			rel="noopener noreferrer">Stripe</a
		> and 4111 1111 1111 1111 (Adyen, Braintree). Expiry and CVC are random.
	</li>
	<li>No CPR numbers are generated, on purpose.</li>
</ul>

<style>
	.opts {
		margin: 0 0 1rem;
	}
	.inputs {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
		gap: 1rem;
		margin-bottom: 1rem;
	}
	.between {
		justify-content: space-between;
	}
	.out {
		min-height: 18rem;
		font-size: 0.875rem;
		white-space: pre;
		overflow-wrap: normal;
		overflow-x: auto;
	}
	button:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.note {
		margin: 1rem 0 0;
	}
	.facts {
		padding-left: 1.6rem;
		display: grid;
		gap: 0.35rem;
	}
</style>
