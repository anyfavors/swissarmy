import { describe, expect, it } from 'vitest';
import {
	buildFilter,
	buildItem,
	escapeDnValue,
	escapeFilterValue,
	formatDn,
	fromCanonical,
	looksLikeDn,
	parseDn,
	toCanonical,
	unescapeDnValue,
	unescapeFilterValue
} from './logic';
import { ops } from './ops';

const vals = (dn: string) => parseDn(dn).rdns.map((r) => r.map((a) => [a.type, a.value]));

describe('parseDn: RFC 4514 section 4 examples', () => {
	it('simple DN', () => {
		expect(vals('UID=jsmith,DC=example,DC=net')).toEqual([
			[['UID', 'jsmith']],
			[['DC', 'example']],
			[['DC', 'net']]
		]);
	});

	it('multi-valued RDN keeps inner spaces', () => {
		expect(vals('OU=Sales+CN=J.  Smith,DC=example,DC=net')[0]).toEqual([
			['OU', 'Sales'],
			['CN', 'J.  Smith']
		]);
	});

	it('escaped quotes and comma', () => {
		expect(vals('CN=James \\"Jim\\" Smith\\, III,DC=example,DC=net')[0]).toEqual([
			['CN', 'James "Jim" Smith, III']
		]);
	});

	it('hex escape of a carriage return', () => {
		expect(vals('CN=Before\\0dAfter,DC=example,DC=net')[0][0][1]).toBe('Before\rAfter');
	});

	it('BER hex value with a numeric OID', () => {
		const r = parseDn('1.3.6.1.4.1.1466.0=#04024869,DC=example,DC=com').rdns[0][0];
		expect(r).toMatchObject({ type: '1.3.6.1.4.1.1466.0', value: '#04024869', hex: true });
	});

	it('UTF-8 hex escapes', () => {
		expect(vals('CN=Lu\\C4\\8Di\\C4\\87')[0][0][1]).toBe('Lučić');
	});
});

describe('parseDn: leniency and errors', () => {
	it('trims spaces around separators', () => {
		expect(vals(' CN = Jane Doe , OU = Staff ')).toEqual([[['CN', 'Jane Doe']], [['OU', 'Staff']]]);
	});

	it('keeps escaped trailing space', () => {
		expect(vals('CN=x\\ ,DC=a')[0][0][1]).toBe('x ');
	});

	it('accepts old forms with a note', () => {
		const p = parseDn('CN="Smith, J";O=Acme');
		expect(p.rdns[0][0].value).toBe('Smith, J');
		expect(p.notes).toHaveLength(2);
	});

	it('reports errors with positions', () => {
		expect(() => parseDn('CN=a,')).toThrow('Missing RDN after separator at position 6');
		expect(() => parseDn('CN=a<b')).toThrow('Character < must be escaped as \\<');
		expect(() => parseDn('CN=a\\zb')).toThrow('"\\z" is not a valid escape');
		expect(() => parseDn('CN=a\\')).toThrow('Backslash at the end');
		expect(() => parseDn('=a')).toThrow(/Expected an attribute type/);
		expect(() => parseDn('CN a')).toThrow('Expected "=" after CN');
		expect(() => parseDn('CN=#abc')).toThrow(/even number/);
		expect(() => parseDn('CN=\\ff\\fe')).toThrow(/UTF-8/);
		expect(() => parseDn('1x=a')).toThrow(/not a valid attribute type/);
	});

	it('empty input is an empty DN', () => {
		expect(parseDn('  ').rdns).toEqual([]);
	});
});

describe('escaping', () => {
	it('escapes DN values per RFC 4514 2.4', () => {
		expect(escapeDnValue('Smith, John')).toBe('Smith\\, John');
		expect(escapeDnValue('#1 "best" <x>; a+b\\c')).toBe('\\#1 \\"best\\" \\<x\\>\\; a\\+b\\\\c');
		expect(escapeDnValue(' lead and trail ')).toBe('\\ lead and trail\\ ');
		expect(escapeDnValue('a=b')).toBe('a=b');
		expect(escapeDnValue('nul\0')).toBe('nul\\00');
	});

	it('round-trips DN values', () => {
		for (const v of ['Smith, John', ' x ', '#hash', 'Lučić', 'a\\b+c'])
			expect(unescapeDnValue(escapeDnValue(v))).toBe(v);
		expect(unescapeDnValue('Lu\\C4\\8Di\\C4\\87')).toBe('Lučić');
	});

	it('escapes filter values: RFC 4515 section 4 examples', () => {
		expect(escapeFilterValue('Parens R Us (for all your parenthetical needs)')).toBe(
			'Parens R Us \\28for all your parenthetical needs\\29'
		);
		expect(escapeFilterValue('*')).toBe('\\2a');
		expect(escapeFilterValue('C:\\MyFile')).toBe('C:\\5cMyFile');
		expect(escapeFilterValue('\0\0\0\x04')).toBe('\\00\\00\\00\x04');
		expect(escapeFilterValue('Lučić', true)).toBe('Lu\\c4\\8di\\c4\\87');
		expect(escapeFilterValue('Lučić')).toBe('Lučić');
	});

	it('unescapes filter values', () => {
		expect(unescapeFilterValue('Lu\\c4\\8di\\c4\\87')).toBe('Lučić');
		expect(unescapeFilterValue('\\2A')).toBe('*');
		expect(() => unescapeFilterValue('a\\zz')).toThrow(/two hex digits/);
	});
});

describe('canonical name', () => {
	it('converts DN to canonical name', () => {
		expect(toCanonical('CN=John Smith,OU=Staff,OU=Oslo,DC=corp,DC=example,DC=com')).toBe(
			'corp.example.com/Oslo/Staff/John Smith'
		);
		expect(toCanonical('CN=a/b,CN=Users,DC=example,DC=com')).toBe('example.com/Users/a\\/b');
		expect(toCanonical('DC=example,DC=com')).toBe('example.com');
		expect(() => toCanonical('CN=x,O=Acme')).toThrow(/no DC=/);
		expect(() => toCanonical('CN=a+UID=b,DC=x')).toThrow(/Multi-valued/);
	});

	it('converts canonical name to DN', () => {
		expect(fromCanonical('corp.example.com/Oslo/Staff/John Smith')).toBe(
			'CN=John Smith,OU=Staff,OU=Oslo,DC=corp,DC=example,DC=com'
		);
		expect(fromCanonical('example.com/Users/Smith, John')).toBe(
			'CN=Smith\\, John,CN=Users,DC=example,DC=com'
		);
		expect(fromCanonical('example.com/Domain Controllers/DC1')).toBe(
			'CN=DC1,OU=Domain Controllers,DC=example,DC=com'
		);
		expect(fromCanonical('example.com/Sales', 'OU')).toBe('OU=Sales,DC=example,DC=com');
		expect(fromCanonical('example.com/Users/a\\/b')).toBe('CN=a/b,CN=Users,DC=example,DC=com');
		expect(() => fromCanonical('example.com//x')).toThrow(/Empty path/);
		expect(() => fromCanonical('')).toThrow(/Enter a canonical name/);
	});

	it('normalises a DN', () => {
		expect(formatDn(parseDn(' cn = Smith\\, J ,  ou=X+uid=1 ').rdns)).toBe(
			'cn=Smith\\, J,ou=X+uid=1'
		);
	});
});

describe('filter builder', () => {
	it('escapes user input so it cannot change the filter', () => {
		expect(buildItem({ attr: 'sAMAccountName', op: 'equals', value: '*)(uid=*' })).toBe(
			'(sAMAccountName=\\2a\\29\\28uid=\\2a)'
		);
	});

	it('builds all operators', () => {
		const f = (op: Parameters<typeof buildItem>[0]['op']) =>
			buildItem({ attr: 'cn', op, value: 'a' });
		expect(
			['equals', 'present', 'contains', 'starts', 'ends', 'gte', 'lte', 'approx'].map((o) =>
				f(o as never)
			)
		).toEqual([
			'(cn=a)',
			'(cn=*)',
			'(cn=*a*)',
			'(cn=a*)',
			'(cn=*a)',
			'(cn>=a)',
			'(cn<=a)',
			'(cn~=a)'
		]);
		expect(buildItem({ attr: 'cn', op: 'equals', value: 'a', not: true })).toBe('(!(cn=a))');
	});

	it('combines conditions', () => {
		expect(
			buildFilter(
				[
					{ attr: 'objectClass', op: 'equals', value: 'user' },
					{ attr: 'mail', op: 'present', value: '' },
					{ attr: '', op: 'equals', value: 'ignored' }
				],
				'&'
			)
		).toBe('(&(objectClass=user)(mail=*))');
		expect(buildFilter([{ attr: 'cn', op: 'equals', value: 'x' }], '|')).toBe('(cn=x)');
		expect(() => buildFilter([], '&')).toThrow(/at least one/);
		expect(() => buildItem({ attr: 'c n', op: 'equals', value: '' })).toThrow(
			/not a valid attribute/
		);
	});
});

describe('detect and ops', () => {
	it('detects DNs conservatively', () => {
		expect(looksLikeDn('CN=John Smith,OU=Staff,DC=example,DC=com')).toBeGreaterThan(0.8);
		expect(looksLikeDn('uid=jsmith,dc=example,dc=net')).toBeGreaterThan(0.8);
		expect(looksLikeDn('a=1,b=2')).toBe(0);
		expect(looksLikeDn('CN=only')).toBe(0);
		expect(looksLikeDn('v=DMARC1; p=none')).toBe(0);
		expect(looksLikeDn('key=value&x=y')).toBe(0);
	});

	it('runs chain ops', async () => {
		const run = (id: string, s: string) => ops.find((o) => o.id === id)!.run(s);
		expect(await run('ldap.escape-dn-value', 'a,b')).toBe('a\\,b');
		expect(await run('ldap.escape-filter-value', '(x)')).toBe('\\28x\\29');
		expect(await run('ldap.to-canonical', 'CN=x,DC=a,DC=b')).toBe('a.b/x');
		expect(await run('ldap.from-canonical', 'a.b/x')).toBe('CN=x,DC=a,DC=b');
		expect(await run('ldap.normalise-dn', 'CN = x , DC = a')).toBe('CN=x,DC=a');
		expect(() => run('ldap.normalise-dn', ' ')).toThrow(/Enter a DN/);
		for (const o of ops) expect(o.id).toMatch(/^[a-z0-9]+\.[a-z0-9-]+$/);
	});
});
