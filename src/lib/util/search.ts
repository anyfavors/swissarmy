import type { ToolMeta } from '../tools/types';
import { toolNumber } from '../tools/registry';

/** Subsequence match with a bonus for word starts and consecutive characters. */
function fuzzy(needle: string, hay: string): number {
	if (!needle) return 0;
	const h = hay.toLowerCase();
	const direct = h.indexOf(needle);
	if (direct === 0) return 100;
	if (direct > 0) return /\W/.test(h[direct - 1]) ? 80 : 60;
	let score = 0;
	let pos = -1;
	let run = 0;
	for (const ch of needle) {
		const next = h.indexOf(ch, pos + 1);
		if (next === -1) return 0;
		run = next === pos + 1 ? run + 1 : 0;
		score += 1 + run * 2 + (next === 0 || /\W/.test(h[next - 1]) ? 3 : 0);
		pos = next;
	}
	return Math.min(score, 50);
}

export function searchTools(query: string, tools: ToolMeta[]): ToolMeta[] {
	const q = query.trim().toLowerCase();
	if (!q) return tools;
	return tools
		.map((t) => {
			const score = Math.max(
				fuzzy(q, t.title),
				fuzzy(q, t.id),
				fuzzy(q, toolNumber(t)),
				...t.keywords.map((k) => fuzzy(q, k) * 0.9),
				fuzzy(q, t.summary) * 0.5
			);
			return { t, score };
		})
		.filter((r) => r.score > 0)
		.sort((a, b) => b.score - a.score)
		.map((r) => r.t);
}

export function detectTools(input: string, tools: ToolMeta[]): { tool: ToolMeta; score: number }[] {
	if (!input.trim()) return [];
	return tools
		.map((tool) => ({ tool, score: tool.detect?.(input) ?? 0 }))
		.filter((r) => r.score >= 0.3)
		.sort((a, b) => b.score - a.score);
}
