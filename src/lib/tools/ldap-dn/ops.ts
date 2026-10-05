import type { ChainOp } from '../types';
import {
	escapeDnValue,
	escapeFilterValue,
	formatDn,
	fromCanonical,
	parseDn,
	toCanonical,
	unescapeDnValue,
	unescapeFilterValue
} from './logic';

// Op ids use the prefix "ldap": the chain registry only allows [a-z0-9] before the dot.
export const ops: ChainOp[] = [
	{ id: 'ldap.escape-dn-value', label: 'LDAP escape DN value', run: (s) => escapeDnValue(s) },
	{ id: 'ldap.unescape-dn-value', label: 'LDAP unescape DN value', run: (s) => unescapeDnValue(s) },
	{
		id: 'ldap.escape-filter-value',
		label: 'LDAP escape filter value',
		run: (s) => escapeFilterValue(s)
	},
	{
		id: 'ldap.unescape-filter-value',
		label: 'LDAP unescape filter value',
		run: (s) => unescapeFilterValue(s)
	},
	{
		id: 'ldap.normalise-dn',
		label: 'LDAP normalise DN',
		run: (s) => {
			const { rdns } = parseDn(s);
			if (!rdns.length) throw new Error('Enter a DN');
			return formatDn(rdns);
		}
	},
	{ id: 'ldap.to-canonical', label: 'DN to canonical name', run: (s) => toCanonical(s) },
	{ id: 'ldap.from-canonical', label: 'Canonical name to DN', run: (s) => fromCanonical(s) }
];
