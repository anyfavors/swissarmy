/** Kept apart from logic.ts so the front page intake does not load the name tables. */
const BIDI = /[\u202a-\u202e\u2066-\u2069]/;
const HIDDEN = /[\u200b-\u200f\u2060-\u2064\ufeff\u{e0000}-\u{e007f}]/u;

export function looksSuspicious(input: string): number {
	if (BIDI.test(input)) return 0.9;
	if (HIDDEN.test(input)) return 0.6;
	return 0;
}
