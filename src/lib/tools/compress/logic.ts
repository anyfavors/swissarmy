import { base64ToBytes } from '../base64/logic';

/** The formats the browser's CompressionStream supports. */
export type Format = 'gzip' | 'deflate' | 'deflate-raw';

export const formats: { id: Format; label: string; note: string }[] = [
	{ id: 'gzip', label: 'gzip', note: 'RFC 1952, with header and CRC-32' },
	{ id: 'deflate', label: 'deflate (zlib)', note: 'RFC 1950, with header and Adler-32' },
	{ id: 'deflate-raw', label: 'raw deflate', note: 'RFC 1951, no header or checksum' }
];

function available(): void {
	if (typeof CompressionStream === 'undefined' || typeof DecompressionStream === 'undefined')
		throw new Error('This browser has no CompressionStream, so it cannot compress here');
}

async function pipe(
	bytes: Uint8Array,
	stream: TransformStream<Uint8Array, Uint8Array>
): Promise<Uint8Array> {
	const writer = stream.writable.getWriter();
	const reading = (async () => {
		const reader = stream.readable.getReader();
		const chunks: Uint8Array[] = [];
		let total = 0;
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			chunks.push(value);
			total += value.length;
		}
		const out = new Uint8Array(total);
		let off = 0;
		for (const c of chunks) {
			out.set(c, off);
			off += c.length;
		}
		return out;
	})();
	// Errors surface on the reading side; swallow them here so they are not reported twice.
	writer.write(new Uint8Array(bytes)).catch(() => {});
	writer.close().catch(() => {});
	return reading;
}

export async function compress(bytes: Uint8Array, format: Format): Promise<Uint8Array> {
	available();
	return pipe(
		bytes,
		new CompressionStream(format) as unknown as TransformStream<Uint8Array, Uint8Array>
	);
}

/** Recognises the container from the first bytes. */
export function sniff(bytes: Uint8Array): Format {
	if (bytes[0] === 0x1f && bytes[1] === 0x8b) return 'gzip';
	// zlib: CM = 8 (deflate), and the header is a multiple of 31 (RFC 1950 section 2.2).
	if (
		bytes.length >= 2 &&
		(bytes[0] & 0x0f) === 8 &&
		bytes[0] >> 4 <= 7 &&
		((bytes[0] << 8) | bytes[1]) % 31 === 0
	)
		return 'deflate';
	return 'deflate-raw';
}

const names: Record<Format, string> = {
	gzip: 'gzip',
	deflate: 'deflate (zlib)',
	'deflate-raw': 'raw deflate'
};

export async function decompress(
	bytes: Uint8Array,
	format: Format | 'auto' = 'auto'
): Promise<{ bytes: Uint8Array; format: Format }> {
	available();
	if (!bytes.length) throw new Error('Nothing to decompress');
	const f = format === 'auto' ? sniff(bytes) : format;
	try {
		const out = await pipe(
			bytes,
			new DecompressionStream(f) as unknown as TransformStream<Uint8Array, Uint8Array>
		);
		return { bytes: out, format: f };
	} catch {
		throw new Error(`Not valid ${names[f]} data, or it is cut short`);
	}
}

export function textBytes(s: string): Uint8Array {
	return new TextEncoder().encode(s);
}

export function utf8OrNull(bytes: Uint8Array): string | null {
	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch {
		return null;
	}
}

/** Compressed size as a share of the original, and the saving. */
export function ratio(before: number, after: number): { ratio: string; saved: string } {
	if (!before) return { ratio: '', saved: '' };
	const r = after / before;
	return {
		ratio: `${(r * 100).toFixed(1)}%`,
		saved:
			r <= 1 ? `${((1 - r) * 100).toFixed(1)}% smaller` : `${((r - 1) * 100).toFixed(1)}% larger`
	};
}

/** Base64 that decodes to a gzip stream (magic bytes 1f 8b). */
export function looksLikeGzipBase64(s: string): number {
	const t = s.trim();
	if (t.length < 16 || !/^[A-Za-z0-9+/_\-\s]+={0,2}$/.test(t)) return 0;
	try {
		const head = base64ToBytes(t.replace(/\s+/g, '').slice(0, 8));
		return head[0] === 0x1f && head[1] === 0x8b ? 0.8 : 0;
	} catch {
		return 0;
	}
}
