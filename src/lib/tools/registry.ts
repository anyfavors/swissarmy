import { chapters } from './chapters';
import type { ToolMeta, ToolModule } from './types';

const metaModules = import.meta.glob<{ meta: ToolMeta }>('./*/meta.ts', { eager: true });
const uiModules = import.meta.glob<ToolModule>('./*/Tool.svelte');

export const tools: ToolMeta[] = Object.values(metaModules)
	.map((m) => m.meta)
	.sort((a, b) => a.chapter - b.chapter || a.section - b.section);

export function toolNumber(t: Pick<ToolMeta, 'chapter' | 'section'>): string {
	return `${t.chapter}-${String(t.section).padStart(2, '0')}`;
}

export function getTool(id: string): ToolMeta | undefined {
	return tools.find((t) => t.id === id);
}

export function loadToolUi(id: string): Promise<ToolModule> {
	const loader = uiModules[`./${id}/Tool.svelte`];
	if (!loader) throw new Error(`No UI for tool ${id}`);
	return loader();
}

export function chapterTitle(no: number): string {
	return chapters.find((c) => c.no === no)?.title ?? '';
}

export const toc = chapters.map((c) => ({ ...c, tools: tools.filter((t) => t.chapter === c.no) }));
