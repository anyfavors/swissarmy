import { self } from '$app/service-worker';
import { assets, immutable, prerendered } from '$app/manifest';
import { version } from '$app/env';

/**
 * Offline support. Everything the site consists of is precached on install, so every tool
 * works without a connection after the first visit. Only same-origin GET requests are handled;
 * DNS-over-HTTPS lookups and anything else cross-origin go straight to the network.
 */
const CACHE = `fm-${version}`;
// Manifest paths are relative to the base path and the front page is the empty string.
// Resolve them against the scope, otherwise "" would resolve to this script's own URL.
const scope = self.registration.scope;
const PRECACHE = [...immutable, ...assets, ...prerendered].map((f) => new URL(f.path, scope).href);

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(PRECACHE))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', (event) => {
	const req = event.request;
	if (req.method !== 'GET') return;
	const url = new URL(req.url);
	if (url.origin !== self.location.origin) return;

	// Pages: network first, so a new deploy shows up on the next load. The cache only answers
	// when the network fails (offline). Hashed build assets never change, so cache first is safe.
	const isPage = req.mode === 'navigate';

	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE);
			const cached = async () =>
				(await cache.match(req, { ignoreSearch: true })) ?? (await cache.match(url.pathname));
			if (!isPage) {
				const hit = await cached();
				if (hit) return hit;
			}
			try {
				return await fetch(req);
			} catch {
				return (await cached()) ?? (await cache.match(scope)) ?? Response.error();
			}
		})()
	);
});
