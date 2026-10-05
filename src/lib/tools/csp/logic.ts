/**
 * Content-Security-Policy reader. Directive semantics from W3C Content Security Policy Level 3
 * (https://www.w3.org/TR/CSP3/), plus sandbox values from the HTML standard and
 * upgrade-insecure-requests from its own W3C spec. Risk checks follow common guidance such as
 * Google's strict CSP recommendations (https://csp.withgoogle.com/docs/strict-csp.html).
 */

export interface Directive {
	name: string;
	sources: string[];
	/** True when a directive with this name appeared earlier: browsers ignore the repeat. */
	duplicate: boolean;
}

export interface Policy {
	directives: Directive[];
	/** Effective map, first occurrence wins. */
	map: Map<string, string[]>;
	fromMeta: boolean;
	reportOnly: boolean;
}

export type Level = 'danger' | 'warn' | 'info';
export interface Finding {
	level: Level;
	directive?: string;
	text: string;
}

interface DirInfo {
	text: string;
	/** Falls back to default-src when absent (fetch directives). */
	fallback?: string;
	/** Not allowed in a <meta> policy. */
	noMeta?: boolean;
	deprecated?: boolean;
}

export const DIRECTIVES: Record<string, DirInfo> = {
	'default-src': { text: 'Fallback for the fetch directives that are not set.' },
	'script-src': {
		text: 'Where scripts may load from, and whether inline scripts and eval run.',
		fallback: 'default-src'
	},
	'script-src-elem': {
		text: 'Script elements only (src and inline blocks). Overrides script-src for them.',
		fallback: 'script-src'
	},
	'script-src-attr': {
		text: 'Inline event handlers like onclick. Overrides script-src for them.',
		fallback: 'script-src'
	},
	'style-src': {
		text: 'Stylesheets, style elements and style attributes.',
		fallback: 'default-src'
	},
	'style-src-elem': { text: 'Style and link rel=stylesheet elements only.', fallback: 'style-src' },
	'style-src-attr': { text: 'Inline style attributes only.', fallback: 'style-src' },
	'img-src': { text: 'Images and favicons.', fallback: 'default-src' },
	'font-src': { text: 'Web fonts loaded with @font-face.', fallback: 'default-src' },
	'connect-src': {
		text: 'fetch, XMLHttpRequest, WebSocket, EventSource and sendBeacon targets.',
		fallback: 'default-src'
	},
	'media-src': { text: 'Audio, video and text tracks.', fallback: 'default-src' },
	'object-src': { text: 'Plugins: object and embed elements.', fallback: 'default-src' },
	'frame-src': { text: 'What this page may load in iframes.', fallback: 'child-src' },
	'child-src': {
		text: 'Frames and workers, when frame-src or worker-src are not set.',
		fallback: 'default-src'
	},
	'worker-src': { text: 'Web workers and service workers.', fallback: 'child-src' },
	'manifest-src': { text: 'The web app manifest.', fallback: 'default-src' },
	'prefetch-src': {
		text: 'Prefetch and prerender targets. Removed from the spec.',
		fallback: 'default-src',
		deprecated: true
	},
	'base-uri': { text: 'Allowed URLs for the base element. No fallback to default-src.' },
	'form-action': { text: 'Where forms may submit to. No fallback to default-src.' },
	'frame-ancestors': {
		text: 'Who may embed this page in a frame (clickjacking). Header only.',
		noMeta: true
	},
	sandbox: {
		text: 'Applies iframe-style sandbox restrictions to the page. Header only.',
		noMeta: true
	},
	'upgrade-insecure-requests': {
		text: 'Rewrites http: subresource URLs to https: before fetching.'
	},
	'block-all-mixed-content': {
		text: 'Blocks all mixed content. Deprecated, browsers now do this by default.',
		deprecated: true
	},
	'report-uri': {
		text: 'Where to POST violation reports. Deprecated in favour of report-to. Header only.',
		noMeta: true,
		deprecated: true
	},
	'report-to': { text: 'Reporting API endpoint group name for violation reports.', noMeta: true },
	'require-trusted-types-for': {
		text: "With 'script', DOM XSS sinks only accept Trusted Types objects."
	},
	'trusted-types': { text: 'Allowed Trusted Types policy names.' },
	webrtc: { text: 'Whether WebRTC connections are allowed.' },
	'fenced-frame-src': { text: 'Fenced frames (Privacy Sandbox).', fallback: 'frame-src' }
};

const KEYWORDS: Record<string, string> = {
	"'self'": 'Same origin as the page (scheme, host and port).',
	"'none'": 'Nothing is allowed.',
	"'unsafe-inline'": 'Inline scripts or styles and event handler attributes.',
	"'unsafe-eval'": 'eval(), new Function() and string timers.',
	"'wasm-unsafe-eval'": 'WebAssembly compilation, without allowing JavaScript eval.',
	"'unsafe-hashes'": 'Lets hashes match event handler and style attributes too.',
	"'strict-dynamic'":
		'Scripts loaded by an already trusted (nonce or hash) script are trusted too. Host lists are ignored.',
	"'report-sample'": 'Include the first 40 characters of the blocked code in reports.',
	"'inline-speculation-rules'": 'Inline speculation rules scripts.',
	"'unsafe-allow-redirects'": 'Allow redirects for navigation checks (experimental).'
};

const SCHEMES: Record<string, string> = {
	'https:': 'Any host over HTTPS.',
	'http:': 'Any host over plain HTTP (and HTTPS).',
	'data:': 'data: URLs, content embedded in the URL itself.',
	'blob:': 'blob: URLs created by scripts on the page.',
	'filesystem:': 'filesystem: URLs.',
	'mediastream:': 'mediastream: URLs.',
	'wss:': 'Any host over secure WebSocket.',
	'ws:': 'Any host over plain WebSocket.'
};

/** Pulls the policy out of a header line or a meta tag. */
export function extractPolicy(input: string): {
	text: string;
	fromMeta: boolean;
	reportOnly: boolean;
} {
	const t = input.trim();
	const meta = t.match(/<meta\b[^>]*>/i);
	if (meta) {
		const content = meta[0].match(/\bcontent\s*=\s*("([^"]*)"|'([^']*)')/i);
		if (!content) throw new Error('The meta tag has no content attribute');
		const v = (content[2] ?? content[3])
			.replace(/&quot;/g, '"')
			.replace(/&#0*39;|&apos;/g, "'")
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&amp;/g, '&');
		return { text: v, fromMeta: true, reportOnly: /report-only/i.test(meta[0]) };
	}
	const h = t.match(/^content-security-policy(-report-only)?\s*:\s*/i);
	return {
		text: h ? t.slice(h[0].length) : t,
		fromMeta: false,
		reportOnly: !!h?.[1]
	};
}

export function parsePolicy(input: string): Policy {
	const { text, fromMeta, reportOnly } = extractPolicy(input);
	const directives: Directive[] = [];
	const map = new Map<string, string[]>();
	for (const chunk of text.split(';')) {
		const tokens = chunk.trim().split(/\s+/).filter(Boolean);
		if (!tokens.length) continue;
		const name = tokens[0].toLowerCase();
		const sources = tokens.slice(1);
		const duplicate = map.has(name);
		directives.push({ name, sources, duplicate });
		if (!duplicate) map.set(name, sources);
	}
	if (!directives.length) throw new Error('No directives found');
	return { directives, map, fromMeta, reportOnly };
}

/** The source list that actually governs a directive, following the fallback chain. */
export function effective(p: Policy, name: string): { from: string; sources: string[] } | null {
	let n: string | undefined = name;
	while (n) {
		const s = p.map.get(n);
		if (s) return { from: n, sources: s };
		n = DIRECTIVES[n]?.fallback;
	}
	return null;
}

export function describeSource(src: string): string {
	const l = src.toLowerCase();
	if (KEYWORDS[l]) return KEYWORDS[l];
	if (/^'nonce-[A-Za-z0-9+/_=-]+'$/.test(src))
		return 'Nonce: elements carrying this nonce attribute are allowed.';
	if (/^'sha(256|384|512)-[A-Za-z0-9+/_=-]+'$/i.test(src))
		return 'Hash: inline content with exactly this digest is allowed.';
	if (src === '*') return 'Any URL except data:, blob: and filesystem: (and only network schemes).';
	if (SCHEMES[l]) return SCHEMES[l];
	if (
		/^(self|none|unsafe-inline|unsafe-eval|strict-dynamic|unsafe-hashes|report-sample|wasm-unsafe-eval)$/i.test(
			src
		)
	)
		return 'Keyword without quotes: read as a host name, almost certainly a mistake.';
	if (/^'/.test(src)) return 'Unknown quoted keyword, ignored.';
	if (/^[a-z][a-z0-9+.-]*:$/i.test(src)) return `Any URL with the ${l} scheme.`;
	if (/^([a-z][a-z0-9+.-]*:\/\/)?(\*\.)?[a-z0-9.-]+|\*/i.test(src)) {
		const wild = src.includes('*.') ? ' and all its subdomains' : '';
		const path =
			/:\/\/[^/]+\/./.test(src) || /^[^:/]+\/./.test(src) ? ', limited to that path' : '';
		return `Host ${src
			.replace(/^[a-z]+:\/\//i, '')
			.replace(/\/.*/, '')
			.replace(/^\*\./, '')}${wild}${path}.`;
	}
	return 'Not a recognised source expression.';
}

const isNonceOrHash = (s: string) => /^'(nonce-|sha(256|384|512)-)/i.test(s);
const lc = (l: string[]) => l.map((s) => s.toLowerCase());

export function analyse(p: Policy): Finding[] {
	const f: Finding[] = [];
	const has = (n: string) => p.map.has(n);
	const def = p.map.get('default-src');

	for (const d of p.directives) {
		const info = DIRECTIVES[d.name];
		if (d.duplicate)
			f.push({
				level: 'warn',
				directive: d.name,
				text: `${d.name} appears twice. Browsers use the first one and ignore the rest`
			});
		if (!info)
			f.push({
				level: 'warn',
				directive: d.name,
				text: `Unknown directive ${d.name}, ignored by browsers`
			});
		if (info?.deprecated)
			f.push({ level: 'info', directive: d.name, text: `${d.name} is deprecated` });
		if (info?.noMeta && p.fromMeta)
			f.push({
				level: 'warn',
				directive: d.name,
				text: `${d.name} is ignored in a meta tag. Send it as an HTTP header`
			});
		for (const s of d.sources) {
			if (/^(self|none|unsafe-inline|unsafe-eval|strict-dynamic|unsafe-hashes)$/i.test(s))
				f.push({
					level: 'danger',
					directive: d.name,
					text: `${d.name}: ${s} needs single quotes ('${s}'), otherwise it means a host called ${s}`
				});
			if (/^http:\/\//i.test(s) || /^ws:\/\//i.test(s))
				f.push({
					level: 'warn',
					directive: d.name,
					text: `${d.name}: ${s} loads over an unencrypted connection`
				});
		}
		const l = lc(d.sources);
		if (l.includes("'none'") && d.sources.length > 1)
			f.push({
				level: 'info',
				directive: d.name,
				text: `${d.name}: 'none' combined with other sources; the other sources win`
			});
	}

	// Scripts
	const script = effective(p, 'script-src');
	if (!script)
		f.push({
			level: 'danger',
			directive: 'script-src',
			text: 'No script-src and no default-src: scripts from anywhere are allowed'
		});
	else {
		const l = lc(script.sources);
		const nh = script.sources.some(isNonceOrHash);
		const sd = l.includes("'strict-dynamic'");
		const tag = script.from;
		if (l.includes("'unsafe-inline'")) {
			if (nh || sd)
				f.push({
					level: 'info',
					directive: tag,
					text: `${tag}: 'unsafe-inline' is ignored by modern browsers because a ${sd ? "'strict-dynamic'" : 'nonce or hash'} is present (kept as fallback for old ones)`
				});
			else
				f.push({
					level: 'danger',
					directive: tag,
					text: `${tag}: 'unsafe-inline' without a nonce or hash allows injected inline scripts, so the policy gives little XSS protection`
				});
		}
		if (l.includes("'unsafe-eval'"))
			f.push({
				level: 'warn',
				directive: tag,
				text: `${tag}: 'unsafe-eval' allows eval() and new Function()`
			});
		if (!sd) {
			if (l.includes('*'))
				f.push({ level: 'danger', directive: tag, text: `${tag}: * allows scripts from any host` });
			for (const s of ['https:', 'http:', 'data:', 'blob:'])
				if (l.includes(s))
					f.push({
						level: s === 'blob:' ? 'warn' : 'danger',
						directive: tag,
						text: `${tag}: ${s} allows scripts from ${s === 'data:' ? 'data: URLs, an easy injection vector' : s === 'blob:' ? 'blob: URLs made by any script on the page' : 'any host'}`
					});
		}
	}

	// object-src
	const obj = effective(p, 'object-src');
	if (!obj)
		f.push({
			level: 'warn',
			directive: 'object-src',
			text: "No object-src and no default-src: plugins are unrestricted. Add object-src 'none'"
		});
	else if (!(obj.sources.length === 1 && obj.sources[0].toLowerCase() === "'none'"))
		f.push({
			level: 'warn',
			directive: 'object-src',
			text: `object-src is not 'none'${obj.from === 'default-src' ? ' (inherited from default-src)' : ''}. Plugins are rarely needed; set object-src 'none'`
		});

	if (!has('base-uri'))
		f.push({
			level: 'warn',
			directive: 'base-uri',
			text: "No base-uri (it has no fallback). An injected base tag can redirect relative script URLs. Add base-uri 'none' or 'self'"
		});
	if (!has('frame-ancestors'))
		f.push({
			level: p.fromMeta ? 'info' : 'warn',
			directive: 'frame-ancestors',
			text: p.fromMeta
				? 'No frame-ancestors. It cannot be set in a meta tag; send it as a header to prevent clickjacking'
				: "No frame-ancestors (it has no fallback): any site may frame this page. Add frame-ancestors 'none' or 'self'"
		});
	if (!has('form-action'))
		f.push({
			level: 'info',
			directive: 'form-action',
			text: 'No form-action (it has no fallback): forms may post anywhere'
		});

	const style = effective(p, 'style-src');
	if (style && lc(style.sources).includes("'unsafe-inline'") && !style.sources.some(isNonceOrHash))
		f.push({
			level: 'info',
			directive: style.from,
			text: `${style.from}: 'unsafe-inline' allows injected styles (CSS can leak data, but far less than scripts)`
		});

	if (def && lc(def).includes('*'))
		f.push({
			level: 'warn',
			directive: 'default-src',
			text: 'default-src * allows almost everything that is not set explicitly'
		});
	if (has('report-uri') && !has('report-to'))
		f.push({
			level: 'info',
			directive: 'report-uri',
			text: 'report-uri is deprecated. Add report-to as well; browsers that support it ignore report-uri'
		});
	if (p.reportOnly)
		f.push({
			level: 'info',
			text: 'Report-Only: nothing is blocked, violations are only reported'
		});
	return f;
}

/* ----------------------------------------------------------------- builder */

export interface BuilderRow {
	name: string;
	value: string;
	on: boolean;
}

/** Strict-ish defaults for a typical site that hosts its own assets. */
export function defaultRows(): BuilderRow[] {
	return [
		{ name: 'default-src', value: "'self'", on: true },
		{ name: 'script-src', value: "'self'", on: true },
		{ name: 'style-src', value: "'self'", on: true },
		{ name: 'img-src', value: "'self' data:", on: true },
		{ name: 'font-src', value: "'self'", on: true },
		{ name: 'connect-src', value: "'self'", on: true },
		{ name: 'object-src', value: "'none'", on: true },
		{ name: 'base-uri', value: "'none'", on: true },
		{ name: 'form-action', value: "'self'", on: true },
		{ name: 'frame-ancestors', value: "'none'", on: true },
		{ name: 'upgrade-insecure-requests', value: '', on: true },
		{ name: 'report-to', value: 'csp', on: false }
	];
}

export function build(rows: BuilderRow[], meta = false): string {
	return rows
		.filter((r) => r.on && !(meta && DIRECTIVES[r.name]?.noMeta))
		.map((r) => (r.value.trim() ? `${r.name} ${r.value.trim().replace(/\s+/g, ' ')}` : r.name))
		.join('; ');
}

/**
 * This site's own policy, in the shape scripts/csp.js produces (the meta tag and the header
 * are both enforced). Hashes are shortened placeholders: the real ones change per build.
 */
export const examples: { label: string; value: string }[] = [
	{
		label: 'This site, meta tag',
		value:
			"<meta http-equiv=\"content-security-policy\" content=\"default-src 'none'; script-src 'self' 'sha256-PLACEHOLDERforSvelteKitBootstrap0000000000='; style-src 'self' 'unsafe-hashes' 'sha256-PLACEHOLDERforRouteAnnouncerStyle00000000='; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://cloudflare-dns.com https://dns.google; manifest-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'\">"
	},
	{
		label: 'This site, HTTP header',
		value:
			"Content-Security-Policy: connect-src 'self' https://cloudflare-dns.com https://dns.google; img-src 'self' data: blob:; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests"
	},
	{
		label: 'Weak legacy policy',
		value:
			"default-src *; script-src 'self' 'unsafe-inline' 'unsafe-eval' https: data:; style-src 'self' 'unsafe-inline'; report-uri /csp"
	},
	{
		label: 'Strict nonce policy',
		value:
			"script-src 'nonce-r4nd0m' 'strict-dynamic' https: 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'"
	}
];

export { looksLikeCsp } from './detect';
