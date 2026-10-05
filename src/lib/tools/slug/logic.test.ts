import { describe, expect, it } from 'vitest';
import { safeFilename, slugify, transliterate } from './logic';
import { ops } from './ops';

describe('slug: transliterate', () => {
	it('folds accents and special Latin letters', () => {
		expect(transliterate('Crème brûlée à la façon de Šibenik')).toBe(
			'Creme brulee a la facon de Sibenik'
		);
		expect(transliterate('Straße Łódź Þór Œuvre')).toBe('Strasse Lodz THor OEuvre');
	});

	it('uses æ ae, ø o, å a by default, and ae oe aa with the Danish option', () => {
		expect(transliterate('Ærø Åbenrå')).toBe('AEro Abenra');
		expect(transliterate('Ærø Åbenrå', true)).toBe('Aeroe Aabenraa');
	});
});

describe('slug: slugify', () => {
	it('makes a lower-case, hyphenated slug', () => {
		expect(slugify('  Hello, World!  ')).toBe('hello-world');
		expect(slugify("Don't Panic: It's 2026")).toBe('dont-panic-its-2026');
		expect(slugify('Tom & Jerry')).toBe('tom-and-jerry');
	});

	it('handles Danish', () => {
		expect(slugify('Rødgrød med fløde på Ærø')).toBe('rodgrod-med-flode-pa-aero');
		expect(slugify('Rødgrød med fløde på Ærø', { danish: true })).toBe(
			'roedgroed-med-floede-paa-aeroe'
		);
	});

	it('supports separators, case and max length at a word boundary', () => {
		expect(slugify('A B C', { separator: '_', lower: false })).toBe('A_B_C');
		expect(slugify('the quick brown fox', { maxLength: 12 })).toBe('the-quick');
	});

	it('drops or keeps non-Latin scripts', () => {
		expect(slugify('Привет мир 2')).toBe('2');
		expect(slugify('Привет мир', { unicode: true })).toBe('привет-мир');
	});
});

describe('slug: safe filename', () => {
	it('replaces characters Windows forbids', () => {
		const r = safeFilename('Q1: report <final>?.docx', 'windows');
		expect(r.name).toBe('Q1_ report _final__.docx');
		expect(r.changes.length).toBe(1);
	});

	it('only replaces / on Linux and / and : on macOS', () => {
		expect(safeFilename('a:b/c?', 'linux').name).toBe('a:b_c?');
		expect(safeFilename('a:b/c?', 'macos').name).toBe('a_b_c?');
	});

	it('handles reserved device names, with and without extension, any case', () => {
		expect(safeFilename('CON', 'windows').name).toBe('CON_');
		expect(safeFilename('nul.txt', 'windows').name).toBe('nul_.txt');
		expect(safeFilename('com1.tar.gz', 'portable').name).toBe('com1_.tar.gz');
		expect(safeFilename('CONSOLE.txt', 'windows').name).toBe('CONSOLE.txt');
		expect(safeFilename('con', 'linux').name).toBe('con');
	});

	it('removes trailing dots and spaces for Windows', () => {
		expect(safeFilename('  notes. . ', 'windows').name).toBe('notes');
		expect(safeFilename('notes.', 'linux').name).toBe('notes.');
	});

	it('names empty or dot-only input', () => {
		expect(safeFilename('..', 'linux').name).toBe('unnamed');
		expect(safeFilename('???', 'windows').name).toBe('___');
		expect(safeFilename('   ', 'windows').name).toBe('unnamed');
	});

	it('shortens to 255 bytes keeping the extension and whole characters', () => {
		const r = safeFilename('ø'.repeat(200) + '.txt', 'linux');
		expect(new TextEncoder().encode(r.name).length).toBeLessThanOrEqual(255);
		expect(r.name.endsWith('ø.txt')).toBe(true);
		expect(r.name).toBe('ø'.repeat(125) + '.txt');
		const w = safeFilename('a'.repeat(300) + '.pdf', 'windows');
		expect(w.name.length).toBe(255);
		expect(w.name.endsWith('.pdf')).toBe(true);
	});

	it('warns about hidden files and leading dashes', () => {
		expect(safeFilename('.env', 'linux').changes[0]).toMatch(/hidden/);
		expect(safeFilename('-rf', 'linux').changes[0]).toMatch(/option/);
	});
});

describe('slug: ops', () => {
	const run = (id: string, s: string) => ops.find((o) => o.id === id)!.run(s);
	it('runs and throws readable errors', () => {
		expect(run('slug.slugify', 'Æblegrød')).toBe('aeblegrod');
		expect(run('slug.slugify-da', 'Æblegrød')).toBe('aeblegroed');
		expect(() => run('slug.slugify', '!!!')).toThrow(/Nothing left/);
		expect(run('slug.filename', 'a/b:c')).toBe('a_b_c');
		expect(() => run('slug.filename', 'a\nb')).toThrow(/lines/);
	});
});
