import { describe, expect, it } from 'vitest';
import { averageCurrent, dailyEnergy, humanHours, runtime, solar, whToAh } from './logic';

const near = (a: number, b: number, rel = 1e-9) =>
	expect(Math.abs(a - b) / Math.abs(b)).toBeLessThan(rel);

describe('average current', () => {
	it('weights by time', () => {
		// 10 µA sleep for 59 s, 20 mA awake for 1 s
		near(
			averageCurrent([
				{ current: 10e-6, time: 59 },
				{ current: 0.02, time: 1 }
			]),
			(10e-6 * 59 + 0.02) / 60
		);
	});
	it('handles a single phase', () => {
		expect(averageCurrent([{ current: 0.1, time: 5 }])).toBe(0.1);
	});
	it('validates', () => {
		expect(() => averageCurrent([])).toThrow(/at least one/);
		expect(() => averageCurrent([{ current: -1, time: 1 }])).toThrow(/negative/);
		expect(() => averageCurrent([{ current: 1, time: 0 }])).toThrow(/zero/);
	});
});

describe('runtime', () => {
	it('divides derated capacity by draw', () => {
		const r = runtime(2, 0.1, 0.8, 3.7);
		near(r.hours, 16);
		near(r.usableAh, 1.6);
		near(r.wh!, 7.4);
	});
	it('converts Wh', () => {
		near(whToAh(12, 3.7), 12 / 3.7);
		expect(() => whToAh(12, 0)).toThrow(/Voltage/);
	});
	it('validates', () => {
		expect(() => runtime(0, 1)).toThrow(/Capacity/);
		expect(() => runtime(1, 0)).toThrow(/Average current/);
		expect(() => runtime(1, 1, 1.2)).toThrow(/Derating/);
	});
	it('formats durations', () => {
		expect(humanHours(1.5)).toBe('1 h 30 min');
		expect(humanHours(0.25)).toBe('15 min');
		expect(humanHours(50)).toBe('2 d 2 h 0 min');
		expect(humanHours(24 * 400)).toBe('400 d 0 h (1.1 years)');
		expect(humanHours(1 / 7200)).toBe('0.500 s');
		expect(humanHours(Infinity)).toBe('∞');
	});
});

describe('solar', () => {
	it('sizes panel and battery', () => {
		const s = solar(240, 1, 3, 0.5, 12, 0.75);
		near(s.panelW, 320);
		near(s.batteryWh, 1440);
		near(s.batteryAh, 120);
	});
	it('validates', () => {
		expect(() => solar(0, 1, 1, 0.5, 12)).toThrow(/Daily energy/);
		expect(() => solar(1, 0, 1, 0.5, 12)).toThrow(/Peak sun/);
		expect(() => solar(1, 1, 0, 0.5, 12)).toThrow(/autonomy/);
		expect(() => solar(1, 1, 1, 0, 12)).toThrow(/Depth/);
		expect(() => solar(1, 1, 1, 0.5, 0)).toThrow(/System voltage/);
		expect(() => solar(1, 1, 1, 0.5, 12, 2)).toThrow(/Efficiency/);
	});
	it('sums loads', () => {
		expect(
			dailyEnergy([
				{ name: 'router', watts: 10, hours: 24 },
				{ name: 'lamp', watts: 5, hours: 4 }
			])
		).toBe(260);
		expect(() => dailyEnergy([{ name: 'x', watts: 1, hours: 25 }])).toThrow(/24 h/);
	});
});
