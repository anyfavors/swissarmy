/**
 * Propagation delay, bandwidth-delay product, TCP window and loss-limited throughput.
 */

/** Speed of light in vacuum, km/s (exact, SI definition of the metre). */
export const C_KM_S = 299_792.458;

/**
 * Light in silica fibre travels at about c / 1.47 (group index of standard single-mode fibre
 * near 1550 nm), roughly 2/3 c or about 204,000 km/s. This tool uses 2/3 c as stated.
 */
export const FIBRE_FACTOR = 2 / 3;

/** Mean Earth radius, km (IUGG mean radius R1). */
export const EARTH_RADIUS_KM = 6371.0088;

export interface City {
	id: string;
	name: string;
	lat: number;
	lon: number;
}

/** City centre coordinates, decimal degrees, rounded to 0.01 degrees. */
export const cities: City[] = [
	{ id: 'cph', name: 'Copenhagen', lat: 55.68, lon: 12.57 },
	{ id: 'lon', name: 'London', lat: 51.51, lon: -0.13 },
	{ id: 'ams', name: 'Amsterdam', lat: 52.37, lon: 4.9 },
	{ id: 'fra', name: 'Frankfurt', lat: 50.11, lon: 8.68 },
	{ id: 'sto', name: 'Stockholm', lat: 59.33, lon: 18.07 },
	{ id: 'osl', name: 'Oslo', lat: 59.91, lon: 10.75 },
	{ id: 'hel', name: 'Helsinki', lat: 60.17, lon: 24.94 },
	{ id: 'par', name: 'Paris', lat: 48.86, lon: 2.35 },
	{ id: 'mad', name: 'Madrid', lat: 40.42, lon: -3.7 },
	{ id: 'nyc', name: 'New York', lat: 40.71, lon: -74.01 },
	{ id: 'iad', name: 'Ashburn, Virginia', lat: 39.04, lon: -77.49 },
	{ id: 'sfo', name: 'San Francisco', lat: 37.77, lon: -122.42 },
	{ id: 'sao', name: 'São Paulo', lat: -23.55, lon: -46.63 },
	{ id: 'jnb', name: 'Johannesburg', lat: -26.2, lon: 28.05 },
	{ id: 'dxb', name: 'Dubai', lat: 25.2, lon: 55.27 },
	{ id: 'bom', name: 'Mumbai', lat: 19.08, lon: 72.88 },
	{ id: 'sin', name: 'Singapore', lat: 1.35, lon: 103.82 },
	{ id: 'hkg', name: 'Hong Kong', lat: 22.32, lon: 114.17 },
	{ id: 'tyo', name: 'Tokyo', lat: 35.68, lon: 139.69 },
	{ id: 'syd', name: 'Sydney', lat: -33.87, lon: 151.21 }
];

export const pairs: [string, string][] = [
	['cph', 'lon'],
	['cph', 'fra'],
	['cph', 'sto'],
	['lon', 'nyc'],
	['fra', 'sin'],
	['nyc', 'sfo'],
	['lon', 'tyo'],
	['sfo', 'syd']
];

export const cityById = (id: string): City | undefined => cities.find((c) => c.id === id);

/** Great-circle distance by the haversine formula on a sphere of the mean Earth radius. */
export function greatCircleKm(
	a: { lat: number; lon: number },
	b: { lat: number; lon: number }
): number {
	const rad = Math.PI / 180;
	const dLat = (b.lat - a.lat) * rad;
	const dLon = (b.lon - a.lon) * rad;
	const h =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
	return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** One-way propagation delay in ms for a distance at a fraction of c. */
export function oneWayMs(km: number, factor = FIBRE_FACTOR): number {
	if (!(km >= 0)) throw new Error('Distance must be zero or more');
	if (!(factor > 0 && factor <= 1)) throw new Error('Speed factor must be above 0 and at most 1');
	return (km / (C_KM_S * factor)) * 1000;
}

export const minRttMs = (km: number, factor = FIBRE_FACTOR) => 2 * oneWayMs(km, factor);

/* --------------------------------------------------------------- units */

const rateUnits: Record<string, number> = {
	'bit/s': 1,
	bps: 1,
	'kbit/s': 1e3,
	kbps: 1e3,
	'mbit/s': 1e6,
	mbps: 1e6,
	'gbit/s': 1e9,
	gbps: 1e9,
	'tbit/s': 1e12,
	tbps: 1e12
};

/** "100 Mbit/s", "1 Gbps", "2.5G", "800k". Bits per second, decimal prefixes. */
export function parseRate(s: string): number {
	const m = s
		.trim()
		.toLowerCase()
		.match(/^(\d+(?:\.\d+)?)\s*([kmgt]?)(bit\/s|bps|bit)?$/);
	if (!m) throw new Error(`Could not read the rate "${s}". Try 100 Mbit/s or 1 Gbps`);
	const unit = `${m[2]}bit/s`;
	const v = Number(m[1]) * (rateUnits[unit] ?? 1);
	if (!(v > 0)) throw new Error('Rate must be above zero');
	return v;
}

/** "64 KiB", "4 MB", "65535", "1.5 MiB". Bytes. */
export function parseBytes(s: string): number {
	const m = s.trim().match(/^(\d+(?:\.\d+)?)\s*(([kKMGT])(i?)B?|B)?$/);
	if (!m) throw new Error(`Could not read the size "${s}". Try 64 KiB or 4 MB`);
	const n = Number(m[1]);
	if (!m[3]) return n;
	const pow = 'KMGT'.indexOf(m[3].toUpperCase()) + 1;
	return n * (m[4] ? 1024 : 1000) ** pow;
}

/** "30 ms", "0.3 s", "300us", "30". Milliseconds. */
export function parseTime(s: string): number {
	const m = s
		.trim()
		.toLowerCase()
		.match(/^(\d+(?:\.\d+)?)\s*(ms|s|us|µs|μs)?$/);
	if (!m) throw new Error(`Could not read the time "${s}". Try 30 ms`);
	const n = Number(m[1]);
	const ms = m[2] === 's' ? n * 1000 : m[2] && m[2] !== 'ms' ? n / 1000 : n;
	if (!(ms > 0)) throw new Error('Round-trip time must be above zero');
	return ms;
}

/** "1%", "0.01", "1e-4". Loss probability 0..1. */
export function parseLoss(s: string): number {
	const t = s.trim();
	const pct = t.endsWith('%');
	const n = Number(pct ? t.slice(0, -1) : t);
	if (!Number.isFinite(n)) throw new Error(`Could not read the loss "${s}". Try 0.1%`);
	const p = pct ? n / 100 : n;
	if (!(p > 0 && p < 1)) throw new Error('Loss must be above 0 and below 100%');
	return p;
}

export function formatRate(bps: number): string {
	const units: [number, string][] = [
		[1e12, 'Tbit/s'],
		[1e9, 'Gbit/s'],
		[1e6, 'Mbit/s'],
		[1e3, 'kbit/s']
	];
	for (const [f, u] of units) if (bps >= f) return `${sig(bps / f)} ${u}`;
	return `${sig(bps)} bit/s`;
}

export function formatBytes(b: number): string {
	const units: [number, string][] = [
		[1024 ** 4, 'TiB'],
		[1024 ** 3, 'GiB'],
		[1024 ** 2, 'MiB'],
		[1024, 'KiB']
	];
	const exact = `${Math.round(b).toLocaleString('en-GB')} bytes`;
	for (const [f, u] of units) if (b >= f) return `${sig(b / f)} ${u} (${exact})`;
	return exact;
}

export function formatMs(ms: number): string {
	if (ms < 1) return `${sig(ms * 1000)} µs`;
	return `${sig(ms)} ms`;
}

/** Three significant digits, no exponent for everyday values. */
export function sig(n: number): string {
	if (n === 0) return '0';
	const digits = Math.max(0, 2 - Math.floor(Math.log10(Math.abs(n))));
	return Number(n.toFixed(Math.min(digits, 6))).toLocaleString('en-GB', {
		maximumFractionDigits: 6
	});
}

/* ------------------------------------------------------------- formulas */

/** Bandwidth-delay product in bytes: rate (bit/s) × RTT (ms). */
export function bdpBytes(bps: number, rttMs: number): number {
	return (bps * (rttMs / 1000)) / 8;
}

/** Maximum throughput of one TCP flow limited by its window: window / RTT, bit/s. */
export function windowLimitedBps(windowBytes: number, rttMs: number): number {
	return (windowBytes * 8) / (rttMs / 1000);
}

/**
 * Window scale shift needed for a window (RFC 7323 section 2): the 16-bit window field holds
 * at most 65,535, the shift is 0 to 14, so the largest window is 65,535 × 2^14 (about 1 GiB).
 */
export function windowScale(windowBytes: number): { shift: number; fits: boolean } {
	let shift = 0;
	while (shift < 14 && 65535 * 2 ** shift < windowBytes) shift++;
	return { shift, fits: 65535 * 2 ** shift >= windowBytes };
}

/** sqrt(3/2), the constant for periodic loss with delayed ACKs off (Mathis et al., 1997). */
export const MATHIS_C = Math.sqrt(3 / 2);

/**
 * Mathis, Semke, Mahdavi and Ott, "The Macroscopic Behavior of the TCP Congestion Avoidance
 * Algorithm", ACM SIGCOMM CCR 27(3), 1997: throughput <= (MSS / RTT) × (C / sqrt(p)). bit/s.
 */
export function mathisBps(mssBytes: number, rttMs: number, loss: number, c = MATHIS_C): number {
	if (!(mssBytes > 0)) throw new Error('MSS must be above zero');
	return ((mssBytes * 8) / (rttMs / 1000)) * (c / Math.sqrt(loss));
}
