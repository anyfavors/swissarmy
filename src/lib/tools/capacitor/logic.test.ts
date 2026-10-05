import { describe, expect, it } from 'vitest';
import {
	curvePoints,
	decodeCap,
	encodeCap,
	lcResonance,
	parseF,
	rc,
	timeToPct,
	tolRange,
	TOLERANCES,
	units,
	voltageCode,
	xc,
	xl
} from './logic';

const near = (a: number, b: number, rel = 1e-3) =>
	expect(Math.abs(a - b) / Math.abs(b)).toBeLessThan(rel);

describe('value codes', () => {
	it('reads three-digit codes in pF', () => {
		expect(decodeCap('104').pF).toBe(100000);
		expect(decodeCap('104').value).toBe(1e-7);
		expect(decodeCap('473').pF).toBe(47000);
		expect(decodeCap('222').pF).toBe(2200);
		expect(decodeCap('100').pF).toBe(10);
		expect(decodeCap('105').pF).toBe(1e6);
		expect(decodeCap('109').pF).toBe(1);
		expect(decodeCap('478').pF).toBe(0.47);
	});
	it('reads R notation and plain values', () => {
		expect(decodeCap('4R7').pF).toBe(4.7);
		expect(decodeCap('R47').pF).toBe(0.47);
		expect(decodeCap('47').pF).toBe(47);
	});
	it('reads tolerance and voltage', () => {
		const d = decodeCap('104K 1H');
		expect(d.pF).toBe(100000);
		expect(d.tol?.letter).toBe('K');
		expect(d.volts).toBe(50);
		const e = decodeCap('2A 473J');
		expect(e.volts).toBe(100);
		expect(e.tol?.pct).toBe(5);
		expect(decodeCap('4R7C').tol?.pF).toBe(0.25);
	});
	it('rejects junk', () => {
		expect(() => decodeCap('')).toThrow(/Enter a marking/);
		expect(() => decodeCap('abc')).toThrow(/not a capacitor code/);
		expect(() => decodeCap('107')).toThrow(/7 is not used/);
		expect(() => decodeCap('104 1H 2A')).toThrow(/Could not read/);
	});
	it('encodes values', () => {
		expect(encodeCap(100e-9)).toBe('104');
		expect(encodeCap(4.7e-12)).toBe('4R7');
		expect(encodeCap(1e-12)).toBe('1R0');
		expect(encodeCap(47e-12)).toBe('470');
		expect(encodeCap(2.2e-9)).toBe('222');
		expect(encodeCap(1e-6)).toBe('105');
		expect(encodeCap(1.23e-9)).toBeUndefined();
	});
	it('round trips E6 values', () => {
		for (const s of [10, 15, 22, 33, 47, 68])
			for (let e = 1; e <= 6; e++) {
				const f = s * 10 ** e * 1e-12;
				expect(decodeCap(encodeCap(f)!).value).toBeCloseTo(f, 20);
			}
	});
});

describe('voltage codes', () => {
	it('follows the EIA table', () => {
		expect(voltageCode('1H')).toBe(50);
		expect(voltageCode('1C')).toBe(16);
		expect(voltageCode('1E')).toBe(25);
		expect(voltageCode('1V')).toBe(35);
		expect(voltageCode('0J')).toBe(6.3);
		expect(voltageCode('2A')).toBe(100);
		expect(voltageCode('2J')).toBe(630);
		expect(voltageCode('2W')).toBe(450);
		expect(voltageCode('3A')).toBe(1000);
	});
	it('rejects unknown letters', () => {
		expect(() => voltageCode('1X')).toThrow(/Unknown voltage code letter/);
		expect(() => voltageCode('9H')).toThrow(/not a voltage code/);
	});
});

describe('tolerance and units', () => {
	it('uses absolute pF below 10 pF', () => {
		const c = TOLERANCES.find((t) => t.letter === 'C')!;
		const r = tolRange(4.7e-12, c);
		near(r.min, 4.45e-12);
		near(r.max, 4.95e-12);
	});
	it('uses percent above 10 pF', () => {
		const k = TOLERANCES.find((t) => t.letter === 'K')!;
		const r = tolRange(100e-9, k);
		near(r.min, 90e-9);
		near(r.max, 110e-9);
		const z = TOLERANCES.find((t) => t.letter === 'Z')!;
		near(tolRange(10e-6, z).max, 18e-6);
		near(tolRange(10e-6, z).min, 8e-6);
	});
	it('converts pF nF µF', () => {
		expect(units(100e-9)).toEqual({ pF: 100000, nF: 100, uF: 0.1 });
		expect(parseF('100nF')).toBe(1e-7);
		expect(parseF('4.7u')).toBe(4.7e-6);
		expect(parseF('4µ7')).toBe(4.7e-6);
		expect(parseF('')).toBeUndefined();
	});
});

describe('RC', () => {
	it('gives the time constant and the 1 to 5 τ table', () => {
		const r = rc(10e3, 100e-6);
		near(r.tau, 1);
		expect(r.rows.map((x) => x.charge.toFixed(1))).toEqual([
			'63.2',
			'86.5',
			'95.0',
			'98.2',
			'99.3'
		]);
		expect(r.rows.map((x) => x.discharge.toFixed(1))).toEqual([
			'36.8',
			'13.5',
			'5.0',
			'1.8',
			'0.7'
		]);
	});
	it('gives the cutoff frequency', () => {
		near(rc(1e3, 1e-6).fc, 159.155);
	});
	it('solves time to a percentage', () => {
		near(timeToPct(1, 63.212), 1);
		near(timeToPct(1, 50), Math.LN2);
		expect(() => timeToPct(1, 100)).toThrow(/between 0 and 100/);
	});
	it('rejects zero', () => {
		expect(() => rc(0, 1e-6)).toThrow(/R must be above zero/);
		expect(() => rc(1, 0)).toThrow(/C must be above zero/);
	});
	it('draws curves inside the box', () => {
		const p = curvePoints(500, 200, 10);
		const ch = p.charge.split(' ');
		expect(ch).toHaveLength(11);
		expect(ch[0]).toBe('0,200');
		expect(p.discharge.split(' ')[0]).toBe('0,0');
		expect(ch[10].startsWith('500,')).toBe(true);
	});
});

describe('LC and reactance', () => {
	it('computes resonance', () => {
		near(lcResonance(10e-6, 100e-9), 159154.9);
	});
	it('computes reactance', () => {
		near(xc(50, 10e-6), 318.31);
		near(xl(1e3, 10e-3), 62.832);
		expect(() => xc(0, 1)).toThrow(/Frequency/);
	});
});
