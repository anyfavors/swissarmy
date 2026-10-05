import type { ToolMeta } from '../types';
import { looksLikeWindowsTime } from './logic';

export const meta: ToolMeta = {
	id: 'windows-time',
	chapter: 3,
	section: 5,
	title: 'Windows and other epochs',
	summary:
		'FILETIME, AD lastLogonTimestamp, Excel serials, .NET ticks, GPS, NTP, Cocoa, snowflake ids, UUID and ULID times.',
	keywords: [
		'filetime',
		'lastlogontimestamp',
		'pwdlastset',
		'accountexpires',
		'active directory',
		'excel date',
		'serial date',
		'ticks',
		'webkit',
		'chrome time',
		'cocoa',
		'gps time',
		'ntp',
		'snowflake',
		'discord',
		'twitter',
		'uuid',
		'ulid',
		'w32tm'
	],
	network: false,
	detect: looksLikeWindowsTime,
	chain: { in: 'text', out: 'text' }
};
