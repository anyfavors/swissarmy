/**
 * Tiny synthetic images for tests. A minimal TIFF writer lays out IFD0, the Exif IFD,
 * the GPS IFD and IFD1 the way cameras do, in either byte order.
 */

export interface Entry {
	tag: number;
	type: number;
	/** Numbers for integer types, [num, den] pairs for rationals, a string for ASCII, bytes for UNDEFINED. */
	value: number[] | [number, number][] | string | Uint8Array;
	/** For pointer tags: the entries of the sub-IFD. */
	sub?: Entry[];
}

const SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

export function tiff(le: boolean, ifd0: Entry[], ifd1?: Entry[]): Uint8Array {
	const buf: number[] = [];
	const u16 = (at: number, v: number) => {
		const b = le ? [v & 0xff, v >> 8] : [v >> 8, v & 0xff];
		buf[at] = b[0];
		buf[at + 1] = b[1];
	};
	const u32 = (at: number, v: number) => {
		const b = [v >>> 24, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
		if (le) b.reverse();
		for (let i = 0; i < 4; i++) buf[at + i] = b[i];
	};
	const valueBytes = (e: Entry): number[] => {
		const out: number[] = [];
		const put = (n: number, size: number) => {
			const t: number[] = [];
			for (let i = size - 1; i >= 0; i--) t.push((n >>> (i * 8)) & 0xff);
			if (le) t.reverse();
			out.push(...t);
		};
		if (typeof e.value === 'string') return [...new TextEncoder().encode(e.value), 0];
		if (e.value instanceof Uint8Array) return [...e.value];
		for (const v of e.value as (number | [number, number])[]) {
			if (Array.isArray(v)) {
				put(v[0], 4);
				put(v[1], 4);
			} else put(v, SIZE[e.type]);
		}
		return out;
	};
	const count = (e: Entry) =>
		typeof e.value === 'string'
			? new TextEncoder().encode(e.value).length + 1
			: e.value instanceof Uint8Array
				? e.value.length
				: (e.value as unknown[]).length;

	buf.push(...(le ? [0x49, 0x49] : [0x4d, 0x4d]), 0, 0, 0, 0, 0, 0);
	u16(2, 42);

	const write = (entries: Entry[], next?: Entry[]): number => {
		const at = buf.length;
		const n = entries.length;
		for (let i = 0; i < 2 + n * 12 + 4; i++) buf.push(0);
		u16(at, n);
		const later: [number, Entry[]][] = [];
		entries.forEach((e, i) => {
			const p = at + 2 + i * 12;
			u16(p, e.tag);
			u16(p + 2, e.type);
			if (e.sub) {
				u32(p + 4, 1);
				later.push([p + 8, e.sub]);
				return;
			}
			u32(p + 4, count(e));
			const bytes = valueBytes(e);
			if (bytes.length <= 4) bytes.forEach((b, j) => (buf[p + 8 + j] = b));
			else {
				if (buf.length % 2) buf.push(0);
				u32(p + 8, buf.length);
				buf.push(...bytes);
			}
		});
		for (const [slot, sub] of later) u32(slot, write(sub));
		if (next) u32(at + 2 + n * 12, write(next));
		return at;
	};
	u32(4, write(ifd0, ifd1));
	return Uint8Array.from(buf);
}

const seg = (marker: number, body: number[] | Uint8Array) => {
	const len = body.length + 2;
	return [0xff, marker, len >> 8, len & 0xff, ...body];
};
const str = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** SOI, APP0 JFIF, APP1 Exif, APP1 XMP, APP13 IPTC, COM, DQT, SOF0, SOS, scan data, EOI. */
export function jpeg(
	exif: Uint8Array | null,
	extras = true
): { file: Uint8Array; clean: Uint8Array } {
	const soi = [0xff, 0xd8];
	const app0 = seg(0xe0, [...str('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0]);
	const app1 = exif ? seg(0xe1, [...str('Exif\0\0'), ...exif]) : [];
	const xmp = extras ? seg(0xe1, str('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta/>')) : [];
	const app13 = extras ? seg(0xed, str('Photoshop 3.0\x008BIM\x04\x04\0\0\0\0\0\0')) : [];
	const com = extras ? seg(0xfe, str('secret comment')) : [];
	const app2 = seg(0xe2, str('ICC_PROFILE\0\x01\x01xx'));
	const dqt = seg(0xdb, [0, ...new Array(64).fill(1)]);
	// SOF0: precision 8, height 480, width 640, 1 component
	const sof = seg(0xc0, [8, 0x01, 0xe0, 0x02, 0x80, 1, 1, 0x11, 0]);
	const sos = seg(0xda, [1, 1, 0, 0, 0x3f, 0]);
	// entropy-coded data with a stuffed 0xFF00 and a restart marker
	const scan = [0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56, 0xff, 0xd9];
	const file = Uint8Array.from([
		...soi,
		...app0,
		...app1,
		...xmp,
		...app2,
		...app13,
		...com,
		...dqt,
		...sof,
		...sos,
		...scan
	]);
	const clean = Uint8Array.from([...soi, ...app0, ...app2, ...dqt, ...sof, ...sos, ...scan]);
	return { file, clean };
}

function crc32(b: Uint8Array): number {
	let c = 0xffffffff;
	for (const x of b) {
		c ^= x;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	}
	return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: number[] | Uint8Array): number[] {
	const body = Uint8Array.from([...str(type), ...data]);
	const c = crc32(body);
	const len = data.length;
	return [
		len >>> 24,
		(len >>> 16) & 0xff,
		(len >>> 8) & 0xff,
		len & 0xff,
		...body,
		c >>> 24,
		(c >>> 16) & 0xff,
		(c >>> 8) & 0xff,
		c & 0xff
	];
}

/** 2x3 PNG with eXIf, tEXt, iTXt (XMP) and tIME chunks. IDAT content is a placeholder. */
export function png(exif: Uint8Array): { file: Uint8Array; clean: Uint8Array } {
	const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
	const ihdr = chunk('IHDR', [0, 0, 0, 2, 0, 0, 0, 3, 8, 2, 0, 0, 0]);
	const exifC = chunk('eXIf', exif);
	const text = chunk('tEXt', str('Author\0Jane Doe'));
	const itxt = chunk('iTXt', [...str('XML:com.adobe.xmp\0\0\0\0\0'), ...str('<x:xmpmeta/>')]);
	const time = chunk('tIME', [0x07, 0xea, 10, 5, 12, 30, 0]);
	const idat = chunk('IDAT', [0x78, 0x9c, 0x63, 0, 0, 0, 1, 0, 1]);
	const iend = chunk('IEND', []);
	const file = Uint8Array.from([
		...sig,
		...ihdr,
		...exifC,
		...text,
		...itxt,
		...time,
		...idat,
		...iend
	]);
	const clean = Uint8Array.from([...sig, ...ihdr, ...idat, ...iend]);
	return { file, clean };
}

function riff(id: string, data: number[]): number[] {
	const len = data.length;
	const out = [...str(id), len & 0xff, (len >> 8) & 0xff, (len >> 16) & 0xff, len >>> 24, ...data];
	if (len & 1) out.push(0);
	return out;
}

/** Extended WebP: VP8X with EXIF and XMP flags, a dummy VP8L, EXIF and XMP chunks. */
export function webp(exif: Uint8Array): { file: Uint8Array; vp8x: number[] } {
	// flags 0x0c = EXIF + XMP, canvas 100 x 50 (stored minus one)
	const vp8x = riff('VP8X', [0x0c, 0, 0, 0, 99, 0, 0, 49, 0, 0]);
	const vp8l = riff('VP8L', [0x2f, 0x63, 0xc0, 0x0c, 0x00]);
	const ex = riff('EXIF', [...exif]);
	const xmp = riff('XMP ', str('<x:xmpmeta/>'));
	const body = [...str('WEBP'), ...vp8x, ...vp8l, ...ex, ...xmp];
	const n = body.length;
	const file = Uint8Array.from([
		...str('RIFF'),
		n & 0xff,
		(n >> 8) & 0xff,
		(n >> 16) & 0xff,
		n >>> 24,
		...body
	]);
	return { file, vp8x };
}
