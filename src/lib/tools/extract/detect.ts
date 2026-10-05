/** Kept apart from logic.ts so the front page intake does not load the extractors. */
export function looksDefanged(input: string): number {
	return /\bhxxps?(?:\[:\]|:)\/\/|\w\[\.\]\w/i.test(input) ? 0.7 : 0;
}
