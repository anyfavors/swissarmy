import { describe, expect, it } from 'vitest';
import { formatSql, looksLikeSql, minifySql, SqlError, tokenize } from './logic';
import { ops } from './ops';

const lines = (...l: string[]) => l.join('\n');

describe('sql: formatting', () => {
	it('lays out SELECT, JOIN, WHERE, GROUP BY, HAVING, ORDER BY and LIMIT', () => {
		expect(
			formatSql(
				"select a, b as c, count(*) from users u left join orders o on o.user_id = u.id and o.status = 'paid' where u.active = true and (u.age > 18 or u.vip) group by a, b having count(*) > 1 order by a desc limit 10 offset 5"
			)
		).toBe(
			lines(
				'SELECT',
				'  a,',
				'  b AS c,',
				'  count(*)',
				'FROM',
				'  users u',
				'  LEFT JOIN orders o ON o.user_id = u.id',
				"    AND o.status = 'paid'",
				'WHERE',
				'  u.active = TRUE',
				'  AND (u.age > 18 OR u.vip)',
				'GROUP BY',
				'  a,',
				'  b',
				'HAVING',
				'  count(*) > 1',
				'ORDER BY',
				'  a DESC',
				'LIMIT 10',
				'OFFSET 5'
			)
		);
	});

	it('formats CTEs', () => {
		expect(
			formatSql(
				"with recent as (select * from orders where created_at > now() - interval '7 days'), totals as (select user_id, sum(amount) total from recent group by user_id) select u.name, t.total from users u join totals t on t.user_id = u.id"
			)
		).toBe(
			lines(
				'WITH',
				'  recent AS (',
				'    SELECT',
				'      *',
				'    FROM',
				'      orders',
				'    WHERE',
				"      created_at > now() - INTERVAL '7 days'",
				'  ),',
				'  totals AS (',
				'    SELECT',
				'      user_id,',
				'      sum(amount) total',
				'    FROM',
				'      recent',
				'    GROUP BY',
				'      user_id',
				'  )',
				'SELECT',
				'  u.name,',
				'  t.total',
				'FROM',
				'  users u',
				'  JOIN totals t ON t.user_id = u.id'
			)
		);
	});

	it('formats CASE, BETWEEN and IN subqueries', () => {
		expect(
			formatSql(
				"SELECT id, CASE WHEN score >= 90 THEN 'A' WHEN score BETWEEN 80 AND 89 THEN 'B' ELSE 'C' END AS grade FROM results WHERE id IN (SELECT result_id FROM flags WHERE flagged = 1)"
			)
		).toBe(
			lines(
				'SELECT',
				'  id,',
				'  CASE',
				"    WHEN score >= 90 THEN 'A'",
				"    WHEN score BETWEEN 80 AND 89 THEN 'B'",
				"    ELSE 'C'",
				'  END AS grade',
				'FROM',
				'  results',
				'WHERE',
				'  id IN (',
				'    SELECT',
				'      result_id',
				'    FROM',
				'      flags',
				'    WHERE',
				'      flagged = 1',
				'  )'
			)
		);
	});

	it('formats derived tables and EXISTS', () => {
		expect(
			formatSql(
				'SELECT * FROM (SELECT a FROM t) sub WHERE EXISTS (SELECT 1 FROM u WHERE u.id = sub.a)'
			)
		).toBe(
			lines(
				'SELECT',
				'  *',
				'FROM',
				'  (',
				'    SELECT',
				'      a',
				'    FROM',
				'      t',
				'  ) sub',
				'WHERE',
				'  EXISTS (',
				'    SELECT',
				'      1',
				'    FROM',
				'      u',
				'    WHERE',
				'      u.id = sub.a',
				'  )'
			)
		);
	});

	it('formats INSERT, UPDATE and DELETE', () => {
		expect(formatSql("insert into t (a, b) values (1, 'x'), (2, 'it''s')")).toBe(
			lines('INSERT INTO', '  t (a, b)', 'VALUES', "  (1, 'x'),", "  (2, 'it''s')")
		);
		expect(
			formatSql(
				'update accounts set balance = balance - 100, updated_at = now() where id = 42 returning *'
			)
		).toBe(
			lines(
				'UPDATE',
				'  accounts',
				'SET',
				'  balance = balance - 100,',
				'  updated_at = now()',
				'WHERE',
				'  id = 42',
				'RETURNING',
				'  *'
			)
		);
		expect(
			formatSql('delete from sessions where expires_at < now() -- old\n and user_id = $1')
		).toBe(
			lines(
				'DELETE FROM',
				'  sessions',
				'WHERE',
				'  expires_at < now() -- old',
				'  AND user_id = $1'
			)
		);
		expect(
			formatSql(
				"insert into t (id, n) values (1, 'a') on conflict (id) do update set n = excluded.n"
			)
		).toBe(
			lines(
				'INSERT INTO',
				'  t (id, n)',
				'VALUES',
				"  (1, 'a')",
				'ON CONFLICT (id) DO UPDATE SET n = excluded.n'
			)
		);
	});

	it('leaves strings, quoted identifiers and comments untouched', () => {
		expect(
			formatSql(
				'/* header */\nselect "Weird Col", `tick`, [bracket] from [dbo].[t] where x::int = -1 and arr[1] = :name and y = @var;select \'select from where\''
			)
		).toBe(
			lines(
				'/* header */',
				'SELECT',
				'  "Weird Col",',
				'  `tick`,',
				'  [bracket]',
				'FROM',
				'  [dbo].[t]',
				'WHERE',
				'  x::int = -1',
				'  AND arr[1] = :name',
				'  AND y = @var;',
				'',
				'SELECT',
				"  'select from where'"
			)
		);
	});

	it('keeps window specs, set operations and DISTINCT FROM inline', () => {
		expect(formatSql('select row_number() over (partition by a order by b desc) rn from t')).toBe(
			lines('SELECT', '  row_number() OVER (PARTITION BY a ORDER BY b DESC) rn', 'FROM', '  t')
		);
		expect(formatSql('select * from a union all select * from b')).toBe(
			lines('SELECT', '  *', 'FROM', '  a', 'UNION ALL', 'SELECT', '  *', 'FROM', '  b')
		);
		expect(
			formatSql("select a from t where b is distinct from c and d not in (1, 2, 3) and e like 'x%'")
		).toBe(
			lines(
				'SELECT',
				'  a',
				'FROM',
				'  t',
				'WHERE',
				'  b IS DISTINCT FROM c',
				'  AND d NOT IN (1, 2, 3)',
				"  AND e LIKE 'x%'"
			)
		);
	});

	it('supports lower case, preserved case and 4 spaces', () => {
		expect(formatSql('SELECT a FROM t WHERE b = 1', { keywordCase: 'lower', indent: 4 })).toBe(
			lines('select', '    a', 'from', '    t', 'where', '    b = 1')
		);
		expect(formatSql('Select a From t', { keywordCase: 'preserve' })).toBe(
			lines('Select', '  a', 'From', '  t')
		);
		expect(formatSql('select a from t', { indent: 'tab' })).toBe('SELECT\n\ta\nFROM\n\tt');
	});

	it('does not uppercase identifiers after a dot or common column names', () => {
		expect(formatSql('select t.select, name, date, value from t')).toBe(
			lines('SELECT', '  t.select,', '  name,', '  date,', '  value', 'FROM', '  t')
		);
	});

	it('handles E strings, dollar quoting and numbers', () => {
		expect(formatSql("select e'it\\'s', $$a; 'b'$$, $fn$x$fn$, 1.5e-3, .5, 0xFF")).toBe(
			lines(
				'SELECT',
				"  e'it\\'s',",
				"  $$a; 'b'$$,",
				'  $fn$x$fn$,',
				'  1.5e-3,',
				'  .5,',
				'  0xFF'
			)
		);
	});

	it('is idempotent', () => {
		const q =
			'with x as (select a, case when b then 1 else 0 end c from t left join u on u.id = t.id and u.k = 1 where a between 1 and 2 or b) select * from x order by a';
		const once = formatSql(q);
		expect(formatSql(once)).toBe(once);
	});

	it('reports unterminated strings and comments', () => {
		expect(() => formatSql("select 'open")).toThrow(SqlError);
		expect(() => formatSql("select 'open")).toThrow('Unterminated string');
		expect(() => formatSql('select /* x')).toThrow('Unterminated /* comment');
		expect(() => formatSql('select "x')).toThrow('Unterminated quoted identifier');
		expect(() => formatSql('select $$x')).toThrow('Unterminated dollar-quoted string');
	});
});

describe('sql: minify', () => {
	it('collapses white space and drops comments but keeps hints', () => {
		expect(minifySql('SELECT  a ,  b -- c\nFROM t /* x */ WHERE x = - 1 AND f( 1 )')).toBe(
			'SELECT a, b FROM t WHERE x = -1 AND f(1)'
		);
		expect(minifySql('SELECT /*+ INDEX(t i) */ a FROM t')).toBe(
			'SELECT /*+ INDEX(t i) */ a FROM t'
		);
		expect(minifySql("select 'a  --  b', x::text")).toBe("select 'a  --  b', x::text");
		expect(minifySql('insert into t (a) values (1)')).toBe('insert into t (a) values (1)');
	});

	it('round-trips through format', () => {
		const q = "SELECT a, b FROM t JOIN u ON u.id = t.id WHERE a IN (SELECT x FROM y) AND b = 'z'";
		expect(minifySql(formatSql(q))).toBe(q);
	});
});

describe('sql: tokenizer and detection', () => {
	it('tells bracket identifiers from subscripts', () => {
		expect(tokenize('select [a] from t where x[1] = ARRAY[1]').map((t) => t.type)).toEqual([
			'word',
			'ident',
			'word',
			'word',
			'word',
			'word',
			'open',
			'number',
			'close',
			'op',
			'word',
			'open',
			'number',
			'close'
		]);
	});

	it('detects SQL', () => {
		expect(looksLikeSql('SELECT * FROM t')).toBe(0.7);
		expect(looksLikeSql('update t set a = 1')).toBe(0.7);
		expect(looksLikeSql('select the best option')).toBe(0);
		expect(looksLikeSql('{"a":1}')).toBe(0);
	});

	it('chain ops format and minify', async () => {
		const get = (id: string) => ops.find((o) => o.id === id)!;
		expect(await get('sql-format.format').run('select 1')).toBe('SELECT\n  1');
		expect(await get('sql-format.minify').run('select\n  1')).toBe('select 1');
		expect(() => get('sql-format.format').run("select\n'x")).toThrow('line 2 column 1');
	});
});
