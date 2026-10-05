import type { ChainOp } from '../types';
import { JsonError, locate } from '../json/logic';
import { jsonToYaml, YamlError, yamlToJson } from './logic';

/** Adds line and column to parse errors, since the chain view shows only the message. */
function located<T>(input: string, f: () => T): T {
	try {
		return f();
	} catch (e) {
		if (e instanceof YamlError || e instanceof JsonError) {
			const l = locate(input, e.pos);
			throw new Error(`${e.message}, line ${l.line} column ${l.col}`);
		}
		throw e;
	}
}

export const ops: ChainOp[] = [
	{
		id: 'yaml.to-json',
		label: 'YAML to JSON',
		run: (s) => located(s, () => yamlToJson(s).json)
	},
	{
		id: 'yaml.from-json',
		label: 'JSON to YAML',
		run: (s) => located(s, () => jsonToYaml(s))
	}
];
