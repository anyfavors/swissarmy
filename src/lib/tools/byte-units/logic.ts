export interface ParsedSize {
	/** Size in bytes. Can be fractional when the input was in bits. */
	bytes: number;
	/** How the unit was read, e.g. "terabytes (10^12 B)". */
	readAs: string;
	/** Set when the unit could reasonably mean something else. */
	warning?: string;
}

const letters = ['', 'k', 'M', 'G', 'T', 'P', 'E'];
const words: Record<string, [number, boolean]> = {
	kilo: [1, false],
	mega: [2, false],
	giga: [3, false],
	tera: [4, false],
	peta: [5, false],
	exa: [6, false],
	kibi: [1, true],
	mebi: [2, true],
	gibi: [3, true],
	tebi: [4, true],
	pebi: [5, true],
	exbi: [6, true]
};
const decNames = [
	'bytes',
	'kilobytes',
	'megabytes',
	'gigabytes',
	'terabytes',
	'petabytes',
	'exabytes'
];
const binNames = [
	'bytes',
	'kibibytes',
	'mebibytes',
	'gibibytes',
	'tebibytes',
	'pebibytes',
	'exbibytes'
];

function readNumber(s: string): number {
	if (/,/.test(s)) {
		if (!/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s))
			throw new Error('Use . as the decimal mark. Commas are only read as thousands separators');
		s = s.replace(/,/g, '');
	}
	s = s.replace(/[_\s']/g, '');
	const n = Number(s);
	if (!Number.isFinite(n)) throw new Error(`"${s}" is not a number`);
	return n;
}

/**
 * Parsing rules:
 * - B is bytes, b is bits. "bit", "bits", "byte", "bytes" and "o" (octet) are also accepted.
 * - k, M, G, T, P, E are powers of 1000. K means the same as k.
 * - Ki, Mi, Gi, Ti, Pi, Ei are powers of 1024.
 * - A bare prefix letter without B (500G, 1.5T) is read as binary, as df -h and ls -h print it.
 * - No unit means bytes.
 */
export function parseSize(raw: string): ParsedSize {
	const s = raw.trim();
	if (!s) throw new Error('Enter a size, e.g. 1.5 TB');
	const m = s.match(/^(\+?(?:\d[\d,_' ]*(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*([A-Za-z]*)$/);
	if (!m) throw new Error(`Could not read "${s}". Try 1.5 TB, 500 GiB, 4 Tbit or 1048576`);
	const n = readNumber(m[1].trim());
	const unit = m[2];

	if (!unit) return { bytes: n, readAs: 'bytes' };

	const word = unit
		.toLowerCase()
		.match(/^(kilo|mega|giga|tera|peta|exa|kibi|mebi|gibi|tebi|pebi|exbi)?(bytes?|bits?)$/);
	if (word) {
		const [pow, bin] = word[1] ? words[word[1]] : [0, false];
		const bits = word[2].startsWith('bit');
		const mult = (bin ? 1024 : 1000) ** pow;
		return {
			bytes: (n * mult) / (bits ? 8 : 1),
			readAs: describe(pow, bin, bits)
		};
	}

	const sym = unit.match(/^([kKmMgGtTpPeE])(i?)(B|b|bit|bits|byte|bytes|o)?$/);
	if (!sym) {
		if (unit === 'B' || unit === 'o') return { bytes: n, readAs: 'bytes' };
		if (unit === 'b') return { bytes: n / 8, readAs: 'bits' };
		throw new Error(`Unknown unit "${unit}". Use B, kB, MB, GB, TB, KiB, MiB, GiB, TiB, bit, Mbit`);
	}
	const [, p, i, suffix] = sym;
	const pow = letters.indexOf(p === 'K' || p === 'k' ? 'k' : p.toUpperCase());
	const bareLetter = suffix === undefined;
	const bin = i === 'i' || bareLetter;
	const bits = suffix !== undefined && (suffix === 'b' || suffix.startsWith('bit'));
	const mult = (bin ? 1024 : 1000) ** pow;
	const out: ParsedSize = {
		bytes: (n * mult) / (bits ? 8 : 1),
		readAs: describe(pow, bin, bits)
	};
	const P = letters[pow];
	if (bareLetter)
		out.warning = `No B or b given, so ${p} is read as ${P}i (1024-based), as df -h prints it.`;
	else if (suffix === 'b')
		out.warning = `Lowercase b means bits. Write ${P}${i}B for ${bin ? binNames[pow] : decNames[pow]}.`;
	else if (/[mgtpe]/.test(p))
		out.warning = `Lowercase ${p} is not an SI prefix for this (m is milli). Read as ${P}.`;
	else if (p === 'K' && !i)
		out.warning = `KB is read as 1000 bytes. Windows and JEDEC memory use KB for 1024 bytes: write KiB for that.`;
	return out;
}

function describe(pow: number, bin: boolean, bits: boolean): string {
	const base = bin ? `2^${pow * 10}` : `10^${pow * 3}`;
	if (bits) {
		if (pow === 0) return 'bits';
		return `${(bin ? binNames : decNames)[pow].replace('bytes', 'bits')} (${base} bit)`;
	}
	return pow === 0 ? 'bytes' : `${bin ? binNames[pow] : decNames[pow]} (${base} B)`;
}

export interface UnitValue {
	unit: string;
	value: number;
}

export function decimalUnits(bytes: number): UnitValue[] {
	return ['B', 'kB', 'MB', 'GB', 'TB', 'PB'].map((unit, i) => ({ unit, value: bytes / 1000 ** i }));
}

export function binaryUnits(bytes: number): UnitValue[] {
	return ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'].map((unit, i) => ({
		unit,
		value: bytes / 1024 ** i
	}));
}

export function bitUnits(bytes: number): UnitValue[] {
	const bits = bytes * 8;
	return ['bit', 'kbit', 'Mbit', 'Gbit', 'Tbit', 'Pbit'].map((unit, i) => ({
		unit,
		value: bits / 1000 ** i
	}));
}

/** Index of the largest unit where the value is at least 1. */
export function bestIndex(list: UnitValue[]): number {
	let best = 0;
	list.forEach((u, i) => {
		if (Math.abs(u.value) >= 1) best = i;
	});
	return best;
}

/** Plain number with up to 6 decimals, or 6 significant digits below 1. */
export function fmt(x: number, maxFrac = 6): string {
	if (x === 0) return '0';
	if (Number.isInteger(x) && Math.abs(x) < 1e21) return new Intl.NumberFormat('en-GB').format(x);
	const opts: Intl.NumberFormatOptions =
		Math.abs(x) >= 1 ? { maximumFractionDigits: maxFrac } : { maximumSignificantDigits: 6 };
	return new Intl.NumberFormat('en-GB', opts).format(x);
}

/**
 * What Windows Explorer shows: 1024-based units labelled KB, MB, GB, TB, the unit chosen so
 * the number stays below 1000, and three significant digits, truncated rather than rounded.
 */
export function windowsLabel(bytes: number): string {
	if (bytes < 1024) return `${Math.trunc(bytes)} bytes`;
	const units = ['KB', 'MB', 'GB', 'TB', 'PB', 'EB'];
	let i = 0;
	let v = bytes / 1024;
	while (v >= 1000 && i < units.length - 1) {
		v /= 1024;
		i++;
	}
	const digits = v >= 100 ? 0 : v >= 10 ? 1 : 2;
	const f = 10 ** digits;
	return `${(Math.trunc(v * f) / f).toFixed(digits)} ${units[i]}`;
}

/** How much smaller the 1024-based number is than the 1000-based one at prefix level `pow`. */
export function gapPercent(pow: number): number {
	return (1 - (1000 / 1024) ** pow) * 100;
}

export type SpeedUnit = 'kbit/s' | 'Mbit/s' | 'Gbit/s' | 'MB/s';
export const speedUnits: SpeedUnit[] = ['kbit/s', 'Mbit/s', 'Gbit/s', 'MB/s'];
const bitsPerSecond: Record<SpeedUnit, number> = {
	'kbit/s': 1e3,
	'Mbit/s': 1e6,
	'Gbit/s': 1e9,
	'MB/s': 8e6
};

/** Seconds to move `bytes` over a link of `speed` units at `efficiency` percent of line rate. */
export function transferSeconds(
	bytes: number,
	speed: number,
	unit: SpeedUnit,
	efficiency = 100
): number {
	if (!(speed > 0)) throw new Error('Link speed must be above 0');
	if (!(efficiency > 0 && efficiency <= 100))
		throw new Error('Efficiency must be above 0 and at most 100 %');
	return (bytes * 8) / (speed * bitsPerSecond[unit] * (efficiency / 100));
}

export function formatDuration(sec: number): string {
	if (!Number.isFinite(sec)) return 'n/a';
	if (sec < 1) return `${fmt(sec * 1000, 1)} ms`;
	if (sec < 60) return `${sec.toFixed(sec < 10 ? 2 : 1)} s`;
	let s = Math.round(sec);
	const parts: string[] = [];
	const d = Math.floor(s / 86400);
	s -= d * 86400;
	const h = Math.floor(s / 3600);
	s -= h * 3600;
	const m = Math.floor(s / 60);
	s -= m * 60;
	if (d) parts.push(`${d} d`);
	if (h || d) parts.push(`${h} h`);
	parts.push(`${m} min`);
	if (!d) parts.push(`${s} s`);
	return parts.join(' ');
}
