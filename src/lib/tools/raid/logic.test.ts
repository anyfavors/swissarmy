import { describe, expect, it } from 'vitest';
import { compute, parseDisks, rebuildSeconds, toTB, toTiB, ureProbability } from './logic';

const TB = 1e12;

describe('parseDisks', () => {
	it('reads counts and units', () => {
		expect(parseDisks('4 x 4 TB')).toEqual([4 * TB, 4 * TB, 4 * TB, 4 * TB]);
		expect(parseDisks('2x8TB, 1 x 960 GB')).toEqual([8 * TB, 8 * TB, 960e9]);
		expect(parseDisks('12, 12, 10')).toEqual([12 * TB, 12 * TB, 10 * TB]);
		expect(parseDisks('2 × 1 TiB')).toEqual([2 ** 40, 2 ** 40]);
	});
	it('rejects nonsense', () => {
		expect(() => parseDisks('')).toThrow(/Enter disks/);
		expect(() => parseDisks('four big ones')).toThrow(/Cannot read/);
		expect(() => parseDisks('2000 x 1 TB')).toThrow(/1024/);
	});
});

describe('capacity and tolerance', () => {
	const d = (n: number, s = 4) => Array(n).fill(s * TB);
	it('RAID 0, 1, 5, 6', () => {
		expect(compute('0', d(4)).usable).toBe(16 * TB);
		expect(compute('1', d(2)).usable).toBe(4 * TB);
		expect(compute('1', d(3)).tolerance).toBe(2);
		expect(compute('5', d(4)).usable).toBe(12 * TB);
		expect(compute('5', d(4)).tolerance).toBe(1);
		expect(compute('6', d(6)).usable).toBe(16 * TB);
		expect(compute('6', d(6)).tolerance).toBe(2);
	});
	it('RAID 10, 50, 60', () => {
		const r10 = compute('10', d(8));
		expect(r10.usable).toBe(16 * TB);
		expect([r10.tolerance, r10.toleranceBest]).toEqual([1, 4]);
		const r50 = compute('50', d(12), 3);
		expect(r50.usable).toBe(36 * TB);
		expect([r50.tolerance, r50.toleranceBest, r50.perGroup]).toEqual([1, 3, 4]);
		const r60 = compute('60', d(12), 2);
		expect(r60.usable).toBe(32 * TB);
		expect([r60.tolerance, r60.toleranceBest]).toEqual([2, 4]);
	});
	it('JBOD sums mixed sizes, parity RAID uses the smallest', () => {
		const mixed = [4 * TB, 8 * TB, 8 * TB];
		expect(compute('jbod', mixed).usable).toBe(20 * TB);
		const r5 = compute('5', mixed);
		expect(r5.usable).toBe(8 * TB);
		expect(r5.mixed).toBe(true);
	});
	it('enforces minimums and layouts', () => {
		expect(() => compute('5', d(2))).toThrow(/at least 3/);
		expect(() => compute('6', d(3))).toThrow(/at least 4/);
		expect(() => compute('10', d(5))).toThrow(/even/);
		expect(() => compute('50', d(7), 2)).toThrow(/evenly/);
		expect(() => compute('60', d(12), 4)).toThrow(/at least 4 disks \(has 3\)/);
		expect(() => compute('50', d(6), 1)).toThrow(/2 spans/);
	});
	it('gives theoretical performance factors', () => {
		const r5 = compute('5', d(8));
		expect([r5.read, r5.write]).toEqual([8, 2]);
		const r10 = compute('10', d(8));
		expect([r10.read, r10.write]).toEqual([8, 4]);
	});
});

describe('units, rebuild, URE', () => {
	it('converts TB and TiB', () => {
		expect(toTB(12 * TB)).toBe(12);
		expect(toTiB(12 * TB)).toBeCloseTo(10.914, 3);
	});
	it('estimates rebuild time', () => {
		expect(rebuildSeconds(4 * TB, 100)).toBe(40_000);
		expect(() => rebuildSeconds(TB, 0)).toThrow(/above zero/);
	});
	it('computes URE risk on a 4 x 4 TB RAID 5 rebuild', () => {
		const r = compute('5', Array(4).fill(4 * TB));
		expect(r.ureExposedBytes).toBe(12 * TB);
		// 9.6e13 bits at 1 in 1e14: 1 - e^-0.96
		expect(ureProbability(r.ureExposedBytes, 1e14)).toBeCloseTo(1 - Math.exp(-0.96), 6);
		expect(ureProbability(r.ureExposedBytes, 1e15)).toBeCloseTo(1 - Math.exp(-0.096), 6);
	});
	it('marks RAID 6 as still protected during rebuild', () => {
		expect(compute('6', Array(6).fill(TB)).redundancyDuringRebuild).toBe(1);
		expect(compute('6', Array(6).fill(TB)).ureExposedBytes).toBe(0);
	});
});
