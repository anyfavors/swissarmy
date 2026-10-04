<script lang="ts">
	import type { NetworkUse } from '#lib/tools/types.ts';

	let { network }: { network: NetworkUse } = $props();
</script>

{#if network}
	<p class="stamp net">
		<span class="head">Network</span>
		<span
			>Sends data to {network.hosts.join(', ')}: {network.purpose}. Only when you press the button.</span
		>
	</p>
{:else}
	<p class="stamp">
		<span class="head">Local only</span>
		<span>Runs in your browser. Nothing you enter leaves this page.</span>
	</p>
{/if}

<style>
	.stamp {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: stretch;
		margin: 0;
		border: 1px solid var(--rule);
		font-size: 0.875rem;
	}
	.stamp > span {
		padding: 0.3rem 0.6rem;
	}
	.head {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		border-right: 1px solid var(--rule);
		display: flex;
		align-items: center;
	}
	.net .head {
		background: var(--signal);
		color: var(--signal-ink);
	}
</style>
