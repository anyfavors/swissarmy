/**
 * RAID capacity, fault tolerance and rebuild arithmetic. Levels as commonly defined
 * (SNIA Common RAID Disk Data Format, and the original Patterson, Gibson, Katz 1988 paper).
 * Performance factors are the textbook theoretical multiples of one disk, not benchmarks.
 */

export type Level = 'jbod' | '0' | '1' | '5' | '6' | '10' | '50' | '60';

export interface LevelInfo {
	id: Level;
	label: string;
	min: number;
	/** Uses spans (groups) of disks. */
	nested?: boolean;
}

export const levels: LevelInfo[] = [
	{ id: '0', label: 'RAID 0', min: 2 },
	{ id: '1', label: 'RAID 1', min: 2 },
	{ id: '5', label: 'RAID 5', min: 3 },
	{ id: '6', label: 'RAID 6', min: 4 },
	{ id: '10', label: 'RAID 10', min: 4 },
	{ id: '50', label: 'RAID 50', min: 6, nested: true },
	{ id: '60', label: 'RAID 60', min: 8, nested: true },
	{ id: 'jbod', label: 'JBOD', min: 1 }
];

const unitBytes: Record<string, number> = {
	gb: 1e9,
	tb: 1e12,
	pb: 1e15,
	gib: 2 ** 30,
	tib: 2 ** 40
};

/**
 * Parses a disk list. Accepts "8 x 12 TB", "4x4TB, 2x8TB", "12, 12, 10" (TB by default),
 * "960 GB". Returns sizes in bytes, one entry per disk.
 */
export function parseDisks(raw: string): number[] {
	const s = raw.trim().toLowerCase().replace(/×/g, 'x');
	if (!s) throw new Error('Enter disks, for example 6 x 8 TB');
	const out: number[] = [];
	for (const part of s.split(/[,;+\n]+/)) {
		const p = part.trim();
		if (!p) continue;
		const m = /^(?:(\d+)\s*(?:x|\*)\s*)?(\d+(?:\.\d+)?)\s*(gb|tb|pb|gib|tib)?$/.exec(p);
		if (!m) throw new Error(`Cannot read "${part.trim()}". Use a form like 6 x 8 TB`);
		const count = m[1] ? Number(m[1]) : 1;
		const size = Number(m[2]) * unitBytes[m[3] ?? 'tb'];
		if (!(size > 0)) throw new Error('Disk size must be above zero');
		if (count < 1) throw new Error('Disk count must be at least 1');
		if (out.length + count > 1024) throw new Error('At most 1024 disks');
		for (let i = 0; i < count; i++) out.push(size);
	}
	if (!out.length) throw new Error('Enter at least one disk');
	return out;
}

export interface RaidResult {
	level: Level;
	disks: number;
	groups: number;
	perGroup: number;
	smallest: number;
	raw: number;
	usable: number;
	/** Disks that may fail with certainty of survival. */
	tolerance: number;
	/** Best case: failures survived if they land in different mirrors or groups. */
	toleranceBest: number;
	read: number;
	write: number;
	writeNote: string;
	mixed: boolean;
	/** Bytes read from surviving disks to rebuild one failed disk, when no redundancy remains. */
	ureExposedBytes: number;
	/** Redundancy left during a one-disk rebuild (0 means a URE can lose data). */
	redundancyDuringRebuild: number;
}

export function compute(level: Level, sizes: number[], groups = 2): RaidResult {
	const n = sizes.length;
	const smallest = Math.min(...sizes);
	const raw = sizes.reduce((a, b) => a + b, 0);
	const mixed = sizes.some((s) => s !== smallest);
	const info = levels.find((l) => l.id === level);
	if (!info) throw new Error(`Unknown RAID level ${level}`);
	if (n < info.min) throw new Error(`${info.label} needs at least ${info.min} disks`);
	const base = { level, disks: n, groups: 1, perGroup: n, smallest, raw, mixed };
	switch (level) {
		case 'jbod':
			return {
				...base,
				usable: raw,
				tolerance: 0,
				toleranceBest: 0,
				read: 1,
				write: 1,
				writeNote: 'One disk at a time, spanned, no striping',
				ureExposedBytes: 0,
				redundancyDuringRebuild: -1
			};
		case '0':
			return {
				...base,
				usable: n * smallest,
				tolerance: 0,
				toleranceBest: 0,
				read: n,
				write: n,
				writeNote: 'Striping, no parity',
				ureExposedBytes: 0,
				redundancyDuringRebuild: -1
			};
		case '1':
			return {
				...base,
				usable: smallest,
				tolerance: n - 1,
				toleranceBest: n - 1,
				read: n,
				write: 1,
				writeNote: 'Every write goes to all mirrors',
				ureExposedBytes: n === 2 ? smallest : 0,
				redundancyDuringRebuild: n - 2
			};
		case '5':
			return {
				...base,
				usable: (n - 1) * smallest,
				tolerance: 1,
				toleranceBest: 1,
				read: n,
				write: n / 4,
				writeNote: 'Small random writes: penalty 4 (read data, read parity, write both)',
				ureExposedBytes: (n - 1) * smallest,
				redundancyDuringRebuild: 0
			};
		case '6':
			return {
				...base,
				usable: (n - 2) * smallest,
				tolerance: 2,
				toleranceBest: 2,
				read: n,
				write: n / 6,
				writeNote: 'Small random writes: penalty 6 (two parity blocks)',
				ureExposedBytes: 0,
				redundancyDuringRebuild: 1
			};
		case '10':
			if (n % 2) throw new Error('RAID 10 needs an even number of disks');
			return {
				...base,
				groups: n / 2,
				perGroup: 2,
				usable: (n / 2) * smallest,
				tolerance: 1,
				toleranceBest: n / 2,
				read: n,
				write: n / 2,
				writeNote: 'Small random writes: penalty 2 (both mirror halves)',
				ureExposedBytes: smallest,
				redundancyDuringRebuild: 0
			};
		case '50':
		case '60': {
			const p = level === '50' ? 1 : 2;
			const minPer = level === '50' ? 3 : 4;
			if (!Number.isInteger(groups) || groups < 2) throw new Error('Use at least 2 spans');
			if (n % groups) throw new Error(`${n} disks do not split evenly into ${groups} spans`);
			const per = n / groups;
			if (per < minPer)
				throw new Error(`Each span of RAID ${level} needs at least ${minPer} disks (has ${per})`);
			return {
				...base,
				groups,
				perGroup: per,
				usable: (n - p * groups) * smallest,
				tolerance: p,
				toleranceBest: p * groups,
				read: n,
				write: n / (p === 1 ? 4 : 6),
				writeNote: `Small random writes: penalty ${p === 1 ? 4 : 6} inside each span`,
				ureExposedBytes: p === 1 ? (per - 1) * smallest : 0,
				redundancyDuringRebuild: p - 1
			};
		}
	}
}

export function toTB(bytes: number): number {
	return bytes / 1e12;
}

export function toTiB(bytes: number): number {
	return bytes / 2 ** 40;
}

/** Seconds to rewrite one disk at a sustained speed in MB/s (10^6 bytes per second). */
export function rebuildSeconds(diskBytes: number, mbPerSecond: number): number {
	if (!(mbPerSecond > 0)) throw new Error('Rebuild speed must be above zero');
	return diskBytes / (mbPerSecond * 1e6);
}

/**
 * Probability of at least one unrecoverable read error while reading `bytes`, for a drive
 * spec of one URE per `bitsPerUre` bits read: 1 - (1 - 1/R)^b, computed stably.
 */
export function ureProbability(bytes: number, bitsPerUre: number): number {
	const bits = bytes * 8;
	return -Math.expm1(bits * Math.log1p(-1 / bitsPerUre));
}

export function formatHours(seconds: number): string {
	const h = seconds / 3600;
	if (h < 1) return `${Math.round(seconds / 60)} min`;
	if (h < 48) return `${Number(h.toFixed(1))} h`;
	return `${Number((h / 24).toFixed(1))} days (${Math.round(h)} h)`;
}

export function fmt(n: number, digits = 2): string {
	return Number(n.toFixed(digits)).toLocaleString('en-GB', { maximumFractionDigits: digits });
}
