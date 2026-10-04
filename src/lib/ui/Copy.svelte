<script lang="ts">
	let { value, label = 'Copy' }: { value: string; label?: string } = $props();
	let copied = $state(false);
	let timer: ReturnType<typeof setTimeout>;

	async function copy() {
		await navigator.clipboard.writeText(value);
		copied = true;
		clearTimeout(timer);
		timer = setTimeout(() => (copied = false), 1200);
	}
</script>

<button type="button" class="copy" onclick={copy} disabled={!value} aria-live="polite">
	{copied ? 'Copied' : label}
</button>

<style>
	.copy {
		min-height: 2.25rem;
		padding: 0.25rem 0.6rem;
		font-size: 0.6875rem;
	}
	.copy:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.copy:disabled:hover {
		background: transparent;
		color: var(--ink);
	}
</style>
