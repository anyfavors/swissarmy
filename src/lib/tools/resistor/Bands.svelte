<script lang="ts">
	import { colour, roles, type BandCount, type Colour } from './logic';

	let { bands, title }: { bands: Colour[]; title: string } = $props();

	const roleName = { digit: 'digit', mult: 'multiplier', tol: 'tolerance', tcr: 'tempco' };

	const layout = $derived.by(() => {
		const r = roles(bands.length as BandCount);
		const n = bands.length;
		const lastGap = n >= 4;
		// Bands spread over the body, the tolerance group set apart with a wider gap
		const main = lastGap ? (n === 6 ? 4 : n - 1) : n;
		const xs: number[] = [];
		for (let i = 0; i < main; i++) xs.push(84 + i * 30);
		for (let i = main; i < n; i++) xs.push(84 + (main - 1) * 30 + 48 + (i - main) * 30);
		return bands.map((b, i) => ({ c: colour(b), x: xs[i], role: roleName[r[i]] }));
	});
</script>

<svg viewBox="0 0 360 112" role="img" aria-label={title}>
	<line class="lead" x1="4" y1="40" x2="356" y2="40" />
	<rect class="body" x="60" y="12" width="240" height="56" rx="16" />
	{#each layout as b, i (i)}
		{#if b.c.name !== 'none'}
			<rect class="band" x={b.x} y="12" width="16" height="56" fill={b.c.fill} />
		{:else}
			<rect class="band empty" x={b.x} y="12" width="16" height="56" />
		{/if}
		<text class="tag" x={b.x + 8} y="88" text-anchor="middle">{i + 1}</text>
		<text class="tag small" x={b.x + 8} y="104" text-anchor="middle"
			>{b.c.label.slice(0, 3).toUpperCase()}</text
		>
	{/each}
</svg>

<ol class="legend">
	{#each layout as b, i (i)}
		<li>
			<svg class="chip" viewBox="0 0 12 12" aria-hidden="true">
				{#if b.c.name !== 'none'}
					<rect class="band" x="0.5" y="0.5" width="11" height="11" fill={b.c.fill} />
				{:else}
					<rect class="band empty" x="0.5" y="0.5" width="11" height="11" />
				{/if}
			</svg>
			<span class="name">{b.c.label}</span>
			<span class="role">{b.role}</span>
		</li>
	{/each}
</ol>

<style>
	svg[role='img'] {
		display: block;
		width: 100%;
		max-width: 30rem;
		height: auto;
		margin: 0.5rem 0;
	}
	.lead {
		stroke: var(--ink-2);
		stroke-width: 3;
	}
	.body {
		fill: var(--field);
		stroke: var(--rule);
		stroke-width: 1.5;
	}
	.band {
		stroke: var(--rule);
		stroke-width: 0.75;
	}
	.empty {
		fill: none;
		stroke-dasharray: 3 3;
	}
	.tag {
		fill: var(--ink);
		font-family: var(--font-mono);
		font-size: 12px;
	}
	.small {
		fill: var(--ink-2);
		font-size: 10px;
	}
	.legend {
		list-style: none;
		margin: 0 0 1rem;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1rem;
		counter-reset: band;
		font-family: var(--font-mono);
		font-size: 0.875rem;
	}
	.legend li {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		counter-increment: band;
	}
	.legend li::before {
		content: counter(band);
		color: var(--ink-2);
		font-size: 0.75rem;
	}
	.chip {
		width: 0.9rem;
		height: 0.9rem;
	}
	.role {
		color: var(--ink-2);
		font-size: 0.75rem;
	}
</style>
