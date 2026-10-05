import { E24, clean, nearest, parseValue } from '../resistor/logic';

export { clean };

/** Parses a quantity like "5V", "20mA", "4k7", "0.25 W". Empty gives undefined. */
export function parseQty(s: string, unit: string): number | undefined {
	if (!s.trim()) return undefined;
	const words: Record<string, string[]> = {
		V: ['V', 'volt', 'volts'],
		A: ['A', 'amp', 'amps'],
		R: ['ohm', 'ohms', 'Ω', 'Ω'],
		W: ['W', 'watt', 'watts']
	};
	return parseValue(s, words[unit] ?? []);
}

/** 0.02 → "20 mA" */
export function fmt(x: number, unit: string): string {
	if (!Number.isFinite(x)) return '∞';
	if (x === 0) return `0 ${unit}`;
	const steps: [number, string][] = [
		[1e9, 'G'],
		[1e6, 'M'],
		[1e3, 'k'],
		[1, ''],
		[1e-3, 'm'],
		[1e-6, 'µ'],
		[1e-9, 'n'],
		[1e-12, 'p']
	];
	const a = Math.abs(x);
	for (const [f, p] of steps) {
		if (a >= f * 0.9999999) return `${Number((x / f).toPrecision(4))} ${p}${unit}`;
	}
	return `${x.toExponential(3)} ${unit}`;
}

export interface Virp {
	V: number;
	I: number;
	R: number;
	P: number;
}

/** Ohm's law and Joule's law from any two of V, I, R, P. */
export function solve(known: Partial<Virp>): Virp {
	const keys = (['V', 'I', 'R', 'P'] as const).filter((k) => known[k] !== undefined);
	if (keys.length !== 2) throw new Error(`Enter exactly two of V, I, R, P (${keys.length} given)`);
	for (const k of keys) {
		if (!Number.isFinite(known[k]!)) throw new Error(`${k} is not a number`);
		if ((k === 'R' || k === 'P') && known[k]! < 0) throw new Error(`${k} cannot be negative`);
	}
	const { V, I, R, P } = known;
	let out: Virp;
	if (V !== undefined && I !== undefined) out = { V, I, R: V / I, P: V * I };
	else if (V !== undefined && R !== undefined) {
		if (R === 0) throw new Error('R = 0 with a voltage is a short circuit');
		out = { V, I: V / R, R, P: (V * V) / R };
	} else if (V !== undefined && P !== undefined) {
		if (V === 0) throw new Error('V = 0 cannot deliver power');
		out = { V, I: P / V, R: (V * V) / P, P };
	} else if (I !== undefined && R !== undefined) out = { V: I * R, I, R, P: I * I * R };
	else if (I !== undefined && P !== undefined) {
		if (I === 0) throw new Error('I = 0 cannot deliver power');
		out = { V: P / I, I, R: P / (I * I), P };
	} else {
		if (R === 0) throw new Error('R = 0 cannot dissipate power');
		out = { V: Math.sqrt(P! * R!), I: Math.sqrt(P! / R!), R: R!, P: P! };
	}
	return { V: clean(out.V), I: clean(out.I), R: clean(out.R), P: clean(out.P) };
}

// ---------- voltage divider ----------

export interface Divider {
	vout: number;
	current: number;
	p1: number;
	p2: number;
	/** Thevenin output resistance R1 ∥ R2 */
	rout: number;
}

export function divider(vin: number, r1: number, r2: number): Divider {
	if (r1 < 0 || r2 < 0) throw new Error('Resistances cannot be negative');
	if (r1 + r2 === 0) throw new Error('R1 + R2 is zero, a short circuit');
	const i = vin / (r1 + r2);
	return {
		vout: clean((vin * r2) / (r1 + r2)),
		current: clean(i),
		p1: clean(i * i * r1),
		p2: clean(i * i * r2),
		rout: clean(r1 && r2 ? (r1 * r2) / (r1 + r2) : 0)
	};
}

export interface DividerPick {
	r1: number;
	r2: number;
	vout: number;
	/** Error against the target in percent */
	error: number;
}

/** Ideal R2 for a given R1 and target. */
export function idealR2(vin: number, vout: number, r1: number): number {
	if (!(vin > 0)) throw new Error('Vin must be above zero');
	if (!(vout > 0) || vout >= vin) throw new Error('Target Vout must be between 0 and Vin');
	if (!(r1 > 0)) throw new Error('R1 must be above zero');
	return clean((r1 * vout) / (vin - vout));
}

const e24Range = (lo: number, hi: number) => {
	const out: number[] = [];
	for (let d = Math.floor(Math.log10(lo)) - 1; d <= Math.ceil(Math.log10(hi)); d++)
		for (const b of E24) {
			const v = clean(b * 10 ** d);
			if (v >= lo && v <= hi) out.push(v);
		}
	return out;
};

/** Best E24 pairs for a target, R1 from `lo` to `hi`, sorted by error then by total resistance. */
export function bestPairs(
	vin: number,
	vout: number,
	lo = 1000,
	hi = 100_000,
	n = 5
): DividerPick[] {
	idealR2(vin, vout, lo);
	const r2s = e24Range(lo / 100, hi * 100);
	const picks: DividerPick[] = [];
	for (const r1 of e24Range(lo, hi)) {
		const ideal = (r1 * vout) / (vin - vout);
		const nb = nearest(ideal, 'E24');
		for (const r2 of new Set([nb.below, nb.above])) {
			if (!r2s.includes(r2)) continue;
			const v = (vin * r2) / (r1 + r2);
			picks.push({ r1, r2, vout: clean(v), error: clean(((v - vout) / vout) * 100) });
		}
	}
	picks.sort((a, b) => Math.abs(a.error) - Math.abs(b.error) || a.r1 + a.r2 - (b.r1 + b.r2));
	const seen = new Set<string>();
	return picks
		.filter((p) => {
			const k = `${p.r2 / p.r1}`;
			if (seen.has(k)) return false;
			seen.add(k);
			return true;
		})
		.slice(0, n);
}

// ---------- LED series resistor ----------

/** Common resistor power ratings in watts. */
export const RATINGS = [0.125, 0.25, 0.5, 1, 2, 3, 5, 10];

export interface Led {
	ideal: number;
	/** Next E24 value up, keeps the current at or below the target */
	chosen: number;
	current: number;
	power: number;
	/** Rating with at least 2× margin */
	rating: number | undefined;
	ledPower: number;
}

export function ledResistor(supply: number, vf: number, current: number, count = 1): Led {
	if (!(current > 0)) throw new Error('LED current must be above zero');
	if (!(vf > 0)) throw new Error('Forward voltage must be above zero');
	if (!Number.isInteger(count) || count < 1)
		throw new Error('LED count must be a whole number, 1 or more');
	const drop = supply - vf * count;
	if (drop <= 0)
		throw new Error(
			`Supply ${fmt(supply, 'V')} is not above ${count} × ${fmt(vf, 'V')} = ${fmt(vf * count, 'V')}. Use fewer LEDs in series or a higher supply.`
		);
	const ideal = drop / current;
	const n = nearest(ideal, 'E24');
	const chosen = n.above;
	const i = drop / chosen;
	const p = i * i * chosen;
	return {
		ideal: clean(ideal),
		chosen,
		current: clean(i),
		power: clean(p),
		rating: RATINGS.find((r) => r >= 2 * p),
		ledPower: clean(i * vf)
	};
}

// ---------- series / parallel ----------

export interface Combo {
	values: number[];
	series: number;
	parallel: number;
}

export function combine(list: string): Combo {
	const parts = list
		.split(/[\n;,]+|\s{2,}|\s(?=\d)/)
		.map((s) => s.trim())
		.filter(Boolean);
	if (!parts.length) throw new Error('Enter resistor values, one per line or separated by commas');
	const values = parts.map((p) => {
		const v = parseValue(p);
		if (v < 0) throw new Error(`${p} is negative`);
		return v;
	});
	const series = values.reduce((a, b) => a + b, 0);
	const parallel = values.some((v) => v === 0) ? 0 : 1 / values.reduce((a, b) => a + 1 / b, 0);
	return { values, series: clean(series), parallel: clean(parallel) };
}
