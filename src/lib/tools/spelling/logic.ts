/**
 * Spelling alphabets.
 *
 * NATO / ICAO: ICAO Annex 10, Volume II, chapter 5 (radiotelephony spelling alphabet and
 * figures), the same words as NATO's ACP 125. Note the official spellings Alfa and Juliett.
 * Pronunciation hints are the ICAO ones, capitals marking the stressed syllable.
 *
 * Danish: the traditional Danish telephone spelling alphabet (det danske stavealfabet),
 * as listed in Den Danske Ordbog / Danish Wikipedia "Stavealfabet". Variants exist
 * (for example for Q and Æ); this is the commonly printed one.
 */

export type Alphabet = 'nato' | 'danish';
export type CaseMode = 'upper' | 'both' | 'none';

const nato: Record<string, [string, string]> = {
	A: ['Alfa', 'AL fah'],
	B: ['Bravo', 'BRAH voh'],
	C: ['Charlie', 'CHAR lee or SHAR lee'],
	D: ['Delta', 'DELL tah'],
	E: ['Echo', 'ECK oh'],
	F: ['Foxtrot', 'FOKS trot'],
	G: ['Golf', 'golf'],
	H: ['Hotel', 'hoh TELL'],
	I: ['India', 'IN dee ah'],
	J: ['Juliett', 'JEW lee ETT'],
	K: ['Kilo', 'KEY loh'],
	L: ['Lima', 'LEE mah'],
	M: ['Mike', 'mike'],
	N: ['November', 'no VEM ber'],
	O: ['Oscar', 'OSS cah'],
	P: ['Papa', 'pah PAH'],
	Q: ['Quebec', 'keh BECK'],
	R: ['Romeo', 'ROW me oh'],
	S: ['Sierra', 'see AIR rah'],
	T: ['Tango', 'TANG go'],
	U: ['Uniform', 'YOU nee form or OO nee form'],
	V: ['Victor', 'VIK tah'],
	W: ['Whiskey', 'WISS key'],
	X: ['X-ray', 'ECKS ray'],
	Y: ['Yankee', 'YANG key'],
	Z: ['Zulu', 'ZOO loo']
};

/** ICAO figures: word and the ICAO pronunciation (Tree, Fife, Niner...). */
const natoDigits: [string, string][] = [
	['Zero', 'ZE-RO'],
	['One', 'WUN'],
	['Two', 'TOO'],
	['Three', 'TREE'],
	['Four', 'FOW-er'],
	['Five', 'FIFE'],
	['Six', 'SIX'],
	['Seven', 'SEV-en'],
	['Eight', 'AIT'],
	['Nine', 'NIN-er']
];

const danish: Record<string, string> = {
	A: 'Anna',
	B: 'Bernhard',
	C: 'Cecilie',
	D: 'David',
	E: 'Erik',
	F: 'Frederik',
	G: 'Georg',
	H: 'Hans',
	I: 'Ida',
	J: 'Johan',
	K: 'Karen',
	L: 'Ludvig',
	M: 'Mari',
	N: 'Nikolaj',
	O: 'Odin',
	P: 'Peter',
	Q: 'Quintus',
	R: 'Rasmus',
	S: 'Søren',
	T: 'Theodor',
	U: 'Ulla',
	V: 'Viggo',
	W: 'William',
	X: 'Xerxes',
	Y: 'Yrsa',
	Z: 'Zackarias',
	Æ: 'Ægir',
	Ø: 'Øresund',
	Å: 'Åse'
};

const danishDigits = ['nul', 'en', 'to', 'tre', 'fire', 'fem', 'seks', 'syv', 'otte', 'ni'];

const symbolsEn: Record<string, string> = {
	' ': 'Space',
	'!': 'Exclamation mark',
	'"': 'Double quote',
	'#': 'Hash',
	$: 'Dollar',
	'%': 'Percent',
	'&': 'Ampersand',
	"'": 'Single quote',
	'(': 'Open parenthesis',
	')': 'Close parenthesis',
	'*': 'Asterisk',
	'+': 'Plus',
	',': 'Comma',
	'-': 'Dash',
	'.': 'Dot',
	'/': 'Slash',
	':': 'Colon',
	';': 'Semicolon',
	'<': 'Less than',
	'=': 'Equals',
	'>': 'Greater than',
	'?': 'Question mark',
	'@': 'At sign',
	'[': 'Open square bracket',
	'\\': 'Backslash',
	']': 'Close square bracket',
	'^': 'Caret',
	_: 'Underscore',
	'`': 'Backtick',
	'{': 'Open curly brace',
	'|': 'Vertical bar',
	'}': 'Close curly brace',
	'~': 'Tilde',
	'€': 'Euro sign',
	'£': 'Pound sign',
	'§': 'Section sign'
};

const symbolsDa: Record<string, string> = {
	' ': 'mellemrum',
	'!': 'udråbstegn',
	'"': 'anførselstegn',
	'#': 'havelåge',
	$: 'dollartegn',
	'%': 'procent',
	'&': 'og-tegn',
	"'": 'apostrof',
	'(': 'venstre parentes',
	')': 'højre parentes',
	'*': 'stjerne',
	'+': 'plus',
	',': 'komma',
	'-': 'bindestreg',
	'.': 'punktum',
	'/': 'skråstreg',
	':': 'kolon',
	';': 'semikolon',
	'<': 'mindre end',
	'=': 'lig med',
	'>': 'større end',
	'?': 'spørgsmålstegn',
	'@': 'snabel-a',
	'[': 'venstre kantparentes',
	'\\': 'omvendt skråstreg',
	']': 'højre kantparentes',
	'^': 'hat',
	_: 'understreg',
	'`': 'accent grave',
	'{': 'venstre tuborg',
	'|': 'lodret streg',
	'}': 'højre tuborg',
	'~': 'tilde',
	'€': 'eurotegn',
	'£': 'pundtegn',
	'§': 'paragraftegn'
};

export type ItemKind = 'letter' | 'digit' | 'symbol' | 'other';

export interface Item {
	char: string;
	kind: ItemKind;
	/** The spoken form, including any case word. */
	say: string;
	/** Optional pronunciation hint (NATO only). */
	hint?: string;
	upper?: boolean;
}

export interface Options {
	alphabet: Alphabet;
	caseMode: CaseMode;
}

function codepoint(ch: string): string {
	return `U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`;
}

export function spell(text: string, o: Options): Item[] {
	const out: Item[] = [];
	const da = o.alphabet === 'danish';
	for (const ch of text) {
		const up = ch.toUpperCase();
		const isLetter = up !== ch.toLowerCase();
		if (/^[0-9]$/.test(ch)) {
			const n = Number(ch);
			out.push(
				da
					? { char: ch, kind: 'digit', say: danishDigits[n] }
					: { char: ch, kind: 'digit', say: natoDigits[n][0], hint: natoDigits[n][1] }
			);
			continue;
		}
		const word = da ? danish[up] : nato[up]?.[0];
		if (isLetter && word && up.length === 1) {
			const upper = ch === up;
			let say = word;
			if (o.caseMode !== 'none') {
				if (upper) say = `${da ? 'stort' : 'Capital'} ${word}`;
				else if (o.caseMode === 'both') say = `${da ? 'lille' : 'Small'} ${word}`;
				else if (!da) say = word.toLowerCase();
			}
			out.push({ char: ch, kind: 'letter', say, upper, hint: da ? undefined : nato[up][1] });
			continue;
		}
		const sym = (da ? symbolsDa : symbolsEn)[ch];
		if (sym) {
			out.push({ char: ch, kind: 'symbol', say: sym });
			continue;
		}
		if (/\s/.test(ch)) {
			const names: Record<string, string> = {
				'\t': 'Tab',
				'\n': 'New line',
				'\r': 'Carriage return'
			};
			out.push({ char: ch, kind: 'symbol', say: names[ch] ?? `Whitespace ${codepoint(ch)}` });
			continue;
		}
		out.push({
			char: ch,
			kind: 'other',
			say: `${isLetter ? (ch === up ? 'Capital letter' : 'Letter') : 'Character'} ${ch} (${codepoint(ch)})`
		});
	}
	return out;
}

/** One line for copying or reading: "Capital Alfa, bravo, One, Dash". */
export function spellLine(text: string, o: Options): string {
	return spell(text, o)
		.map((i) => i.say)
		.join(', ');
}

export const alphabets: { id: Alphabet; label: string }[] = [
	{ id: 'nato', label: 'NATO / ICAO' },
	{ id: 'danish', label: 'Danish' }
];

export { nato, danish };
