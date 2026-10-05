import { describe, expect, it } from 'vitest';
import {
	MORSE,
	PROSIGNS,
	atbash,
	bruteForce,
	caesar,
	fromMorse,
	looksLikeMorse,
	rot13,
	rot47,
	toMorse,
	vigenere
} from './logic';
import { ops } from './ops';

describe('ROT13 and ROT47', () => {
	it('rotates letters only', () => {
		expect(rot13('Hello, World!')).toBe('Uryyb, Jbeyq!');
		expect(rot13(rot13('Why did the chicken cross the road?'))).toBe(
			'Why did the chicken cross the road?'
		);
		expect(rot13('æøå 123')).toBe('æøå 123');
	});
	it('rotates printable ASCII', () => {
		expect(rot47('Hello, World!')).toBe('w6==@[ (@C=5P');
		expect(rot47(rot47('The Quick Brown Fox 123 ~!'))).toBe('The Quick Brown Fox 123 ~!');
		expect(rot47(' ')).toBe(' ');
	});
});

describe('Caesar', () => {
	it('shifts both ways and wraps', () => {
		expect(caesar('abcxyz ABCXYZ', 3)).toBe('defabc DEFABC');
		expect(caesar('defabc', -3)).toBe('abcxyz');
		expect(caesar('abc', 29)).toBe('def');
	});
	it('brute forces all 25 shifts', () => {
		const all = bruteForce('Khoor');
		expect(all).toHaveLength(25);
		expect(all.find((r) => r.text === 'Hello')?.shift).toBe(23);
	});
});

describe('Atbash', () => {
	it('mirrors the alphabet', () => {
		expect(atbash('abcxyz ABC')).toBe('zyxcba ZYX');
		expect(atbash('Wizard')).toBe('Draziw');
	});
});

describe('Vigenère', () => {
	it('matches the textbook example', () => {
		expect(vigenere('ATTACKATDAWN', 'LEMON')).toBe('LXFOPVEFRNHR');
		expect(vigenere('LXFOPVEFRNHR', 'LEMON', true)).toBe('ATTACKATDAWN');
	});
	it('keeps case and skips non-letters without using a key letter', () => {
		expect(vigenere('Attack at dawn!', 'lemon')).toBe('Lxfopv ef rnhr!');
		expect(vigenere('Lxfopv ef rnhr!', 'Le-mon', true)).toBe('Attack at dawn!');
	});
	it('needs a letter key', () => {
		expect(() => vigenere('x', '123')).toThrow(/at least one letter/);
	});
});

describe('Morse', () => {
	it('encodes letters, digits and punctuation', () => {
		expect(toMorse('SOS').text).toBe('... --- ...');
		expect(toMorse('Hello world').text).toBe('.... . .-.. .-.. --- / .-- --- .-. .-.. -..');
		expect(toMorse('73?').text).toBe('--... ...-- ..--..');
		expect(toMorse('a@b.c').text).toBe('.- .--.-. -... .-.-.- -.-.');
	});
	it('sends prosigns as one run', () => {
		expect(toMorse('<SOS>').text).toBe('...---...');
		expect(toMorse('<sk>').text).toBe('...-.-');
		expect(toMorse('<BK>').text).toBe('-...-.-');
	});
	it('folds accents it does not know and reports what it cannot send', () => {
		expect(toMorse('É').text).toBe('..-..');
		expect(toMorse('ü').text).toBe('..-');
		const r = toMorse('a%b');
		expect(r.text).toBe('.- -...');
		expect(r.unknown).toEqual(['%']);
	});
	it('decodes with any word separator and typographic dashes', () => {
		expect(fromMorse('.... . .-.. .-.. --- / .-- --- .-. .-.. -..').text).toBe('HELLO WORLD');
		expect(fromMorse('.... ..   .- -').text).toBe('HI AT');
		expect(fromMorse('.... ..\n.- -').text).toBe('HI AT');
		expect(fromMorse('••• ——— •••').text).toBe('SOS');
		expect(fromMorse('...---...').text).toBe('<SOS>');
		expect(fromMorse('........').text).toBe('<HH>');
	});
	it('marks unknown codes and rejects non-Morse', () => {
		const r = fromMorse('.- ------- -');
		expect(r.text).toBe('A#T');
		expect(r.unknown).toEqual(['-------']);
		expect(() => fromMorse('.- x')).toThrow('"x" is not Morse');
	});
	it('round trips the whole ITU table', () => {
		const all = Object.keys(MORSE).join(' ');
		expect(fromMorse(toMorse(all).text).text).toBe(all);
	});
	it('lists unique prosigns', () => {
		expect(new Set(PROSIGNS.map((p) => p.code)).size).toBe(PROSIGNS.length);
	});
});

describe('intake and ops', () => {
	it('recognises Morse', () => {
		expect(looksLikeMorse('... --- ...')).toBe(0.85);
		expect(looksLikeMorse('.-.-.-.-.-.- ---------- .')).toBe(0);
		expect(looksLikeMorse('- -')).toBe(0);
		expect(looksLikeMorse('-1 -2 -3')).toBe(0);
		expect(looksLikeMorse('... ... ...')).toBe(0);
	});
	it('runs through the chain', () => {
		const run = (id: string, s: string) => ops.find((o) => o.id === id)!.run(s);
		expect(run('ciphers.morse-decode', run('ciphers.morse-encode', 'cq dx') as string)).toBe(
			'CQ DX'
		);
		expect(() => run('ciphers.morse-encode', '%')).toThrow(/No Morse code/);
		expect(run('ciphers.rot13', 'abc')).toBe('nop');
	});
});
