import type { ToolMeta } from '../types';

export const meta: ToolMeta = {
	id: 'sql-format',
	chapter: 5,
	section: 8,
	title: 'SQL formatter',
	summary: 'Format or minify SQL: clauses, joins, conditions, subqueries, CASE and CTEs laid out.',
	keywords: [
		'sql',
		'format',
		'beautify',
		'pretty print',
		'minify',
		'query',
		'postgres',
		'mysql',
		'sqlite',
		't-sql'
	],
	network: false,
	chain: { in: 'text', out: 'text' }
};
