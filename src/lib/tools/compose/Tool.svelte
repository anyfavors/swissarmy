<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from '#lib/ui/Copy.svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import { composeToRun, runToCompose, type Note } from './logic';

	const RUN_SAMPLE = `docker run -d --name web --restart unless-stopped \\
  -p 8080:80 \\
  -v ./html:/usr/share/nginx/html:ro \\
  -e TZ=Europe/Oslo \\
  --health-cmd "curl -fs http://localhost/ || exit 1" --health-interval 30s \\
  nginx:1.27`;

	const COMPOSE_SAMPLE = `services:
  db:
    image: postgres:16
    restart: always
    environment:
      POSTGRES_DB: app
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "127.0.0.1:5432:5432"
volumes:
  pgdata:
`;

	type Dir = 'run' | 'compose';
	let dir = $state<Dir>('run');
	let runText = $state(RUN_SAMPLE);
	let composeText = $state(COMPOSE_SAMPLE);
	let pick = $state('');
	let ready = false;

	const out = $derived.by(
		(): {
			text?: string;
			label?: string;
			notes?: Note[];
			services?: string[];
			service?: string;
			error?: string;
		} | null => {
			try {
				if (dir === 'run') {
					if (!runText.trim()) return null;
					const r = runToCompose(runText);
					return { text: r.yaml, label: 'compose.yaml', notes: r.notes };
				}
				if (!composeText.trim()) return null;
				const r = composeToRun(composeText, pick || undefined);
				return {
					text: r.command,
					label: 'docker run',
					notes: r.notes,
					services: r.services,
					service: r.service
				};
			} catch (e) {
				return { error: (e as Error).message };
			}
		}
	);

	const unsupported = $derived(out?.notes?.filter((n) => n.level === 'unsupported') ?? []);
	const info = $derived(out?.notes?.filter((n) => n.level === 'info') ?? []);

	onMount(() => {
		const h = readHash();
		if (h.d === 'compose') dir = 'compose';
		if (h.in) {
			if (/^\s*(?:sudo\s+)?(?:docker|podman|nerdctl)\s/.test(h.in)) {
				runText = h.in;
				dir = 'run';
			} else {
				composeText = h.in;
				dir = 'compose';
			}
		}
		ready = true;
	});

	// Commands and Compose files often carry passwords in -e, so only the direction is kept.
	$effect(() => {
		const state = { d: dir === 'compose' ? 'compose' : undefined };
		if (ready) writeHash(state);
	});
</script>

<div class="row modes" role="group" aria-label="Direction">
	<button type="button" aria-pressed={dir === 'run'} onclick={() => (dir = 'run')}
		>docker run to Compose</button
	>
	<button type="button" aria-pressed={dir === 'compose'} onclick={() => (dir = 'compose')}
		>Compose to docker run</button
	>
</div>

{#if dir === 'run'}
	<div class="field">
		<label class="label" for="cp-run">docker run command</label>
		<textarea id="cp-run" bind:value={runText} spellcheck="false" autocapitalize="off"></textarea>
	</div>
{:else}
	<div class="field">
		<label class="label" for="cp-yaml">compose.yaml, or one service</label>
		<textarea
			id="cp-yaml"
			class="tall"
			bind:value={composeText}
			spellcheck="false"
			autocapitalize="off"></textarea>
	</div>
	{#if out?.services && out.services.length > 1}
		<div class="field pick">
			<label class="label" for="cp-svc">Service</label>
			<select id="cp-svc" bind:value={pick}>
				<option value="">{out.services[0]} (first)</option>
				{#each out.services.slice(1) as s (s)}
					<option value={s}>{s}</option>
				{/each}
			</select>
		</div>
	{/if}
{/if}

{#if out?.error}
	<p class="error" role="alert">{out.error}</p>
{:else if out?.text}
	<div class="result">
		<div class="row head">
			<span class="label">{out.label}{out.service ? `, service ${out.service}` : ''}</span>
			<Copy value={out.text} />
		</div>
		<pre>{out.text}</pre>
	</div>
	{#if unsupported.length}
		<div class="notes">
			<h2 class="label">Not converted</h2>
			<ul class="unsupported">
				{#each unsupported as n, i (i)}<li>{n.text}</li>{/each}
			</ul>
		</div>
	{/if}
	{#if info.length}
		<div class="notes">
			<h2 class="label">Notes</h2>
			<ul>
				{#each info as n, i (i)}<li>{n.text}</li>{/each}
			</ul>
		</div>
	{/if}
{/if}

<p class="note">
	Values are never expanded: $VAR stays as written. Commands and Compose files are not saved in the
	address bar because -e often carries passwords. Compose names networks and volumes after the
	project unless they are external, and only runs containers in the background with docker compose
	up -d.
</p>

<style>
	.modes {
		margin-bottom: 1.25rem;
	}
	textarea {
		min-height: 10rem;
	}
	.tall {
		min-height: 14rem;
	}
	.pick {
		max-width: 20rem;
		margin-top: 0.75rem;
	}
	.result {
		margin: 1.25rem 0;
		border-top: 2px solid var(--rule);
	}
	.head {
		justify-content: space-between;
		padding: 0.35rem 0;
		border-bottom: 1px solid var(--rule-soft);
	}
	pre {
		margin: 0;
		padding: 0.75rem;
		background: var(--field);
		border-bottom: 1px solid var(--rule-soft);
		font-size: 0.875rem;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.notes {
		margin-bottom: 1.25rem;
	}
	.notes h2 {
		margin: 0 0 0.35rem;
		font-weight: 400;
	}
	ul {
		margin: 0;
		padding: 0 0 0 1.1rem;
		font-size: 0.9375rem;
		overflow-wrap: anywhere;
	}
	li {
		margin-bottom: 0.25rem;
	}
	.unsupported li::marker {
		color: var(--signal);
	}
	.error {
		margin: 1rem 0;
	}
	.note {
		margin: 0 0 1rem;
	}
</style>
