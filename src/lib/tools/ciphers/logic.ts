/** Classical letter ciphers and Morse code. None of these is encryption in any modern sense. */

function shiftLetter(c: string, n: number): string {
	const code = c.charCodeAt(0);
	const base = code >= 65 && code <= 90 ? 65 : code >= 97 && code <= 122 ? 97 : 0;
	if (!base) return c;
	return String.fromCharCode(base + ((((code - base + n) % 26) + 26) % 26));
}

/** Shifts A to Z and a to z by n places; everything else is left alone. */
export function caesar(text: string, shift: number): string {
	return text.replace(/[A-Za-z]/g, (c) => shiftLetter(c, shift));
}

export function rot13(text: string): string {
	return caesar(text, 13);
}

/** Rotates the 94 printable ASCII characters ! to ~ by 47. */
export function rot47(text: string): string {
	return text.replace(/[!-~]/g, (c) =>
		String.fromCharCode(33 + ((c.charCodeAt(0) - 33 + 47) % 94))
	);
}

/** A becomes Z, B becomes Y, and so on. */
export function atbash(text: string): string {
	return text.replace(/[A-Za-z]/g, (c) => {
		const base = c <= 'Z' ? 65 : 97;
		return String.fromCharCode(base + 25 - (c.charCodeAt(0) - base));
	});
}

/** All 25 shifts, for reading off the one that makes sense. */
export function bruteForce(text: string): { shift: number; text: string }[] {
	return Array.from({ length: 25 }, (_, i) => ({ shift: i + 1, text: caesar(text, i + 1) }));
}

/**
 * Vigenère with a letter key. Non-letters pass through and do not use up a key letter,
 * which is the usual convention. Case is kept.
 */
export function vigenere(text: string, key: string, decrypt = false): string {
	const k = key.toUpperCase().replace(/[^A-Z]/g, '');
	if (!k) throw new Error('The key needs at least one letter A to Z');
	let i = 0;
	return text.replace(/[A-Za-z]/g, (c) => {
		const s = k.charCodeAt(i++ % k.length) - 65;
		return shiftLetter(c, decrypt ? -s : s);
	});
}

// ---------------------------------------------------------------------------
// Morse code. Letters, digits and punctuation from ITU-R M.1677-1, part I section 1.1.

export const MORSE: Record<string, string> = {
	A: '.-',
	B: '-...',
	C: '-.-.',
	D: '-..',
	E: '.',
	F: '..-.',
	G: '--.',
	H: '....',
	I: '..',
	J: '.---',
	K: '-.-',
	L: '.-..',
	M: '--',
	N: '-.',
	O: '---',
	P: '.--.',
	Q: '--.-',
	R: '.-.',
	S: '...',
	T: '-',
	U: '..-',
	V: '...-',
	W: '.--',
	X: '-..-',
	Y: '-.--',
	Z: '--..',
	É: '..-..',
	'1': '.----',
	'2': '..---',
	'3': '...--',
	'4': '....-',
	'5': '.....',
	'6': '-....',
	'7': '--...',
	'8': '---..',
	'9': '----.',
	'0': '-----',
	'.': '.-.-.-',
	',': '--..--',
	':': '---...',
	'?': '..--..',
	"'": '.----.',
	'-': '-....-',
	'/': '-..-.',
	'(': '-.--.',
	')': '-.--.-',
	'"': '.-..-.',
	'=': '-...-',
	'+': '.-.-.',
	'@': '.--.-.'
};

/** Common in amateur use, not in the ITU recommendation. */
export const MORSE_EXTRA: Record<string, string> = {
	'!': '-.-.--',
	'&': '.-...',
	';': '-.-.-.',
	_: '..--.-',
	$: '...-..-'
};

/** Procedural signals, sent as one character without letter gaps. ITU names where there is one. */
export const PROSIGNS: { sign: string; code: string; meaning: string }[] = [
	{ sign: 'AR', code: '.-.-.', meaning: 'End of message (same as +)' },
	{ sign: 'AS', code: '.-...', meaning: 'Wait' },
	{ sign: 'BT', code: '-...-', meaning: 'Break, new section (same as =)' },
	{ sign: 'CT', code: '-.-.-', meaning: 'Starting signal' },
	{ sign: 'HH', code: '........', meaning: 'Error' },
	{ sign: 'K', code: '-.-', meaning: 'Invitation to transmit' },
	{ sign: 'KN', code: '-.--.', meaning: 'Named station only, go ahead (same as ()' },
	{ sign: 'SK', code: '...-.-', meaning: 'End of work' },
	{ sign: 'SN', code: '...-.', meaning: 'Understood' },
	{ sign: 'SOS', code: '...---...', meaning: 'Distress' }
];

const ENCODE: Record<string, string> = { ...MORSE_EXTRA, ...MORSE };
const DECODE: Record<string, string> = Object.fromEntries(
	Object.entries(ENCODE).map(([ch, code]) => [code, ch])
);
// Codes only used as prosigns decode to <XX>.
for (const p of PROSIGNS) if (!(p.code in DECODE)) DECODE[p.code] = `<${p.sign}>`;

export interface MorseResult {
	text: string;
	/** Characters or codes that had no mapping. */
	unknown: string[];
}

/**
 * Letters are separated by a space and words by " / ". A prosign written as <SK>
 * is sent as one run without gaps.
 */
export function toMorse(text: string): MorseResult {
	const unknown: string[] = [];
	const words = text
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.map((word) => {
			const out: string[] = [];
			const re = /<([A-Za-z]{2,3})>|([\s\S])/gu;
			for (const m of word.matchAll(re)) {
				if (m[1]) {
					const p = PROSIGNS.find((x) => x.sign === m[1].toUpperCase());
					if (p) out.push(p.code);
					else {
						const run = Array.from(m[1].toUpperCase(), (c) => MORSE[c]).join('');
						out.push(run);
					}
					continue;
				}
				const ch = m[2].toUpperCase();
				const code = ENCODE[ch] ?? ENCODE[ch.normalize('NFD')[0]];
				if (code) out.push(code);
				else unknown.push(m[2]);
			}
			return out.join(' ');
		})
		.filter(Boolean);
	return { text: words.join(' / '), unknown };
}

/**
 * Reads dots and dashes. Accepts . and - plus the typographic dot and dash variants,
 * letters split by spaces, words split by /, | or a line break.
 */
export function fromMorse(input: string): MorseResult {
	const norm = input
		.replace(/[\u00b7\u2022\u2219\u22c5]/g, '.')
		.replace(/[_\u2013\u2014\u2212]/g, '-');
	const bad = norm.match(/[^.\-\s/|]/);
	if (bad) throw new Error(`"${bad[0]}" is not Morse; use dots, dashes, spaces and /`);
	const unknown: string[] = [];
	const words = norm
		.split(/\s*[/|\n]\s*|\s{3,}/)
		.map((w) =>
			w
				.trim()
				.split(/\s+/)
				.filter(Boolean)
				.map((code) => {
					const ch = DECODE[code];
					if (ch) return ch;
					unknown.push(code);
					return '#';
				})
				.join('')
		)
		.filter(Boolean);
	return { text: words.join(' '), unknown };
}

/** Text made only of dots, dashes and separators, with a few letters' worth. */
export function looksLikeMorse(s: string): number {
	const t = s.trim();
	if (!/^[.\-\s/]+$/.test(t)) return 0;
	const codes = t.split(/[\s/]+/).filter(Boolean);
	if (codes.length < 3 || !codes.every((c) => c.length <= 8)) return 0;
	if (!/\./.test(t) || !/-/.test(t)) return 0;
	return codes.every((c) => c in DECODE) ? 0.85 : 0.5;
}
