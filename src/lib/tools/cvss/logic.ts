/**
 * CVSS v3.1 scoring: FIRST, "Common Vulnerability Scoring System v3.1: Specification Document",
 * section 7 (equations), 7.4 (metric values) and appendix A (Roundup).
 * https://www.first.org/cvss/v3.1/specification-document
 *
 * CVSS v4.0 vectors are parsed and explained only. v4.0 scores come from the MacroVector lookup
 * table and interpolation in the v4.0 specification; that is not implemented here.
 */

export type Version = '3.0' | '3.1' | '4.0';

export interface MetricDef {
	key: string;
	name: string;
	group: string;
	/** Value letter -> label. For optional metrics the first entry is X (Not Defined). */
	values: Record<string, string>;
	/** One sentence on what the metric means. */
	help: string;
}

// ---------------------------------------------------------------- v3.1 definitions

const CIA = { H: 'High', L: 'Low', N: 'None' };
const X = { X: 'Not Defined' };
const REQ = { ...X, H: 'High', M: 'Medium', L: 'Low' };

export const v3Metrics: MetricDef[] = [
	{
		key: 'AV',
		name: 'Attack Vector',
		group: 'Base',
		values: { N: 'Network', A: 'Adjacent', L: 'Local', P: 'Physical' },
		help: 'How remote the attacker can be.'
	},
	{
		key: 'AC',
		name: 'Attack Complexity',
		group: 'Base',
		values: { L: 'Low', H: 'High' },
		help: "Conditions beyond the attacker's control that must exist."
	},
	{
		key: 'PR',
		name: 'Privileges Required',
		group: 'Base',
		values: { N: 'None', L: 'Low', H: 'High' },
		help: 'Privileges the attacker needs before the attack.'
	},
	{
		key: 'UI',
		name: 'User Interaction',
		group: 'Base',
		values: { N: 'None', R: 'Required' },
		help: 'Whether a user other than the attacker must take part.'
	},
	{
		key: 'S',
		name: 'Scope',
		group: 'Base',
		values: { U: 'Unchanged', C: 'Changed' },
		help: "Whether the impact reaches beyond the vulnerable component's security authority."
	},
	{
		key: 'C',
		name: 'Confidentiality',
		group: 'Base',
		values: CIA,
		help: 'Impact on confidentiality.'
	},
	{ key: 'I', name: 'Integrity', group: 'Base', values: CIA, help: 'Impact on integrity.' },
	{ key: 'A', name: 'Availability', group: 'Base', values: CIA, help: 'Impact on availability.' },
	{
		key: 'E',
		name: 'Exploit Code Maturity',
		group: 'Temporal',
		values: { ...X, H: 'High', F: 'Functional', P: 'Proof-of-Concept', U: 'Unproven' },
		help: 'How mature the available exploit is.'
	},
	{
		key: 'RL',
		name: 'Remediation Level',
		group: 'Temporal',
		values: { ...X, U: 'Unavailable', W: 'Workaround', T: 'Temporary Fix', O: 'Official Fix' },
		help: 'What fix exists.'
	},
	{
		key: 'RC',
		name: 'Report Confidence',
		group: 'Temporal',
		values: { ...X, C: 'Confirmed', R: 'Reasonable', U: 'Unknown' },
		help: 'How certain the existence and details of the vulnerability are.'
	},
	{
		key: 'CR',
		name: 'Confidentiality Requirement',
		group: 'Environmental',
		values: REQ,
		help: 'How much confidentiality matters for this asset.'
	},
	{
		key: 'IR',
		name: 'Integrity Requirement',
		group: 'Environmental',
		values: REQ,
		help: 'How much integrity matters for this asset.'
	},
	{
		key: 'AR',
		name: 'Availability Requirement',
		group: 'Environmental',
		values: REQ,
		help: 'How much availability matters for this asset.'
	},
	{
		key: 'MAV',
		name: 'Modified Attack Vector',
		group: 'Environmental',
		values: { ...X, N: 'Network', A: 'Adjacent', L: 'Local', P: 'Physical' },
		help: 'Attack Vector in your environment.'
	},
	{
		key: 'MAC',
		name: 'Modified Attack Complexity',
		group: 'Environmental',
		values: { ...X, L: 'Low', H: 'High' },
		help: 'Attack Complexity in your environment.'
	},
	{
		key: 'MPR',
		name: 'Modified Privileges Required',
		group: 'Environmental',
		values: { ...X, N: 'None', L: 'Low', H: 'High' },
		help: 'Privileges Required in your environment.'
	},
	{
		key: 'MUI',
		name: 'Modified User Interaction',
		group: 'Environmental',
		values: { ...X, N: 'None', R: 'Required' },
		help: 'User Interaction in your environment.'
	},
	{
		key: 'MS',
		name: 'Modified Scope',
		group: 'Environmental',
		values: { ...X, U: 'Unchanged', C: 'Changed' },
		help: 'Scope in your environment.'
	},
	{
		key: 'MC',
		name: 'Modified Confidentiality',
		group: 'Environmental',
		values: { ...X, ...CIA },
		help: 'Confidentiality impact in your environment.'
	},
	{
		key: 'MI',
		name: 'Modified Integrity',
		group: 'Environmental',
		values: { ...X, ...CIA },
		help: 'Integrity impact in your environment.'
	},
	{
		key: 'MA',
		name: 'Modified Availability',
		group: 'Environmental',
		values: { ...X, ...CIA },
		help: 'Availability impact in your environment.'
	}
];

export const v3BaseKeys = ['AV', 'AC', 'PR', 'UI', 'S', 'C', 'I', 'A'];

// Section 7.4, table 16.
const W = {
	AV: { N: 0.85, A: 0.62, L: 0.55, P: 0.2 },
	AC: { L: 0.77, H: 0.44 },
	UI: { N: 0.85, R: 0.62 },
	CIA: { H: 0.56, L: 0.22, N: 0 },
	E: { X: 1, H: 1, F: 0.97, P: 0.94, U: 0.91 },
	RL: { X: 1, U: 1, W: 0.97, T: 0.96, O: 0.95 },
	RC: { X: 1, C: 1, R: 0.96, U: 0.92 },
	REQ: { X: 1, H: 1.5, M: 1, L: 0.5 }
} as const;

/** Privileges Required depends on Scope. */
function prWeight(pr: string, scopeChanged: boolean): number {
	if (pr === 'N') return 0.85;
	if (pr === 'L') return scopeChanged ? 0.68 : 0.62;
	if (pr === 'H') return scopeChanged ? 0.5 : 0.27;
	throw new Error(`Bad PR value ${pr}`);
}

/**
 * CVSS v3.1 appendix A: round up to one decimal, done in integers so that floating point noise
 * (e.g. 4.000000000000001) does not bump the result to the next tenth.
 */
export function roundup(input: number): number {
	const intInput = Math.round(input * 100000);
	if (intInput % 10000 === 0) return intInput / 100000;
	return (Math.floor(intInput / 10000) + 1) / 10;
}

export type Severity = 'None' | 'Low' | 'Medium' | 'High' | 'Critical';

/** Section 5, table 14 (same bands in v4.0). */
export function severity(score: number): Severity {
	if (score === 0) return 'None';
	if (score < 4) return 'Low';
	if (score < 7) return 'Medium';
	if (score < 9) return 'High';
	return 'Critical';
}

export interface V3Scores {
	base: number;
	impact: number;
	exploitability: number;
	temporal: number;
	environmental: number;
	modifiedImpact: number;
	modifiedExploitability: number;
}

type Values = Record<string, string>;

const w = <T extends Record<string, number>>(table: T, v: string, metric: string): number => {
	const x = (table as Record<string, number>)[v];
	if (x === undefined) throw new Error(`Bad ${metric} value ${v}`);
	return x;
};

/** Value of a modified metric, falling back to the base metric when Not Defined. */
const mod = (m: Values, key: string) =>
	m[`M${key}`] && m[`M${key}`] !== 'X' ? m[`M${key}`] : m[key];

export function scoreV3(m: Values): V3Scores {
	for (const k of v3BaseKeys) if (!m[k]) throw new Error(`Missing base metric ${k}`);
	const t = (k: string) => m[k] ?? 'X';

	// Base (7.1)
	const changed = m.S === 'C';
	const iss = 1 - (1 - w(W.CIA, m.C, 'C')) * (1 - w(W.CIA, m.I, 'I')) * (1 - w(W.CIA, m.A, 'A'));
	const impact = changed ? 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15) : 6.42 * iss;
	const exploitability =
		8.22 *
		w(W.AV, m.AV, 'AV') *
		w(W.AC, m.AC, 'AC') *
		prWeight(m.PR, changed) *
		w(W.UI, m.UI, 'UI');
	let base: number;
	if (impact <= 0) base = 0;
	else if (changed) base = roundup(Math.min(1.08 * (impact + exploitability), 10));
	else base = roundup(Math.min(impact + exploitability, 10));

	// Temporal (7.2)
	const tmul = w(W.E, t('E'), 'E') * w(W.RL, t('RL'), 'RL') * w(W.RC, t('RC'), 'RC');
	const temporal = roundup(base * tmul);

	// Environmental (7.3)
	const ms = mod(m, 'S');
	const mChanged = ms === 'C';
	const miss = Math.min(
		1 -
			(1 - w(W.REQ, t('CR'), 'CR') * w(W.CIA, mod(m, 'C'), 'MC')) *
				(1 - w(W.REQ, t('IR'), 'IR') * w(W.CIA, mod(m, 'I'), 'MI')) *
				(1 - w(W.REQ, t('AR'), 'AR') * w(W.CIA, mod(m, 'A'), 'MA')),
		0.915
	);
	const modifiedImpact = mChanged
		? 7.52 * (miss - 0.029) - 3.25 * Math.pow(miss * 0.9731 - 0.02, 13)
		: 6.42 * miss;
	const modifiedExploitability =
		8.22 *
		w(W.AV, mod(m, 'AV'), 'MAV') *
		w(W.AC, mod(m, 'AC'), 'MAC') *
		prWeight(mod(m, 'PR'), mChanged) *
		w(W.UI, mod(m, 'UI'), 'MUI');
	let environmental: number;
	if (modifiedImpact <= 0) environmental = 0;
	else if (mChanged)
		environmental = roundup(
			roundup(Math.min(1.08 * (modifiedImpact + modifiedExploitability), 10)) * tmul
		);
	else
		environmental = roundup(roundup(Math.min(modifiedImpact + modifiedExploitability, 10)) * tmul);

	return {
		base,
		impact,
		exploitability,
		temporal,
		environmental,
		modifiedImpact,
		modifiedExploitability
	};
}

// ---------------------------------------------------------------- v4.0 definitions (explain only)

const v4cia = { H: 'High', L: 'Low', N: 'None' };

export const v4Metrics: MetricDef[] = [
	{
		key: 'AV',
		name: 'Attack Vector',
		group: 'Base: exploitability',
		values: { N: 'Network', A: 'Adjacent', L: 'Local', P: 'Physical' },
		help: 'How remote the attacker can be.'
	},
	{
		key: 'AC',
		name: 'Attack Complexity',
		group: 'Base: exploitability',
		values: { L: 'Low', H: 'High' },
		help: 'Whether the attacker must defeat security-enhancing conditions such as ASLR.'
	},
	{
		key: 'AT',
		name: 'Attack Requirements',
		group: 'Base: exploitability',
		values: { N: 'None', P: 'Present' },
		help: 'Deployment or execution conditions of the target that must hold (new in v4.0, partly the old AC).'
	},
	{
		key: 'PR',
		name: 'Privileges Required',
		group: 'Base: exploitability',
		values: { N: 'None', L: 'Low', H: 'High' },
		help: 'Privileges the attacker needs before the attack.'
	},
	{
		key: 'UI',
		name: 'User Interaction',
		group: 'Base: exploitability',
		values: { N: 'None', P: 'Passive', A: 'Active' },
		help: 'Whether a human user must take part, passively or by a deliberate action.'
	},
	{
		key: 'VC',
		name: 'Vulnerable System Confidentiality',
		group: 'Base: vulnerable system impact',
		values: v4cia,
		help: 'Confidentiality impact on the vulnerable system itself.'
	},
	{
		key: 'VI',
		name: 'Vulnerable System Integrity',
		group: 'Base: vulnerable system impact',
		values: v4cia,
		help: 'Integrity impact on the vulnerable system itself.'
	},
	{
		key: 'VA',
		name: 'Vulnerable System Availability',
		group: 'Base: vulnerable system impact',
		values: v4cia,
		help: 'Availability impact on the vulnerable system itself.'
	},
	{
		key: 'SC',
		name: 'Subsequent System Confidentiality',
		group: 'Base: subsequent system impact',
		values: v4cia,
		help: 'Confidentiality impact on other systems (replaces Scope).'
	},
	{
		key: 'SI',
		name: 'Subsequent System Integrity',
		group: 'Base: subsequent system impact',
		values: v4cia,
		help: 'Integrity impact on other systems.'
	},
	{
		key: 'SA',
		name: 'Subsequent System Availability',
		group: 'Base: subsequent system impact',
		values: v4cia,
		help: 'Availability impact on other systems.'
	},
	{
		key: 'E',
		name: 'Exploit Maturity',
		group: 'Threat',
		values: { ...X, A: 'Attacked', P: 'POC', U: 'Unreported' },
		help: 'Whether attacks are known, a proof of concept exists, or neither.'
	},
	{
		key: 'CR',
		name: 'Confidentiality Requirement',
		group: 'Environmental',
		values: REQ,
		help: 'How much confidentiality matters for this asset.'
	},
	{
		key: 'IR',
		name: 'Integrity Requirement',
		group: 'Environmental',
		values: REQ,
		help: 'How much integrity matters for this asset.'
	},
	{
		key: 'AR',
		name: 'Availability Requirement',
		group: 'Environmental',
		values: REQ,
		help: 'How much availability matters for this asset.'
	},
	{
		key: 'MAV',
		name: 'Modified Attack Vector',
		group: 'Environmental',
		values: { ...X, N: 'Network', A: 'Adjacent', L: 'Local', P: 'Physical' },
		help: 'Attack Vector in your environment.'
	},
	{
		key: 'MAC',
		name: 'Modified Attack Complexity',
		group: 'Environmental',
		values: { ...X, L: 'Low', H: 'High' },
		help: 'Attack Complexity in your environment.'
	},
	{
		key: 'MAT',
		name: 'Modified Attack Requirements',
		group: 'Environmental',
		values: { ...X, N: 'None', P: 'Present' },
		help: 'Attack Requirements in your environment.'
	},
	{
		key: 'MPR',
		name: 'Modified Privileges Required',
		group: 'Environmental',
		values: { ...X, N: 'None', L: 'Low', H: 'High' },
		help: 'Privileges Required in your environment.'
	},
	{
		key: 'MUI',
		name: 'Modified User Interaction',
		group: 'Environmental',
		values: { ...X, N: 'None', P: 'Passive', A: 'Active' },
		help: 'User Interaction in your environment.'
	},
	{
		key: 'MVC',
		name: 'Modified Vulnerable System Confidentiality',
		group: 'Environmental',
		values: { ...X, ...v4cia },
		help: 'Vulnerable system confidentiality impact in your environment.'
	},
	{
		key: 'MVI',
		name: 'Modified Vulnerable System Integrity',
		group: 'Environmental',
		values: { ...X, ...v4cia },
		help: 'Vulnerable system integrity impact in your environment.'
	},
	{
		key: 'MVA',
		name: 'Modified Vulnerable System Availability',
		group: 'Environmental',
		values: { ...X, ...v4cia },
		help: 'Vulnerable system availability impact in your environment.'
	},
	{
		key: 'MSC',
		name: 'Modified Subsequent System Confidentiality',
		group: 'Environmental',
		values: { ...X, ...v4cia },
		help: 'Subsequent system confidentiality impact in your environment.'
	},
	{
		key: 'MSI',
		name: 'Modified Subsequent System Integrity',
		group: 'Environmental',
		values: { ...X, S: 'Safety', ...v4cia },
		help: 'Subsequent system integrity impact in your environment; S marks a safety impact.'
	},
	{
		key: 'MSA',
		name: 'Modified Subsequent System Availability',
		group: 'Environmental',
		values: { ...X, S: 'Safety', ...v4cia },
		help: 'Subsequent system availability impact in your environment; S marks a safety impact.'
	},
	{
		key: 'S',
		name: 'Safety',
		group: 'Supplemental',
		values: { ...X, N: 'Negligible', P: 'Present' },
		help: 'Whether exploitation can cause physical harm (IEC 61508 terms).'
	},
	{
		key: 'AU',
		name: 'Automatable',
		group: 'Supplemental',
		values: { ...X, N: 'No', Y: 'Yes' },
		help: 'Whether the kill chain steps can be automated across many targets.'
	},
	{
		key: 'R',
		name: 'Recovery',
		group: 'Supplemental',
		values: { ...X, A: 'Automatic', U: 'User', I: 'Irrecoverable' },
		help: 'How the system recovers after an attack.'
	},
	{
		key: 'V',
		name: 'Value Density',
		group: 'Supplemental',
		values: { ...X, D: 'Diffuse', C: 'Concentrated' },
		help: 'Resources the attacker gains control of with one exploitation.'
	},
	{
		key: 'RE',
		name: 'Vulnerability Response Effort',
		group: 'Supplemental',
		values: { ...X, L: 'Low', M: 'Moderate', H: 'High' },
		help: 'How hard it is to respond to the vulnerability.'
	},
	{
		key: 'U',
		name: 'Provider Urgency',
		group: 'Supplemental',
		values: { ...X, Clear: 'Clear', Green: 'Green', Amber: 'Amber', Red: 'Red' },
		help: 'Urgency as assessed by the provider.'
	}
];

export const v4BaseKeys = ['AV', 'AC', 'AT', 'PR', 'UI', 'VC', 'VI', 'VA', 'SC', 'SI', 'SA'];

// ---------------------------------------------------------------- vector strings

export interface ParsedVector {
	version: Version;
	values: Values;
	warnings: string[];
}

export function metricsFor(v: Version): MetricDef[] {
	return v === '4.0' ? v4Metrics : v3Metrics;
}

export function parseVector(input: string): ParsedVector {
	let s = input.trim().replace(/^\(|\)$/g, '');
	if (!s) throw new Error('Empty vector');
	const warnings: string[] = [];
	let version: Version;
	const m = s.match(/^CVSS:(\d\.\d)\//);
	if (m) {
		if (m[1] !== '3.0' && m[1] !== '3.1' && m[1] !== '4.0')
			throw new Error(`CVSS version ${m[1]} is not supported (3.0, 3.1 and 4.0 are)`);
		version = m[1];
		s = s.slice(m[0].length);
	} else if (/(^|\/)Au:/.test(s)) {
		throw new Error('This looks like a CVSS v2 vector (Au:). Only v3.x and v4.0 are supported');
	} else if (/^AV:/.test(s)) {
		version = /(^|\/)(AT|VC):/.test(s) ? '4.0' : '3.1';
		warnings.push(`No CVSS: prefix; read as CVSS:${version}`);
	} else {
		throw new Error('A vector starts with CVSS:3.1/ or CVSS:4.0/');
	}
	const defs = metricsFor(version);
	const values: Values = {};
	for (const part of s.split('/')) {
		const kv = part.match(/^([A-Za-z]+):([A-Za-z]+)$/);
		if (!kv) throw new Error(`"${part}" is not a metric:value pair`);
		const def = defs.find((d) => d.key === kv[1]);
		if (!def) throw new Error(`Unknown metric "${kv[1]}" for CVSS ${version}`);
		if (values[kv[1]]) throw new Error(`Metric ${kv[1]} appears twice`);
		if (!(kv[2] in def.values))
			throw new Error(
				`${def.name} (${kv[1]}) cannot be "${kv[2]}"; allowed: ${Object.keys(def.values).join(', ')}`
			);
		values[kv[1]] = kv[2];
	}
	const baseKeys = version === '4.0' ? v4BaseKeys : v3BaseKeys;
	const missing = baseKeys.filter((k) => !values[k]);
	if (missing.length)
		throw new Error(`Missing base metric${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`);
	if (version === '3.0')
		warnings.push(
			'Scored with the v3.1 equations. v3.1 changed the rounding and the scope-changed environmental formula, so a v3.0 score can differ by a tenth, and environmental scores with MS:C can differ more.'
		);
	const order = Object.keys(values).map((k) => defs.findIndex((d) => d.key === k));
	if (order.some((x, i) => i > 0 && x < order[i - 1]))
		warnings.push("Metrics were reordered to the specification's order");
	return { version, values, warnings };
}

/** Canonical vector: specification order, Not Defined (X) metrics left out. */
export function buildVector(version: Version, values: Values): string {
	const parts = metricsFor(version)
		.filter((d) => values[d.key] && values[d.key] !== 'X')
		.map((d) => `${d.key}:${values[d.key]}`);
	return `CVSS:${version}/${parts.join('/')}`;
}

/** CVSS v4.0 nomenclature (specification section 1.3): which groups contributed. */
export function v4Nomenclature(values: Values): string {
	const set = (k: string) => values[k] && values[k] !== 'X';
	const threat = set('E');
	const env = v4Metrics.filter((d) => d.group === 'Environmental').some((d) => set(d.key));
	return `CVSS-B${threat ? 'T' : ''}${env ? 'E' : ''}`;
}

export function looksLikeCvss(s: string): number {
	return /^\s*\(?CVSS:(3\.[01]|4\.0)\/[A-Z]+:/.test(s) ? 0.95 : 0;
}
