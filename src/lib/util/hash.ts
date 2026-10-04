import { replaceState } from '$app/navigation';

/**
 * Tool state lives in the URL fragment. Fragments are never sent to the server,
 * so a shared link carries the input without it passing through any server log.
 */
export function readHash(): Record<string, string> {
	if (typeof location === 'undefined') return {};
	return Object.fromEntries(new URLSearchParams(location.hash.slice(1)));
}

export function writeHash(values: Record<string, string | undefined>): void {
	const params = new URLSearchParams();
	for (const [k, v] of Object.entries(values)) if (v) params.set(k, v);
	const hash = params.toString();
	const url = location.pathname + location.search + (hash ? `#${hash}` : '');
	if (url !== location.pathname + location.search + location.hash) replaceState(url, {});
}
