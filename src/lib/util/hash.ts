import { goto } from '$app/navigation';

/**
 * Tool state lives in the URL fragment. Fragments are never sent to the server,
 * so a shared link carries the input without it passing through any server log.
 */
export function readHash(): Record<string, string> {
	if (typeof location === 'undefined') return {};
	const values = Object.fromEntries(new URLSearchParams(location.hash.slice(1)));
	if (pending !== undefined) {
		values.in = pending;
		pending = undefined;
	}
	return values;
}

/**
 * Input handed from the front page intake to the next tool, kept in memory only.
 * Pasted text can be a secret (a TOTP seed, a token), so it never touches the URL.
 * Client-side navigation keeps this module alive; readHash() consumes it once.
 */
let pending: string | undefined;

export function handOff(value: string): void {
	pending = value;
}

export function writeHash(values: Record<string, string | undefined>): void {
	const params = new URLSearchParams();
	for (const [k, v] of Object.entries(values)) if (v) params.set(k, v);
	const hash = params.toString();
	const url = location.pathname + location.search + (hash ? `#${hash}` : '');
	if (url === location.pathname + location.search + location.hash) return;
	// Shallow + replace: updates the address bar without navigating, adding history, moving focus or scrolling.
	void goto(url, { shallow: true, replace: true, state: {} });
}
