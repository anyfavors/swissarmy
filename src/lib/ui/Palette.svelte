<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { tools, toolNumber } from '#lib/tools/registry.ts';
	import { searchTools } from '#lib/util/search.ts';

	let dialog: HTMLDialogElement;
	let input: HTMLInputElement;
	let query = $state('');
	let active = $state(0);
	const results = $derived(searchTools(query, tools));

	export function open() {
		query = '';
		active = 0;
		dialog.showModal();
		input.focus();
	}

	function choose(id: string) {
		dialog.close();
		goto(resolve('/[tool]', { tool: id }));
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			active = Math.min(active + 1, results.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			active = Math.max(active - 1, 0);
		} else if (e.key === 'Enter' && results[active]) {
			e.preventDefault();
			choose(results[active].id);
		}
	}

	function globalKey(e: KeyboardEvent) {
		const target = e.target as HTMLElement;
		const typing = target.closest('input, textarea, select, [contenteditable]');
		if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
			e.preventDefault();
			open();
		}
	}

	function backdropClose(e: MouseEvent) {
		if (e.target === dialog) dialog.close();
	}
</script>

<svelte:window onkeydown={globalKey} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog bind:this={dialog} onclick={backdropClose} aria-label="Search tools">
	<div class="inner">
		<div class="top">
			<label class="label" for="palette-q">Find a tool</label>
			<button type="button" class="close" onclick={() => dialog.close()}>Close</button>
		</div>
		<input
			id="palette-q"
			bind:this={input}
			type="search"
			autocomplete="off"
			spellcheck="false"
			placeholder="subnet, epoch, b64, 2-01 …"
			bind:value={query}
			oninput={() => (active = 0)}
			onkeydown={onKey}
			role="combobox"
			aria-expanded="true"
			aria-controls="palette-list"
			aria-activedescendant={results[active] ? `pal-${results[active].id}` : undefined}
		/>
		<ul id="palette-list" role="listbox">
			{#each results as t, i (t.id)}
				<li
					id={`pal-${t.id}`}
					role="option"
					aria-selected={i === active}
					class:active={i === active}
					onclick={() => choose(t.id)}
					onmousemove={() => (active = i)}
				>
					<span class="no">{toolNumber(t)}</span>
					<span class="title">{t.title}</span>
					<span class="sum">{t.summary}</span>
				</li>
			{:else}
				<li class="empty">No entry in this manual matches “{query}”.</li>
			{/each}
		</ul>
		<p class="label keys">
			<kbd>↑</kbd> <kbd>↓</kbd> move · <kbd>Enter</kbd> open · <kbd>Esc</kbd> close
		</p>
	</div>
</dialog>

<style>
	dialog {
		padding: 0;
		border: 2px solid var(--rule);
		background: var(--paper);
		color: var(--ink);
		width: min(40rem, calc(100vw - 2rem));
		max-height: min(34rem, calc(100dvh - 4rem));
		margin: 12vh auto auto;
		box-shadow: 8px 8px 0 var(--rule);
	}
	dialog::backdrop {
		background: rgb(0 0 0 / 0.35);
	}
	.inner {
		display: grid;
		grid-template-rows: auto auto 1fr auto;
		gap: 0.5rem;
		padding: 1rem;
		max-height: inherit;
	}
	.top {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.close {
		min-height: 2.25rem;
		padding: 0.25rem 0.6rem;
		font-size: 0.6875rem;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		overflow-y: auto;
		border-top: 2px solid var(--rule);
	}
	li {
		display: grid;
		grid-template-columns: 3.5rem 1fr;
		gap: 0 0.75rem;
		padding: 0.55rem 0.4rem;
		border-bottom: 1px solid var(--rule-soft);
		cursor: pointer;
	}
	li.active {
		background: var(--ink);
		color: var(--paper);
	}
	li.active .sum,
	li.active .no {
		color: inherit;
	}
	.no {
		font-family: var(--font-mono);
		color: var(--signal);
		grid-row: span 2;
	}
	.title {
		font-weight: 700;
	}
	.sum {
		font-size: 0.875rem;
		color: var(--ink-2);
	}
	.empty {
		display: block;
		cursor: default;
		color: var(--ink-2);
	}
	.keys {
		margin: 0;
	}
	kbd {
		border: 1px solid var(--rule-soft);
		padding: 0 0.3rem;
	}
	@media (max-width: 40rem) {
		dialog {
			margin: 0;
			width: 100vw;
			max-width: 100vw;
			height: 100dvh;
			max-height: 100dvh;
			border: 0;
			box-shadow: none;
		}
		.keys {
			display: none;
		}
	}
</style>
