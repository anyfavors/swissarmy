<script lang="ts">
	import { onMount } from 'svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import type { Port } from './data';
	import { find, portLabel, rangeOf, validPort, type ProtoFilter } from './logic';

	let q = $state('');
	let proto = $state<ProtoFilter>('all');
	let risky = $state(false);
	let list = $state<Port[] | null>(null);
	let loadError = $state('');
	let ready = false;

	const found = $derived(list ? find(list, { q, proto, risky }) : []);
	const num = $derived(validPort(q.replace(/\/(tcp|udp)$/i, '')));

	onMount(() => {
		const h = readHash();
		if (h.in) q = h.in;
		if (h.p === 'tcp' || h.p === 'udp') proto = h.p;
		if (h.r === '1') risky = true;
		ready = true;
		import('./data')
			.then((m) => (list = m.ports))
			.catch((e) => (loadError = `Could not load the port list: ${(e as Error).message}`));
	});

	$effect(() => {
		const state = {
			in: q.trim(),
			p: proto === 'all' ? undefined : proto,
			r: risky ? '1' : undefined
		};
		if (ready) writeHash(state);
	});
</script>

<div class="field">
	<label class="label" for="ports-q">Port, service or keyword</label>
	<input id="ports-q" type="search" bind:value={q} spellcheck="false" autocomplete="off" />
	<p class="label hint">Accepts 3389 · 514/udp · smb · winrm · kubernetes</p>
</div>

<div class="row opts" role="group" aria-label="Filter">
	<span class="label">Protocol</span>
	<button type="button" aria-pressed={proto === 'all'} onclick={() => (proto = 'all')}>All</button>
	<button type="button" aria-pressed={proto === 'tcp'} onclick={() => (proto = 'tcp')}>TCP</button>
	<button type="button" aria-pressed={proto === 'udp'} onclick={() => (proto = 'udp')}>UDP</button>
	<button type="button" aria-pressed={risky} onclick={() => (risky = !risky)}
		>Risky when exposed</button
	>
</div>

{#if loadError}
	<p class="error" role="alert">{loadError}</p>
{:else if !list}
	<p class="note">Loading the port list.</p>
{:else}
	<p class="label count" aria-live="polite">
		{found.length} of {list.length} entries{num !== null ? ` · ${num}: ${rangeOf(num)}` : ''}
	</p>
	{#if !found.length}
		<p class="note">
			Nothing in this list{num !== null ? ` for ${num}` : ''}. The full IANA registry has far more,
			and any port can carry any service.
		</p>
	{/if}
	<ul class="ports">
		{#each found as p (`${p.port}/${p.proto}`)}
			<li class:risk={p.risk}>
				<p class="head">
					<span class="num mono">{portLabel(p)}</span>
					<span class="proto mono">{p.proto.toUpperCase()}</span>
					<span class="name">{p.name}</span>
					{#if p.iana}<span class="label iana">IANA: {p.iana}</span>{:else}<span class="label iana"
							>common use</span
						>{/if}
				</p>
				<p class="desc">{p.desc}</p>
				{#if p.risk}<p class="warn"><span class="label">Exposure</span> {p.risk}</p>{/if}
			</li>
		{/each}
	</ul>
{/if}

<p class="note">
	Service names from the <a
		href="https://www.iana.org/assignments/service-names-port-numbers"
		rel="noopener noreferrer">IANA Service Name and Transport Protocol Port Number Registry</a
	>. Entries marked common use are conventions IANA does not list for that service. A port number
	says nothing certain about what is listening: check with the process list (ss -tulpn,
	Get-NetTCPConnection) before acting.
</p>

<style>
	.hint {
		margin: 0.35rem 0 0;
		text-transform: none;
		letter-spacing: 0.02em;
	}
	.opts {
		margin: 1rem 0;
	}
	.count {
		margin: 0 0 0.5rem;
	}
	.ports {
		list-style: none;
		margin: 0 0 1.5rem;
		padding: 0;
		border-top: 2px solid var(--rule);
	}
	.ports li {
		padding: 0.6rem 0;
		border-bottom: 1px solid var(--rule-soft);
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 0.75rem;
		margin: 0;
	}
	.num {
		font-weight: 700;
		font-size: 1.125rem;
		min-width: 3.5rem;
	}
	.risk .num {
		color: var(--signal);
	}
	.proto {
		font-size: 0.75rem;
		border: 1px solid var(--rule-soft);
		padding: 0 0.3rem;
	}
	.name {
		font-weight: 700;
	}
	.iana {
		text-transform: none;
		letter-spacing: 0.02em;
	}
	.desc {
		margin: 0.2rem 0 0;
		color: var(--ink-2);
		font-size: 0.9375rem;
		overflow-wrap: anywhere;
	}
	.warn {
		margin: 0.35rem 0 0;
		font-size: 0.9375rem;
		border-left: 3px solid var(--signal);
		padding-left: 0.6rem;
		overflow-wrap: anywhere;
	}
	.warn .label {
		color: var(--signal);
		margin-right: 0.35rem;
	}
</style>
