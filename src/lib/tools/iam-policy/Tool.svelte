<script lang="ts">
	import { onMount } from 'svelte';
	import { readHash, writeHash } from '#lib/util/hash.ts';
	import {
		azureAllows,
		describeAzureAction,
		describeScope,
		evaluate,
		explain,
		type AzurePermission,
		type Explained,
		type Finding
	} from './logic';

	const blocks = (p: AzurePermission) => [
		{ label: 'Actions', list: p.actions },
		{ label: 'NotActions', list: p.notActions },
		{ label: 'DataActions', list: p.dataActions },
		{ label: 'NotDataActions', list: p.notDataActions }
	];

	const SAMPLE = `{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadReports",
      "Effect": "Allow",
      "Action": ["s3:Get*", "s3:ListBucket"],
      "Resource": ["arn:aws:s3:::reports", "arn:aws:s3:::reports/*"]
    },
    {
      "Sid": "DenyWithoutTls",
      "Effect": "Deny",
      "Action": "s3:*",
      "Resource": "*",
      "Condition": { "Bool": { "aws:SecureTransport": "false" } }
    },
    {
      "Sid": "Deploy",
      "Effect": "Allow",
      "Action": ["lambda:UpdateFunctionCode", "iam:PassRole"],
      "Resource": "*"
    }
  ]
}`;

	let text = $state(SAMPLE);
	let action = $state('s3:GetObject');
	let resource = $state('arn:aws:s3:::reports/2026/q3.csv');
	let azAction = $state('Microsoft.Compute/virtualMachines/start/action');
	let azData = $state(false);
	let ready = false;

	const result = $derived.by((): { r?: Explained; error?: string } | null => {
		if (!text.trim()) return null;
		try {
			return { r: explain(text) };
		} catch (e) {
			return { error: (e as Error).message };
		}
	});

	const evaluation = $derived.by(() => {
		const r = result?.r;
		if (!r || r.kind !== 'aws' || !action.trim() || !resource.trim()) return null;
		return evaluate(r, action.trim(), resource.trim());
	});

	const azResult = $derived.by(() => {
		const r = result?.r;
		if (!r || r.kind !== 'azure' || !azAction.trim()) return null;
		return azureAllows(r, azAction.trim(), azData);
	});

	const levelName: Record<Finding['level'], string> = {
		high: 'Risk',
		medium: 'Check',
		info: 'Note'
	};

	onMount(() => {
		const h = readHash();
		if (h.a) action = h.a;
		if (h.in) text = h.in;
		ready = true;
	});

	// Policies name accounts, roles and buckets, so only the action under test is kept.
	$effect(() => {
		const state = { a: action !== 's3:GetObject' ? action : undefined };
		if (ready) writeHash(state);
	});
</script>

{#snippet findings(list: Finding[])}
	{#each list as f, i (i)}
		<p class="finding {f.level}"><span class="tag">{levelName[f.level]}</span>{f.text}</p>
	{/each}
{/snippet}

<div class="field">
	<label class="label" for="iam-in">AWS IAM policy or Azure role definition, JSON</label>
	<textarea id="iam-in" class="tall" bind:value={text} spellcheck="false" autocapitalize="off"
	></textarea>
</div>

{#if result?.error}
	<p class="error" role="alert">{result.error}</p>
{:else if result?.r?.kind === 'aws'}
	{@const p = result.r}
	<p class="kind label">
		AWS IAM policy, {p.statements.length} statement{p.statements.length === 1 ? '' : 's'}{p.version
			? `, version ${p.version}`
			: ''}
	</p>
	{@render findings(p.findings)}

	<section class="eval" aria-labelledby="iam-eval-h">
		<h2 id="iam-eval-h" class="label">Test a request</h2>
		<div class="inputs">
			<div class="field">
				<label class="label" for="iam-a">Action</label>
				<input
					id="iam-a"
					type="text"
					bind:value={action}
					spellcheck="false"
					autocomplete="off"
					autocapitalize="off"
				/>
			</div>
			<div class="field">
				<label class="label" for="iam-r">Resource ARN</label>
				<input
					id="iam-r"
					type="text"
					bind:value={resource}
					spellcheck="false"
					autocomplete="off"
					autocapitalize="off"
				/>
			</div>
		</div>
		{#if evaluation}
			<p class="verdict" class:deny={evaluation.decision !== 'allow'} aria-live="polite">
				<strong
					>{evaluation.decision === 'allow'
						? 'Allow'
						: evaluation.decision === 'explicit-deny'
							? 'Explicit deny'
							: 'Implicit deny'}{evaluation.conditional ? ', conditional' : ''}</strong
				>
				<span class="why">{evaluation.text}</span>
			</p>
			{#if evaluation.matches.length}
				<p class="matched">
					Matching statements: {evaluation.matches
						.map(
							(m) =>
								`${m.index + 1}${m.sid ? ` (${m.sid})` : ''} ${m.effect}${m.conditional ? ' if conditions hold' : ''}`
						)
						.join('; ')}
				</p>
			{/if}
		{/if}
	</section>

	{#each p.statements as s (s.index)}
		<section class="stmt" aria-label="Statement {s.index + 1}">
			<h2 class="shead">
				<span class="label">Statement {s.index + 1}</span>
				{#if s.sid}<span class="sid">{s.sid}</span>{/if}
				<span class="effect" class:deny={s.effect !== 'Allow'}>{s.effect || 'no Effect'}</span>
			</h2>
			<ul>
				{#each s.lines as l, i (i)}<li>{l}</li>{/each}
			</ul>
			{@render findings(s.findings)}
		</section>
	{/each}
{:else if result?.r?.kind === 'azure'}
	{@const r = result.r}
	<p class="kind label">
		Azure role definition{r.name ? `: ${r.name}` : ''}{r.custom === true
			? ', custom'
			: r.custom === false
				? ', built-in'
				: ''}
	</p>
	{#if r.description}<p class="desc">{r.description}</p>{/if}
	{@render findings(r.findings)}

	<section class="eval" aria-labelledby="iam-az-h">
		<h2 id="iam-az-h" class="label">Test an operation</h2>
		<div class="field">
			<label class="label" for="iam-az">Operation</label>
			<input
				id="iam-az"
				type="text"
				bind:value={azAction}
				spellcheck="false"
				autocomplete="off"
				autocapitalize="off"
			/>
		</div>
		<div class="row plane" role="group" aria-label="Plane">
			<button type="button" aria-pressed={!azData} onclick={() => (azData = false)}
				>Control plane</button
			>
			<button type="button" aria-pressed={azData} onclick={() => (azData = true)}>Data plane</button
			>
		</div>
		{#if azResult !== null}
			<p class="verdict" class:deny={!azResult} aria-live="polite">
				<strong>{azResult ? 'Granted by this role' : 'Not granted by this role'}</strong>
				<span class="why"
					>{azData ? 'DataActions minus NotDataActions' : 'Actions minus NotActions'},
					case-insensitive</span
				>
			</p>
		{/if}
	</section>

	{#each r.permissions as p, i (i)}
		<section class="stmt" aria-label="Permission block {i + 1}">
			{#each blocks(p) as b (b.label)}
				{#if b.list.length}
					<h2 class="shead"><span class="label">{b.label}</span></h2>
					<ul>
						{#each b.list as a, j (j)}
							<li><code>{a}</code>: {describeAzureAction(a)}</li>
						{/each}
					</ul>
				{/if}
			{/each}
		</section>
	{/each}
	{#if r.scopes.length}
		<section class="stmt" aria-label="Assignable scopes">
			<h2 class="shead"><span class="label">Assignable scopes</span></h2>
			<ul>
				{#each r.scopes as s, i (i)}<li><code>{s}</code>: {describeScope(s)}</li>{/each}
			</ul>
		</section>
	{/if}
{/if}

<p class="note">
	AWS: a request is allowed only if some statement allows it and none denies it. This tester looks
	at one policy and does not evaluate conditions, principals, SCPs, permission boundaries or session
	policies. Wildcards are described, never expanded to the list of actions. Azure: access is the
	union of all role assignments, minus deny assignments.
</p>

<style>
	.tall {
		min-height: 16rem;
	}
	.kind {
		margin: 1.25rem 0 0.75rem;
	}
	.desc {
		margin: 0 0 0.75rem;
	}
	.finding {
		margin: 0 0 0.5rem;
		padding: 0.35rem 0.6rem;
		border-left: 4px solid var(--rule-soft);
		font-size: 0.9375rem;
		overflow-wrap: anywhere;
	}
	.finding.high {
		border-left-color: var(--signal);
		background: var(--hilite);
	}
	.finding.medium {
		border-left-color: var(--rule);
	}
	.tag {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		margin-right: 0.5rem;
		color: var(--ink-2);
	}
	.high .tag {
		color: var(--signal);
		font-weight: 700;
	}
	.eval {
		margin: 1.25rem 0 1.5rem;
		padding-top: 0.5rem;
		border-top: 2px solid var(--rule);
	}
	.eval h2 {
		margin: 0 0 0.5rem;
		font-weight: 400;
	}
	.inputs {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
		gap: 0.75rem;
	}
	.plane {
		margin-top: 0.75rem;
	}
	.verdict {
		margin: 0.75rem 0 0.5rem;
		padding: 0.5rem 0.75rem;
		border-left: 4px solid var(--rule);
		font-size: 1.125rem;
	}
	.verdict.deny {
		border-left-color: var(--signal);
		background: var(--hilite);
	}
	.why {
		display: block;
		font-size: 0.875rem;
		color: var(--ink-2);
	}
	.matched {
		margin: 0;
		font-size: 0.875rem;
		overflow-wrap: anywhere;
	}
	.stmt {
		margin-bottom: 1.25rem;
		border-top: 1px solid var(--rule);
		padding-top: 0.5rem;
	}
	.shead {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.75rem;
		align-items: baseline;
		margin: 0 0 0.4rem;
		font-size: 1rem;
		font-weight: 400;
	}
	.sid {
		font-family: var(--font-mono);
		font-weight: 700;
		overflow-wrap: anywhere;
	}
	.effect {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		border: 1px solid var(--rule);
		padding: 0 0.4rem;
	}
	.effect.deny {
		color: var(--signal);
		border-color: var(--signal);
	}
	ul {
		margin: 0 0 0.5rem;
		padding-left: 1.1rem;
		font-size: 0.9375rem;
		overflow-wrap: anywhere;
	}
	li {
		margin-bottom: 0.25rem;
	}
	.error {
		margin: 1rem 0;
	}
	.note {
		margin: 1rem 0;
	}
</style>
