/**
 * Filament mass, length and cost.
 *
 * mass = density × π (d / 2)² × length. Densities are typical values in g/cm³ as printed on
 * common manufacturer data sheets; a given brand can differ by a few percent, so the tool lets
 * you type your own. Diameters are nominal.
 */

export interface Material {
	id: string;
	name: string;
	/** g/cm³, typical */
	density: number;
}

export const MATERIALS: Material[] = [
	{ id: 'pla', name: 'PLA', density: 1.24 },
	{ id: 'petg', name: 'PETG', density: 1.27 },
	{ id: 'abs', name: 'ABS', density: 1.04 },
	{ id: 'asa', name: 'ASA', density: 1.07 },
	{ id: 'tpu', name: 'TPU', density: 1.21 }
];

export const DIAMETERS = [1.75, 2.85];

/** Grams per metre of filament. diameter in mm, density in g/cm³. */
export function gramsPerMetre(diameter: number, density: number): number {
	if (!(diameter > 0)) throw new Error('Diameter must be above zero');
	if (!(density > 0)) throw new Error('Density must be above zero');
	const areaMm2 = Math.PI * (diameter / 2) ** 2;
	// 1 m = 1000 mm, mm³ → cm³ is / 1000, so mm² × 1 m = area cm³
	return areaMm2 * density;
}

export function gramsToMetres(g: number, diameter: number, density: number): number {
	if (!(g >= 0)) throw new Error('Mass cannot be negative');
	return g / gramsPerMetre(diameter, density);
}

export function metresToGrams(m: number, diameter: number, density: number): number {
	if (!(m >= 0)) throw new Error('Length cannot be negative');
	return m * gramsPerMetre(diameter, density);
}

export interface Cost {
	perGram: number;
	perMetre: number;
	print: number;
}

/** Cost of a print from a spool price and spool net weight in grams. */
export function cost(
	spoolPrice: number,
	spoolGrams: number,
	printGrams: number,
	gpm: number
): Cost {
	if (!(spoolPrice >= 0)) throw new Error('Price cannot be negative');
	if (!(spoolGrams > 0)) throw new Error('Spool weight must be above zero');
	if (!(printGrams >= 0)) throw new Error('Print weight cannot be negative');
	const perGram = spoolPrice / spoolGrams;
	return { perGram, perMetre: perGram * gpm, print: perGram * printGrams };
}
