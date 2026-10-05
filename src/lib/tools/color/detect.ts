/** Likelihood that a pasted value is a colour. Kept apart from logic.ts so the registry stays small. */
export function looksLikeColor(s: string): number {
	const t = s.trim().toLowerCase();
	if (/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(t)) return 0.7;
	if (/^(rgba?|hsla?|hwb|oklch|oklab|device-cmyk|cmyk)\(.*\)$/.test(t)) return 0.9;
	return 0;
}
