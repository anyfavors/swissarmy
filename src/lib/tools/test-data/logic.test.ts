import { describe, expect, it } from 'vitest';
import { checkIban } from '../check-digits/logic';
import {
	allFields,
	asciiSlug,
	cryptoRng,
	danishIban,
	danishPhone,
	generate,
	luhnValid,
	randInt,
	seededRng,
	testCards,
	toCsv,
	toJson,
	uuidV4
} from './logic';

const opts = { count: 50, fields: allFields, names: 'mixed' as const, year: 2026 };

describe('random sources', () => {
	it('is reproducible with a seed', () => {
		const a = generate(seededRng('field manual'), opts);
		const b = generate(seededRng('field manual'), opts);
		const c = generate(seededRng('other'), opts);
		expect(a).toEqual(b);
		expect(a).not.toEqual(c);
	});
	it('gives integers in range', () => {
		const r = seededRng('x');
		const seen = new Set<number>();
		for (let i = 0; i < 2000; i++) {
			const n = randInt(r, 7);
			expect(n).toBeGreaterThanOrEqual(0);
			expect(n).toBeLessThan(7);
			seen.add(n);
		}
		expect(seen.size).toBe(7);
	});
	it('uses crypto.getRandomValues without a seed', () => {
		const r = cryptoRng();
		const xs = Array.from({ length: 600 }, () => r());
		expect(new Set(xs).size).toBeGreaterThan(590);
		expect(xs.every((x) => Number.isInteger(x) && x >= 0 && x < 2 ** 32)).toBe(true);
	});
});

describe('fields', () => {
	const rows = generate(seededRng('t'), { ...opts, count: 200 });
	it('only uses RFC 2606 domains', () => {
		for (const r of rows) expect(r.email).toMatch(/^[a-z0-9.]+@example\.(com|org|net)$/);
		expect(new Set(rows.map((r) => r.email)).size).toBe(rows.length);
	});
	it('only uses documented test cards, all Luhn-valid', () => {
		for (const c of testCards) expect(luhnValid(c.number), c.number).toBe(true);
		const known = new Set(testCards.map((c) => c.number));
		for (const r of rows) expect(known.has(r.card_number)).toBe(true);
		for (const r of rows) expect(r.card_expiry).toMatch(/^(0[1-9]|1[0-2])\/\d{2}$/);
	});
	it('makes valid Danish IBANs', () => {
		const r = seededRng('iban');
		for (let i = 0; i < 100; i++) {
			const iban = danishIban(r);
			expect(iban).toMatch(/^DK\d{16}$/);
			expect(checkIban(iban).status).toBe('valid');
		}
	});
	it('formats phones and UUIDs', () => {
		const r = seededRng('p');
		expect(danishPhone(r)).toMatch(/^\+45 [2-9]\d \d{2} \d{2} \d{2}$/);
		expect(uuidV4(r)).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
		);
	});
	it('folds names to ASCII', () => {
		expect(asciiSlug('Søren')).toBe('soeren');
		expect(asciiSlug('Østergaard')).toBe('oestergaard');
		expect(asciiSlug("O'Brien")).toBe('obrien');
		expect(asciiSlug('Chloé')).toBe('chloe');
		expect(asciiSlug('Yılmaz')).toBe('yilmaz');
	});
	it('gives birth dates in range', () => {
		for (const r of rows) {
			expect(r.birthdate >= '1950-01-01' && r.birthdate <= '2007-12-31').toBe(true);
		}
	});
	it('validates options', () => {
		expect(() => generate(seededRng('a'), { ...opts, count: 0 })).toThrow(/1 to 1000/);
		expect(() => generate(seededRng('a'), { ...opts, fields: [] })).toThrow(/at least one/);
	});
});

describe('output', () => {
	it('quotes CSV cells', () => {
		expect(
			toCsv([
				{ a: 'x,y', b: 'say "hi"' },
				{ a: 'plain', b: "O'Brien" }
			])
		).toBe('a,b\r\n"x,y","say ""hi"""\r\nplain,O\'Brien');
		expect(toCsv([])).toBe('');
	});
	it('writes JSON', () => {
		expect(JSON.parse(toJson([{ a: '1' }]))).toEqual([{ a: '1' }]);
	});
	it('keeps only chosen fields', () => {
		const rows = generate(seededRng('f'), { ...opts, count: 2, fields: ['uuid', 'name'] });
		expect(Object.keys(rows[0])).toEqual(['first_name', 'last_name', 'uuid']);
	});
});
