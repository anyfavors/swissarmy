import type { ChainOp } from '../types';
import { convert } from './logic';

export const ops: ChainOp[] = [
	{
		id: 'windows-time.filetime-to-iso',
		label: 'FILETIME to ISO date',
		run: (s) => convert(s, 'filetime', 'iso')
	},
	{
		id: 'windows-time.iso-to-filetime',
		label: 'ISO date to FILETIME',
		run: (s) => convert(s, 'iso', 'filetime')
	},
	{
		id: 'windows-time.excel-to-iso',
		label: 'Excel serial (1900) to ISO date',
		run: (s) => convert(s, 'excel1900', 'iso')
	},
	{
		id: 'windows-time.iso-to-excel',
		label: 'ISO date to Excel serial (1900)',
		run: (s) => convert(s, 'iso', 'excel1900')
	},
	{
		id: 'windows-time.auto-to-iso',
		label: 'Any epoch value to ISO date',
		run: (s) => convert(s, 'auto', 'iso')
	}
];
