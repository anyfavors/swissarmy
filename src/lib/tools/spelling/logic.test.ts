import { describe, expect, it } from 'vitest';
import { danish, nato, spell, spellLine } from './logic';
import { ops } from './ops';

describe('NATO / ICAO', () => {
	it('has 26 letters with the ICAO spellings', () => {
		expect(Object.keys(nato)).toHaveLength(26);
		expect(nato.A[0]).toBe('Alfa');
		expect(nato.J[0]).toBe('Juliett');
		expect(nato.X[0]).toBe('X-ray');
	});
	it('spells with case marked', () => {
		expect(spellLine('aB3-', { alphabet: 'nato', caseMode: 'upper' })).toBe(
			'alfa, Capital Bravo, Three, Dash'
		);
		expect(spellLine('aB', { alphabet: 'nato', caseMode: 'both' })).toBe(
			'Small Alfa, Capital Bravo'
		);
		expect(spellLine('aB', { alphabet: 'nato', caseMode: 'none' })).toBe('Alfa, Bravo');
	});
	it('gives ICAO figure pronunciation', () => {
		const items = spell('3459', { alphabet: 'nato', caseMode: 'upper' });
		expect(items.map((i) => i.hint)).toEqual(['TREE', 'FOW-er', 'FIFE', 'NIN-er']);
	});
	it('names symbols and unknown characters', () => {
		expect(spellLine('@ _', { alphabet: 'nato', caseMode: 'upper' })).toBe(
			'At sign, Space, Underscore'
		);
		expect(spellLine('Ø', { alphabet: 'nato', caseMode: 'upper' })).toBe(
			'Capital letter Ø (U+00D8)'
		);
		expect(spellLine('😀', { alphabet: 'nato', caseMode: 'upper' })).toBe('Character 😀 (U+1F600)');
		expect(spellLine('\t', { alphabet: 'nato', caseMode: 'upper' })).toBe('Tab');
	});
});

describe('Danish', () => {
	it('covers A to Å', () => {
		expect(Object.keys(danish)).toHaveLength(29);
		expect([danish.A, danish.B, danish.C]).toEqual(['Anna', 'Bernhard', 'Cecilie']);
	});
	it('spells with Danish case words, digits and symbols', () => {
		expect(spellLine('Øl1@', { alphabet: 'danish', caseMode: 'upper' })).toBe(
			'stort Øresund, Ludvig, en, snabel-a'
		);
		expect(spellLine('æ', { alphabet: 'danish', caseMode: 'both' })).toBe('lille Ægir');
	});
});

describe('chain ops', () => {
	it('spells', async () => {
		const op = ops.find((o) => o.id === 'spelling.nato')!;
		expect(await op.run('Hi')).toBe('Capital Hotel, india');
	});
});
