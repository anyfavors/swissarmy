/**
 * Finds likely credentials in pasted text before it is shared. Pattern sources are the vendors'
 * own documentation of their token formats:
 *   AWS: IAM identifiers, "Unique ID prefixes" (AKIA long-term, ASIA temporary access keys)
 *   GitHub: "About authentication to GitHub", token prefixes ghp_ gho_ ghu_ ghs_ ghr_ github_pat_
 *   GitLab: personal access token prefix glpat-
 *   Slack: token types xoxb xoxp xoxa xoxr xoxs, incoming webhooks hooks.slack.com/services/
 *   Stripe: secret keys sk_live_, restricted keys rk_live_
 *   Google Cloud: API keys start with AIza and are 39 characters
 *   Azure Storage: connection strings carry AccountKey=<base64>
 * Everything else is heuristic. A scanner like this finds the obvious; it cannot prove text is clean.
 */

export interface Finding {
	type: string;
	label: string;
	/** Offsets into the scanned text (UTF-16 code units), end exclusive. */
	start: number;
	end: number;
	line: number;
	column: number;
	/** Masked preview, safe to show. */
	preview: string;
	/** Why it was flagged, when not obvious from the type. */
	detail?: string;
}

interface Rule {
	type: string;
	label: string;
	re: RegExp;
	/** Capture group holding the secret (default: whole match). */
	group?: number;
	/** Higher wins when findings overlap. */
	priority: number;
	/** Extra check on the secret itself. */
	accept?: (secret: string, text: string, index: number) => boolean;
	/** Characters kept visible in the preview (a known prefix). */
	keep?: number;
}

// ---------------------------------------------------------------- entropy

/** Shannon entropy in bits per character of the string's own character distribution. */
export function shannonEntropy(s: string): number {
	if (!s) return 0;
	const counts = new Map<string, number>();
	for (const c of s) counts.set(c, (counts.get(c) ?? 0) + 1);
	let h = 0;
	const n = [...s].length;
	for (const c of counts.values()) {
		const p = c / n;
		h -= p * Math.log2(p);
	}
	return h;
}

/**
 * High-entropy threshold. A string of n characters can reach at most log2(n) bits per character
 * (all characters distinct), and random base64 sits close to that for short strings. So the bar is
 * relative, ENTROPY_RATIO of the maximum possible for its length, and capped at ENTROPY_CAP bits
 * (the classic base64 threshold) for long strings.
 */
export const ENTROPY_RATIO = 0.85;
export const ENTROPY_CAP = 4.5;
export const MIN_ENTROPY_LENGTH = 20;

export function entropyThreshold(length: number, alphabet = 64): number {
	const cap = alphabet === 16 ? 3.0 : ENTROPY_CAP;
	return Math.min(ENTROPY_RATIO * Math.log2(Math.min(length, alphabet)), cap);
}

/**
 * Share of adjacent character pairs that switch class (upper, lower, digit, other). Random base64
 * switches about 64% of the time; camelCase identifiers and words far less.
 */
export function classSwitchRate(s: string): number {
	const cls = (c: string) => (/[A-Z]/.test(c) ? 0 : /[a-z]/.test(c) ? 1 : /\d/.test(c) ? 2 : 3);
	let n = 0;
	for (let i = 1; i < s.length; i++) if (cls(s[i]) !== cls(s[i - 1])) n++;
	return s.length > 1 ? n / (s.length - 1) : 0;
}
export const MIN_SWITCH_RATE = 0.4;

const hasDigit = /\d/;
const hasLetter = /[A-Za-z]/;

// ---------------------------------------------------------------- rules

/** Values in assignments that are clearly placeholders or references, not secrets. */
function isPlaceholder(v: string): boolean {
	const s = v.trim();
	if (s.length < 4) return true;
	if (/^(?:\$\{?[A-Za-z_][\w.]*\}?|\{\{.*\}\}|%\(?\w+\)?s?|<[^>]*>|\[[^\]]*\]|%[A-Z_]+%)$/.test(s))
		return true;
	if (
		/^(?:null|none|nil|true|false|undefined|empty|xxx+|\*+|\.+|-+|redacted|\[redacted.*\])$/i.test(
			s
		)
	)
		return true;
	// Code: a call, a property access or an environment lookup.
	if (/^(?:process\.env|os\.environ|os\.getenv|env\(|getenv\(|System\.getenv|ENV\[)/.test(s))
		return true;
	if (/^[A-Za-z_$][\w$.]*\(/.test(s)) return true;
	return false;
}

function nearAwsKeyId(text: string, index: number): boolean {
	const lo = Math.max(0, index - 400);
	const window = text.slice(lo, index + 400);
	return (
		/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/.test(window) ||
		/aws.{0,30}secret|secret.?access.?key/i.test(window)
	);
}

const rules: Rule[] = [
	{
		type: 'private-key',
		label: 'Private key (PEM)',
		// Whole block when the END line is present, else the header line alone.
		re: /-----BEGIN ((?:RSA |EC |DSA |OPENSSH |ENCRYPTED |PGP )?PRIVATE KEY(?: BLOCK)?)-----(?:[\s\S]*?-----END \1-----)?/g,
		priority: 100
	},
	{
		type: 'aws-access-key-id',
		label: 'AWS access key ID',
		re: /\b((?:AKIA|ASIA)[A-Z0-9]{16})\b/g,
		group: 1,
		priority: 90,
		keep: 4
	},
	{
		type: 'aws-secret-access-key',
		label: 'AWS secret access key (heuristic)',
		// 40 characters of base64 alphabet, standing alone.
		re: /(?<![A-Za-z0-9/+])([A-Za-z0-9/+]{40})(?![A-Za-z0-9/+=])/g,
		group: 1,
		priority: 60,
		accept: (s, text, i) =>
			!/^[0-9a-f]+$/i.test(s) && // a hex SHA-1 is 40 characters too
			/[a-z]/.test(s) &&
			/[A-Z]/.test(s) &&
			hasDigit.test(s) &&
			nearAwsKeyId(text, i)
	},
	{
		type: 'github-token',
		label: 'GitHub token',
		re: /\b((?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,255})\b/g,
		group: 1,
		priority: 90,
		keep: 4
	},
	{
		type: 'github-pat',
		label: 'GitHub fine-grained token',
		re: /\b(github_pat_[A-Za-z0-9_]{60,255})\b/g,
		group: 1,
		priority: 90,
		keep: 11
	},
	{
		type: 'gitlab-token',
		label: 'GitLab personal access token',
		re: /\b(glpat-[A-Za-z0-9_\-.]{20,})/g,
		group: 1,
		priority: 90,
		keep: 6
	},
	{
		type: 'slack-token',
		label: 'Slack token',
		re: /\b(xox[baprs]-[A-Za-z0-9-]{10,})/g,
		group: 1,
		priority: 90,
		keep: 5
	},
	{
		type: 'slack-webhook',
		label: 'Slack webhook URL',
		re: /(https:\/\/hooks\.slack\.com\/services\/T[A-Za-z0-9]+\/B[A-Za-z0-9]+\/[A-Za-z0-9]+)/g,
		group: 1,
		priority: 90,
		keep: 33
	},
	{
		type: 'stripe-key',
		label: 'Stripe live key',
		re: /\b((?:sk|rk)_live_[A-Za-z0-9]{10,})/g,
		group: 1,
		priority: 90,
		keep: 8
	},
	{
		type: 'google-api-key',
		label: 'Google API key',
		re: /\b(AIza[0-9A-Za-z_-]{35})(?![0-9A-Za-z_-])/g,
		group: 1,
		priority: 90,
		keep: 4
	},
	{
		type: 'azure-storage-key',
		label: 'Azure storage account key',
		re: /(?:AccountKey|SharedAccessKey)=([A-Za-z0-9+/]{20,}={0,2})/g,
		group: 1,
		priority: 90
	},
	{
		type: 'jwt',
		label: 'JSON Web Token',
		re: /\b(eyJ[A-Za-z0-9_-]{5,}\.eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{10,})/g,
		group: 1,
		priority: 80,
		keep: 3
	},
	{
		type: 'url-password',
		label: 'Password in URL',
		re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:([^\s@/]+)@/gi,
		group: 1,
		priority: 85,
		accept: (s) => !isPlaceholder(s)
	},
	{
		type: 'assignment',
		label: 'Password or secret assignment',
		// key = value, key: value, key="value", "key": "value". The key names a credential.
		re: /(?:^|[^A-Za-z0-9])((?:[A-Za-z0-9]+[_.-])*(?:passw(?:or)?d|passwd|pwd|pass|secret|api[_-]?key|apikey|access[_-]?key|auth[_-]?token|access[_-]?token|refresh[_-]?token|token|private[_-]?key|client[_-]?secret|credentials?)(?:[_.-][A-Za-z0-9]+)*)["']?\s*(?:=>|:=|:|=)\s*(?:"([^"\n]+)"|'([^'\n]+)'|(<[^>\n]*>)|([^\s,;'"}{)\]]+))/gim,
		priority: 50
	}
];

// ---------------------------------------------------------------- scanning

function lineCol(text: string, index: number): { line: number; column: number } {
	let line = 1;
	let last = -1;
	for (let i = text.indexOf('\n'); i !== -1 && i < index; i = text.indexOf('\n', i + 1)) {
		line++;
		last = i;
	}
	return { line, column: index - last };
}

export function mask(secret: string, keep = 0): string {
	const n = [...secret].length;
	if (secret.includes('\n')) {
		const first = secret.split('\n')[0];
		return `${first} (${secret.split('\n').length} lines)`;
	}
	const visible = Math.min(keep, Math.max(0, n - 4));
	return `${secret.slice(0, visible)}${'*'.repeat(Math.min(8, n - visible))} (${n} chars)`;
}

interface Candidate extends Omit<Finding, 'line' | 'column'> {
	priority: number;
}

export function scan(text: string): Finding[] {
	const cands: Candidate[] = [];
	for (const r of rules) {
		r.re.lastIndex = 0;
		for (const m of text.matchAll(r.re)) {
			let secret: string;
			let start: number;
			if (r.type === 'assignment') {
				const value = m[2] ?? m[3] ?? m[4] ?? m[5];
				if (!value || isPlaceholder(value)) continue;
				// Locate the value inside the match (it is the last capture).
				const rel = m[0].lastIndexOf(value);
				secret = value;
				start = m.index! + rel;
			} else {
				const g = r.group ?? 0;
				secret = m[g];
				if (!secret) continue;
				start = m.index! + (g === 0 ? 0 : m[0].indexOf(secret));
			}
			if (r.accept && !r.accept(secret, text, start)) continue;
			cands.push({
				type: r.type,
				label: r.label,
				start,
				end: start + secret.length,
				preview: mask(secret, r.keep),
				priority: r.priority,
				detail: r.type === 'assignment' ? `key "${m[1]}"` : undefined
			});
		}
	}

	// High-entropy tokens: runs of base64/base64url characters.
	for (const m of text.matchAll(/[A-Za-z0-9+/_\-=]{20,}/g)) {
		const tok = m[0].replace(/=+$/, '');
		if (tok.length < MIN_ENTROPY_LENGTH) continue;
		// Subresource Integrity hashes (package-lock.json, <script integrity>) are public.
		if (/^sha(?:256|384|512)-/.test(tok)) continue;
		const isHex = /^[0-9a-fA-F]+$/.test(tok);
		const h = shannonEntropy(tok);
		let detail: string | undefined;
		if (isHex) {
			// Hex: hashes and IDs are everywhere, so only flag them next to a credential word.
			const lineStart = text.lastIndexOf('\n', m.index!) + 1;
			const lineEnd = text.indexOf('\n', m.index!);
			const lineText = text.slice(lineStart, lineEnd < 0 ? undefined : lineEnd);
			if (tok.length < 32 || h < entropyThreshold(tok.length, 16)) continue;
			if (!/key|secret|token|passw|auth|credential/i.test(lineText)) continue;
			detail = `hex, ${h.toFixed(2)} bits/char, next to a credential word`;
		} else {
			if (!hasDigit.test(tok) || !hasLetter.test(tok)) continue;
			// Paths and dotted or dashed identifiers are low risk and noisy.
			if (/^[a-z]+(?:[-_/][a-z0-9]+)+$/i.test(tok) && !/[A-Z].*[a-z].*\d|\d.*[A-Z]/.test(tok))
				continue;
			if (h < entropyThreshold(tok.length)) continue;
			if (classSwitchRate(tok) < MIN_SWITCH_RATE) continue;
			detail = `${h.toFixed(2)} bits/char, threshold ${entropyThreshold(tok.length).toFixed(2)}`;
		}
		cands.push({
			type: 'high-entropy',
			label: 'High-entropy string',
			start: m.index!,
			end: m.index! + tok.length,
			preview: mask(tok),
			priority: 10,
			detail
		});
	}

	// Overlaps: keep the higher priority, then the earlier and longer one.
	cands.sort((a, b) => b.priority - a.priority || a.start - b.start || b.end - a.end);
	const kept: Candidate[] = [];
	for (const c of cands) if (!kept.some((k) => c.start < k.end && k.start < c.end)) kept.push(c);
	kept.sort((a, b) => a.start - b.start);
	return kept.map(({ priority: _priority, ...f }) => ({ ...f, ...lineCol(text, f.start) }));
}

/** Replaces every finding with [REDACTED:type]. */
export function redact(text: string, findings: Finding[] = scan(text)): string {
	let out = '';
	let pos = 0;
	for (const f of [...findings].sort((a, b) => a.start - b.start)) {
		out += text.slice(pos, f.start) + `[REDACTED:${f.type}]`;
		pos = f.end;
	}
	return out + text.slice(pos);
}
