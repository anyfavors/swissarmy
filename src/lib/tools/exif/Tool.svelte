<script lang="ts">
	import { onDestroy } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import {
		camera,
		display,
		gps,
		orientation,
		osmLink,
		privacy,
		readImage,
		stripMetadata,
		type ImageInfo
	} from './logic';

	let name = $state('');
	let size = $state(0);
	let info = $state<ImageInfo | null>(null);
	let error = $state('');
	let preview = $state('');
	let cleanUrl = $state('');
	let cleanSize = $state(0);
	let dragging = $state(false);
	let bytes: Uint8Array | null = null;

	const findings = $derived(info ? privacy(info) : []);
	const where = $derived(info ? gps(info.exif) : null);
	const cam = $derived(info ? camera(info.exif) : []);
	const orient = $derived(info ? orientation(info.exif) : 1);
	const mime: Record<string, string> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

	function revoke() {
		if (preview) URL.revokeObjectURL(preview);
		if (cleanUrl) URL.revokeObjectURL(cleanUrl);
		preview = '';
		cleanUrl = '';
	}

	async function load(file: File) {
		revoke();
		info = null;
		error = '';
		name = file.name;
		size = file.size;
		try {
			bytes = new Uint8Array(await file.arrayBuffer());
			info = readImage(bytes);
			preview = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime[info.format] }));
		} catch (e) {
			error = (e as Error).message;
			bytes = null;
		}
	}

	function onPick(e: Event) {
		const f = (e.currentTarget as HTMLInputElement).files?.[0];
		if (f) load(f);
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		const f = e.dataTransfer?.files?.[0];
		if (f) load(f);
	}

	function strip() {
		if (!bytes || !info) return;
		try {
			const out = stripMetadata(bytes);
			if (cleanUrl) URL.revokeObjectURL(cleanUrl);
			cleanUrl = URL.createObjectURL(new Blob([out as BlobPart], { type: mime[info.format] }));
			cleanSize = out.length;
		} catch (e) {
			error = (e as Error).message;
		}
	}

	const cleanName = $derived(name.replace(/(\.[^.]+)?$/, (ext) => `-clean${ext || '.jpg'}`));
	const kb = (n: number) => (n < 10240 ? `${n} bytes` : `${(n / 1024).toFixed(1)} KiB`);

	onDestroy(revoke);
</script>

<label
	class="drop"
	class:dragging
	ondragover={(e) => {
		e.preventDefault();
		dragging = true;
	}}
	ondragleave={() => (dragging = false)}
	ondrop={onDrop}
>
	<span class="label">Image file: JPEG, PNG or WebP</span>
	<span class="hint">Drop a file here or choose one</span>
	<input
		type="file"
		accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
		onchange={onPick}
	/>
</label>
<p class="note">
	The file is read on this device. Nothing is uploaded, and nothing goes into the link.
</p>

{#if error}<p class="error" role="alert">{error}</p>{/if}

{#if info}
	<div class="top">
		{#if preview}<img src={preview} alt="Preview of {name}" class="preview" />{/if}
		<dl class="readout">
			<div>
				<dt>File</dt>
				<dd>{name}</dd>
			</div>
			<div>
				<dt>Format</dt>
				<dd>{info.format.toUpperCase()}, {kb(size)}</dd>
			</div>
			{#if info.width}
				<div>
					<dt>Pixels</dt>
					<dd>{info.width} x {info.height}</dd>
				</div>
			{/if}
			<div>
				<dt>Colour profile</dt>
				<dd>{info.icc ? 'Embedded ICC profile (kept when stripping)' : 'None'}</dd>
			</div>
		</dl>
	</div>

	<h2 class="label section-h">Privacy summary</h2>
	{#if findings.length}
		<ul class="findings">
			{#each findings as f (f.text)}<li class={f.level}>{f.text}</li>{/each}
		</ul>
	{:else}
		<p class="note">No metadata found that identifies a place, a person or a device.</p>
	{/if}

	{#if where}
		<h2 class="label section-h">Location</h2>
		<dl class="readout">
			<div>
				<dt>Latitude, longitude</dt>
				<dd>{where.lat.toFixed(6)}, {where.lon.toFixed(6)}</dd>
				<Copy value="{where.lat.toFixed(6)}, {where.lon.toFixed(6)}" />
			</div>
			{#if where.alt !== undefined}
				<div>
					<dt>Altitude</dt>
					<dd>{where.alt.toFixed(1)} m</dd>
				</div>
			{/if}
			{#if where.time}
				<div>
					<dt>GPS time</dt>
					<dd>{where.time}</dd>
				</div>
			{/if}
		</dl>
		<p class="note">
			<a href={osmLink(where)} rel="noreferrer noopener" target="_blank">Open in OpenStreetMap</a>.
			Nothing is loaded unless you click; the link sends the coordinates to openstreetmap.org.
		</p>
	{/if}

	{#if cam.length}
		<h2 class="label section-h">Camera and exposure</h2>
		<dl class="readout">
			{#each cam as r (r.label)}
				<div>
					<dt>{r.label}</dt>
					<dd>{r.value}</dd>
				</div>
			{/each}
		</dl>
	{/if}

	{#if info.exifError}<p class="error" role="alert">Exif block unreadable: {info.exifError}</p>{/if}
	{#each info.warnings as w (w)}<p class="note">{w}</p>{/each}

	{#if info.text.length || info.comments.length}
		<h2 class="label section-h">Text fields</h2>
		<dl class="readout">
			{#each info.comments as c, i (i)}
				<div>
					<dt>Comment</dt>
					<dd>{c}</dd>
				</div>
			{/each}
			{#each info.text as t, i (i)}
				<div>
					<dt>{t.keyword}</dt>
					<dd>{t.text.length > 500 ? t.text.slice(0, 500) + ' …' : t.text}</dd>
				</div>
			{/each}
		</dl>
	{/if}

	{#if info.exif?.tags.length}
		<details class="all">
			<summary class="label">All {info.exif.tags.length} Exif tags</summary>
			<div class="scroll">
				<table>
					<thead>
						<tr>
							<th scope="col">IFD</th>
							<th scope="col">Tag</th>
							<th scope="col">Value</th>
						</tr>
					</thead>
					<tbody>
						{#each info.exif.tags as t, i (i)}
							<tr>
								<td class="mono dim">{t.ifd}</td>
								<th scope="row" class="mono">{t.name}</th>
								<td class="mono">{display(t)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</details>
	{/if}

	{#if info.xmp}
		<details class="all">
			<summary class="label">XMP packet ({info.xmp.length} characters)</summary>
			<pre>{info.xmp.length > 20000 ? info.xmp.slice(0, 20000) + '\n…' : info.xmp}</pre>
		</details>
	{/if}

	<h2 class="label section-h">Strip metadata</h2>
	{#if info.removable.length}
		<p class="note">
			Removes {info.removable.map((r) => r.name).join(', ')}. The image data is copied unchanged,
			not re-compressed{info.icc ? ', and the colour profile stays' : ''}.
		</p>
		{#if orient !== 1}
			<p class="note warn">
				This image relies on the Exif orientation flag ({orient}). Without it, viewers show the raw
				pixels, so the cleaned copy may appear rotated or mirrored.
			</p>
		{/if}
		<div class="row">
			<button type="button" onclick={strip}>Strip metadata</button>
			{#if cleanUrl}
				<a class="btn" href={cleanUrl} download={cleanName}>Download {cleanName}</a>
				<span class="label">{kb(size)} to {kb(cleanSize)}</span>
			{/if}
		</div>
	{:else}
		<p class="note">There is no Exif, XMP, IPTC, comment or text block to remove.</p>
	{/if}
{/if}

<style>
	.drop {
		display: grid;
		gap: 0.4rem;
		padding: 1.25rem;
		border: 2px dashed var(--rule-soft);
		background: var(--field);
		cursor: pointer;
		margin-bottom: 0.75rem;
	}
	.drop.dragging {
		border-color: var(--signal);
		background: var(--hilite);
	}
	.hint {
		color: var(--ink-2);
	}
	.drop input {
		font: inherit;
		font-size: 0.875rem;
		max-width: 100%;
	}
	.note {
		margin: 0.5rem 0;
	}
	.warn {
		border-left-color: var(--signal);
		color: var(--ink);
	}
	.top {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
		gap: 1.25rem;
		align-items: start;
		margin: 1.25rem 0;
	}
	.preview {
		display: block;
		max-width: 100%;
		max-height: 20rem;
		height: auto;
		border: 1px solid var(--rule);
		image-orientation: from-image;
	}
	.section-h {
		margin: 1.75rem 0 0.6rem;
		border-top: 2px solid var(--rule);
		padding-top: 0.5rem;
	}
	.findings {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 0.4rem;
	}
	.findings li {
		border-left: 3px solid var(--rule-soft);
		padding: 0.2rem 0 0.2rem 0.6rem;
		color: var(--ink-2);
		overflow-wrap: anywhere;
	}
	.findings .warn {
		border-left-color: var(--signal);
		color: var(--ink);
	}
	.findings .danger {
		border-left-color: var(--signal);
		color: var(--signal);
		font-weight: 700;
	}
	.all {
		margin: 1.25rem 0;
	}
	.all summary {
		cursor: pointer;
		min-height: 2.75rem;
		display: flex;
		align-items: center;
	}
	.scroll {
		overflow-x: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		border-top: 2px solid var(--rule);
		font-size: 0.875rem;
	}
	th,
	td {
		text-align: left;
		padding: 0.35rem 0.75rem 0.35rem 0;
		border-bottom: 1px solid var(--rule-soft);
		vertical-align: top;
		overflow-wrap: anywhere;
	}
	thead th {
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-2);
		font-weight: 400;
		font-family: var(--font-mono);
	}
	th[scope='row'] {
		font-weight: 400;
	}
	.dim {
		color: var(--ink-2);
	}
	pre {
		margin: 0.5rem 0 0;
		padding: 0.65rem 0.75rem;
		background: var(--field);
		border: 1px solid var(--rule);
		font-size: 0.8125rem;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		max-height: 24rem;
		overflow-y: auto;
	}
</style>
