import { describe, expect, it } from 'vitest';
import { jpeg, png, tiff, webp, type Entry } from './fixtures';
import {
	camera,
	detectFormat,
	display,
	get,
	gps,
	osmLink,
	parseTiff,
	privacy,
	readImage,
	stripMetadata
} from './logic';

const R = (n: number, d: number): [number, number] => [n, d];

/** A typical phone photo: make, model, dates, exposure, GPS in Copenhagen, a thumbnail. */
function sample(le: boolean): Uint8Array {
	const exifIfd: Entry[] = [
		{ tag: 0x829a, type: 5, value: [R(1, 250)] },
		{ tag: 0x829d, type: 5, value: [R(18, 10)] },
		{ tag: 0x8827, type: 3, value: [100] },
		{ tag: 0x9000, type: 7, value: new TextEncoder().encode('0232') },
		{ tag: 0x9003, type: 2, value: '2026:10:05 14:03:12' },
		{ tag: 0x9011, type: 2, value: '+02:00' },
		{ tag: 0x9204, type: 10, value: [R(-1, 3)] },
		{ tag: 0x9209, type: 3, value: [0x10] },
		{ tag: 0x920a, type: 5, value: [R(425, 100)] },
		{ tag: 0xa405, type: 3, value: [26] },
		{ tag: 0xa431, type: 2, value: 'SN-123456' },
		{ tag: 0xa432, type: 5, value: [R(24, 1), R(70, 1), R(28, 10), R(4, 1)] },
		{ tag: 0xa434, type: 2, value: 'Phone back camera 4.25mm f/1.8' }
	];
	const gpsIfd: Entry[] = [
		{ tag: 0x00, type: 1, value: [2, 2, 0, 0] },
		{ tag: 0x01, type: 2, value: 'N' },
		{ tag: 0x02, type: 5, value: [R(55, 1), R(40, 1), R(3456, 100)] },
		{ tag: 0x03, type: 2, value: 'E' },
		{ tag: 0x04, type: 5, value: [R(12, 1), R(34, 1), R(3600, 100)] },
		{ tag: 0x05, type: 1, value: [0] },
		{ tag: 0x06, type: 5, value: [R(125, 10)] },
		{ tag: 0x07, type: 5, value: [R(12, 1), R(3, 1), R(12, 1)] },
		{ tag: 0x1d, type: 2, value: '2026:10:05' }
	];
	const ifd0: Entry[] = [
		{ tag: 0x010f, type: 2, value: 'Acme' },
		{ tag: 0x0110, type: 2, value: 'Phone 9 Pro' },
		{ tag: 0x0112, type: 3, value: [6] },
		{ tag: 0x0131, type: 2, value: 'Editor 2.1' },
		{ tag: 0x0132, type: 2, value: '2026:10:05 15:00:00' },
		{ tag: 0x8769, type: 4, value: [], sub: exifIfd },
		{ tag: 0x8825, type: 4, value: [], sub: gpsIfd }
	];
	const ifd1: Entry[] = [
		{ tag: 0x0103, type: 3, value: [6] },
		{ tag: 0x0201, type: 4, value: [0] },
		{ tag: 0x0202, type: 4, value: [1234] }
	];
	return tiff(le, ifd0, ifd1);
}

describe('TIFF / Exif parsing', () => {
	it.each([
		['little-endian (II)', true],
		['big-endian (MM)', false]
	])('reads all IFDs in %s', (_, le) => {
		const t = parseTiff(sample(le));
		expect(t.littleEndian).toBe(le);
		expect(t.warnings).toEqual([]);
		expect(get(t, 'IFD0', 0x010f)?.value).toBe('Acme');
		expect(get(t, 'Exif', 0x9003)?.value).toBe('2026:10:05 14:03:12');
		expect(get(t, 'GPS', 0x01)?.value).toBe('N');
		expect(t.thumbnail).toEqual({ offset: 0, length: 1234 });
		const rows = Object.fromEntries(camera(t).map((r) => [r.label, r.value]));
		expect(rows).toMatchObject({
			Make: 'Acme',
			Model: 'Phone 9 Pro',
			Lens: 'Phone back camera 4.25mm f/1.8',
			Exposure: '1/250 s',
			Aperture: 'f/1.8',
			ISO: '100',
			'Focal length': '4.3 mm',
			'35 mm equivalent': '26 mm',
			'Exposure bias': '-0.33 EV',
			Flash: 'Did not fire, suppressed',
			Orientation: '6: Rotated 90° clockwise',
			Taken: '2026:10:05 14:03:12',
			'Time zone offset': '+02:00'
		});
	});

	it('converts GPS to decimal degrees with references', () => {
		const g = gps(parseTiff(sample(true)))!;
		expect(g.lat).toBeCloseTo(55 + 40 / 60 + 34.56 / 3600, 9);
		expect(g.lon).toBeCloseTo(12 + 34 / 60 + 36 / 3600, 9);
		expect(g.alt).toBe(12.5);
		expect(g.time).toBe('2026-10-05 12:03:12 UTC');
		expect(osmLink(g)).toBe(
			'https://www.openstreetmap.org/?mlat=55.676267&mlon=12.576667#map=16/55.676267/12.576667'
		);
		const south = tiff(true, [
			{
				tag: 0x8825,
				type: 4,
				value: [],
				sub: [
					{ tag: 1, type: 2, value: 'S' },
					{ tag: 2, type: 5, value: [R(33, 1), R(52, 1), R(0, 1)] },
					{ tag: 3, type: 2, value: 'W' },
					{ tag: 4, type: 5, value: [R(70, 1), R(30, 1), R(0, 1)] }
				]
			}
		]);
		expect(gps(parseTiff(south))).toMatchObject({ lat: -(33 + 52 / 60), lon: -70.5 });
	});

	it('formats lens specification and version tags', () => {
		const t = parseTiff(sample(false));
		expect(display(get(t, 'Exif', 0xa432)!)).toBe('24-70 mm f/2.8-4');
		expect(display(get(t, 'Exif', 0x9000)!)).toBe('0232');
	});

	it('survives damaged input', () => {
		expect(() => parseTiff(new Uint8Array([1, 2, 3]))).toThrow(/too short/);
		expect(() => parseTiff(new TextEncoder().encode('XX*\0\0\0\0\0'))).toThrow(/byte order/);
		// point the next-IFD link of IFD0 back at IFD0: must stop, not loop
		const loop = sample(true);
		const dv = new DataView(loop.buffer);
		const ifd0 = dv.getUint32(4, true);
		dv.setUint32(ifd0 + 2 + dv.getUint16(ifd0, true) * 12, ifd0, true);
		expect(parseTiff(loop).warnings).toEqual(['IFD1 points back to an IFD already read, stopped']);
		const bad = sample(true).slice(0, 40);
		expect(parseTiff(bad).warnings.length).toBeGreaterThan(0);
	});
});

describe('JPEG', () => {
	const { file, clean } = jpeg(sample(true));

	it('finds Exif, XMP, IPTC, comments, ICC and dimensions', () => {
		const info = readImage(file);
		expect(info.format).toBe('jpeg');
		expect([info.width, info.height]).toEqual([640, 480]);
		expect(info.exif?.tags.length).toBeGreaterThan(10);
		expect(info.xmp).toBe('<x:xmpmeta/>');
		expect(info.iptc).toBe(true);
		expect(info.icc).toBe(true);
		expect(info.comments).toEqual(['secret comment']);
		expect(info.removable.map((r) => r.name)).toEqual([
			'Exif (APP1)',
			'XMP (APP1)',
			'Photoshop / IPTC (APP13)',
			'Comment (COM)'
		]);
	});

	it('strips metadata losslessly, keeping JFIF, ICC and image data byte for byte', () => {
		const out = stripMetadata(file);
		expect(out).toEqual(clean);
		const again = readImage(out);
		expect(again.exif).toBeUndefined();
		expect(again.icc).toBe(true);
		expect(again.removable).toEqual([]);
		expect(stripMetadata(out)).toEqual(out);
	});

	it('summarises what the image reveals', () => {
		const p = privacy(readImage(file)).map((f) => `${f.level}: ${f.text}`);
		expect(p[0]).toMatch(/^danger: This image reveals where it was taken: 55\.67627, 12\.57667/);
		expect(p.join('\n')).toMatch(/Serial numbers.*SN-123456/);
		expect(p.join('\n')).toMatch(/embedded thumbnail/);
		expect(p.join('\n')).toMatch(/Software: Editor 2\.1/);
		expect(privacy(readImage(clean))).toEqual([]);
	});

	it('rejects broken files', () => {
		expect(() => readImage(new Uint8Array([0xff, 0xd8, 0x00]))).toThrow(/structure broken/);
		expect(() => readImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x40]))).toThrow(
			/bad length/
		);
		expect(() => readImage(new Uint8Array([1, 2, 3, 4]))).toThrow(/Not a JPEG, PNG or WebP/);
		expect(detectFormat(new Uint8Array([0x47, 0x49, 0x46]))).toBeNull();
	});

	it('reports a damaged Exif block without failing the file', () => {
		const { file: f } = jpeg(new TextEncoder().encode('garbage!'), false);
		const info = readImage(f);
		expect(info.exifError).toMatch(/byte order/);
	});
});

describe('PNG', () => {
	const { file, clean } = png(sample(false));

	it('reads eXIf, text, XMP and tIME', () => {
		const info = readImage(file);
		expect(info.format).toBe('png');
		expect([info.width, info.height]).toEqual([2, 3]);
		expect(get(info.exif, 'IFD0', 0x0110)?.value).toBe('Phone 9 Pro');
		expect(info.text).toEqual([
			{ keyword: 'Author', text: 'Jane Doe' },
			{ keyword: 'Last modified (tIME)', text: '2026-10-05 12:30:00 UTC' }
		]);
		expect(info.xmp).toBe('<x:xmpmeta/>');
	});

	it('drops metadata chunks and keeps the rest', () => {
		expect(stripMetadata(file)).toEqual(clean);
	});
});

describe('WebP', () => {
	const { file } = webp(sample(true));

	it('reads the EXIF chunk and canvas size', () => {
		const info = readImage(file);
		expect(info.format).toBe('webp');
		expect([info.width, info.height]).toEqual([100, 50]);
		expect(get(info.exif, 'IFD0', 0x010f)?.value).toBe('Acme');
		expect(info.xmp).toBe('<x:xmpmeta/>');
	});

	it('removes EXIF and XMP, clears the flags and fixes the RIFF size', () => {
		const out = stripMetadata(file);
		const info = readImage(out);
		expect(info.exif).toBeUndefined();
		expect(info.xmp).toBeUndefined();
		const size = out[4] | (out[5] << 8) | (out[6] << 16) | (out[7] << 24);
		expect(size).toBe(out.length - 8);
		expect(out[20]).toBe(0); // VP8X flags byte
		expect([info.width, info.height]).toEqual([100, 50]);
	});
});
