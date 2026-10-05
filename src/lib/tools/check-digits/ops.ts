import type { ChainOp } from '../types';
import { checkIban, isbn10to13, isbn13to10, checkIsbn10, checkIsbn13 } from './logic';

function ensure<T extends { status: string; problems: string[] }>(r: T): T {
	if (r.status === 'invalid') throw new Error(r.problems[0] ?? 'Check digit does not match');
	return r;
}

export const ops: ChainOp[] = [
	{
		id: 'checkdigit.iban-format',
		label: 'IBAN validate and group in fours',
		run: (s) => ensure(checkIban(s)).formatted
	},
	{
		id: 'checkdigit.isbn13',
		label: 'ISBN-10 to ISBN-13',
		run: (s) => isbn10to13(ensure(checkIsbn10(s)).value)
	},
	{
		id: 'checkdigit.isbn10',
		label: 'ISBN-13 to ISBN-10',
		run: (s) => isbn13to10(ensure(checkIsbn13(s)).value)
	}
];
