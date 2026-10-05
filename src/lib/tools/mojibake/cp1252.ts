/**
 * Windows-1252, bytes 0x80 to 0x9F. Every other byte is the same code point as in ISO-8859-1.
 * Source: unicode.org, MAPPINGS/VENDORS/MICSFT/WINDOWS/CP1252.TXT.
 * 0x81, 0x8D, 0x8F, 0x90 and 0x9D are undefined there; browsers (WHATWG Encoding) map them
 * to the C1 controls U+0081 and so on, which is what is done here too.
 */
const HIGH: number[] = [
	0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039,
	0x0152, 0x008d, 0x017d, 0x008f, 0x0090, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
	0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x009d, 0x017e, 0x0178
];

const REVERSE = new Map<number, number>(HIGH.map((cp, i) => [cp, 0x80 + i]));

export function cp1252Decode(bytes: Uint8Array): string {
	let out = '';
	for (const b of bytes) out += String.fromCharCode(b >= 0x80 && b < 0xa0 ? HIGH[b - 0x80] : b);
	return out;
}

/** The byte for a code point, or -1 when Windows-1252 has no such character. */
export function cp1252Byte(cp: number): number {
	if (cp < 0x80 || (cp >= 0xa0 && cp <= 0xff)) return cp;
	return REVERSE.get(cp) ?? -1;
}

export function latin1Decode(bytes: Uint8Array): string {
	let out = '';
	for (const b of bytes) out += String.fromCharCode(b);
	return out;
}

export function latin1Byte(cp: number): number {
	return cp <= 0xff ? cp : -1;
}
