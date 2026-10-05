import type { ChainOp } from '../types';
import { bytesToGuid, info, parseGuid } from './logic';

const i = (s: string) => info(parseGuid(s).rfc);

export const ops: ChainOp[] = [
	{ id: 'guid.to-string', label: 'GUID to string form', run: (s) => bytesToGuid(parseGuid(s).rfc) },
	{ id: 'guid.to-ad-hex', label: 'GUID to AD byte order hex', run: (s) => i(s).adHex },
	{ id: 'guid.to-base64', label: 'GUID to Base64 objectGUID', run: (s) => i(s).base64 },
	{
		id: 'guid.to-ldap-filter',
		label: 'GUID to LDAP objectGUID filter',
		run: (s) => i(s).ldapFilter
	}
];
