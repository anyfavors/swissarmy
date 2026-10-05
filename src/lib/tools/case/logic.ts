/**
 * Word splitting and case conversion. Letters and digits are matched with Unicode
 * properties, so æ, ø, å and other non-ASCII letters count as letters.
 */

export type CaseId =
	| 'camel'
	| 'pascal'
	| 'snake'
	| 'constant'
	| 'kebab'
	| 'train'
	| 'dot'
	| 'path'
	| 'title'
	| 'sentence'
	| 'lower'
	| 'upper'
	| 'alternating';

export const cases: { id: CaseId; label: string; example: string }[] = [
	{ id: 'camel', label: 'camelCase', example: 'parseHttpResponse' },
	{ id: 'pascal', label: 'PascalCase', example: 'ParseHttpResponse' },
	{ id: 'snake', label: 'snake_case', example: 'parse_http_response' },
	{ id: 'constant', label: 'SCREAMING_SNAKE', example: 'PARSE_HTTP_RESPONSE' },
	{ id: 'kebab', label: 'kebab-case', example: 'parse-http-response' },
	{ id: 'train', label: 'Train-Case', example: 'Parse-Http-Response' },
	{ id: 'dot', label: 'dot.case', example: 'parse.http.response' },
	{ id: 'path', label: 'path/case', example: 'parse/http/response' },
	{ id: 'title', label: 'Title Case', example: 'The Lord of the Rings' },
	{ id: 'sentence', label: 'Sentence case', example: 'The lord of the rings' },
	{ id: 'lower', label: 'lower case', example: 'the lord of the rings' },
	{ id: 'upper', label: 'UPPER CASE', example: 'THE LORD OF THE RINGS' },
	{ id: 'alternating', label: 'aLtErNaTiNg', example: 'tHe LoRd' }
];

const UPPER = /\p{Lu}/u;
const LOWER = /\p{Ll}/u;
const DIGIT = /\p{N}/u;

/**
 * Splits an identifier or phrase into words.
 * Boundaries: any character that is not a letter or digit, lower to upper (fooBar),
 * an acronym followed by a capitalised word (HTTPResponse -> HTTP Response),
 * and a digit followed by an upper case letter (base64Encode -> base64 Encode).
 * Digits otherwise stay with the letters before them (utf8, ipv4).
 */
export function splitWords(input: string): string[] {
	const words: string[] = [];
	for (const chunk of input.split(/[^\p{L}\p{N}\p{M}]+/u)) {
		if (!chunk) continue;
		const cs = Array.from(chunk);
		let cur = '';
		for (let i = 0; i < cs.length; i++) {
			const c = cs[i];
			const prev = cs[i - 1];
			const next = cs[i + 1];
			if (cur && UPPER.test(c)) {
				const afterLower = LOWER.test(prev);
				const afterDigit = DIGIT.test(prev);
				const acronymEnd = UPPER.test(prev) && next !== undefined && LOWER.test(next);
				if (afterLower || afterDigit || acronymEnd) {
					words.push(cur);
					cur = '';
				}
			}
			cur += c;
		}
		if (cur) words.push(cur);
	}
	return words;
}

const cap = (w: string) => {
	const [first = '', ...rest] = Array.from(w);
	return first.toUpperCase() + rest.join('').toLowerCase();
};

/** English title case: words that stay lower case unless first or last (Chicago style, short list). */
export const smallWords = new Set([
	'a',
	'an',
	'the',
	'and',
	'but',
	'or',
	'nor',
	'for',
	'so',
	'yet',
	'as',
	'at',
	'by',
	'in',
	'of',
	'off',
	'on',
	'per',
	'to',
	'up',
	'via',
	'vs',
	'v'
]);

/** Keeps words with a capital after the first letter (iPhone, NASA, McDonald) as written. */
const hasInnerCapital = (w: string) => UPPER.test(Array.from(w).slice(1).join(''));

export function titleCase(input: string): string {
	const allCaps = !LOWER.test(input);
	return input
		.split('\n')
		.map((line) => {
			const parts = line.split(/(\s+)/);
			const wordIdx = parts.map((p, i) => (/[\p{L}\p{N}]/u.test(p) ? i : -1)).filter((i) => i >= 0);
			const first = wordIdx[0];
			const last = wordIdx[wordIdx.length - 1];
			return parts
				.map((p, i) => {
					if (!/[\p{L}\p{N}]/u.test(p)) return p;
					if (!allCaps && hasInnerCapital(p)) return p;
					// A word after a colon also starts a new phrase.
					const prevWord = parts[i - 2];
					const afterColon = prevWord !== undefined && /[:.!?]$/.test(prevWord);
					const core = p.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
					if (i !== first && i !== last && !afterColon && smallWords.has(core))
						return p.toLowerCase();
					// Capitalise each part of a hyphenated word: Well-Known.
					return p
						.toLowerCase()
						.replace(
							/(^|[-/])([^\p{L}\p{N}]*)(\p{L})/gu,
							(_, sep, pre, l) => sep + pre + l.toUpperCase()
						);
				})
				.join('');
		})
		.join('\n');
}

export function sentenceCase(input: string): string {
	const lower = input.toLowerCase();
	return lower.replace(
		/(^\s*[^\p{L}\p{N}]*|[.!?]\s+[^\p{L}\p{N}]*|\n\s*[^\p{L}\p{N}]*)(\p{L})/gu,
		(_, pre, l) => pre + l.toUpperCase()
	);
}

export function alternating(input: string): string {
	let n = 0;
	return Array.from(input)
		.map((c) => {
			if (!/\p{L}/u.test(c)) return c;
			return n++ % 2 ? c.toUpperCase() : c.toLowerCase();
		})
		.join('');
}

function joinWords(line: string, id: CaseId): string {
	const w = splitWords(line);
	switch (id) {
		case 'camel':
			return w.map((x, i) => (i ? cap(x) : x.toLowerCase())).join('');
		case 'pascal':
			return w.map(cap).join('');
		case 'snake':
			return w.map((x) => x.toLowerCase()).join('_');
		case 'constant':
			return w.map((x) => x.toUpperCase()).join('_');
		case 'kebab':
			return w.map((x) => x.toLowerCase()).join('-');
		case 'train':
			return w.map(cap).join('-');
		case 'dot':
			return w.map((x) => x.toLowerCase()).join('.');
		case 'path':
			return w.map((x) => x.toLowerCase()).join('/');
		default:
			return line;
	}
}

/** Converts text. Identifier styles work line by line, so a list of names converts in one go. */
export function convertCase(input: string, id: CaseId): string {
	switch (id) {
		case 'title':
			return titleCase(input);
		case 'sentence':
			return sentenceCase(input);
		case 'lower':
			return input.toLowerCase();
		case 'upper':
			return input.toUpperCase();
		case 'alternating':
			return alternating(input);
		default:
			return input
				.split(/\r?\n/)
				.map((l) => joinWords(l, id))
				.join('\n');
	}
}
