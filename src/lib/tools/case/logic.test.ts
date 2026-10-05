import { describe, expect, it } from 'vitest';
import { alternating, convertCase, sentenceCase, splitWords, titleCase } from './logic';

describe('case: splitWords', () => {
	it('splits camel and Pascal case, keeping acronyms together', () => {
		expect(splitWords('parseHTTPResponse')).toEqual(['parse', 'HTTP', 'Response']);
		expect(splitWords('XMLHttpRequest')).toEqual(['XML', 'Http', 'Request']);
		expect(splitWords('getID')).toEqual(['get', 'ID']);
		expect(splitWords('HTML')).toEqual(['HTML']);
	});

	it('splits on separators of any kind', () => {
		expect(splitWords('foo_bar-baz.qux/quux  Spaced')).toEqual([
			'foo',
			'bar',
			'baz',
			'qux',
			'quux',
			'Spaced'
		]);
		expect(splitWords('__leading__and__trailing__')).toEqual(['leading', 'and', 'trailing']);
	});

	it('keeps digits with the preceding letters, splits before a capital', () => {
		expect(splitWords('base64Encode')).toEqual(['base64', 'Encode']);
		expect(splitWords('utf8_string')).toEqual(['utf8', 'string']);
		expect(splitWords('version2')).toEqual(['version2']);
		expect(splitWords('2fa code')).toEqual(['2fa', 'code']);
	});

	it('treats Danish letters as letters', () => {
		expect(splitWords('rødGrødMedFløde')).toEqual(['rød', 'Grød', 'Med', 'Fløde']);
		expect(splitWords('ÆbleØlÅl')).toEqual(['Æble', 'Øl', 'Ål']);
	});
});

describe('case: identifiers', () => {
	const src = 'parseHTTPResponse';
	it.each([
		['camel', 'parseHttpResponse'],
		['pascal', 'ParseHttpResponse'],
		['snake', 'parse_http_response'],
		['constant', 'PARSE_HTTP_RESPONSE'],
		['kebab', 'parse-http-response'],
		['train', 'Parse-Http-Response'],
		['dot', 'parse.http.response'],
		['path', 'parse/http/response']
	] as const)('%s', (id, want) => {
		expect(convertCase(src, id)).toBe(want);
	});

	it('converts each line on its own', () => {
		expect(convertCase('first name\nlast_name\r\nzipCode', 'camel')).toBe(
			'firstName\nlastName\nzipCode'
		);
	});

	it('handles Danish letters in upper and lower case', () => {
		expect(convertCase('blå bær øl', 'constant')).toBe('BLÅ_BÆR_ØL');
		expect(convertCase('Blå Bær Øl', 'camel')).toBe('blåBærØl');
	});

	it('returns empty for empty input', () => {
		expect(convertCase('', 'snake')).toBe('');
	});
});

describe('case: prose', () => {
	it('title case keeps small words lower except first and last', () => {
		expect(titleCase('the lord of the rings')).toBe('The Lord of the Rings');
		expect(titleCase('a tale of two cities')).toBe('A Tale of Two Cities');
		expect(titleCase('what are you looking at')).toBe('What Are You Looking At');
		expect(titleCase('star wars: a new hope')).toBe('Star Wars: A New Hope');
	});

	it('title case keeps mixed-case words and capitalises hyphenated parts', () => {
		expect(titleCase('my new iPhone and the NASA budget')).toBe(
			'My New iPhone and the NASA Budget'
		);
		expect(titleCase('a well-known fact')).toBe('A Well-Known Fact');
		expect(titleCase('THE LORD OF THE RINGS')).toBe('The Lord of the Rings');
	});

	it('sentence case capitalises after full stops and line breaks', () => {
		expect(sentenceCase('HELLO THERE. how are you? fine!\nnew line')).toBe(
			'Hello there. How are you? Fine!\nNew line'
		);
		expect(sentenceCase('"quoted start" here')).toBe('"Quoted start" here');
		expect(sentenceCase('øl i køleskabet')).toBe('Øl i køleskabet');
	});

	it('alternates letters only', () => {
		expect(alternating('alternating')).toBe('aLtErNaTiNg');
		expect(alternating('ab cd')).toBe('aB cD');
	});

	it('upper and lower', () => {
		expect(convertCase('Æble', 'upper')).toBe('ÆBLE');
		expect(convertCase('ÆBLE', 'lower')).toBe('æble');
	});
});
