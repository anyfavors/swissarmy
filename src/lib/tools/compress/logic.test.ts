import {
	deflateRawSync,
	deflateSync,
	gunzipSync,
	gzipSync,
	inflateRawSync,
	inflateSync
} from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { bytesToBase64 } from '../base64/logic';
import {
	compress,
	decompress,
	looksLikeGzipBase64,
	ratio,
	sniff,
	textBytes,
	utf8OrNull,
	type Format
} from './logic';
import { ops } from './ops';

const text = 'Rødgrød med fløde. '.repeat(50);
const bytes = textBytes(text);
const zlib: Record<Format, [(b: Uint8Array) => Uint8Array, (b: Uint8Array) => Uint8Array]> = {
	gzip: [gzipSync, gunzipSync],
	deflate: [deflateSync, inflateSync],
	'deflate-raw': [deflateRawSync, inflateRawSync]
};

describe.each(['gzip', 'deflate', 'deflate-raw'] as Format[])('%s', (f) => {
	it('compresses into something zlib reads', async () => {
		const out = await compress(bytes, f);
		expect(out.length).toBeLessThan(bytes.length);
		expect(new Uint8Array(zlib[f][1](out))).toEqual(bytes);
	});

	it('decompresses what zlib wrote, sniffing the format', async () => {
		const packed = new Uint8Array(zlib[f][0](bytes));
		expect(sniff(packed)).toBe(f);
		const r = await decompress(packed);
		expect(r.format).toBe(f);
		expect(utf8OrNull(r.bytes)).toBe(text);
	});
});

describe('errors', () => {
	it('rejects corrupt and truncated data', async () => {
		await expect(decompress(new Uint8Array([1, 2, 3, 4]), 'gzip')).rejects.toThrow(
			'Not valid gzip data, or it is cut short'
		);
		const packed = new Uint8Array(gzipSync(bytes)).subarray(0, 20);
		await expect(decompress(packed)).rejects.toThrow(/cut short/);
		await expect(decompress(new Uint8Array())).rejects.toThrow(/Nothing/);
	});

	it('handles empty input', async () => {
		const empty = await compress(new Uint8Array(), 'gzip');
		expect((await decompress(empty)).bytes).toHaveLength(0);
	});
});

describe('helpers', () => {
	it('works out the ratio', () => {
		expect(ratio(1000, 250)).toEqual({ ratio: '25.0%', saved: '75.0% smaller' });
		expect(ratio(10, 30)).toEqual({ ratio: '300.0%', saved: '200.0% larger' });
		expect(ratio(0, 20)).toEqual({ ratio: '', saved: '' });
	});

	it('detects gzip in Base64', () => {
		expect(looksLikeGzipBase64(bytesToBase64(new Uint8Array(gzipSync(bytes))))).toBe(0.8);
		expect(looksLikeGzipBase64(bytesToBase64(new Uint8Array(deflateSync(bytes))))).toBe(0);
		expect(looksLikeGzipBase64('SGVsbG8gd29ybGQgaGVsbG8=')).toBe(0);
		expect(looksLikeGzipBase64('H4sI')).toBe(0);
		expect(looksLikeGzipBase64('not base64 at all, really')).toBe(0);
	});
});

describe('ops', () => {
	const run = (id: string, s: string) => ops.find((o) => o.id === id)!.run(s);
	it('round trips through Base64', async () => {
		for (const [a, b] of [
			['gzip', 'gunzip'],
			['deflate', 'inflate'],
			['deflate-raw', 'inflate-raw']
		])
			expect(await run(`compress.${b}`, await run(`compress.${a}`, text))).toBe(text);
	});
	it('reads Base64 made by zlib', async () => {
		expect(await run('compress.gunzip', gzipSync('hello').toString('base64'))).toBe('hello');
	});
	it('refuses binary output', async () => {
		const bin = gzipSync(Buffer.from([0xff, 0xfe, 0x00])).toString('base64');
		await expect(run('compress.gunzip', bin)).rejects.toThrow(/not UTF-8/);
	});
});
