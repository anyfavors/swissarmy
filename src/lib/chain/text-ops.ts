import type { ChainOp } from '../tools/types';

const lines = (s: string) => s.split(/\r?\n/);

/** Small text steps that belong to no single tool but make chains useful. */
export const textOps: ChainOp[] = [
	{ id: 'text.trim', label: 'Trim whitespace', run: (s) => s.trim() },
	{ id: 'text.upper', label: 'Uppercase', run: (s) => s.toUpperCase() },
	{ id: 'text.lower', label: 'Lowercase', run: (s) => s.toLowerCase() },
	{ id: 'text.reverse', label: 'Reverse characters', run: (s) => Array.from(s).reverse().join('') },
	{
		id: 'text.sort-lines',
		label: 'Sort lines',
		run: (s) =>
			lines(s)
				.sort((a, b) => a.localeCompare(b))
				.join('\n')
	},
	{
		id: 'text.unique-lines',
		label: 'Remove duplicate lines',
		run: (s) => [...new Set(lines(s))].join('\n')
	},
	{
		id: 'text.remove-blank',
		label: 'Remove blank lines',
		run: (s) =>
			lines(s)
				.filter((l) => l.trim())
				.join('\n')
	},
	{
		id: 'text.strip-newlines',
		label: 'Join lines (remove line breaks)',
		run: (s) => lines(s).join('')
	}
];
