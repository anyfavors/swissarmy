import { ibanLengths } from './iban';

/**
 * Check digit algorithms.
 *  Luhn: ISO/IEC 7812-1 annex B (payment cards), also used by IMEI (3GPP TS 23.003).
 *  IBAN: ISO 13616 with ISO 7064 MOD 97-10, lengths from the SWIFT IBAN Registry.
 *  EAN-13, EAN-8, UPC-A: GS1 General Specifications, check digit calculation (weights 3,1).
 *  ISBN-10: ISO 2108 (pre-2007), mod 11 with weights 10..2; ISBN-13 is an EAN-13 with 978/979.
 *  ISSN: ISO 3297, mod 11 with weights 8..2.
 *  CVR: Danish Business Authority (Erhvervsstyrelsen), modulus 11 with weights 2,7,6,5,4,3,2,1.
 *  CPR: CPR-kontoret, "Personnummeret i CPR" (cpr.dk), century from the 7th digit and modulus 11
 *  with weights 4,3,2,7,6,5,4,3,2,1. Since 2007 numbers without modulus 11 are issued.
 */

export type Kind =
	'iban' | 'luhn' | 'ean13' | 'isbn13' | 'ean8' | 'upca' | 'isbn10' | 'issn' | 'cvr' | 'cpr';

export const kindLabels: Record<Kind, string> = {
	iban: 'IBAN',
	luhn: 'Luhn (card, IMEI)',
	ean13: 'EAN-13 / GTIN-13',
	isbn13: 'ISBN-13',
	ean8: 'EAN-8',
	upca: 'UPC-A',
	isbn10: 'ISBN-10',
	issn: 'ISSN',
	cvr: 'CVR (Danish company)',
	cpr: 'CPR (Danish person)'
};

/** Kinds a check digit can be computed for. CPR is left out on purpose. */
export const computable: Kind[] = [
	'luhn',
	'iban',
	'ean13',
	'ean8',
	'upca',
	'isbn10',
	'isbn13',
	'issn',
	'cvr'
];

export type Status = 'valid' | 'invalid' | 'warn';

export interface Result {
	kind: Kind;
	status: Status;
	/** Compact form, no separators. */
	value: string;
	/** Display form, e.g. IBAN in groups of four. */
	formatted: string;
	/** The check character(s) the payload calls for, when different from the given ones. */
	expected?: string;
	details: [string, string][];
	problems: string[];
	sensitive?: boolean;
}

const digitsOnly = (s: string) => s.replace(/[\s-]/g, '');

// ---------- primitives ----------

/** Luhn: valid when the weighted sum is a multiple of 10. */
export function luhnValid(d: string): boolean {
	let sum = 0;
	for (let i = 0; i < d.length; i++) {
		let n = d.charCodeAt(d.length - 1 - i) - 48;
		if (i % 2 === 1) {
			n *= 2;
			if (n > 9) n -= 9;
		}
		sum += n;
	}
	return sum % 10 === 0;
}

export function luhnDigit(payload: string): string {
	for (let c = 0; c < 10; c++) if (luhnValid(payload + c)) return String(c);
	throw new Error('unreachable');
}

/** Remainder of a long decimal string modulo 97, in chunks so it never exceeds 2^53. */
export function mod97(digits: string): number {
	let r = 0;
	for (let i = 0; i < digits.length; i += 7) r = Number(String(r) + digits.slice(i, i + 7)) % 97;
	return r;
}

function ibanNumeric(s: string): string {
	return s.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
}

/** GS1 check digit for a payload (EAN-8, EAN-13, UPC-A, GTIN-14): weights 3,1 from the right. */
export function gs1Digit(payload: string): string {
	let sum = 0;
	for (let i = 0; i < payload.length; i++) {
		const n = payload.charCodeAt(payload.length - 1 - i) - 48;
		sum += i % 2 === 0 ? n * 3 : n;
	}
	return String((10 - (sum % 10)) % 10);
}

/** Mod 11 check character with weights from (len+1) down to 2. 10 is written X. */
function mod11Char(payload: string): string {
	let sum = 0;
	for (let i = 0; i < payload.length; i++)
		sum += (payload.length + 1 - i) * (payload.charCodeAt(i) - 48);
	const c = (11 - (sum % 11)) % 11;
	return c === 10 ? 'X' : String(c);
}

export const isbn10Char = (payload9: string) => mod11Char(payload9);
export const issnChar = (payload7: string) => mod11Char(payload7);

const cvrWeights = [2, 7, 6, 5, 4, 3, 2, 1];
const cprWeights = [4, 3, 2, 7, 6, 5, 4, 3, 2, 1];

function weighted(d: string, w: number[]): number {
	let s = 0;
	for (let i = 0; i < w.length; i++) s += w[i] * (d.charCodeAt(i) - 48);
	return s;
}

/** CVR check digit for a 7-digit payload, or null when no digit makes it valid. */
export function cvrDigit(payload7: string): string | null {
	const r = weighted(payload7 + '0', cvrWeights) % 11;
	const c = (11 - r) % 11;
	return c === 10 ? null : String(c);
}

// ---------- formatting ----------

export function groups(s: string, n = 4): string {
	return s.replace(new RegExp(`(.{${n}})(?=.)`, 'g'), '$1 ');
}

export function cardBrand(d: string): string | undefined {
	// Issuer prefixes (IIN ranges) as published by the card schemes; indicative only.
	if (/^4571/.test(d)) return 'Visa/Dankort';
	if (/^5019/.test(d)) return 'Dankort';
	if (/^4/.test(d)) return 'Visa';
	if (/^5[1-5]/.test(d)) return 'Mastercard';
	const p4 = Number(d.slice(0, 4));
	if (p4 >= 2221 && p4 <= 2720) return 'Mastercard';
	if (/^3[47]/.test(d)) return 'American Express';
	if (/^(6011|65|64[4-9])/.test(d)) return 'Discover';
	if (p4 >= 3528 && p4 <= 3589) return 'JCB';
	if (/^(36|30[0-5]|38|39)/.test(d)) return 'Diners Club';
	if (/^(5018|5020|5038|5893|6304|6759|676[1-3])/.test(d)) return 'Maestro';
	return undefined;
}

function formatCard(d: string): string {
	if (/^3[47]/.test(d) && d.length === 15)
		return `${d.slice(0, 4)} ${d.slice(4, 10)} ${d.slice(10)}`;
	return groups(d);
}

// ---------- validators ----------

function result(
	kind: Kind,
	ok: boolean,
	value: string,
	formatted: string,
	extra: Partial<Result> = {}
): Result {
	return {
		kind,
		status: ok ? 'valid' : 'invalid',
		value,
		formatted,
		details: [],
		problems: [],
		...extra
	};
}

export function checkLuhn(raw: string): Result {
	const d = digitsOnly(raw);
	if (!/^\d{2,}$/.test(d)) throw new Error('Luhn needs at least 2 digits');
	const ok = luhnValid(d);
	const r = result('luhn', ok, d, d.length >= 12 && d.length <= 19 ? formatCard(d) : d);
	if (!ok) r.expected = luhnDigit(d.slice(0, -1));
	r.details.push(['Length', `${d.length} digits`]);
	if (d.length === 15 && !cardBrand(d)?.startsWith('American'))
		r.details.push(['As IMEI', `TAC ${d.slice(0, 8)} · serial ${d.slice(8, 14)} · check ${d[14]}`]);
	const b = cardBrand(d);
	if (b && d.length >= 12) r.details.push(['Card prefix suggests', b]);
	if (!ok) r.problems.push(`Luhn sum is not a multiple of 10. Check digit should be ${r.expected}`);
	return r;
}

export function checkIban(raw: string): Result {
	const s = raw.replace(/[\s-]/g, '').toUpperCase();
	if (!/^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/.test(s))
		throw new Error('An IBAN is 2 letters, 2 check digits, then up to 30 letters and digits');
	const cc = s.slice(0, 2);
	const country = ibanLengths[cc];
	const ok97 = mod97(ibanNumeric(s.slice(4) + s.slice(0, 4))) === 1;
	const okLen = !country || country.length === s.length;
	const r = result('iban', ok97 && okLen, s, groups(s));
	r.details.push(['Country', country ? `${country.name} (${cc})` : `${cc}, not in the table here`]);
	r.details.push(['Length', `${s.length}${country ? ` of ${country.length}` : ''}`]);
	r.details.push(['Check digits', s.slice(2, 4)]);
	r.details.push(['BBAN', s.slice(4)]);
	if (!okLen)
		r.problems.push(
			`${country!.name} IBANs are ${country!.length} characters, this has ${s.length}`
		);
	if (!ok97) {
		r.expected = ibanCheckDigits(cc, s.slice(4));
		r.problems.push(`Mod 97 check fails. Check digits for this BBAN would be ${r.expected}`);
	}
	if (ok97 && okLen && !country) r.status = 'warn';
	if (!country) r.problems.push('Country length unknown here, so only the checksum was verified');
	return r;
}

export function ibanCheckDigits(cc: string, bban: string): string {
	const n = 98 - mod97(ibanNumeric(bban + cc + '00'));
	return String(n).padStart(2, '0');
}

function checkGs1(kind: 'ean13' | 'ean8' | 'upca', raw: string): Result {
	const d = digitsOnly(raw);
	const len = { ean13: 13, ean8: 8, upca: 12 }[kind];
	if (!new RegExp(`^\\d{${len}}$`).test(d))
		throw new Error(`${kindLabels[kind]} has ${len} digits`);
	const exp = gs1Digit(d.slice(0, -1));
	const ok = exp === d.at(-1);
	const r = result(kind, ok, d, d);
	if (!ok) {
		r.expected = exp;
		r.problems.push(`Check digit should be ${exp}`);
	}
	if (kind === 'upca') r.details.push(['As EAN-13', `0${d}`]);
	if (kind === 'ean13') {
		if (/^97[89]/.test(d)) r.details.push(['Prefix', 'Bookland (ISBN)']);
		else if (/^977/.test(d)) r.details.push(['Prefix', 'Serial publication (ISSN)']);
		else if (/^0/.test(d)) r.details.push(['As UPC-A', d.slice(1)]);
		else if (/^5[7]/.test(d)) r.details.push(['Prefix', '57: GS1 Denmark']);
		else if (/^2/.test(d)) r.details.push(['Prefix', '20-29: restricted, in-store use']);
	}
	return r;
}

export function checkIsbn13(raw: string): Result {
	const d = digitsOnly(raw.replace(/^isbn(-1[03])?:?\s*/i, ''));
	if (!/^97[89]\d{10}$/.test(d)) throw new Error('ISBN-13 has 13 digits starting with 978 or 979');
	const r = checkGs1('ean13', d);
	r.kind = 'isbn13';
	r.details = [];
	if (d.startsWith('978'))
		r.details.push(['As ISBN-10', isbn13to10(d.slice(0, 12) + gs1Digit(d.slice(0, 12)))]);
	else r.details.push(['As ISBN-10', 'none, 979 prefixes have no ISBN-10']);
	return r;
}

export function checkIsbn10(raw: string): Result {
	const d = digitsOnly(raw.replace(/^isbn(-10)?:?\s*/i, '')).toUpperCase();
	if (!/^\d{9}[\dX]$/.test(d)) throw new Error('ISBN-10 has 9 digits and a check digit or X');
	const exp = isbn10Char(d.slice(0, 9));
	const ok = exp === d[9];
	const r = result('isbn10', ok, d, d);
	r.details.push(['As ISBN-13', isbn10to13(d.slice(0, 9) + exp)]);
	if (!ok) {
		r.expected = exp;
		r.problems.push(`Check character should be ${exp}`);
	}
	return r;
}

export function isbn10to13(isbn10: string): string {
	const d = digitsOnly(isbn10).toUpperCase();
	if (!/^\d{9}[\dX]$/.test(d)) throw new Error('Not an ISBN-10');
	const p = '978' + d.slice(0, 9);
	return p + gs1Digit(p);
}

export function isbn13to10(isbn13: string): string {
	const d = digitsOnly(isbn13);
	if (!/^978\d{10}$/.test(d)) throw new Error('Only ISBN-13 starting with 978 have an ISBN-10');
	const p = d.slice(3, 12);
	return p + isbn10Char(p);
}

export function checkIssn(raw: string): Result {
	const d = digitsOnly(raw.replace(/^issn:?\s*/i, '')).toUpperCase();
	if (!/^\d{7}[\dX]$/.test(d)) throw new Error('ISSN has 7 digits and a check digit or X');
	const exp = issnChar(d.slice(0, 7));
	const ok = exp === d[7];
	const r = result('issn', ok, d, `${d.slice(0, 4)}-${d.slice(4)}`);
	const ean = '977' + d.slice(0, 7) + '00';
	r.details.push(['As EAN-13', ean + gs1Digit(ean) + ' (with 00 variant)']);
	if (!ok) {
		r.expected = exp;
		r.problems.push(`Check character should be ${exp}`);
	}
	return r;
}

export function checkCvr(raw: string): Result {
	const d = digitsOnly(raw.replace(/^(dk|cvr)[:\s-]*/i, ''));
	if (!/^\d{8}$/.test(d)) throw new Error('A CVR number has 8 digits');
	const ok = weighted(d, cvrWeights) % 11 === 0 && d[0] !== '0';
	const r = result('cvr', ok, d, d);
	r.details.push(['EU VAT number', `DK${d}`]);
	if (d[0] === '0') r.problems.push('CVR numbers do not start with 0');
	if (weighted(d, cvrWeights) % 11 !== 0) {
		const e = cvrDigit(d.slice(0, 7));
		if (e) r.expected = e;
		r.problems.push(
			e
				? `Modulus 11 fails. Last digit should be ${e}`
				: 'Modulus 11 fails, and no last digit can fix these 7'
		);
	}
	return r;
}

/** Full year of birth from the 2-digit year and the 7th digit of a CPR number (cpr.dk). */
export function cprYear(yy: number, seventh: number): number {
	if (seventh <= 3) return 1900 + yy;
	if (seventh === 4 || seventh === 9) return (yy <= 36 ? 2000 : 1900) + yy;
	return (yy <= 57 ? 2000 : 1800) + yy;
}

export function checkCpr(raw: string): Result {
	const d = digitsOnly(raw);
	if (!/^\d{10}$/.test(d)) throw new Error('A CPR number is DDMMYY-SSSS, 10 digits');
	const dd = +d.slice(0, 2);
	const mm = +d.slice(2, 4);
	const year = cprYear(+d.slice(4, 6), +d[6]);
	const date = new Date(Date.UTC(year, mm - 1, dd));
	const dateOk = mm >= 1 && mm <= 12 && date.getUTCMonth() === mm - 1 && date.getUTCDate() === dd;
	const mod11 = weighted(d, cprWeights) % 11 === 0;
	const r = result('cpr', dateOk, d, `${d.slice(0, 6)}-${d.slice(6)}`, { sensitive: true });
	r.details.push([
		'Date of birth',
		dateOk ? `${year}-${d.slice(2, 4)}-${d.slice(0, 2)}` : 'not a valid date'
	]);
	r.details.push(['Century from 7th digit', `${d[6]} with year ${d.slice(4, 6)} gives ${year}`]);
	r.details.push(['Legal sex', +d[9] % 2 ? 'male (odd last digit)' : 'female (even last digit)']);
	r.details.push(['Modulus 11', mod11 ? 'passes' : 'does not pass']);
	if (!dateOk) r.problems.push('The first six digits are not a valid date for that century');
	else if (!mod11) {
		r.status = 'warn';
		r.problems.push(
			'Fails modulus 11. Since 2007 CPR numbers that do not pass modulus 11 are issued, so this alone does not prove the number invalid'
		);
	}
	return r;
}

export function check(kind: Kind, raw: string): Result {
	switch (kind) {
		case 'iban':
			return checkIban(raw);
		case 'luhn':
			return checkLuhn(raw);
		case 'ean13':
		case 'ean8':
		case 'upca':
			return checkGs1(kind, raw);
		case 'isbn13':
			return checkIsbn13(raw);
		case 'isbn10':
			return checkIsbn10(raw);
		case 'issn':
			return checkIssn(raw);
		case 'cvr':
			return checkCvr(raw);
		case 'cpr':
			return checkCpr(raw);
	}
}

// ---------- detection ----------

/** Kinds whose format fits the input, most plausible first. */
export function candidates(raw: string): Kind[] {
	const t = raw.trim();
	if (!t) return [];
	const c = t.replace(/[\s-]/g, '');
	if (/^isbn/i.test(t))
		return c.replace(/^isbn(-1[03])?:?/i, '').length === 10 ? ['isbn10'] : ['isbn13'];
	if (/^issn/i.test(t)) return ['issn'];
	if (/^[A-Za-z]{2}\d{2}[A-Za-z0-9]{8,30}$/.test(c) && !/^dk\d{8}$/i.test(c)) return ['iban'];
	if (/^(dk|cvr)[:\s-]*\d{8}$/i.test(t.replace(/\s/g, ' '))) return ['cvr'];
	if (/^\d{7}[\dXx]$/.test(c)) return /[Xx]$/.test(c) ? ['issn'] : ['cvr', 'ean8', 'issn'];
	if (/^\d{9}[\dXx]$/.test(c)) {
		if (/[Xx]$/.test(c)) return ['isbn10'];
		if (/^\d{6}-\d{4}$/.test(t)) return ['cpr', 'isbn10', 'luhn'];
		return ['isbn10', 'cpr', 'luhn'];
	}
	if (!/^\d+$/.test(c)) return [];
	if (c.length === 12) return ['upca', 'luhn'];
	if (c.length === 13) return /^97[89]/.test(c) ? ['isbn13', 'ean13', 'luhn'] : ['ean13', 'luhn'];
	if (c.length >= 2) return ['luhn'];
	return [];
}

/** All interpretations, each validated. Inputs that fail parsing for a kind are skipped. */
export function auto(raw: string): Result[] {
	const out: Result[] = [];
	for (const k of candidates(raw)) {
		try {
			out.push(check(k, raw));
		} catch {
			// format did not fit after all
		}
	}
	// Show passing interpretations first, keep the plausibility order otherwise.
	const rank = (r: Result) => (r.status === 'valid' ? 0 : r.status === 'warn' ? 1 : 2);
	return out
		.map((r, i) => ({ r, i }))
		.sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i)
		.map((x) => x.r);
}

/** Front-page intake: only claim IBANs (checksum verified) and labelled ISBN/ISSN. */
export function looksLikeCheckDigit(s: string): number {
	const t = s.trim();
	if (t.length > 50) return 0;
	if (/^(isbn|issn)/i.test(t)) return 0.9;
	const c = t.replace(/\s/g, '');
	if (/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/i.test(c)) {
		try {
			return checkIban(c).status !== 'invalid' ? 0.95 : 0.5;
		} catch {
			return 0;
		}
	}
	return 0;
}

// ---------- compute ----------

/** Appends (or for IBAN, inserts) the check character(s) for a payload. */
export function complete(kind: Kind, raw: string): string {
	const d = digitsOnly(raw);
	const need = (n: number, what: string) => {
		if (!new RegExp(`^\\d{${n}}$`).test(d)) throw new Error(`${what}: enter the first ${n} digits`);
	};
	switch (kind) {
		case 'luhn':
			if (!/^\d{1,30}$/.test(d)) throw new Error('Luhn: enter digits');
			return d + luhnDigit(d);
		case 'ean13':
			need(12, 'EAN-13');
			return d + gs1Digit(d);
		case 'ean8':
			need(7, 'EAN-8');
			return d + gs1Digit(d);
		case 'upca':
			need(11, 'UPC-A');
			return d + gs1Digit(d);
		case 'isbn13':
			need(12, 'ISBN-13');
			if (!/^97[89]/.test(d)) throw new Error('ISBN-13 starts with 978 or 979');
			return d + gs1Digit(d);
		case 'isbn10':
			need(9, 'ISBN-10');
			return d + isbn10Char(d);
		case 'issn': {
			need(7, 'ISSN');
			const s = d + issnChar(d);
			return `${s.slice(0, 4)}-${s.slice(4)}`;
		}
		case 'cvr': {
			need(7, 'CVR');
			const c = cvrDigit(d);
			if (!c) throw new Error('No last digit makes these 7 digits a valid CVR number');
			return d + c;
		}
		case 'iban': {
			const s = raw
				.replace(/[\s-]/g, '')
				.toUpperCase()
				.replace(/^([A-Z]{2})\?\?/, '$100');
			if (!/^[A-Z]{2}[A-Z0-9]+$/.test(s))
				throw new Error('IBAN: enter country code and BBAN, e.g. DK00 0040 0440 1162 43');
			const cc = s.slice(0, 2);
			const rest = s.slice(2);
			const country = ibanLengths[cc];
			let bban: string;
			if (country && rest.length === country.length - 4) bban = rest;
			else if (
				rest.length >= 3 &&
				/^\d{2}/.test(rest) &&
				(!country || rest.length === country.length - 2)
			)
				bban = rest.slice(2);
			else
				throw new Error(
					`${country?.name ?? cc}: the BBAN is ${country ? country.length - 4 : 'unknown'} characters, got ${rest.length}`
				);
			return groups(cc + ibanCheckDigits(cc, bban) + bban);
		}
		case 'cpr':
			throw new Error('Not offered for CPR numbers');
	}
}
