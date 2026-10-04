import type { ChainOp } from '../tools/types';
import { tools } from '../tools/registry';
import { textOps } from './text-ops';

const modules = import.meta.glob<{ ops: ChainOp[] }>('../tools/*/ops.ts', { eager: true });

export interface OpGroup {
	title: string;
	toolId?: string;
	ops: ChainOp[];
}

/** Ops grouped by tool, in manual order, with the generic text steps last. */
export const groups: OpGroup[] = [
	...tools
		.map((t) => ({
			title: t.title,
			toolId: t.id,
			ops: modules[`../tools/${t.id}/ops.ts`]?.ops ?? []
		}))
		.filter((g) => g.ops.length),
	{ title: 'Text', ops: textOps }
];

export const allOps: ChainOp[] = groups.flatMap((g) => g.ops);
const byId = new Map(allOps.map((o) => [o.id, o]));

export function getOp(id: string): ChainOp | undefined {
	return byId.get(id);
}

export function toolHasOps(toolId: string): boolean {
	return groups.some((g) => g.toolId === toolId);
}

export interface StepResult {
	op: ChainOp;
	output?: string;
	error?: string;
}

/** Runs the steps in order. Stops at the first failing step; later steps are not run. */
export async function runChain(input: string, ids: string[]): Promise<StepResult[]> {
	const out: StepResult[] = [];
	let value = input;
	for (const id of ids) {
		const op = getOp(id);
		if (!op) {
			out.push({
				op: { id, label: `Unknown step "${id}"`, run: (s) => s },
				error: 'This step does not exist (any more)'
			});
			break;
		}
		try {
			value = await op.run(value);
			out.push({ op, output: value });
		} catch (e) {
			out.push({ op, error: (e as Error).message });
			break;
		}
	}
	return out;
}
