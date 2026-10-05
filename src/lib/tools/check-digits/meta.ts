import type { ToolMeta } from '../types';

export const meta: ToolMeta = {
	id: 'check-digits',
	chapter: 16,
	section: 1,
	title: 'Check digits',
	summary:
		'Validate or compute IBAN, Luhn, EAN/UPC, ISBN, ISSN, CVR and CPR check digits, type detected from the input.',
	keywords: [
		'iban',
		'luhn',
		'credit card',
		'imei',
		'ean',
		'gtin',
		'upc',
		'barcode',
		'isbn',
		'issn',
		'cvr',
		'cpr',
		'modulus 11',
		'mod 97',
		'checksum',
		'personnummer'
	],
	network: false,
	chain: { in: 'text', out: 'text' }
};
