/** Only explicitly labelled Cookie / Set-Cookie headers are claimed. */
export function looksLikeCookie(s: string): number {
	const t = s.trim();
	if (/^set-cookie\s*:\s*[^=;\s]+=/i.test(t)) return 0.95;
	if (/^cookie\s*:\s*[^=;\s]+=/i.test(t)) return 0.95;
	return 0;
}
