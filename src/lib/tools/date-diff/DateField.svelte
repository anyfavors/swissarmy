<script lang="ts">
	import { todayIso } from './logic';
	/**
	 * A text field for YYYY-MM-DD[THH:MM[:SS]] with native date and time pickers next to it.
	 * The text is the source of truth; the pickers write into it.
	 */
	let {
		id,
		label,
		value = $bindable(''),
		withTime = true
	}: { id: string; label: string; value: string; withTime?: boolean } = $props();

	const parts = $derived.by(() => {
		const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?))?/.exec(value.trim());
		return { date: m?.[1] ?? '', time: m?.[2] ?? '' };
	});

	function setDate(d: string) {
		if (!d) return;
		value = parts.time ? `${d}T${parts.time}` : d;
	}

	function setTime(t: string) {
		const d = parts.date || todayIso();
		value = t ? `${d}T${t}` : d;
	}
</script>

<div class="field">
	<label class="label" for={id}>{label}</label>
	<input
		{id}
		type="text"
		bind:value
		spellcheck="false"
		autocomplete="off"
		placeholder="YYYY-MM-DD or YYYY-MM-DDTHH:MM"
	/>
	<div class="pickers">
		<label class="pick">
			<span class="visually-hidden">{label}: pick date</span>
			<input type="date" value={parts.date} onchange={(e) => setDate(e.currentTarget.value)} />
		</label>
		{#if withTime}
			<label class="pick">
				<span class="visually-hidden">{label}: pick time</span>
				<input
					type="time"
					step="1"
					value={parts.time}
					onchange={(e) => setTime(e.currentTarget.value)}
				/>
			</label>
			<button type="button" onclick={() => setTime('')} disabled={!parts.time}>No time</button>
		{/if}
	</div>
</div>

<style>
	.pickers {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
		gap: 0.5rem;
	}
	.pick {
		display: block;
	}
	.pick input {
		width: 100%;
		min-height: 2.75rem;
		font: inherit;
		font-family: var(--font-mono);
		font-size: 0.9375rem;
		color: var(--ink);
		background: var(--field);
		border: 1px solid var(--rule-soft);
		border-radius: 0;
		padding: 0.4rem 0.6rem;
	}
	button {
		justify-content: center;
	}
	button:disabled {
		opacity: 0.35;
		cursor: default;
	}
	button:disabled:hover {
		background: transparent;
		color: var(--ink);
	}
</style>
