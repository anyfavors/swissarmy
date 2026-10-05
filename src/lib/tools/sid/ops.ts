import type { ChainOp } from '../types';
import { bytesToBase64, ldapFilter, parseAny, toHex } from './logic';

export const ops: ChainOp[] = [
	{ id: 'sid.to-string', label: 'SID to S-1-… string', run: (s) => parseAny(s).e.string },
	{ id: 'sid.to-hex', label: 'SID to hex', run: (s) => toHex(parseAny(s).e.bytes) },
	{
		id: 'sid.to-base64',
		label: 'SID to Base64 objectSid',
		run: (s) => bytesToBase64(parseAny(s).e.bytes)
	},
	{ id: 'sid.to-ldap-filter', label: 'SID to LDAP filter', run: (s) => ldapFilter(parseAny(s).e) }
];
