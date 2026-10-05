<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		SETGID,
		SETUID,
		STICKY,
		applySymbolic,
		applyUmask,
		explain,
		parseAny,
		parseOctal,
		parseSymbolic,
		toChmodSymbolic,
		toOctal,
		toSymbolic,
		whoShift,
		type Who
	} from './logic';

	let mode = $state(0o755);
	let isDir = $state(false);
	let octalText = $state('755');
	let symText = $state('-rwxr-xr-x');
	let exprText = $state('');
	let umaskText = $state('022');
	let octalErr = $state('');
	let symErr = $state('');
	let exprErr = $state('');
	let ready = false;

	const typeChar = $derived(isDir ? 'd' : '-');
	const octal = $derived(toOctal(mode));
	const symbolic = $derived(toSymbolic(mode, typeChar));
	const clauses = $derived(toChmodSymbolic(mode));
	const lines = $derived(explain(mode));
	const um = $derived.by(() => {
		try {
			const u = parseOctal(umaskText);
			if (u > 0o777) return { error: 'A umask has at most 3 significant digits' };
			return { r: applyUmask(u) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	function sync(from: 'octal' | 'sym' | 'other') {
		if (from !== 'octal') {
			octalText = toOctal(mode);
			octalErr = '';
		}
		if (from !== 'sym') {
			symText = toSymbolic(mode, typeChar);
			symErr = '';
		}
	}

	function onOctal() {
		try {
			mode = parseOctal(octalText);
			octalErr = '';
			sync('octal');
		} catch (e) {
			octalErr = (e as Error).message;
		}
	}

	function onSym() {
		try {
			const p = parseSymbolic(symText);
			mode = p.mode;
			if (p.type === 'd') isDir = true;
			else if (p.type === '-') isDir = false;
			symErr = '';
			sync('sym');
		} catch (e) {
			symErr = (e as Error).message;
		}
	}

	function applyExpr() {
		try {
			mode = applySymbolic(mode, exprText, isDir);
			exprErr = '';
			sync('other');
		} catch (e) {
			exprErr = (e as Error).message;
		}
	}

	function toggle(bit: number) {
		mode ^= bit;
		sync('other');
	}

	function setType(dir: boolean) {
		isDir = dir;
		sync('other');
	}

	const whos: { w: Who; label: string; special: number; specialLabel: string }[] = [
		{ w: 'u', label: 'Owner', special: SETUID, specialLabel: 'setuid' },
		{ w: 'g', label: 'Group', special: SETGID, specialLabel: 'setgid' },
		{ w: 'o', label: 'Other', special: STICKY, specialLabel: 'sticky' }
	];
	const perms = [
		{ v: 4, label: 'Read' },
		{ v: 2, label: 'Write' },
		{ v: 1, label: 'Execute' }
	];

	onMount(() => {
		const h = readHash();
		if (h.d === '1') isDir = true;
		const start = (h.in ?? h.m ?? '').trim();
		if (h.um) umaskText = h.um;
		if (start) {
			try {
				mode = parseAny(start);
				if (start.startsWith('d')) isDir = true;
			} catch (e) {
				octalErr = (e as Error).message;
			}
		}
		sync(octalErr ? 'octal' : 'other');
		if (octalErr) octalText = start;
		ready = true;
	});

	$effect(() => {
		const state = {
			m: octal,
			d: isDir ? '1' : undefined,
			um: umaskText === '022' ? undefined : umaskText
		};
		if (ready) writeHash(state);
	});
</script>

<div class="inputs">
	<div class="field">
		<label class="label" for="cm-oct">Octal</label>
		<input
			id="cm-oct"
			type="text"
			inputmode="numeric"
			bind:value={octalText}
			oninput={onOctal}
			spellcheck="false"
			autocomplete="off"
		/>
	</div>
	<div class="field">
		<label class="label" for="cm-sym">Symbolic (ls -l)</label>
		<input
			id="cm-sym"
			type="text"
			bind:value={symText}
			oninput={onSym}
			spellcheck="false"
			autocomplete="off"
			autocapitalize="off"
		/>
	</div>
</div>
{#if octalErr}<p class="error" role="alert">{octalErr}</p>{/if}
{#if symErr}<p class="error" role="alert">{symErr}</p>{/if}

<div class="row opts" role="group" aria-label="File type">
	<span class="label">Type</span>
	<button type="button" aria-pressed={!isDir} onclick={() => setType(false)}>File</button>
	<button type="button" aria-pressed={isDir} onclick={() => setType(true)}>Directory</button>
</div>

<div class="scroll">
	<table>
		<caption class="label">Permission bits</caption>
		<thead>
			<tr>
				<th scope="col">Class</th>
				{#each perms as p (p.v)}<th scope="col">{p.label}</th>{/each}
				<th scope="col">Special</th>
				<th scope="col">Digit</th>
			</tr>
		</thead>
		<tbody>
			{#each whos as w (w.w)}
				<tr>
					<th scope="row">{w.label}</th>
					{#each perms as p (p.v)}
						{@const bit = p.v << whoShift[w.w]}
						<td>
							<input
								type="checkbox"
								id="cm-{w.w}{p.v}"
								checked={(mode & bit) !== 0}
								onchange={() => toggle(bit)}
								aria-label="{w.label} {p.label.toLowerCase()}"
							/>
						</td>
					{/each}
					<td>
						<label class="special">
							<input
								type="checkbox"
								checked={(mode & w.special) !== 0}
								onchange={() => toggle(w.special)}
							/>
							<span class="mono">{w.specialLabel}</span>
						</label>
					</td>
					<td class="mono strong">{(mode >> whoShift[w.w]) & 7}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<dl class="readout">
	<div>
		<dt>Octal</dt>
		<dd>{octal}</dd>
		<Copy value={octal} />
	</div>
	<div>
		<dt>Symbolic</dt>
		<dd>{symbolic}</dd>
		<Copy value={symbolic} />
	</div>
	<div>
		<dt>chmod numeric</dt>
		<dd>chmod {octal} {isDir ? 'dir' : 'file'}</dd>
		<Copy value="chmod {octal} {isDir ? 'dir' : 'file'}" />
	</div>
	<div>
		<dt>chmod symbolic</dt>
		<dd>chmod {clauses} {isDir ? 'dir' : 'file'}</dd>
		<Copy value="chmod {clauses} {isDir ? 'dir' : 'file'}" />
	</div>
</dl>

<ul class="explain">
	{#each lines as l (l)}<li class:warn={l.startsWith('Warning')}>{l}</li>{/each}
</ul>

<h2 class="label section-h">Apply a chmod expression</h2>
<form
	class="apply"
	onsubmit={(e) => {
		e.preventDefault();
		applyExpr();
	}}
>
	<div class="field grow">
		<label class="label" for="cm-expr">Expression, applied to the mode above</label>
		<input
			id="cm-expr"
			type="text"
			bind:value={exprText}
			placeholder="u+x,go-w"
			spellcheck="false"
			autocomplete="off"
			autocapitalize="off"
		/>
	</div>
	<button type="submit">Apply</button>
</form>
{#if exprErr}<p class="error" role="alert">{exprErr}</p>{/if}
<p class="note">
	Who: u owner, g group, o other, a all. Op: + add, - remove, = set exactly. Perms: r w x, X
	(execute only for directories or if someone already has execute), s setuid or setgid, t sticky.
	Without a who letter, real chmod also masks the change with your umask.
</p>

<h2 class="label section-h">umask</h2>
<div class="field umask">
	<label class="label" for="cm-umask">umask</label>
	<input
		id="cm-umask"
		type="text"
		inputmode="numeric"
		bind:value={umaskText}
		spellcheck="false"
		autocomplete="off"
	/>
</div>
{#if um.error}
	<p class="error" role="alert">{um.error}</p>
{:else if um.r}
	<dl class="readout">
		<div>
			<dt>New files (0666 minus umask)</dt>
			<dd>{toOctal(um.r.file, true)} {toSymbolic(um.r.file)}</dd>
		</div>
		<div>
			<dt>New directories (0777 minus umask)</dt>
			<dd>{toOctal(um.r.dir, true)} {toSymbolic(um.r.dir, 'd')}</dd>
		</div>
	</dl>
	<p class="note">
		The umask removes bits, it does not subtract: 0666 with umask 0033 gives 0644, not 0633.
		Programs may ask for fewer bits than 0666 or 0777 to begin with.
	</p>
{/if}

<style>
	.inputs {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
		gap: 1rem;
		margin-bottom: 0.75rem;
	}
	.opts {
		margin: 1rem 0;
	}
	.scroll {
		overflow-x: auto;
		margin: 0 0 1.25rem;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		border-top: 2px solid var(--rule);
	}
	caption {
		text-align: left;
		padding-bottom: 0.4rem;
	}
	th,
	td {
		text-align: left;
		padding: 0.3rem 0.6rem 0.3rem 0;
		border-bottom: 1px solid var(--rule-soft);
	}
	th {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ink-2);
		font-weight: 400;
	}
	input[type='checkbox'] {
		width: 1.5rem;
		height: 1.5rem;
		margin: 0.5rem 0;
		accent-color: var(--signal);
		cursor: pointer;
	}
	.special {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.8125rem;
		cursor: pointer;
	}
	.strong {
		font-weight: 700;
		font-size: 1.125rem;
	}
	.explain {
		margin: 1rem 0;
		padding-left: 1.1rem;
	}
	.warn {
		color: var(--signal);
	}
	.section-h {
		margin: 2rem 0 0.75rem;
		border-top: 2px solid var(--rule);
		padding-top: 0.5rem;
	}
	.apply {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: end;
		margin-bottom: 0.75rem;
	}
	.grow {
		flex: 1 1 14rem;
	}
	.umask {
		max-width: 12rem;
		margin-bottom: 1rem;
	}
	.readout {
		margin-bottom: 1rem;
	}
	.error {
		margin-bottom: 0.75rem;
	}
</style>
