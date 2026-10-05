import type { ChainOp } from '../types';
import { locate } from '../json/logic';
import { formatSql, minifySql, SqlError } from './logic';

function located<T>(input: string, f: () => T): T {
	try {
		return f();
	} catch (e) {
		if (e instanceof SqlError) {
			const l = locate(input, e.pos);
			throw new Error(`${e.message}, line ${l.line} column ${l.col}`);
		}
		throw e;
	}
}

export const ops: ChainOp[] = [
	{ id: 'sql-format.format', label: 'SQL format', run: (s) => located(s, () => formatSql(s)) },
	{ id: 'sql-format.minify', label: 'SQL minify', run: (s) => located(s, () => minifySql(s)) }
];
