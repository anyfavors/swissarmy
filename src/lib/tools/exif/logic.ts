/**
 * Image metadata reader and stripper.
 * JPEG: ISO/IEC 10918-1 markers, Exif in APP1 (CIPA DC-008, "Exif\0\0" + TIFF), XMP in APP1,
 * IPTC in APP13 (Photoshop image resources). PNG: chunks per the PNG spec (3rd edition), including
 * eXIf, tEXt, iTXt, zTXt. WebP: RIFF container with VP8X, EXIF and XMP chunks.
 * TIFF structure per TIFF 6.0: byte order, IFD entries of 12 bytes.
 */
import { exifTags, exposurePrograms, gpsTags, ifd0Tags, meteringModes, orientations } from './tags';

export type IfdName = 'IFD0' | 'Exif' | 'GPS' | 'IFD1' | 'Interop';

export type Rational = [number, number];
export type TagValue = string | number[] | Rational[] | Uint8Array;

export interface Tag {
	ifd: IfdName;
	id: number;
	name: string;
	type: number;
	count: number;
	value: TagValue;
}

export interface Tiff {
	littleEndian: boolean;
	tags: Tag[];
	/** Embedded JPEG thumbnail (IFD1), offset relative to the TIFF header. */
	thumbnail?: { offset: number; length: number };
	warnings: string[];
}

const TYPE_SIZE: Record<number, number> = {
	1: 1, // BYTE
	2: 1, // ASCII
	3: 2, // SHORT
	4: 4, // LONG
	5: 8, // RATIONAL
	6: 1, // SBYTE
	7: 1, // UNDEFINED
	8: 2, // SSHORT
	9: 4, // SLONG
	10: 8, // SRATIONAL
	11: 4, // FLOAT
	12: 8 // DOUBLE
};

const POINTERS: Record<number, IfdName> = { 0x8769: 'Exif', 0x8825: 'GPS', 0xa005: 'Interop' };

function tagName(ifd: IfdName, id: number): string {
	const t = ifd === 'GPS' ? gpsTags : ifd === 'Exif' || ifd === 'Interop' ? exifTags : ifd0Tags;
	return t[id] ?? `Tag 0x${id.toString(16).padStart(4, '0')}`;
}

/** Parses a TIFF structure (the payload of an Exif block). */
export function parseTiff(b: Uint8Array): Tiff {
	if (b.length < 8) throw new Error('Exif block is too short');
	const order = String.fromCharCode(b[0], b[1]);
	if (order !== 'II' && order !== 'MM') throw new Error('Exif block has no TIFF byte order mark');
	const le = order === 'II';
	const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
	if (dv.getUint16(2, le) !== 42) throw new Error('Exif block has a bad TIFF magic number');
	const tags: Tag[] = [];
	const warnings: string[] = [];
	const seen = new Set<number>();
	let thumbnail: Tiff['thumbnail'];

	const readValue = (type: number, count: number, off: number): TagValue => {
		switch (type) {
			case 2: {
				let s = '';
				for (let i = 0; i < count; i++) {
					const c = b[off + i];
					if (c === 0) break;
					s += String.fromCharCode(c);
				}
				// ASCII fields are often UTF-8 in practice
				try {
					return new TextDecoder('utf-8', { fatal: true })
						.decode(Uint8Array.from(s, (ch) => ch.charCodeAt(0)))
						.trim();
				} catch {
					return s.trim();
				}
			}
			case 1:
			case 6:
			case 7:
				if (type === 1 && count <= 8) return Array.from(b.subarray(off, off + count));
				return b.slice(off, off + count);
			case 3:
			case 8:
				return Array.from({ length: count }, (_, i) =>
					type === 3 ? dv.getUint16(off + i * 2, le) : dv.getInt16(off + i * 2, le)
				);
			case 4:
			case 9:
				return Array.from({ length: count }, (_, i) =>
					type === 4 ? dv.getUint32(off + i * 4, le) : dv.getInt32(off + i * 4, le)
				);
			case 5:
			case 10:
				return Array.from({ length: count }, (_, i): Rational =>
					type === 5
						? [dv.getUint32(off + i * 8, le), dv.getUint32(off + i * 8 + 4, le)]
						: [dv.getInt32(off + i * 8, le), dv.getInt32(off + i * 8 + 4, le)]
				);
			case 11:
				return Array.from({ length: count }, (_, i) => dv.getFloat32(off + i * 4, le));
			case 12:
				return Array.from({ length: count }, (_, i) => dv.getFloat64(off + i * 8, le));
			default:
				return b.slice(off, off + count);
		}
	};

	const readIfd = (offset: number, ifd: IfdName): number => {
		if (seen.has(offset)) {
			warnings.push(`${ifd} points back to an IFD already read, stopped`);
			return 0;
		}
		seen.add(offset);
		if (offset + 2 > b.length) {
			warnings.push(`${ifd} offset ${offset} is outside the Exif block`);
			return 0;
		}
		const n = dv.getUint16(offset, le);
		if (n > 1000 || offset + 2 + n * 12 > b.length) {
			warnings.push(`${ifd} is truncated or damaged`);
			return 0;
		}
		let thumbOff = -1;
		let thumbLen = -1;
		for (let i = 0; i < n; i++) {
			const e = offset + 2 + i * 12;
			const id = dv.getUint16(e, le);
			const type = dv.getUint16(e + 2, le);
			const count = dv.getUint32(e + 4, le);
			const size = (TYPE_SIZE[type] ?? 1) * count;
			const valOff = size <= 4 ? e + 8 : dv.getUint32(e + 8, le);
			if (!TYPE_SIZE[type]) {
				warnings.push(`${ifd} tag 0x${id.toString(16)} has unknown type ${type}`);
				continue;
			}
			if (valOff + size > b.length) {
				warnings.push(`${ifd} ${tagName(ifd, id)} points outside the Exif block`);
				continue;
			}
			const value = readValue(type, count, valOff);
			if (POINTERS[id] && Array.isArray(value) && typeof value[0] === 'number') {
				readIfd(value[0] as number, POINTERS[id]);
				continue;
			}
			if (ifd === 'IFD1' && id === 0x0201) thumbOff = (value as number[])[0];
			if (ifd === 'IFD1' && id === 0x0202) thumbLen = (value as number[])[0];
			tags.push({ ifd, id, name: tagName(ifd, id), type, count, value });
		}
		if (thumbOff >= 0 && thumbLen > 0) thumbnail = { offset: thumbOff, length: thumbLen };
		const nextPos = offset + 2 + n * 12;
		return nextPos + 4 <= b.length ? dv.getUint32(nextPos, le) : 0;
	};

	const next = readIfd(dv.getUint32(4, le), 'IFD0');
	if (next) readIfd(next, 'IFD1');
	return { littleEndian: le, tags, thumbnail, warnings };
}

/* ------------------------------------------------------------ helpers */

const ratio = (r: Rational) => (r[1] === 0 ? NaN : r[0] / r[1]);
const trim = (n: number, d = 2) => String(Number(n.toFixed(d)));

export function get(t: Tiff | undefined, ifd: IfdName, id: number): Tag | undefined {
	return t?.tags.find((x) => x.ifd === ifd && x.id === id);
}

function num(tag: Tag | undefined): number | undefined {
	if (!tag || !Array.isArray(tag.value) || !tag.value.length) return undefined;
	const v = tag.value[0];
	return Array.isArray(v) ? ratio(v) : (v as number);
}

function str(tag: Tag | undefined): string | undefined {
	return tag && typeof tag.value === 'string' && tag.value ? tag.value : undefined;
}

/** Human readable value of any tag. */
export function display(tag: Tag): string {
	const v = tag.value;
	const n = num(tag);
	if (tag.ifd !== 'GPS') {
		switch (tag.id) {
			case 0x829a:
				if (n === undefined) break;
				return n >= 1 ? `${trim(n, 1)} s` : `1/${Math.round(1 / n)} s`;
			case 0x829d:
				return n === undefined ? '' : `f/${trim(n, 1)}`;
			case 0x920a:
				return n === undefined ? '' : `${trim(n, 1)} mm`;
			case 0xa405:
				return n === undefined ? '' : `${n} mm`;
			case 0x0112:
				return n === undefined ? '' : `${n}: ${orientations[n] ?? 'invalid'}`;
			case 0x8822:
				return n === undefined ? '' : (exposurePrograms[n] ?? String(n));
			case 0x9207:
				return n === undefined ? '' : (meteringModes[n] ?? String(n));
			case 0x9209:
				return n === undefined ? '' : flash(n);
			case 0x9204:
				return n === undefined ? '' : `${n > 0 ? '+' : ''}${trim(n, 2)} EV`;
			case 0xa432:
				return lensSpec(v as Rational[]);
			case 0x9000:
			case 0xa000:
				if (v instanceof Uint8Array) return String.fromCharCode(...v);
				break;
			case 0x9286:
				return userComment(v);
			case 0x927c:
				return `${(v as Uint8Array).length} bytes of vendor data`;
		}
	}
	if (typeof v === 'string') return v;
	if (v instanceof Uint8Array) {
		const ascii = /^[\x20-\x7e]*$/.test(String.fromCharCode(...v.subarray(0, 64)));
		return ascii && v.length <= 64 ? String.fromCharCode(...v) : `${v.length} bytes`;
	}
	return (v as (number | Rational)[])
		.slice(0, 16)
		.map((x) => (Array.isArray(x) ? (x[1] === 1 ? String(x[0]) : `${x[0]}/${x[1]}`) : trim(x, 6)))
		.join(', ');
}

function flash(n: number): string {
	const parts = [n & 1 ? 'Fired' : 'Did not fire'];
	const mode = (n >> 3) & 3;
	if (mode === 1) parts.push('compulsory');
	if (mode === 2) parts.push('suppressed');
	if (mode === 3) parts.push('auto');
	if (n & 0x40) parts.push('red-eye reduction');
	if (n & 0x20) parts.push('no flash unit');
	return parts.join(', ');
}

function lensSpec(v: Rational[]): string {
	const [a, b, c, d] = v.map(ratio);
	const focal = a === b ? `${trim(a, 1)} mm` : `${trim(a, 1)}-${trim(b, 1)} mm`;
	const ap = Number.isNaN(c)
		? ''
		: c === d || Number.isNaN(d)
			? ` f/${trim(c, 1)}`
			: ` f/${trim(c, 1)}-${trim(d, 1)}`;
	return focal + ap;
}

function userComment(v: TagValue): string {
	if (!(v instanceof Uint8Array) || v.length < 8) return '';
	const code = String.fromCharCode(...v.subarray(0, 8)).replace(/\0/g, '');
	const body = v.subarray(8);
	if (code === 'UNICODE') {
		const le = body[0] !== 0 && body[1] === 0;
		return new TextDecoder(le ? 'utf-16le' : 'utf-16be').decode(body).replace(/\0+$/, '').trim();
	}
	return new TextDecoder().decode(body).replace(/\0+$/, '').trim();
}

/* ------------------------------------------------------------- summary */

export interface Gps {
	lat: number;
	lon: number;
	alt?: number;
	time?: string;
}

function dms(tag: Tag | undefined): number | undefined {
	if (!tag || !Array.isArray(tag.value) || tag.value.length < 3) return undefined;
	const [d, m, s] = (tag.value as Rational[]).map(ratio);
	const v = d + m / 60 + s / 3600;
	return Number.isFinite(v) ? v : undefined;
}

export function gps(t: Tiff | undefined): Gps | null {
	let lat = dms(get(t, 'GPS', 2));
	let lon = dms(get(t, 'GPS', 4));
	if (lat === undefined || lon === undefined) return null;
	if (str(get(t, 'GPS', 1))?.toUpperCase() === 'S') lat = -lat;
	if (str(get(t, 'GPS', 3))?.toUpperCase() === 'W') lon = -lon;
	if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
	const out: Gps = { lat, lon };
	const alt = num(get(t, 'GPS', 6));
	if (alt !== undefined && Number.isFinite(alt)) {
		const below = num(get(t, 'GPS', 5)) === 1;
		out.alt = below ? -alt : alt;
	}
	const date = str(get(t, 'GPS', 0x1d));
	const time = get(t, 'GPS', 7);
	if (date && time && Array.isArray(time.value) && time.value.length === 3) {
		const [h, m, s] = (time.value as Rational[]).map(ratio);
		const p = (x: number) => String(Math.floor(x)).padStart(2, '0');
		out.time = `${date.replace(/:/g, '-')} ${p(h)}:${p(m)}:${p(s)} UTC`;
	}
	return out;
}

export function osmLink(g: Gps): string {
	const la = g.lat.toFixed(6);
	const lo = g.lon.toFixed(6);
	return `https://www.openstreetmap.org/?mlat=${la}&mlon=${lo}#map=16/${la}/${lo}`;
}

/* ----------------------------------------------------------- containers */

export type Format = 'jpeg' | 'png' | 'webp';

export interface TextChunk {
	keyword: string;
	text: string;
}

export interface ImageInfo {
	format: Format;
	width?: number;
	height?: number;
	exif?: Tiff;
	exifError?: string;
	xmp?: string;
	iptc: boolean;
	icc: boolean;
	comments: string[];
	text: TextChunk[];
	/** Names of the blocks that "Strip metadata" removes, with sizes. */
	removable: { name: string; bytes: number }[];
	warnings: string[];
}

const ascii = (b: Uint8Array, start: number, len: number) =>
	String.fromCharCode(...b.subarray(start, start + len));
const startsWith = (b: Uint8Array, at: number, s: string) => ascii(b, at, s.length) === s;
const u16 = (b: Uint8Array, at: number) => (b[at] << 8) | b[at + 1];
const u32be = (b: Uint8Array, at: number) =>
	((b[at] << 24) >>> 0) + (b[at + 1] << 16) + (b[at + 2] << 8) + b[at + 3];
const u32le = (b: Uint8Array, at: number) =>
	b[at] + (b[at + 1] << 8) + (b[at + 2] << 16) + ((b[at + 3] << 24) >>> 0);

export function detectFormat(b: Uint8Array): Format | null {
	if (b[0] === 0xff && b[1] === 0xd8) return 'jpeg';
	if (startsWith(b, 0, '\x89PNG\r\n\x1a\n')) return 'png';
	if (startsWith(b, 0, 'RIFF') && startsWith(b, 8, 'WEBP')) return 'webp';
	return null;
}

function newInfo(format: Format): ImageInfo {
	return { format, iptc: false, icc: false, comments: [], text: [], removable: [], warnings: [] };
}

function readExif(info: ImageInfo, tiff: Uint8Array) {
	try {
		info.exif = parseTiff(tiff);
		info.warnings.push(...info.exif.warnings);
	} catch (e) {
		info.exifError = (e as Error).message;
	}
}

interface JpegSegment {
	marker: number;
	start: number;
	/** End of the segment (exclusive). */
	end: number;
	dataStart: number;
}

const EXIF_ID = 'Exif\0\0';
const XMP_ID = 'http://ns.adobe.com/xap/1.0/\0';
const XMP_EXT_ID = 'http://ns.adobe.com/xmp/extension/\0';

/** Walks JPEG marker segments up to the start of scan. */
function jpegSegments(b: Uint8Array): { segments: JpegSegment[]; scanStart: number } {
	const segments: JpegSegment[] = [];
	let p = 2;
	while (p < b.length) {
		if (b[p] !== 0xff) throw new Error(`JPEG structure broken at byte ${p}`);
		while (b[p + 1] === 0xff) p++; // fill bytes
		const marker = b[p + 1];
		if (marker === 0xd9) return { segments, scanStart: p };
		if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
			p += 2;
			continue;
		}
		if (p + 4 > b.length) throw new Error('JPEG ends inside a segment header');
		const len = u16(b, p + 2);
		if (len < 2 || p + 2 + len > b.length)
			throw new Error(`JPEG segment at byte ${p} has a bad length`);
		if (marker === 0xda) return { segments, scanStart: p };
		segments.push({ marker, start: p, end: p + 2 + len, dataStart: p + 4 });
		p += 2 + len;
	}
	throw new Error('JPEG has no image data (no start of scan)');
}

function jpegInfo(b: Uint8Array): ImageInfo {
	const info = newInfo('jpeg');
	const { segments } = jpegSegments(b);
	for (const s of segments) {
		const d = s.dataStart;
		const len = s.end - d;
		if (s.marker === 0xe1) {
			if (startsWith(b, d, EXIF_ID)) {
				readExif(info, b.subarray(d + 6, s.end));
				info.removable.push({ name: 'Exif (APP1)', bytes: s.end - s.start });
			} else if (startsWith(b, d, XMP_ID)) {
				info.xmp =
					(info.xmp ?? '') + new TextDecoder().decode(b.subarray(d + XMP_ID.length, s.end));
				info.removable.push({ name: 'XMP (APP1)', bytes: s.end - s.start });
			} else if (startsWith(b, d, XMP_EXT_ID)) {
				info.removable.push({ name: 'Extended XMP (APP1)', bytes: s.end - s.start });
			} else info.removable.push({ name: 'Other APP1', bytes: s.end - s.start });
		} else if (s.marker === 0xed) {
			info.iptc = startsWith(b, d, 'Photoshop 3.0\0');
			info.removable.push({ name: 'Photoshop / IPTC (APP13)', bytes: s.end - s.start });
		} else if (s.marker === 0xfe) {
			info.comments.push(new TextDecoder().decode(b.subarray(d, s.end)));
			info.removable.push({ name: 'Comment (COM)', bytes: s.end - s.start });
		} else if (s.marker === 0xe2 && startsWith(b, d, 'ICC_PROFILE\0')) {
			info.icc = true;
		} else if (
			s.marker >= 0xc0 &&
			s.marker <= 0xcf &&
			![0xc4, 0xc8, 0xcc].includes(s.marker) &&
			len >= 5
		) {
			info.height = u16(b, d + 1);
			info.width = u16(b, d + 3);
		}
	}
	return info;
}

/** Removes APP1 (Exif, XMP), APP13 (IPTC) and COM segments. Image data is copied byte for byte. */
function jpegStrip(b: Uint8Array): Uint8Array {
	const { segments, scanStart } = jpegSegments(b);
	const keep: Uint8Array[] = [b.subarray(0, 2)];
	for (const s of segments)
		if (s.marker !== 0xe1 && s.marker !== 0xed && s.marker !== 0xfe)
			keep.push(b.subarray(s.start, s.end));
	keep.push(b.subarray(scanStart));
	return concat(keep);
}

function concat(parts: Uint8Array[]): Uint8Array {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let o = 0;
	for (const p of parts) {
		out.set(p, o);
		o += p.length;
	}
	return out;
}

/* PNG */

interface PngChunk {
	type: string;
	start: number;
	end: number;
	data: Uint8Array;
}

function pngChunks(b: Uint8Array): PngChunk[] {
	const out: PngChunk[] = [];
	let p = 8;
	while (p + 12 <= b.length) {
		const len = u32be(b, p);
		const type = ascii(b, p + 4, 4);
		if (p + 12 + len > b.length) throw new Error(`PNG chunk ${type} runs past the end of the file`);
		out.push({ type, start: p, end: p + 12 + len, data: b.subarray(p + 8, p + 8 + len) });
		p += 12 + len;
		if (type === 'IEND') break;
	}
	return out;
}

const PNG_STRIP = new Set(['eXIf', 'tEXt', 'iTXt', 'zTXt', 'tIME']);
const latin1 = (b: Uint8Array) => new TextDecoder('latin1').decode(b);

function pngInfo(b: Uint8Array): ImageInfo {
	const info = newInfo('png');
	for (const c of pngChunks(b)) {
		const d = c.data;
		if (c.type === 'IHDR' && d.length >= 8) {
			info.width = u32be(d, 0);
			info.height = u32be(d, 4);
		} else if (c.type === 'eXIf') {
			readExif(info, startsWith(d, 0, EXIF_ID) ? d.subarray(6) : d);
		} else if (c.type === 'iCCP') info.icc = true;
		else if (c.type === 'tEXt') {
			const z = d.indexOf(0);
			info.text.push({ keyword: latin1(d.subarray(0, z)), text: latin1(d.subarray(z + 1)) });
		} else if (c.type === 'zTXt') {
			const z = d.indexOf(0);
			info.text.push({ keyword: latin1(d.subarray(0, z)), text: '(compressed text, not shown)' });
		} else if (c.type === 'iTXt') {
			const z = d.indexOf(0);
			const keyword = latin1(d.subarray(0, z));
			const compressed = d[z + 1] === 1;
			const langEnd = d.indexOf(0, z + 3);
			const transEnd = d.indexOf(0, langEnd + 1);
			const body = d.subarray(transEnd + 1);
			const text = compressed ? '(compressed text, not shown)' : new TextDecoder().decode(body);
			if (keyword === 'XML:com.adobe.xmp') info.xmp = text;
			else info.text.push({ keyword, text });
		} else if (c.type === 'tIME' && d.length >= 7) {
			const t = `${u16(d, 0)}-${String(d[2]).padStart(2, '0')}-${String(d[3]).padStart(2, '0')} ${String(d[4]).padStart(2, '0')}:${String(d[5]).padStart(2, '0')}:${String(d[6]).padStart(2, '0')} UTC`;
			info.text.push({ keyword: 'Last modified (tIME)', text: t });
		}
		if (PNG_STRIP.has(c.type))
			info.removable.push({ name: `${c.type} chunk`, bytes: c.end - c.start });
	}
	return info;
}

function pngStrip(b: Uint8Array): Uint8Array {
	const parts = [b.subarray(0, 8)];
	for (const c of pngChunks(b)) if (!PNG_STRIP.has(c.type)) parts.push(b.subarray(c.start, c.end));
	return concat(parts);
}

/* WebP */

interface RiffChunk {
	id: string;
	start: number;
	end: number;
	data: Uint8Array;
}

function webpChunks(b: Uint8Array): RiffChunk[] {
	const out: RiffChunk[] = [];
	let p = 12;
	while (p + 8 <= b.length) {
		const id = ascii(b, p, 4);
		const len = u32le(b, p + 4);
		if (p + 8 + len > b.length)
			throw new Error(`WebP chunk ${id.trim()} runs past the end of the file`);
		const end = p + 8 + len + (len & 1);
		out.push({ id, start: p, end: Math.min(end, b.length), data: b.subarray(p + 8, p + 8 + len) });
		p = end;
	}
	return out;
}

function webpInfo(b: Uint8Array): ImageInfo {
	const info = newInfo('webp');
	for (const c of webpChunks(b)) {
		const d = c.data;
		if (c.id === 'VP8X' && d.length >= 10) {
			info.width = 1 + d[4] + (d[5] << 8) + (d[6] << 16);
			info.height = 1 + d[7] + (d[8] << 8) + (d[9] << 16);
		} else if (c.id === 'VP8 ' && d.length >= 10 && !info.width) {
			info.width = (d[6] | (d[7] << 8)) & 0x3fff;
			info.height = (d[8] | (d[9] << 8)) & 0x3fff;
		} else if (c.id === 'VP8L' && d.length >= 5 && !info.width) {
			const bits = d[1] | (d[2] << 8) | (d[3] << 16) | (d[4] << 24);
			info.width = (bits & 0x3fff) + 1;
			info.height = ((bits >> 14) & 0x3fff) + 1;
		} else if (c.id === 'EXIF') {
			readExif(info, startsWith(d, 0, EXIF_ID) ? d.subarray(6) : d);
			info.removable.push({ name: 'EXIF chunk', bytes: c.end - c.start });
		} else if (c.id === 'XMP ') {
			info.xmp = new TextDecoder().decode(d);
			info.removable.push({ name: 'XMP chunk', bytes: c.end - c.start });
		} else if (c.id === 'ICCP') info.icc = true;
	}
	return info;
}

function webpStrip(b: Uint8Array): Uint8Array {
	const parts: Uint8Array[] = [];
	for (const c of webpChunks(b)) {
		if (c.id === 'EXIF' || c.id === 'XMP ') continue;
		if (c.id === 'VP8X') {
			const copy = b.slice(c.start, c.end);
			copy[8] &= ~(0x08 | 0x04); // clear the EXIF and XMP flags
			parts.push(copy);
		} else parts.push(b.subarray(c.start, c.end));
	}
	const body = concat(parts);
	const out = new Uint8Array(12 + body.length);
	out.set(b.subarray(0, 12));
	out.set(body, 12);
	const size = 4 + body.length;
	out[4] = size & 0xff;
	out[5] = (size >> 8) & 0xff;
	out[6] = (size >> 16) & 0xff;
	out[7] = (size >>> 24) & 0xff;
	return out;
}

/* ------------------------------------------------------------- public */

export function readImage(b: Uint8Array): ImageInfo {
	const f = detectFormat(b);
	if (f === 'jpeg') return jpegInfo(b);
	if (f === 'png') return pngInfo(b);
	if (f === 'webp') return webpInfo(b);
	throw new Error('Not a JPEG, PNG or WebP file');
}

/** Lossless metadata removal: only metadata blocks are dropped, image data is not re-encoded. */
export function stripMetadata(b: Uint8Array): Uint8Array {
	const f = detectFormat(b);
	if (f === 'jpeg') return jpegStrip(b);
	if (f === 'png') return pngStrip(b);
	if (f === 'webp') return webpStrip(b);
	throw new Error('Not a JPEG, PNG or WebP file');
}

export interface Finding {
	level: 'danger' | 'warn' | 'info';
	text: string;
}

/** What the file gives away, most sensitive first. */
export function privacy(info: ImageInfo): Finding[] {
	const f: Finding[] = [];
	const t = info.exif;
	const g = gps(t);
	if (g)
		f.push({
			level: 'danger',
			text: `This image reveals where it was taken: ${g.lat.toFixed(5)}, ${g.lon.toFixed(5)}`
		});
	else if (t?.tags.some((x) => x.ifd === 'GPS'))
		f.push({ level: 'warn', text: 'GPS fields are present, but without a usable position' });
	const serials = [0xa431, 0xa435].map((id) => str(get(t, 'Exif', id))).filter(Boolean);
	if (serials.length)
		f.push({
			level: 'warn',
			text: `Serial numbers can link photos to one camera: ${serials.join(', ')}`
		});
	const owner = [
		str(get(t, 'Exif', 0xa430)),
		str(get(t, 'IFD0', 0x013b)),
		str(get(t, 'IFD0', 0x8298))
	].filter(Boolean);
	if (owner.length) f.push({ level: 'warn', text: `Names: ${owner.join(', ')}` });
	const when = str(get(t, 'Exif', 0x9003)) ?? str(get(t, 'IFD0', 0x0132));
	if (when) f.push({ level: 'info', text: `Date and time: ${when}` });
	const make = [str(get(t, 'IFD0', 0x010f)), str(get(t, 'IFD0', 0x0110))].filter(Boolean).join(' ');
	if (make) f.push({ level: 'info', text: `Device: ${make}` });
	const sw = str(get(t, 'IFD0', 0x0131));
	if (sw) f.push({ level: 'info', text: `Software: ${sw}` });
	if (t?.thumbnail)
		f.push({
			level: 'warn',
			text: 'Contains an embedded thumbnail. It can show the picture before cropping or edits'
		});
	if (get(t, 'Exif', 0x927c))
		f.push({
			level: 'info',
			text: 'Contains a maker note: vendor data that may include serial numbers'
		});
	if (info.xmp)
		f.push({
			level: 'warn',
			text: 'Contains XMP: may hold edit history, location, people or ratings'
		});
	if (info.iptc)
		f.push({
			level: 'warn',
			text: 'Contains IPTC: may hold author, caption, location and keywords'
		});
	if (info.comments.length)
		f.push({
			level: 'info',
			text: `Contains ${info.comments.length} comment${info.comments.length > 1 ? 's' : ''}`
		});
	if (info.text.length)
		f.push({
			level: 'info',
			text: `Contains ${info.text.length} PNG text field${info.text.length > 1 ? 's' : ''}`
		});
	return f;
}

/** Summary rows for the camera section. */
export function camera(t: Tiff | undefined): { label: string; value: string }[] {
	const rows: { label: string; value: string }[] = [];
	const add = (label: string, tag: Tag | undefined) => {
		if (tag) {
			const v = display(tag);
			if (v) rows.push({ label, value: v });
		}
	};
	add('Make', get(t, 'IFD0', 0x010f));
	add('Model', get(t, 'IFD0', 0x0110));
	add('Lens', get(t, 'Exif', 0xa434) ?? get(t, 'Exif', 0xa432));
	add('Taken', get(t, 'Exif', 0x9003));
	add('Time zone offset', get(t, 'Exif', 0x9011));
	add('Modified', get(t, 'IFD0', 0x0132));
	add('Exposure', get(t, 'Exif', 0x829a));
	add('Aperture', get(t, 'Exif', 0x829d));
	add('ISO', get(t, 'Exif', 0x8827));
	add('Focal length', get(t, 'Exif', 0x920a));
	add('35 mm equivalent', get(t, 'Exif', 0xa405));
	add('Exposure bias', get(t, 'Exif', 0x9204));
	add('Program', get(t, 'Exif', 0x8822));
	add('Metering', get(t, 'Exif', 0x9207));
	add('Flash', get(t, 'Exif', 0x9209));
	add('Orientation', get(t, 'IFD0', 0x0112));
	add('Software', get(t, 'IFD0', 0x0131));
	return rows;
}

export function orientation(t: Tiff | undefined): number {
	return num(get(t, 'IFD0', 0x0112)) ?? 1;
}
