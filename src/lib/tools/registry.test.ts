import { describe, expect, it } from 'vitest';
import { tools, toolNumber } from './registry';
import { chapters } from './chapters';

describe('registry', () => {
	it('has unique ids and numbers', () => {
		const ids = tools.map((t) => t.id);
		const nos = tools.map(toolNumber);
		expect(new Set(ids).size).toBe(ids.length);
		expect(new Set(nos).size).toBe(nos.length);
	});

	it('only uses known chapters', () => {
		for (const t of tools) expect(chapters.some((c) => c.no === t.chapter)).toBe(true);
	});

	it('uses slugs that match a url-safe pattern', () => {
		for (const t of tools) expect(t.id).toMatch(/^[a-z0-9-]+$/);
	});
});
