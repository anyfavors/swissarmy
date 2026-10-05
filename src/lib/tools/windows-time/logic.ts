/**
 * Conversions between non-Unix epochs. Every instant is held as a BigInt count of nanoseconds
 * since 1970-01-01T00:00:00Z so that 100 ns FILETIME ticks and years far from 1970 stay exact.
 */

export type Kind =
	| 'iso'
	| 'unix'
	| 'filetime'
	| 'dotnet'
	| 'webkit'
	| 'excel1900'
	| 'excel1904'
	| 'cocoa'
	| 'gps'
	| 'ntp'
	| 'twitter'
	| 'discord'
	| 'uuid'
	| 'ulid';

export const kindLabel: Record<Kind, string> = {
	iso: 'ISO 8601 date',
	unix: 'Unix seconds',
	filetime: 'Windows FILETIME',
	dotnet: '.NET ticks',
	webkit: 'Chrome / WebKit',
	excel1900: 'Excel 1900',
	excel1904: 'Excel 1904',
	cocoa: 'Apple Cocoa',
	gps: 'GPS seconds',
	ntp: 'NTP',
	twitter: 'X / Twitter id',
	discord: 'Discord id',
	uuid: 'UUID v1/v6/v7',
	ulid: 'ULID'
};

const NS = 1_000_000_000n;
const DAY_NS = 86_400n * NS;

/** Epochs as Unix seconds. */
const E1601 = -11_644_473_600n; // FILETIME, WebKit
const E0001 = -62_135_596_800n; // .NET DateTime ticks
const E1582 = -12_219_292_800n; // UUID v1/v6, Gregorian reform 1582-10-15
const E1900 = -2_208_988_800n; // NTP
const EXCEL1900 = -2_209_161_600n; // 1899-12-30, the effective day 0 of the Excel 1900 system
const EXCEL1904 = -2_082_844_800n; // 1904-01-01
const E2001 = 978_307_200n; // Cocoa / Core Data
const EGPS = 315_964_800n; // 1980-01-06
export const TWITTER_EPOCH_MS = 1_288_834_974_657n;
export const DISCORD_EPOCH_MS = 1_420_070_400_000n;

/** 0x7FFFFFFFFFFFFFFF, the largest FILETIME, used by AD for "never". */
export const FILETIME_NEVER = 0x7fffffffffffffffn;

/**
 * Leap seconds inserted since the GPS epoch, as the Unix second at which each new offset starts.
 * Source: IERS Bulletin C and the IERS/IETF leap-seconds.list. GPS time does not apply leap
 * seconds, so GPS − UTC = number of entries in effect (18 since 2017-01-01, unchanged as of
 * Bulletin C 71, 2026). No leap second has been announced after 2016-12-31.
 */
const LEAP_DATES = [
	'1981-07-01',
	'1982-07-01',
	'1983-07-01',
	'1985-07-01',
	'1988-01-01',
	'1990-01-01',
	'1991-01-01',
	'1992-07-01',
	'1993-07-01',
	'1994-07-01',
	'1996-01-01',
	'1997-07-01',
	'1999-01-01',
	'2006-01-01',
	'2009-01-01',
	'2012-07-01',
	'2015-07-01',
	'2017-01-01'
].map((d) => {
	const [y, m, dd] = d.split('-').map(Number);
	return BigInt(daysFromCivil(y, m, dd)) * 86_400n;
});

/** GPS − UTC in seconds at a given Unix second. */
export function gpsLeapOffset(unixSec: bigint): number {
	let n = 0;
	for (const t of LEAP_DATES) if (unixSec >= t) n++;
	return n;
}

function fdiv(a: number, b: number): number {
	return Math.floor(a / b);
}

// ---------- calendar helpers (proleptic Gregorian, H. Hinnant's algorithms) ----------

export function daysFromCivil(y: number, m: number, d: number): number {
	y -= m <= 2 ? 1 : 0;
	const era = fdiv(y, 400);
	const yoe = y - era * 400;
	const doy = fdiv(153 * (m + (m > 2 ? -3 : 9)) + 2, 5) + d - 1;
	const doe = yoe * 365 + fdiv(yoe, 4) - fdiv(yoe, 100) + doy;
	return era * 146097 + doe - 719468;
}

export function civilFromDays(z: number): [number, number, number] {
	z += 719468;
	const era = fdiv(z, 146097);
	const doe = z - era * 146097;
	const yoe = fdiv(doe - fdiv(doe, 1460) + fdiv(doe, 36524) - fdiv(doe, 146096), 365);
	const doy = doe - (365 * yoe + fdiv(yoe, 4) - fdiv(yoe, 100));
	const mp = fdiv(5 * doy + 2, 153);
	const d = doy - fdiv(153 * mp + 2, 5) + 1;
	const m = mp < 10 ? mp + 3 : mp - 9;
	return [yoe + era * 400 + (m <= 2 ? 1 : 0), m, d];
}

function bdiv(a: bigint, b: bigint): bigint {
	const q = a / b;
	return a % b !== 0n && a < 0n !== b < 0n ? q - 1n : q;
}

const pad = (n: number | bigint, w = 2) => String(n).padStart(w, '0');

/** ISO 8601 in UTC with as many fraction digits as needed (up to 9). */
export function formatIso(ns: bigint): string {
	const days = bdiv(ns, DAY_NS);
	const rem = ns - days * DAY_NS;
	const [y, m, d] = civilFromDays(Number(days));
	const secs = rem / NS;
	const frac = rem % NS;
	const hh = secs / 3600n;
	const mm = (secs % 3600n) / 60n;
	const ss = secs % 60n;
	const year = y >= 0 && y <= 9999 ? pad(y, 4) : (y < 0 ? '-' : '+') + pad(Math.abs(y), 6);
	let out = `${year}-${pad(m)}-${pad(d)}T${pad(hh)}:${pad(mm)}:${pad(ss)}`;
	if (frac) out += '.' + pad(frac, 9).replace(/0+$/, '');
	return out + 'Z';
}

const ISO_RE =
	/^([+-]\d{6}|\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

/** Parses an ISO 8601 date, keeping up to 9 fraction digits. No offset means UTC. */
export function parseIso(s: string): bigint {
	const m = ISO_RE.exec(s.trim());
	if (!m)
		throw new Error(`Could not read "${s.trim()}" as an ISO 8601 date, e.g. 2026-10-05T12:00:00Z`);
	const [, ys, mos, ds, hs = '0', mis = '0', ss = '0', fs = '', zs] = m;
	const y = Number(ys);
	const mo = Number(mos);
	const d = Number(ds);
	const h = Number(hs);
	const mi = Number(mis);
	const sec = Number(ss);
	const dim = [
		31,
		y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28,
		31,
		30,
		31,
		30,
		31,
		31,
		30,
		31,
		30,
		31
	];
	if (mo < 1 || mo > 12) throw new Error(`Month ${mos} is out of range`);
	if (d < 1 || d > dim[mo - 1]) throw new Error(`Day ${ds} does not exist in that month`);
	if (h > 24 || mi > 59 || sec > 59) throw new Error('Time is out of range');
	let off = 0n;
	if (zs && zs.toUpperCase() !== 'Z') {
		const sign = zs[0] === '-' ? -1n : 1n;
		const digits = zs.slice(1).replace(':', '');
		off = sign * (BigInt(digits.slice(0, 2)) * 3600n + BigInt(digits.slice(2) || '0') * 60n);
	}
	const secs = BigInt(daysFromCivil(y, mo, d)) * 86_400n + BigInt(h * 3600 + mi * 60 + sec) - off;
	return secs * NS + BigInt(fs.padEnd(9, '0'));
}

// ---------- decimal helpers ----------

/** Parses a decimal string exactly into units of `unit` nanoseconds. */
export function parseDecimal(s: string, unit: bigint): bigint {
	const t = s.trim().replace(',', '.');
	const m = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(t);
	if (!m || (!m[2] && !m[3])) throw new Error(`"${s.trim()}" is not a number`);
	const sign = m[1] === '-' ? -1n : 1n;
	const int = BigInt(m[2] || '0');
	const fd = m[3] ?? '';
	const scale = 10n ** BigInt(fd.length);
	const frac = fd ? BigInt(fd) : 0n;
	// round half up on the sub-nanosecond remainder
	const fracNs = (frac * unit * 2n + scale) / (2n * scale);
	return sign * (int * unit + fracNs);
}

/** n / d as a decimal string, rounded to `places`, trailing zeros trimmed. */
export function divDecimal(n: bigint, d: bigint, places: number): string {
	const neg = n < 0n !== d < 0n && n !== 0n;
	const an = n < 0n ? -n : n;
	const ad = d < 0n ? -d : d;
	const scale = 10n ** BigInt(places);
	const q = (an * scale * 2n + ad) / (2n * ad);
	const int = q / scale;
	const frac = (q % scale).toString().padStart(places, '0').replace(/0+$/, '');
	const out = frac ? `${int}.${frac}` : `${int}`;
	return neg && out !== '0' ? '-' + out : out;
}

// ---------- per-format conversions ----------

const toNs = (epochSec: bigint, units: bigint, unitNs: bigint) => epochSec * NS + units * unitNs;

export function filetimeToNs(ft: bigint): bigint {
	return toNs(E1601, ft, 100n);
}
export function nsToFiletime(ns: bigint): bigint {
	return bdiv(ns - E1601 * NS, 100n);
}

function parseInteger(s: string, what: string): bigint {
	const t = s.trim().replace(/[_\s]/g, '');
	if (/^0x[0-9a-f]+$/i.test(t)) return BigInt(t);
	if (!/^-?\d+$/.test(t)) throw new Error(`${what} must be a whole number`);
	return BigInt(t);
}

const ULID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const ULID_RE = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/i;
const UUID_RE =
	/^(?:urn:uuid:)?\{?([0-9a-f]{8})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{12})\}?$/i;

export interface UuidTime {
	version: number;
	ns: bigint;
	/** v1/v6 only */
	clockSeq?: number;
	node?: string;
}

/** Timestamp inside a UUID v1, v6 or v7. Throws for other versions. */
export function uuidTime(s: string): UuidTime {
	const m = UUID_RE.exec(s.trim());
	if (!m) throw new Error('Not a UUID');
	const hex = m.slice(1).join('').toLowerCase();
	const version = parseInt(hex[12], 16);
	if (version === 1 || version === 6) {
		let ts: bigint;
		if (version === 1) {
			const low = BigInt('0x' + hex.slice(0, 8));
			const mid = BigInt('0x' + hex.slice(8, 12));
			const hi = BigInt('0x' + hex.slice(13, 16));
			ts = (hi << 48n) | (mid << 32n) | low;
		} else {
			const hi = BigInt('0x' + hex.slice(0, 8));
			const mid = BigInt('0x' + hex.slice(8, 12));
			const low = BigInt('0x' + hex.slice(13, 16));
			ts = (hi << 28n) | (mid << 12n) | low;
		}
		return {
			version,
			ns: toNs(E1582, ts, 100n),
			clockSeq: parseInt(hex.slice(16, 20), 16) & 0x3fff,
			node: hex.slice(20).match(/../g)!.join(':')
		};
	}
	if (version === 7) {
		return { version, ns: BigInt('0x' + hex.slice(0, 12)) * 1_000_000n };
	}
	throw new Error(`UUID version ${version} carries no timestamp. Only v1, v6 and v7 do.`);
}

export function ulidToMs(s: string): bigint {
	const t = s.trim().toUpperCase();
	if (!ULID_RE.test(t))
		throw new Error('Not a ULID: 26 Crockford Base32 characters, first one 0 to 7');
	let v = 0n;
	for (const c of t.slice(0, 10)) v = v * 32n + BigInt(ULID_ALPHABET.indexOf(c));
	return v;
}

export function msToUlidPrefix(ms: bigint): string {
	if (ms < 0n || ms >= 1n << 48n) throw new Error('Outside the 48-bit ULID range');
	let out = '';
	for (let i = 0; i < 10; i++) {
		out = ULID_ALPHABET[Number(ms % 32n)] + out;
		ms /= 32n;
	}
	return out;
}

export interface SnowflakeParts {
	ms: bigint;
	/** bits 17 to 21 and 12 to 16 */
	a: number;
	b: number;
	seq: number;
}

export function snowflake(id: bigint, epochMs: bigint): SnowflakeParts {
	if (id < 0n || id >= 1n << 64n) throw new Error('A snowflake is a 64-bit unsigned number');
	return {
		ms: (id >> 22n) + epochMs,
		a: Number((id >> 17n) & 0x1fn),
		b: Number((id >> 12n) & 0x1fn),
		seq: Number(id & 0xfffn)
	};
}

function gpsToNs(gpsNs: bigint): bigint {
	let u = gpsNs + EGPS * NS;
	for (let i = 0; i < 2; i++) u = gpsNs + EGPS * NS - BigInt(gpsLeapOffset(bdiv(u, NS))) * NS;
	return u;
}

function nsToGps(ns: bigint): bigint {
	return ns - EGPS * NS + BigInt(gpsLeapOffset(bdiv(ns, NS))) * NS;
}

const TWO32 = 1n << 32n;

function ntpToNs(s: string): bigint {
	const t = s.trim();
	const hex = /^(?:0x)?([0-9a-f]{8})[.:]?([0-9a-f]{8})$/i.exec(t);
	if (hex && /[a-f.:x]/i.test(t)) {
		const sec = BigInt('0x' + hex[1]);
		const frac = BigInt('0x' + hex[2]);
		return E1900 * NS + sec * NS + (frac * NS + TWO32 / 2n) / TWO32;
	}
	return E1900 * NS + parseDecimal(t, NS);
}

/** 1900 system, including the fake 1900-02-29 (serial 60) Excel inherited from Lotus 1-2-3. */
function excel1900ToNs(s: string): bigint {
	const v = parseDecimal(s, DAY_NS);
	if (v < 0n) throw new Error('Excel serial dates cannot be negative');
	if (v >= 60n * DAY_NS && v < 61n * DAY_NS)
		throw new Error(
			'Serial 60 is 1900-02-29, a day that never existed. Excel keeps it for Lotus 1-2-3 compatibility.'
		);
	return EXCEL1900 * NS + v + (v < 60n * DAY_NS ? DAY_NS : 0n);
}

function nsToExcel1900(ns: bigint): string | null {
	let v = ns - EXCEL1900 * NS;
	if (v < 61n * DAY_NS) v -= DAY_NS;
	if (v < 0n) return null;
	return divDecimal(v, DAY_NS, 10);
}

export interface Parsed {
	kind: Kind;
	/** Absent when the value is a special marker rather than a date. */
	ns?: bigint;
	special?: string;
	details: { label: string; value: string }[];
	notes: string[];
}

const ISO_LIKE = /^[+-]?\d{4,6}-\d{2}-\d{2}/;

/** Best guess of the format of a bare value, or null when it is ambiguous. */
export function guessKind(raw: string): Kind | null {
	const t = raw.trim();
	if (ULID_RE.test(t)) return 'ulid';
	if (UUID_RE.test(t) && /-/.test(t)) return 'uuid';
	if (ISO_LIKE.test(t)) return 'iso';
	if (/^[0-9a-f]{8}\.[0-9a-f]{8}$/i.test(t)) return 'ntp';
	if (/^0x[0-9a-f]{1,16}$/i.test(t) || (/^[0-9a-f]{16}$/i.test(t) && /[a-f]/i.test(t)))
		return 'filetime';
	if (t === '0' || t === '9223372036854775807') return 'filetime';
	if (/^1\d{17}$/.test(t)) return 'filetime';
	if (/^[5-7]\d{17}$/.test(t)) return 'dotnet';
	if (/^1\d{16}$/.test(t)) return 'webkit';
	if (/^[1-9]\d{4}([.,]\d+)?$/.test(t) || /^\d{1,5}[.,]\d+$/.test(t)) return 'excel1900';
	return null;
}

export function parse(raw: string, kind: Kind | 'auto' = 'auto'): Parsed {
	const t = raw.trim();
	if (!t) throw new Error('Enter a value');
	const k = kind === 'auto' ? guessKind(t) : kind;
	if (!k)
		throw new Error(
			'Ambiguous number. Pick the format: a 19-digit value could be a snowflake id or Unix nanoseconds.'
		);
	const out: Parsed = { kind: k, details: [], notes: [] };
	switch (k) {
		case 'iso':
			out.ns = parseIso(t);
			if (!/(Z|[+-]\d{2}(:?\d{2})?)$/i.test(t) || /^\d{4}-\d{2}-\d{2}$/.test(t))
				out.notes.push('No offset given, read as UTC.');
			break;
		case 'unix':
			out.ns = parseDecimal(t, NS);
			break;
		case 'filetime': {
			let v: bigint;
			if (/^[0-9a-f]{16}$/i.test(t) && /[a-f]/i.test(t)) v = BigInt('0x' + t);
			else v = parseInteger(t, 'FILETIME');
			if (v < 0n) throw new Error('FILETIME cannot be negative');
			if (v > FILETIME_NEVER)
				throw new Error('Larger than 0x7FFFFFFFFFFFFFFF, the maximum FILETIME');
			out.details.push({
				label: 'Hex',
				value: '0x' + v.toString(16).toUpperCase().padStart(16, '0')
			});
			if (v === 0n) {
				out.special =
					'0: not set. accountExpires 0 means never expires, pwdLastSet 0 means must change password at next logon, lastLogon 0 means never logged on.';
				break;
			}
			if (v === FILETIME_NEVER) {
				out.special =
					'0x7FFFFFFFFFFFFFFF: never. This is what accountExpires holds for an account that never expires.';
				break;
			}
			out.ns = filetimeToNs(v);
			break;
		}
		case 'dotnet': {
			const v = parseInteger(t, '.NET ticks');
			if (v < 0n) throw new Error('.NET ticks cannot be negative');
			if (v > 3_155_378_975_999_999_999n) throw new Error('Beyond DateTime.MaxValue (9999-12-31)');
			out.ns = toNs(E0001, v, 100n);
			break;
		}
		case 'webkit':
			out.ns = toNs(E1601, parseInteger(t, 'WebKit time'), 1000n);
			break;
		case 'excel1900':
			out.ns = excel1900ToNs(t);
			if (parseDecimal(t, DAY_NS) < DAY_NS) out.notes.push('Excel shows serial 0 as 1900-01-00.');
			break;
		case 'excel1904': {
			const v = parseDecimal(t, DAY_NS);
			if (v < 0n) throw new Error('Excel serial dates cannot be negative');
			out.ns = EXCEL1904 * NS + v;
			break;
		}
		case 'cocoa':
			out.ns = E2001 * NS + parseDecimal(t, NS);
			break;
		case 'gps': {
			const g = parseDecimal(t, NS);
			out.ns = gpsToNs(g);
			const off = gpsLeapOffset(bdiv(out.ns, NS));
			out.details.push({ label: 'GPS − UTC', value: `${off} s` });
			break;
		}
		case 'ntp':
			out.ns = ntpToNs(t);
			out.notes.push('Read as NTP era 0 (1900 to 2036-02-07).');
			break;
		case 'twitter':
		case 'discord': {
			const id = parseInteger(t, 'Snowflake id');
			const p = snowflake(id, k === 'twitter' ? TWITTER_EPOCH_MS : DISCORD_EPOCH_MS);
			out.ns = p.ms * 1_000_000n;
			if (k === 'twitter') {
				out.details.push({ label: 'Datacenter', value: String(p.a) });
				out.details.push({ label: 'Worker', value: String(p.b) });
			} else {
				out.details.push({ label: 'Worker', value: String(p.a) });
				out.details.push({ label: 'Process', value: String(p.b) });
			}
			out.details.push({ label: 'Sequence', value: String(p.seq) });
			break;
		}
		case 'uuid': {
			const u = uuidTime(t);
			out.ns = u.ns;
			out.details.push({ label: 'Version', value: String(u.version) });
			if (u.node) {
				out.details.push({ label: 'Clock sequence', value: String(u.clockSeq) });
				out.details.push({ label: 'Node', value: u.node });
				out.notes.push(
					'v1 and v6 store the time in 100 ns steps since 1582-10-15. The node is often the MAC address of the machine that made it.'
				);
			}
			break;
		}
		case 'ulid':
			out.ns = ulidToMs(t) * 1_000_000n;
			break;
	}
	return out;
}

export interface Row {
	kind: Kind;
	label: string;
	value: string;
	extra?: string;
}

/** The instant in every supported format. Values out of a format's range are left as "". */
export function formats(ns: bigint): Row[] {
	const rows: Row[] = [];
	const add = (kind: Kind, value: string, extra?: string, label = kindLabel[kind]) =>
		rows.push({ kind, label, value, extra });
	const ms = bdiv(ns, 1_000_000n);
	add('iso', formatIso(ns));
	add('unix', divDecimal(ns, NS, 9));
	const ft = nsToFiletime(ns);
	add(
		'filetime',
		ft >= 0n && ft <= FILETIME_NEVER ? ft.toString() : '',
		ft >= 0n && ft <= FILETIME_NEVER ? '0x' + ft.toString(16).toUpperCase().padStart(16, '0') : ''
	);
	const dn = bdiv(ns - E0001 * NS, 100n);
	add('dotnet', dn >= 0n && dn <= 3_155_378_975_999_999_999n ? dn.toString() : '');
	const wk = bdiv(ns - E1601 * NS, 1000n);
	add('webkit', wk >= 0n ? wk.toString() : '', 'µs since 1601');
	add('excel1900', nsToExcel1900(ns) ?? '', 'days, Windows default');
	const e4 = ns - EXCEL1904 * NS;
	add('excel1904', e4 >= 0n ? divDecimal(e4, DAY_NS, 10) : '', 'days, old Mac default');
	add('cocoa', divDecimal(ns - E2001 * NS, NS, 9), 's since 2001');
	const g = nsToGps(ns);
	if (g >= 0n) {
		const gs = bdiv(g, NS);
		add(
			'gps',
			divDecimal(g, NS, 9),
			`week ${gs / 604_800n}, ${divDecimal(g - (gs / 604_800n) * 604_800n * NS, NS, 3)} s into week, GPS − UTC ${gpsLeapOffset(bdiv(ns, NS))} s`
		);
	} else add('gps', '');
	const n = ns - E1900 * NS;
	if (n >= 0n) {
		const sec = n / NS;
		const era = sec / TWO32;
		const frac = ((n % NS) * TWO32 + NS / 2n) / NS;
		const hex =
			(sec % TWO32).toString(16).padStart(8, '0') +
			'.' +
			(frac >= TWO32 ? TWO32 - 1n : frac).toString(16).padStart(8, '0');
		add('ntp', divDecimal(n, NS, 9), `${hex.toUpperCase()}, era ${era}`);
	} else add('ntp', '');
	for (const [k, ep] of [
		['twitter', TWITTER_EPOCH_MS],
		['discord', DISCORD_EPOCH_MS]
	] as const) {
		const d = ms - ep;
		add(k, d >= 0n && d < 1n << 42n ? (d << 22n).toString() : '', 'lowest id at that ms');
	}
	if (ms >= 0n && ms < 1n << 48n) {
		const h = ms.toString(16).padStart(12, '0');
		add(
			'uuid',
			`${h.slice(0, 8)}-${h.slice(8)}-7000-8000-000000000000`,
			'lowest v7 at that ms',
			'UUIDv7'
		);
		add('ulid', msToUlidPrefix(ms) + '0'.repeat(16), 'lowest at that ms');
	} else {
		add('uuid', '', undefined, 'UUIDv7');
		add('ulid', '');
	}
	return rows;
}

/** Converts a value of one format into another, as text. Used by the chain ops. */
export function convert(raw: string, from: Kind | 'auto', to: Kind): string {
	const p = parse(raw, from);
	if (p.ns === undefined) throw new Error(p.special ?? 'Not a date');
	const row = formats(p.ns).find((r) => r.kind === to);
	if (!row || !row.value) throw new Error(`Out of range for ${kindLabel[to]}`);
	return row.value;
}

export function looksLikeWindowsTime(s: string): number {
	const t = s.trim();
	if (/^\d{18}$/.test(t)) return 0.7;
	if (ULID_RE.test(t) && /[A-Z]/i.test(t)) return 0.8;
	return 0;
}
