import { ibanCheckDigits, luhnValid } from '../check-digits/logic';

// ---------- random sources ----------

/** A source of uniformly distributed 32-bit unsigned integers. */
export type Rng = () => number;

/** Cryptographically strong, from crypto.getRandomValues, buffered. */
export function cryptoRng(): Rng {
	const buf = new Uint32Array(256);
	let i = buf.length;
	return () => {
		if (i >= buf.length) {
			crypto.getRandomValues(buf);
			i = 0;
		}
		return buf[i++];
	};
}

/**
 * Reproducible and NOT cryptographic: the seed string is hashed with cyrb128 into the state
 * of sfc32 (Small Fast Counting, from PractRand). Same seed, same data, in every browser.
 */
export function seededRng(seed: string): Rng {
	let h1 = 1779033703,
		h2 = 3144134277,
		h3 = 1013904242,
		h4 = 2773480762;
	for (let i = 0; i < seed.length; i++) {
		const k = seed.charCodeAt(i);
		h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
		h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
		h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
		h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
	}
	h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
	h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
	h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
	h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
	let a = (h1 ^ h2 ^ h3 ^ h4) >>> 0,
		b = (h2 ^ h1) >>> 0,
		c = (h3 ^ h1) >>> 0,
		d = (h4 ^ h1) >>> 0;
	const next = () => {
		const t = (((a + b) | 0) + d) | 0;
		d = (d + 1) | 0;
		a = b ^ (b >>> 9);
		b = (c + (c << 3)) | 0;
		c = (c << 21) | (c >>> 11);
		c = (c + t) | 0;
		return t >>> 0;
	};
	for (let i = 0; i < 12; i++) next();
	return next;
}

/** Uniform integer in [0, n) without modulo bias. */
export function randInt(rng: Rng, n: number): number {
	if (n <= 0 || n > 2 ** 32) throw new Error('range out of bounds');
	const limit = 2 ** 32 - (2 ** 32 % n);
	let x: number;
	do x = rng();
	while (x >= limit);
	return x % n;
}

export function pick<T>(rng: Rng, list: readonly T[]): T {
	return list[randInt(rng, list.length)];
}

function digits(rng: Rng, n: number): string {
	let s = '';
	for (let i = 0; i < n; i++) s += randInt(rng, 10);
	return s;
}

// ---------- word lists (small, for variety, not statistics) ----------

export const danishFirst = [
	'Anne',
	'Mette',
	'Kirsten',
	'Hanne',
	'Helle',
	'Lene',
	'Camilla',
	'Ida',
	'Emma',
	'Freja',
	'Sofie',
	'Astrid',
	'Peter',
	'Jens',
	'Lars',
	'Henrik',
	'Søren',
	'Niels',
	'Rasmus',
	'Mads',
	'Frederik',
	'Magnus',
	'Oliver',
	'Mikkel',
	'Jørgen',
	'Bodil'
];
export const danishLast = [
	'Nielsen',
	'Jensen',
	'Hansen',
	'Pedersen',
	'Andersen',
	'Christensen',
	'Larsen',
	'Sørensen',
	'Rasmussen',
	'Jørgensen',
	'Petersen',
	'Madsen',
	'Kristensen',
	'Olsen',
	'Thomsen',
	'Poulsen',
	'Johansen',
	'Møller',
	'Mortensen',
	'Østergaard',
	'Kjær',
	'Lund'
];
export const intlFirst = [
	'James',
	'Maria',
	'Wei',
	'Fatima',
	'Aisha',
	'Carlos',
	'Sofia',
	'Luca',
	'Yuki',
	'Olga',
	'Ahmed',
	'Priya',
	'Liam',
	'Chloé',
	'Mateo',
	'Amara',
	'Noah',
	'Elena',
	'Kofi',
	'Ana',
	'Mehmet',
	'Zoë'
];
export const intlLast = [
	'Smith',
	'García',
	'Müller',
	'Rossi',
	'Kowalski',
	'Nguyen',
	'Kim',
	'Tanaka',
	'Silva',
	'Novák',
	'Ivanova',
	'Khan',
	'Okafor',
	'Dubois',
	'Hernández',
	'Cohen',
	"O'Brien",
	'Johansson',
	'Yılmaz',
	'Papadopoulos',
	'Mensah',
	'Singh'
];

/** Invented street names. They may coincidentally exist somewhere. */
export const streets = [
	'Testvej',
	'Eksempelgade',
	'Prøvestien',
	'Fiktivvej',
	'Skabelonvej',
	'Pladsholderallé',
	'Demostræde',
	'Dummyvænget',
	'Attrapvej',
	'Udkastgade',
	'Kladdevej',
	'Mockupparken'
];

/** Real Danish postcodes and towns (PostNord), paired with invented streets. */
export const postcodes: [string, string][] = [
	['1050', 'København K'],
	['2300', 'København S'],
	['2800', 'Kongens Lyngby'],
	['3400', 'Hillerød'],
	['4000', 'Roskilde'],
	['5000', 'Odense C'],
	['6700', 'Esbjerg'],
	['7100', 'Vejle'],
	['8000', 'Aarhus C'],
	['8700', 'Horsens'],
	['9000', 'Aalborg'],
	['3700', 'Rønne']
];

/** RFC 2606 reserves these second-level domains for documentation and testing. */
export const emailDomains = ['example.com', 'example.org', 'example.net'];

/**
 * Card numbers published as test numbers by payment providers. Never random numbers with
 * real issuer prefixes. Sources: Stripe, docs.stripe.com/testing (all except 4111...);
 * 4111 1111 1111 1111 is listed by Adyen (docs.adyen.com/development-resources/testing/test-card-numbers)
 * and Braintree (developer.paypal.com/braintree/docs/guides/credit-cards/testing-go-live).
 */
export const testCards: { number: string; brand: string }[] = [
	{ number: '4242424242424242', brand: 'Visa' },
	{ number: '4111111111111111', brand: 'Visa' },
	{ number: '4000056655665556', brand: 'Visa (debit)' },
	{ number: '5555555555554444', brand: 'Mastercard' },
	{ number: '2223003122003222', brand: 'Mastercard (2-series)' },
	{ number: '5200828282828210', brand: 'Mastercard (debit)' },
	{ number: '378282246310005', brand: 'American Express' },
	{ number: '371449635398431', brand: 'American Express' },
	{ number: '6011111111111117', brand: 'Discover' },
	{ number: '3056930009020004', brand: 'Diners Club' },
	{ number: '3566002020360505', brand: 'JCB' }
];

// ---------- fields ----------

export type Field = 'name' | 'email' | 'phone' | 'address' | 'iban' | 'card' | 'uuid' | 'birthdate';

export const fieldLabels: Record<Field, string> = {
	name: 'Name',
	email: 'Email',
	phone: 'Phone',
	address: 'Address',
	iban: 'IBAN (DK)',
	card: 'Test card',
	uuid: 'UUID',
	birthdate: 'Birth date'
};

export const allFields = Object.keys(fieldLabels) as Field[];

export type NameSet = 'dk' | 'intl' | 'mixed';

/** ASCII local part for an email: "Søren Østergaard" -> "soeren.oestergaard". */
export function asciiSlug(s: string): string {
	return s
		.toLowerCase()
		.replace(/æ/g, 'ae')
		.replace(/ø/g, 'oe')
		.replace(/å/g, 'aa')
		.replace(/ß/g, 'ss')
		.replace(/ı/g, 'i')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]+/g, '');
}

export function uuidV4(rng: Rng): string {
	const b = new Uint8Array(16);
	for (let i = 0; i < 16; i += 4) {
		const x = rng();
		b[i] = x & 255;
		b[i + 1] = (x >>> 8) & 255;
		b[i + 2] = (x >>> 16) & 255;
		b[i + 3] = x >>> 24;
	}
	b[6] = (b[6] & 0x0f) | 0x40;
	b[8] = (b[8] & 0x3f) | 0x80;
	const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Synthetic Danish IBAN: random 4-digit registration number and 10-digit account, correct mod 97. */
export function danishIban(rng: Rng): string {
	const bban = String(1000 + randInt(rng, 9000)) + digits(rng, 10);
	return `DK${ibanCheckDigits('DK', bban)}${bban}`;
}

/** Random Danish-format number: +45 and 8 digits starting 2 to 9. May be in use. */
export function danishPhone(rng: Rng): string {
	const d = String(2 + randInt(rng, 8)) + digits(rng, 7);
	return `+45 ${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 6)} ${d.slice(6)}`;
}

const DAY = 86_400_000;

export function birthdate(rng: Rng): string {
	const from = Date.UTC(1950, 0, 1) / DAY;
	const to = Date.UTC(2007, 11, 31) / DAY;
	return new Date((from + randInt(rng, to - from + 1)) * DAY).toISOString().slice(0, 10);
}

export type Row = Record<string, string>;

export interface Options {
	count: number;
	fields: Field[];
	names: NameSet;
	/** Year the card expiry dates are counted from. */
	year: number;
}

export function generate(rng: Rng, o: Options): Row[] {
	if (!Number.isInteger(o.count) || o.count < 1 || o.count > 1000)
		throw new Error('Count must be a whole number from 1 to 1000');
	if (!o.fields.length) throw new Error('Pick at least one field');
	const seenEmail = new Set<string>();
	const rows: Row[] = [];
	for (let i = 0; i < o.count; i++) {
		const dk = o.names === 'dk' || (o.names === 'mixed' && randInt(rng, 2) === 0);
		const first = pick(rng, dk ? danishFirst : intlFirst);
		const last = pick(rng, dk ? danishLast : intlLast);
		const row: Row = {};
		for (const f of allFields) {
			if (!o.fields.includes(f)) continue;
			switch (f) {
				case 'name':
					row.first_name = first;
					row.last_name = last;
					break;
				case 'email': {
					const base = `${asciiSlug(first)}.${asciiSlug(last)}`;
					const domain = pick(rng, emailDomains);
					let e = `${base}@${domain}`;
					for (let n = 2; seenEmail.has(e); n++) e = `${base}${n}@${domain}`;
					seenEmail.add(e);
					row.email = e;
					break;
				}
				case 'phone':
					row.phone = danishPhone(rng);
					break;
				case 'address': {
					const [pc, city] = pick(rng, postcodes);
					row.street = `${pick(rng, streets)} ${1 + randInt(rng, 120)}`;
					row.postcode = pc;
					row.city = city;
					break;
				}
				case 'iban':
					row.iban = danishIban(rng);
					break;
				case 'card': {
					const c = pick(rng, testCards);
					row.card_number = c.number;
					row.card_brand = c.brand;
					row.card_expiry = `${String(1 + randInt(rng, 12)).padStart(2, '0')}/${String((o.year + 1 + randInt(rng, 5)) % 100).padStart(2, '0')}`;
					row.card_cvc = digits(rng, c.brand.startsWith('American') ? 4 : 3);
					break;
				}
				case 'uuid':
					row.uuid = uuidV4(rng);
					break;
				case 'birthdate':
					row.birthdate = birthdate(rng);
					break;
			}
		}
		rows.push(row);
	}
	return rows;
}

function csvCell(s: string): string {
	return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV with a header row, fields quoted as RFC 4180 describes, CRLF line ends. */
export function toCsv(rows: Row[]): string {
	if (!rows.length) return '';
	const cols = Object.keys(rows[0]);
	return [cols, ...rows.map((r) => cols.map((c) => r[c] ?? ''))]
		.map((line) => line.map(csvCell).join(','))
		.join('\r\n');
}

export function toJson(rows: Row[]): string {
	return JSON.stringify(rows, null, 2);
}

export { luhnValid };
