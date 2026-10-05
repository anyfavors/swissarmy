/**
 * @typedef {NonNullable<NonNullable<NonNullable<Parameters<typeof import('@sveltejs/kit/vite').sveltekit>[0]>['csp']>['directives']>} CspDirectives
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

/**
 * SvelteKit's route announcer (screen readers hear the new page title after navigation)
 * carries an inline style attribute. Rather than allowing all inline styles, allow exactly
 * that attribute by hash. The hash is read from the installed SvelteKit so upgrades cannot
 * silently break it; if the markup moves, the build fails here instead.
 */
function announcerStyleHash() {
	const require = createRequire(import.meta.url);
	const kitDir = dirname(require.resolve('@sveltejs/kit/package.json'));
	const root = readFileSync(join(kitDir, 'src/runtime/components/root.svelte'), 'utf8');
	const style = root.match(/id="svelte-announcer"[^>]*?style="([^"]+)"/s)?.[1];
	if (!style)
		throw new Error(
			'csp.js: could not find the svelte-announcer style in SvelteKit, update csp.js'
		);
	return /** @type {`sha256-${string}`} */ (
		`sha256-${createHash('sha256').update(style).digest('base64')}`
	);
}

/**
 * Single source of truth for the Content-Security-Policy.
 * Used by vite.config.ts (meta tag with per-page script hashes) and by
 * scripts/headers.js (HTTP header on Cloudflare Pages).
 *
 * Adding a network tool: add its host to connect-src here AND list it in the tool's meta.network.
 */
/**
 * Page-view statistics (the owner's own analytics instance). It loads one script and posts
 * page views back to the same host; the tag in src/app.html excludes query and fragment,
 * because tool input can live in the fragment.
 */
export const analyticsOrigin = 'https://t.vo.rs';

/** @type {NonNullable<CspDirectives['connect-src']>} */
export const connectSrc = [
	'self',
	'https://cloudflare-dns.com',
	'https://dns.google',
	analyticsOrigin
];

/** Directives that can be delivered in a <meta> tag. SvelteKit adds script hashes to script-src. */
/** @type {CspDirectives} */
export const metaDirectives = {
	'default-src': ['none'],
	'script-src': ['self', analyticsOrigin],
	'style-src': ['self', 'unsafe-hashes', announcerStyleHash()],
	'img-src': ['self', 'data:', 'blob:'],
	'font-src': ['self'],
	'connect-src': connectSrc,
	'manifest-src': ['self'],
	'worker-src': ['self'],
	'base-uri': ['none'],
	'form-action': ['none']
};

/** Quotes CSP keywords the way the header syntax needs them. */
const keyword = new Set(['self', 'none', 'unsafe-inline', 'unsafe-eval', 'strict-dynamic']);
/** @param {string} v */
const q = (v) => (keyword.has(v) ? `'${v}'` : v);

/**
 * The HTTP header carries the directives a meta tag cannot (frame-ancestors) and repeats
 * the network limits so they hold even before the meta tag is parsed. It deliberately
 * leaves script-src and style-src to the meta tag, where the per-page hashes live; both
 * policies are enforced, so the effective policy is the stricter of the two.
 */
export const headerPolicy = [
	`connect-src ${connectSrc.map(q).join(' ')}`,
	`img-src 'self' data: blob:`,
	`font-src 'self'`,
	`object-src 'none'`,
	`base-uri 'none'`,
	`form-action 'none'`,
	`frame-ancestors 'none'`,
	`upgrade-insecure-requests`
].join('; ');
