/** Likelihood that a pasted value is a Content-Security-Policy. Kept apart from logic.ts so the registry stays small. */
export function looksLikeCsp(s: string): number {
	const t = s.trim();
	if (/^content-security-policy(-report-only)?\s*:/i.test(t)) return 0.95;
	if (/http-equiv\s*=\s*["']?content-security-policy/i.test(t)) return 0.95;
	const names = t.match(
		/(?:^|;)\s*(default-src|script-src|style-src|object-src|frame-ancestors|base-uri|img-src|connect-src)\b/gi
	);
	if (names && names.length >= 2) return 0.85;
	if (names && /^(default|script)-src\s/i.test(t)) return 0.7;
	return 0;
}
