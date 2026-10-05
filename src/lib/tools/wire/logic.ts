/**
 * Wire gauge, conductor resistance and voltage drop.
 *
 * Sources:
 * - AWG: ASTM B258, d(n) = 0.127 mm × 92^((36 − n) / 39). Gauge 0 = "1/0", 00 = "2/0",
 *   000 = "3/0", 0000 = "4/0" are n = 0, −1, −2, −3.
 * - Copper: IEC 60028, International Annealed Copper Standard, 1/58 Ω·mm²/m = 0.017241 Ω·mm²/m
 *   at 20 °C, temperature coefficient 0.00393 /K.
 * - Aluminium: IEC 60889 hard-drawn aluminium for overhead conductors, 0.028264 Ω·mm²/m at 20 °C
 *   (61 % IACS), temperature coefficient 0.00403 /K.
 * - Metric sizes: IEC 60228 nominal cross-sections.
 * - Guide values for voltage drop: IEC 60364-5-52 (HD 60364-5-52, in Denmark DS/HD 60364-5-52)
 *   Annex G, informative: 3 % for lighting and 5 % for other uses, installations fed from the
 *   public low-voltage network. National rules and the installer decide.
 *
 * Only the resistance of the conductor is used. Cable reactance (about 0.08 mΩ/m) matters
 * for large cross-sections at 50 Hz and is ignored, as is the power factor.
 */
import { clean } from '../resistor/logic';

export { clean };

export type Metal = 'cu' | 'al';

export const METALS: Record<Metal, { name: string; rho20: number; alpha: number }> = {
	cu: { name: 'Copper', rho20: 1 / 58, alpha: 0.00393 },
	al: { name: 'Aluminium', rho20: 0.028264, alpha: 0.00403 }
};

/** IEC 60228 nominal cross-sections in mm². */
export const METRIC = [
	0.5, 0.75, 1, 1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300
];

/** "4/0" → -3, "00" → -1, "12" → 12. */
export function parseAwg(s: string): number {
	const t = s
		.trim()
		.toLowerCase()
		.replace(/\s*awg$/, '')
		.replace(/^awg\s*/, '');
	if (!t) throw new Error('Enter a gauge');
	let m = /^([1-4])\/0$/.exec(t);
	if (m) return 1 - Number(m[1]);
	if (/^0{1,4}$/.test(t)) return 1 - t.length;
	m = /^\d{1,2}$/.exec(t);
	if (m) {
		const n = Number(t);
		if (n > 40) throw new Error('AWG runs from 4/0 to 40 here');
		return n;
	}
	throw new Error(`"${s.trim()}" is not a gauge. Examples: 12, 1/0, 4/0`);
}

export function awgName(n: number): string {
	if (n <= 0) return `${1 - n}/0`;
	return String(n);
}

/** Diameter in mm of a solid conductor. */
export function awgDiameter(n: number): number {
	return 0.127 * 92 ** ((36 - n) / 39);
}

export function areaFromDiameter(d: number): number {
	return (Math.PI / 4) * d * d;
}

export function diameterFromArea(a: number): number {
	return Math.sqrt((4 * a) / Math.PI);
}

/** Fractional gauge for a diameter. */
export function awgFromDiameter(d: number): number {
	if (!(d > 0)) throw new Error('Diameter must be above zero');
	return 36 - 39 * (Math.log(d / 0.127) / Math.log(92));
}

export interface Size {
	/** mm² */
	area: number;
	/** mm, solid conductor */
	diameter: number;
	/** Fractional AWG */
	awg: number;
	/** Nearest whole AWG, and the next one at least as large */
	awgNearest: number;
	awgUp: number;
	/** Nearest IEC 60228 size, and the next one at least as large */
	metricNearest: number;
	metricUp?: number;
}

export function size(area: number): Size {
	if (!(area > 0)) throw new Error('Cross-section must be above zero');
	const diameter = diameterFromArea(area);
	const awg = awgFromDiameter(diameter);
	const awgNearest = Math.round(awg);
	// Larger wire has a smaller gauge number
	const awgUp = Math.floor(awg + 1e-9);
	let metricNearest = METRIC[0];
	for (const m of METRIC)
		if (Math.abs(Math.log(m / area)) < Math.abs(Math.log(metricNearest / area))) metricNearest = m;
	const metricUp = METRIC.find((m) => m >= area * (1 - 1e-9));
	return { area, diameter, awg, awgNearest, awgUp, metricNearest, metricUp };
}

/** Resistivity in Ω·mm²/m at a temperature. */
export function resistivity(metal: Metal, tempC = 20): number {
	const m = METALS[metal];
	return m.rho20 * (1 + m.alpha * (tempC - 20));
}

/** Ω per km of one conductor. */
export function ohmsPerKm(area: number, metal: Metal, tempC = 20): number {
	if (!(area > 0)) throw new Error('Cross-section must be above zero');
	return (resistivity(metal, tempC) / area) * 1000;
}

export type System = 'dc' | 'ac1' | 'ac3';

export const SYSTEMS: Record<System, { name: string; factor: number; factorText: string }> = {
	dc: { name: 'DC', factor: 2, factorText: '2 × length (out and back)' },
	ac1: { name: 'Single-phase AC', factor: 2, factorText: '2 × length (phase and neutral)' },
	ac3: { name: 'Three-phase AC', factor: Math.sqrt(3), factorText: '√3 × length (line to line)' }
};

export interface Drop {
	/** Volts lost */
	volts: number;
	/** Percent of the supply voltage */
	pct: number;
	/** Watts lost in the cable */
	watts: number;
	/** Resistance of one conductor over the length */
	rConductor: number;
	/** Voltage at the load */
	vLoad: number;
	verdict: 'ok' | 'lighting-high' | 'high';
}

/**
 * Voltage drop over a cable of one-way `length` metres carrying `current` A.
 * DC and single-phase count both conductors (2 × length). Three-phase uses √3 and the
 * line-to-line supply voltage.
 */
export function drop(
	system: System,
	length: number,
	current: number,
	area: number,
	supply: number,
	metal: Metal = 'cu',
	tempC = 20
): Drop {
	if (!(length > 0)) throw new Error('Length must be above zero');
	if (!(current > 0)) throw new Error('Current must be above zero');
	if (!(supply > 0)) throw new Error('Supply voltage must be above zero');
	if (!(area > 0)) throw new Error('Cross-section must be above zero');
	const rConductor = (resistivity(metal, tempC) * length) / area;
	const volts = SYSTEMS[system].factor * rConductor * current;
	const pct = (volts / supply) * 100;
	const conductors = system === 'ac3' ? 3 : 2;
	const watts = conductors * current * current * rConductor;
	const verdict = pct <= 3 ? 'ok' : pct <= 5 ? 'lighting-high' : 'high';
	return { volts, pct, watts, rConductor, vLoad: supply - volts, verdict };
}

/** Smallest IEC 60228 size that keeps the drop at or under maxPct. */
export function minArea(
	system: System,
	length: number,
	current: number,
	supply: number,
	maxPct: number,
	metal: Metal = 'cu',
	tempC = 20
): { exact: number; standard?: number } {
	if (!(maxPct > 0)) throw new Error('Allowed drop must be above zero');
	if (!(length > 0 && current > 0 && supply > 0))
		throw new Error('Enter length, current and supply');
	const exact =
		(SYSTEMS[system].factor * resistivity(metal, tempC) * length * current) /
		((maxPct / 100) * supply);
	return { exact, standard: METRIC.find((m) => m >= exact * (1 - 1e-9)) };
}

/** AWG table rows for reference. */
export function awgTable(from = -3, to = 30) {
	const rows = [];
	for (let n = from; n <= to; n++) {
		const d = awgDiameter(n);
		const a = areaFromDiameter(d);
		rows.push({ n, name: awgName(n), d, a, cu: ohmsPerKm(a, 'cu') });
	}
	return rows;
}
