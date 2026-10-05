import { describe, expect, it } from 'vitest';
import { MATERIALS, cost, gramsPerMetre, gramsToMetres, metresToGrams } from './logic';

const near = (a: number, b: number, rel = 1e-3) =>
	expect(Math.abs(a - b) / Math.abs(b)).toBeLessThan(rel);

describe('filament', () => {
	it('weighs 1.75 mm PLA at about 2.98 g/m', () => {
		near(gramsPerMetre(1.75, 1.24), 2.9825);
	});
	it('gives about 335 m per kg of 1.75 mm PLA', () => {
		near(gramsToMetres(1000, 1.75, 1.24), 335.29);
	});
	it('gives about 126 m per kg of 2.85 mm PLA', () => {
		near(gramsToMetres(1000, 2.85, 1.24), 126.42);
	});
	it('round trips', () => {
		for (const m of MATERIALS)
			near(metresToGrams(gramsToMetres(250, 1.75, m.density), 1.75, m.density), 250, 1e-12);
	});
	it('is lighter per metre for ABS than PETG', () => {
		expect(gramsPerMetre(1.75, 1.04)).toBeLessThan(gramsPerMetre(1.75, 1.27));
	});
	it('validates', () => {
		expect(() => gramsPerMetre(0, 1.24)).toThrow(/Diameter/);
		expect(() => gramsPerMetre(1.75, 0)).toThrow(/Density/);
		expect(() => gramsToMetres(-1, 1.75, 1.24)).toThrow(/negative/);
		expect(() => metresToGrams(-1, 1.75, 1.24)).toThrow(/negative/);
	});
});

describe('cost', () => {
	it('prices a print', () => {
		const c = cost(200, 1000, 42, 2.98);
		near(c.perGram, 0.2);
		near(c.print, 8.4);
		near(c.perMetre, 0.596);
	});
	it('validates', () => {
		expect(() => cost(200, 0, 1, 1)).toThrow(/Spool weight/);
		expect(() => cost(-1, 1000, 1, 1)).toThrow(/Price/);
	});
});
