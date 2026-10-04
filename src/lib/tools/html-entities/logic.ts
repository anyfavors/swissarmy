import { namedEntities } from './entities';

export { namedEntities };

const minimal: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;'
};

/**
 * Escapes the five characters that matter in HTML text and attribute values.
 * With `nonAscii`, every code point above U+007F is also written as &#x..;.
 */
export function encodeEntities(text: string, nonAscii = false): string {
	const re = nonAscii ? /[&<>"']|[^\x00-\x7f]/gu : /[&<>"']/g;
	return text.replace(re, (c) => {
		const m = minimal[c];
		if (m) return m;
		return `&#x${c.codePointAt(0)!.toString(16).toUpperCase()};`;
	});
}

/**
 * Numeric references in 0x80 to 0x9F are read as Windows-1252 by browsers
 * (HTML standard, "numeric character reference end state").
 */
const c1: Record<number, number> = {
	0x80: 0x20ac,
	0x82: 0x201a,
	0x83: 0x192,
	0x84: 0x201e,
	0x85: 0x2026,
	0x86: 0x2020,
	0x87: 0x2021,
	0x88: 0x2c6,
	0x89: 0x2030,
	0x8a: 0x160,
	0x8b: 0x2039,
	0x8c: 0x152,
	0x8e: 0x17d,
	0x91: 0x2018,
	0x92: 0x2019,
	0x93: 0x201c,
	0x94: 0x201d,
	0x95: 0x2022,
	0x96: 0x2013,
	0x97: 0x2014,
	0x98: 0x2dc,
	0x99: 0x2122,
	0x9a: 0x161,
	0x9b: 0x203a,
	0x9c: 0x153,
	0x9e: 0x17e,
	0x9f: 0x178
};

function fromNumeric(cp: number): string {
	if (cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return '�';
	return String.fromCodePoint(c1[cp] ?? cp);
}

export interface Decoded {
	text: string;
	/** Named references that are not in the table, left as written. */
	unknown: string[];
	/** Number of references that were replaced. */
	count: number;
}

/**
 * Decodes named (&eacute;), decimal (&#233;) and hex (&#xE9;) references.
 * Named references need the closing semicolon. Numeric ones are accepted without it,
 * as browsers do. Unknown names are left untouched and reported.
 */
export function decodeEntities(input: string): Decoded {
	const unknown = new Set<string>();
	let count = 0;
	const text = input.replace(
		/&(?:#([0-9]{1,8});?|#[xX]([0-9a-fA-F]{1,8});?|([A-Za-z][A-Za-z0-9]{0,31});)/g,
		(whole, dec?: string, hex?: string, name?: string) => {
			if (dec !== undefined) {
				count++;
				return fromNumeric(parseInt(dec, 10));
			}
			if (hex !== undefined) {
				count++;
				return fromNumeric(parseInt(hex, 16));
			}
			const cp = namedEntities.get(name!);
			if (cp === undefined) {
				unknown.add(whole);
				return whole;
			}
			count++;
			return String.fromCodePoint(cp);
		}
	);
	return { text, unknown: [...unknown], count };
}
