import { describe, expect, it } from 'vitest';
import { allOps, runChain, toolHasOps } from './registry';
import { getTool } from '../tools/registry';

describe('chain', () => {
	it('has unique op ids prefixed by an existing tool or text', () => {
		const ids = allOps.map((o) => o.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+\.[a-z0-9-]+$/);
	});

	it('only gives ops to tools that exist', () => {
		expect(toolHasOps('base64')).toBe(true);
		expect(getTool('base64')).toBeTruthy();
		expect(toolHasOps('cidr')).toBe(false);
	});

	it('decodes base64 then pretty-prints JSON', async () => {
		const input = btoa('{"b":1,"a":[true,null]}');
		const r = await runChain(input, ['base64.decode', 'json.sort']);
		expect(r.map((s) => s.error)).toEqual([undefined, undefined]);
		expect(r[1].output).toBe('{\n  "a": [\n    true,\n    null\n  ],\n  "b": 1\n}');
	});

	it('round-trips url, html and base64 encodings', async () => {
		const text = 'Rødgrød <med> fløde & "ost"?';
		const r = await runChain(text, [
			'html.encode',
			'url.encode',
			'base64.encode-url',
			'base64.decode',
			'url.decode',
			'html.decode'
		]);
		expect(r.at(-1)?.output).toBe(text);
	});

	it('hashes', async () => {
		const r = await runChain('abc', ['hash.sha256']);
		expect(r[0].output).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
	});

	it('stops at the first error and reports it', async () => {
		const r = await runChain('not json', ['json.format', 'text.upper']);
		expect(r).toHaveLength(1);
		expect(r[0].error).toBeTruthy();
	});

	it('reports unknown steps', async () => {
		const r = await runChain('x', ['text.upper', 'nope.nothing']);
		expect(r[1].error).toMatch(/does not exist/);
	});
});
