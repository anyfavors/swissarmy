import { error } from '@sveltejs/kit';
import { getTool, loadToolUi, tools } from '#lib/tools/registry.ts';
import type { EntryGenerator, PageLoad } from './$types';

export const entries: EntryGenerator = () => tools.map((t) => ({ tool: t.id }));

export const load: PageLoad = async ({ params }) => {
	const meta = getTool(params.tool);
	if (!meta) error(404, 'No such entry in this manual');
	const ui = await loadToolUi(meta.id);
	return { id: meta.id, Ui: ui.default };
};
