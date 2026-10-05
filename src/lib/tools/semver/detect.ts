/** Likelihood that a pasted value is a version or an npm range. Kept apart from logic.ts so the registry stays small. */
export function looksLikeSemver(s: string): number {
	const t = s.trim();
	if (t.length > 200 || /\n/.test(t)) return 0;
	if (/^[\^~]\s*v?\d+(\.(\d+|[xX*]))?(\.(\d+|[xX*]))?(-[0-9A-Za-z.-]+)?$/.test(t)) return 0.8;
	if (/^v?\d+\.\d+\.\d+-[0-9A-Za-z.-]+(\+[0-9A-Za-z.-]+)?$/.test(t)) return 0.7;
	if (/^v?\d+\.\d+\.\d+\+[0-9A-Za-z.-]+$/.test(t)) return 0.7;
	if (/^v?\d+\.\d+\.\d+$/.test(t))
		return Number(t.replace(/^v/, '').split('.')[0]) > 1900 ? 0.2 : 0.5;
	if (/^[<>]=?\s*v?\d+(\.\d+){0,2}/.test(t) && /^[<>=\s\dvxX.*|^~-]+$/.test(t)) return 0.6;
	return 0;
}
