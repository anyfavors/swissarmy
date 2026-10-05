import { describe, expect, it } from 'vitest';
import {
	auto,
	candidates,
	check,
	checkCpr,
	checkCvr,
	checkIban,
	complete,
	cprYear,
	isbn10to13,
	isbn13to10,
	looksLikeCheckDigit,
	mod97
} from './logic';
import { ibanLengths } from './iban';

describe('IBAN (ISO 13616, examples from the SWIFT IBAN Registry)', () => {
	const examples = [
		'GB29 NWBK 6016 1331 9268 19',
		'DE89 3704 0044 0532 0130 00',
		'DK50 0040 0440 1162 43',
		'NO93 8601 1117 947',
		'FR14 2004 1010 0505 0001 3M02 606',
		'CH93 0076 2011 6238 5295 7',
		'NL91 ABNA 0417 1643 00',
		'BE68 5390 0754 7034',
		'FI21 1234 5600 0007 85',
		'SE45 5000 0000 0583 9825 7466',
		'AT61 1904 3002 3457 3201',
		'IS14 0159 2600 7654 5510 7303 39'
	];
	it.each(examples)('accepts %s', (iban) => {
		const r = checkIban(iban);
		expect(r.status).toBe('valid');
		expect(r.formatted).toBe(iban);
	});

	it('rejects a changed digit and gives the right check digits', () => {
		const r = checkIban('DK50 0040 0440 1162 44');
		expect(r.status).toBe('invalid');
		expect(r.problems[0]).toMatch(/Mod 97/);
		expect(checkIban(`DK${r.expected}0040044011624 4`).status).toBe('valid');
	});

	it('checks country length', () => {
		const r = checkIban('DK5000400440116243 1'.replace(' ', ''));
		expect(r.status).toBe('invalid');
		expect(r.problems.join()).toMatch(/Denmark IBANs are 18/);
	});

	it('warns for countries not in the table', () => {
		const r = checkIban('ZZ' + '00' + 'ABC123');
		expect(r.problems.join()).toMatch(/unknown here/);
	});

	it('computes check digits', () => {
		expect(complete('iban', 'DK00 0040 0440 1162 43')).toBe('DK50 0040 0440 1162 43');
		expect(complete('iban', 'DK??0040044011624 3')).toBe('DK50 0040 0440 1162 43');
		expect(complete('iban', 'GB NWBK 6016 1331 9268 19')).toBe('GB29 NWBK 6016 1331 9268 19');
		expect(() => complete('iban', 'DK00 123')).toThrow(/Denmark: the BBAN is 14/);
	});

	it('has EU/EEA plus GB, CH, NO in the length table', () => {
		const eea =
			'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE IS LI NO GB CH';
		for (const cc of eea.split(' ')) expect(ibanLengths[cc], cc).toBeTruthy();
	});

	it('computes mod 97 on long strings', () => {
		expect(mod97('3214282912345698765432161182')).toBe(1);
	});
});

describe('Luhn', () => {
	it('validates the classic example and test cards', () => {
		expect(check('luhn', '79927398713').status).toBe('valid');
		expect(check('luhn', '4111 1111 1111 1111').status).toBe('valid');
		expect(check('luhn', '4111 1111 1111 1111').formatted).toBe('4111 1111 1111 1111');
		expect(check('luhn', '378282246310005').formatted).toBe('3782 822463 10005');
	});
	it('reports the expected digit', () => {
		const r = check('luhn', '79927398710');
		expect(r.status).toBe('invalid');
		expect(r.expected).toBe('3');
	});
	it('reads IMEI', () => {
		const r = check('luhn', '490154203237518');
		expect(r.status).toBe('valid');
		expect(r.details.find((d) => d[0] === 'As IMEI')?.[1]).toMatch(/TAC 49015420/);
	});
	it('computes', () => {
		expect(complete('luhn', '7992739871')).toBe('79927398713');
	});
});

describe('GS1: EAN-13, EAN-8, UPC-A', () => {
	it('validates published examples', () => {
		expect(check('ean13', '4006381333931').status).toBe('valid');
		expect(check('ean8', '73513537').status).toBe('valid');
		expect(check('upca', '036000291452').status).toBe('valid');
	});
	it('reports wrong digits', () => {
		const r = check('ean13', '4006381333932');
		expect(r.status).toBe('invalid');
		expect(r.expected).toBe('1');
	});
	it('computes', () => {
		expect(complete('ean13', '400638133393')).toBe('4006381333931');
		expect(complete('upca', '03600029145')).toBe('036000291452');
		expect(complete('ean8', '7351353')).toBe('73513537');
		expect(() => complete('ean13', '123')).toThrow(/first 12 digits/);
	});
});

describe('ISBN and ISSN', () => {
	it('validates and converts ISBN', () => {
		expect(check('isbn13', '978-0-306-40615-7').status).toBe('valid');
		expect(check('isbn10', '0-306-40615-2').status).toBe('valid');
		expect(check('isbn10', '0-8044-2957-X').status).toBe('valid');
		expect(isbn10to13('0306406152')).toBe('9780306406157');
		expect(isbn13to10('9780306406157')).toBe('0306406152');
		expect(() => isbn13to10('9791234567896')).toThrow(/978/);
		expect(complete('isbn10', '080442957')).toBe('080442957X');
	});
	it('validates ISSN', () => {
		expect(check('issn', '0378-5955').status).toBe('valid');
		expect(check('issn', '2049-3630').status).toBe('valid');
		expect(check('issn', '0378-5955').formatted).toBe('0378-5955');
		const r = check('issn', '0378-5954');
		expect(r.expected).toBe('5');
		expect(complete('issn', '0317847')).toBe('0317-8471');
	});
});

describe('CVR', () => {
	it('validates with weights 2,7,6,5,4,3,2,1', () => {
		expect(checkCvr('24256790').status).toBe('valid');
		expect(checkCvr('DK 24 25 67 90').status).toBe('valid');
		const r = checkCvr('24256791');
		expect(r.status).toBe('invalid');
		expect(r.expected).toBe('0');
		expect(complete('cvr', '2425679')).toBe('24256790');
	});
});

describe('CPR', () => {
	it('reads the century from the 7th digit (cpr.dk table)', () => {
		expect(cprYear(61, 0)).toBe(1961);
		expect(cprYear(36, 4)).toBe(2036);
		expect(cprYear(37, 4)).toBe(1937);
		expect(cprYear(57, 5)).toBe(2057);
		expect(cprYear(58, 8)).toBe(1858);
		expect(cprYear(10, 9)).toBe(2010);
		expect(cprYear(80, 9)).toBe(1980);
	});
	it('validates date and modulus 11', () => {
		const r = checkCpr('070761-4285');
		expect(r.status).toBe('valid');
		expect(r.formatted).toBe('070761-4285');
		expect(r.sensitive).toBe(true);
		expect(r.details[0][1]).toBe('1961-07-07');
		expect(r.details.find((d) => d[0] === 'Legal sex')?.[1]).toMatch(/^male/);
	});
	it('only warns when modulus 11 fails', () => {
		const r = checkCpr('070761-4286');
		expect(r.status).toBe('warn');
		expect(r.problems[0]).toMatch(/does not prove the number invalid/);
	});
	it('rejects impossible dates', () => {
		expect(checkCpr('310261-4285').status).toBe('invalid');
		expect(checkCpr('290201-1234').status).toBe('invalid'); // 1901 not a leap year
		expect(checkCpr('290200-4234').status).not.toBe('invalid'); // 2000 is
	});
	it('is never computed', () => {
		expect(() => complete('cpr', '070761428')).toThrow(/Not offered/);
	});
});

describe('detection', () => {
	it('suggests plausible kinds', () => {
		expect(candidates('DK50 0040 0440 1162 43')).toEqual(['iban']);
		expect(candidates('ISBN 0-306-40615-2')).toEqual(['isbn10']);
		expect(candidates('9780306406157')).toEqual(['isbn13', 'ean13', 'luhn']);
		expect(candidates('24256790')).toEqual(['cvr', 'ean8', 'issn']);
		expect(candidates('070761-4285')[0]).toBe('cpr');
		expect(candidates('DK24256790')).toEqual(['cvr']);
		expect(candidates('hello')).toEqual([]);
	});
	it('puts passing interpretations first', () => {
		// 73513537 passes both EAN-8 and CVR modulus 11; both are shown
		expect(
			auto('73513537')
				.filter((r) => r.status === 'valid')
				.map((r) => r.kind)
		).toEqual(['cvr', 'ean8']);
		expect(auto('4006381333931')[0].kind).toBe('ean13');
		expect(auto('0378-5955')[0].kind).toBe('issn');
	});
	it('only claims IBAN and labelled ISBN on the front page', () => {
		expect(looksLikeCheckDigit('DE89 3704 0044 0532 0130 00')).toBeGreaterThan(0.9);
		expect(looksLikeCheckDigit('ISBN 978-0-306-40615-7')).toBeGreaterThan(0.8);
		expect(looksLikeCheckDigit('070761-4285')).toBe(0);
		expect(looksLikeCheckDigit('1700000000')).toBe(0);
		expect(looksLikeCheckDigit('4111111111111111')).toBe(0);
	});
});

describe('chain ops', async () => {
	const { ops } = await import('./ops');
	const run = (id: string, s: string) => ops.find((o) => o.id === id)!.run(s);
	it('formats IBANs and converts ISBNs', () => {
		expect(run('checkdigit.iban-format', 'de89370400440532013000')).toBe(
			'DE89 3704 0044 0532 0130 00'
		);
		expect(() => run('checkdigit.iban-format', 'DE89370400440532013001')).toThrow(/Mod 97/);
		expect(run('checkdigit.isbn13', '0-306-40615-2')).toBe('9780306406157');
		expect(run('checkdigit.isbn10', '978-0-306-40615-7')).toBe('0306406152');
		expect(() => run('checkdigit.isbn13', '0-306-40615-3')).toThrow(/should be 2/);
	});
});
