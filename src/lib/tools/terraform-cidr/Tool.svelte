<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		cidrhost,
		cidrnetmask,
		cidrsubnet,
		cidrsubnets,
		evaluate,
		formatNet,
		hostBitsSet,
		parseCall,
		parsePrefix,
		parseWhole,
		subnetTable,
		type FnName
	} from './logic';

	type Mode = FnName | 'expr';
	const MODES: Mode[] = ['cidrsubnet', 'cidrsubnets', 'cidrhost', 'cidrnetmask', 'expr'];
	const TABLE_MAX = 256;

	let mode = $state<Mode>('cidrsubnet');
	let prefix = $state('10.0.0.0/16');
	let newbits = $state('8');
	let netnum = $state('2');
	let list = $state('4, 4, 8, 4');
	let hostnum = $state('5');
	let expr = $state('cidrsubnet("172.16.0.0/12", 4, 2)');
	let from = $state('0');
	let count = $state('16');
	let ready = false;

	interface Out {
		call: string;
		value: string;
		lines?: string[];
	}

	const result = $derived.by((): { out?: Out; error?: string } | null => {
		try {
			if (mode === 'expr') {
				if (!expr.trim()) return null;
				const c = parseCall(expr);
				return { out: { call: expr.trim(), value: evaluate(c) } };
			}
			if (!prefix.trim()) return null;
			const p = JSON.stringify(prefix.trim());
			if (mode === 'cidrsubnet') {
				const n = cidrsubnet(prefix, parseWhole(newbits, 'newbits'), parseWhole(netnum, 'netnum'));
				return {
					out: {
						call: `cidrsubnet(${p}, ${newbits.trim()}, ${netnum.trim()})`,
						value: formatNet(n)
					}
				};
			}
			if (mode === 'cidrsubnets') {
				const nb = list
					.split(/[\s,]+/)
					.filter(Boolean)
					.map((x) => parseWhole(x, 'newbits'));
				const nets = cidrsubnets(prefix, nb).map(formatNet);
				return {
					out: {
						call: `cidrsubnets(${[p, ...nb.map(String)].join(', ')})`,
						value: nets.join('\n'),
						lines: nets
					}
				};
			}
			if (mode === 'cidrhost') {
				return {
					out: {
						call: `cidrhost(${p}, ${hostnum.trim()})`,
						value: cidrhost(prefix, parseWhole(hostnum, 'hostnum'))
					}
				};
			}
			return { out: { call: `cidrnetmask(${p})`, value: cidrnetmask(prefix) } };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	const base = $derived.by(() => {
		if (mode === 'expr') return null;
		try {
			const n = parsePrefix(prefix);
			return { n, masked: hostBitsSet(prefix) };
		} catch {
			return null;
		}
	});

	const zeroQuirk = $derived(mode === 'cidrsubnets' && base?.n.addr === 0n);

	const table = $derived.by(() => {
		if (mode !== 'cidrsubnet' || !result?.out) return null;
		try {
			const nb = parseWhole(newbits, 'newbits');
			const f = parseWhole(from, 'From');
			if (f < 0n) throw new Error('From must not be negative');
			const c = Number(parseWhole(count, 'Count'));
			if (c < 1 || c > TABLE_MAX) throw new Error(`Count must be 1 to ${TABLE_MAX}`);
			return { rows: subnetTable(prefix, nb, f, c), total: 1n << nb };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	onMount(() => {
		const h = readHash();
		if (MODES.includes(h.m as Mode)) mode = h.m as Mode;
		if (h.p) prefix = h.p;
		if (h.b) newbits = h.b;
		if (h.n) netnum = h.n;
		if (h.l) list = h.l;
		if (h.h) hostnum = h.h;
		if (h.e) expr = h.e;
		if (h.f) from = h.f;
		if (h.c) count = h.c;
		if (h.in) {
			const t = h.in.trim();
			if (/^cidr\w*\s*\(/.test(t)) {
				expr = t;
				mode = 'expr';
			} else prefix = t;
		}
		ready = true;
	});

	$effect(() => {
		const e = mode === 'expr';
		const state = {
			m: mode === 'cidrsubnet' ? undefined : mode,
			p: e ? undefined : prefix,
			b: mode === 'cidrsubnet' ? newbits : undefined,
			n: mode === 'cidrsubnet' ? netnum : undefined,
			l: mode === 'cidrsubnets' ? list : undefined,
			h: mode === 'cidrhost' ? hostnum : undefined,
			e: e ? expr : undefined,
			f: mode === 'cidrsubnet' && from !== '0' ? from : undefined,
			c: mode === 'cidrsubnet' && count !== '16' ? count : undefined
		};
		if (ready) writeHash(state);
	});
</script>

<div class="row modes" role="group" aria-label="Function">
	{#each MODES as m (m)}
		<button type="button" aria-pressed={mode === m} onclick={() => (mode = m)}
			>{m === 'expr' ? 'Expression' : m}</button
		>
	{/each}
</div>

{#if mode === 'expr'}
	<div class="field">
		<label class="label" for="tc-e">Terraform call, literal arguments</label>
		<input
			id="tc-e"
			type="text"
			bind:value={expr}
			spellcheck="false"
			autocomplete="off"
			autocapitalize="off"
		/>
	</div>
{:else}
	<div class="inputs">
		<div class="field">
			<label class="label" for="tc-p">prefix</label>
			<input
				id="tc-p"
				type="text"
				bind:value={prefix}
				spellcheck="false"
				autocomplete="off"
				autocapitalize="off"
			/>
		</div>
		{#if mode === 'cidrsubnet'}
			<div class="field">
				<label class="label" for="tc-b">newbits</label>
				<input id="tc-b" type="text" inputmode="numeric" bind:value={newbits} autocomplete="off" />
			</div>
			<div class="field">
				<label class="label" for="tc-n">netnum</label>
				<input id="tc-n" type="text" inputmode="numeric" bind:value={netnum} autocomplete="off" />
			</div>
		{:else if mode === 'cidrsubnets'}
			<div class="field">
				<label class="label" for="tc-l">newbits, one per subnet</label>
				<input id="tc-l" type="text" bind:value={list} spellcheck="false" autocomplete="off" />
			</div>
		{:else if mode === 'cidrhost'}
			<div class="field">
				<label class="label" for="tc-h">hostnum</label>
				<input id="tc-h" type="text" inputmode="numeric" bind:value={hostnum} autocomplete="off" />
			</div>
		{/if}
	</div>
{/if}

{#if result?.error}
	<p class="error" role="alert">{result.error}</p>
{:else if result?.out}
	{@const o = result.out}
	<dl class="readout">
		<div>
			<dt>Expression</dt>
			<dd>{o.call}</dd>
			<Copy value={o.call} />
		</div>
		{#if o.lines}
			{#each o.lines as l, i (i)}
				<div>
					<dt>[{i}]</dt>
					<dd class="strong">{l}</dd>
					<Copy value={l} />
				</div>
			{/each}
		{:else}
			<div>
				<dt>Result</dt>
				<dd class="strong">{o.value}</dd>
				<Copy value={o.value} />
			</div>
		{/if}
		{#if base}
			<div>
				<dt>Base network</dt>
				<dd>{formatNet(base.n)}{base.masked ? ' (host bits ignored)' : ''}</dd>
				<span></span>
			</div>
		{/if}
	</dl>
	{#if zeroQuirk}
		<p class="note">
			Terraform's cidrsubnets steps back one subnet from the start of the base network to begin. At
			address zero that step wraps around, and Terraform may report "not enough remaining address
			space" for the first subnet. The result shown is the intended allocation.
		</p>
	{/if}
{/if}

{#if mode === 'cidrsubnet' && table}
	<div class="inputs small-inputs">
		<div class="field">
			<label class="label" for="tc-f">Table from netnum</label>
			<input id="tc-f" type="text" inputmode="numeric" bind:value={from} autocomplete="off" />
		</div>
		<div class="field">
			<label class="label" for="tc-c">Rows</label>
			<input id="tc-c" type="text" inputmode="numeric" bind:value={count} autocomplete="off" />
		</div>
	</div>
	{#if table.error}
		<p class="error" role="alert">{table.error}</p>
	{:else if table.rows}
		<div class="scroll">
			<table>
				<caption class="label"
					>cidrsubnet with newbits {newbits.trim()}: {table.total.toLocaleString('en-GB')} subnets in
					total</caption
				>
				<thead>
					<tr>
						<th scope="col">netnum</th>
						<th scope="col">Subnet</th>
						<th scope="col">First</th>
						<th scope="col">Last</th>
						<th scope="col">Addresses</th>
					</tr>
				</thead>
				<tbody>
					{#each table.rows as r (r.netnum)}
						<tr class:hit={r.netnum.toString() === netnum.trim()}>
							<th scope="row">{r.netnum}</th>
							<td class="mono">{r.cidr}</td>
							<td class="mono">{r.first}</td>
							<td class="mono">{r.last}</td>
							<td class="mono">{r.size.toLocaleString('en-GB')}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
{/if}

<p class="note">
	cidrsubnet adds newbits to the prefix length and puts netnum in those bits. cidrhost numbers
	addresses from the network address, so 0 is the network itself and -1 the last address. AWS keeps
	the first four and the last address of every VPC subnet, Azure the same, so start hosts at 4
	there. Results follow Terraform 1.x (and OpenTofu), host bits in the prefix are ignored.
</p>

<style>
	.modes {
		margin-bottom: 1.25rem;
	}
	.modes button {
		text-transform: none;
		letter-spacing: 0;
	}
	.inputs {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
		gap: 0.75rem;
		margin-bottom: 1.25rem;
	}
	.small-inputs {
		grid-template-columns: repeat(auto-fit, minmax(9rem, 12rem));
		margin-top: 1.5rem;
	}
	.readout {
		margin-bottom: 1.25rem;
	}
	.strong {
		font-weight: 700;
	}
	.error {
		margin-bottom: 1rem;
	}
	.scroll {
		overflow-x: auto;
		margin-bottom: 1.5rem;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		border-top: 2px solid var(--rule);
		font-size: 0.875rem;
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
		vertical-align: top;
		overflow-wrap: anywhere;
	}
	th {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-2);
		font-weight: 400;
	}
	th[scope='row'] {
		color: var(--ink);
		letter-spacing: 0;
	}
	tr.hit {
		background: var(--hilite);
	}
	.note {
		margin: 0 0 1rem;
	}
</style>
