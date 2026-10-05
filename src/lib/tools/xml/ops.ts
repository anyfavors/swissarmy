import type { ChainOp } from '../types';
import { locate } from '../json/logic';
import { formatXml, minifyXml, XmlError } from './logic';

function located<T>(input: string, f: () => T): T {
	try {
		return f();
	} catch (e) {
		if (e instanceof XmlError) {
			const l = locate(input, e.pos);
			throw new Error(`${e.message}, line ${l.line} column ${l.col}`);
		}
		throw e;
	}
}

export const ops: ChainOp[] = [
	{ id: 'xml.format', label: 'XML format', run: (s) => located(s, () => formatXml(s)) },
	{ id: 'xml.minify', label: 'XML minify', run: (s) => located(s, () => minifyXml(s)) }
];
