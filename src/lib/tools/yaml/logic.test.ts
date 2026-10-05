import { describe, expect, it } from 'vitest';
import { locate } from '../json/logic';
import {
	jsonToYaml,
	looksLikeYaml,
	needsQuotes,
	resolvePlain,
	YamlError,
	yamlToJson
} from './logic';
import { ops } from './ops';

const y = (text: string) => JSON.parse(yamlToJson(text).json);
const warnings = (text: string) => yamlToJson(text).warnings.map((w) => w.message);

function errorOf(text: string): { msg: string; line: number; col: number } {
	try {
		yamlToJson(text);
	} catch (e) {
		if (!(e instanceof YamlError)) throw e;
		const l = locate(text, e.pos);
		return { msg: e.message, line: l.line, col: l.col };
	}
	throw new Error('expected a parse error');
}

describe('yaml: real-world files', () => {
	it('reads a Kubernetes deployment', () => {
		const src = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels:
    app: web
    tier: "frontend"
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: nginx
          image: nginx:1.25.3
          ports:
            - containerPort: 80
              protocol: TCP
          env:
            - name: GREETING
              value: "hello: world"
            - name: DEBUG
              value: "false"
          resources:
            limits: {cpu: 500m, memory: 128Mi}
          args: ["--port", "80"]
`;
		expect(y(src)).toEqual({
			apiVersion: 'apps/v1',
			kind: 'Deployment',
			metadata: { name: 'web', labels: { app: 'web', tier: 'frontend' } },
			spec: {
				replicas: 3,
				selector: { matchLabels: { app: 'web' } },
				template: {
					metadata: { labels: { app: 'web' } },
					spec: {
						containers: [
							{
								name: 'nginx',
								image: 'nginx:1.25.3',
								ports: [{ containerPort: 80, protocol: 'TCP' }],
								env: [
									{ name: 'GREETING', value: 'hello: world' },
									{ name: 'DEBUG', value: 'false' }
								],
								resources: { limits: { cpu: '500m', memory: '128Mi' } },
								args: ['--port', '80']
							}
						]
					}
				}
			}
		});
	});

	it('reads a GitHub Actions workflow and flags the on: key only as a value', () => {
		const src = `name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  test:
    runs-on: \${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest]
        node: [ 20, 22 ]
    steps:
      - uses: actions/checkout@v4
      - name: Install
        run: npm ci
      - name: Test
        run: |
          npm test
          npm run check
        env:
          CI: true
`;
		const r = y(src);
		expect(r.on).toEqual({ push: { branches: ['main'] }, pull_request: null });
		expect(r.jobs.test['runs-on']).toBe('${{ matrix.os }}');
		expect(r.jobs.test.strategy.matrix.node).toEqual([20, 22]);
		expect(r.jobs.test.steps[2]).toEqual({
			name: 'Test',
			run: 'npm test\nnpm run check\n',
			env: { CI: true }
		});
		expect(warnings(src)).toEqual([]);
	});

	it('reads a docker-compose file and warns about base 60 ports', () => {
		const src = `version: "3.9"
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: example
      POSTGRES_DB: app
    ports:
      - 5432:5432
      - 22:22
      - "8080:80"
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
volumes:
  db-data: {}
`;
		const r = y(src);
		expect(r.version).toBe('3.9');
		expect(r.services.db.ports).toEqual(['5432:5432', '22:22', '8080:80']);
		expect(r.services.db.healthcheck.test).toEqual(['CMD-SHELL', 'pg_isready -U postgres']);
		expect(r.volumes).toEqual({ 'db-data': {} });
		const w = warnings(src);
		expect(w).toHaveLength(1);
		expect(w[0]).toContain('base 60');
	});

	it('reads an Ansible playbook with anchors, merge keys and the Norway problem', () => {
		const src = `---
- hosts: webservers
  become: yes
  vars:
    defaults: &defaults
      state: present
      update_cache: no
  tasks:
    - name: Install nginx
      apt:
        <<: *defaults
        name: nginx
    - name: Country
      debug:
        msg: NO
`;
		const r = y(src);
		expect(r[0].become).toBe('yes');
		expect(r[0].tasks[0].apt).toEqual({ state: 'present', update_cache: 'no', name: 'nginx' });
		const w = warnings(src);
		expect(w.length).toBe(3);
		expect(w[0]).toContain('yes is the string "yes" in YAML 1.2, but a boolean (true)');
		expect(w[1]).toContain('boolean (false)');
		expect(w.some((m) => m.startsWith('NO '))).toBe(true);
	});

	it('reads several documents as an array', () => {
		const src = `apiVersion: v1
kind: Service
---
apiVersion: v1
kind: ConfigMap
data:
  key: value
...
---
# empty document
`;
		const r = yamlToJson(src);
		expect(r.documents).toBe(3);
		expect(JSON.parse(r.json)).toEqual([
			{ apiVersion: 'v1', kind: 'Service' },
			{ apiVersion: 'v1', kind: 'ConfigMap', data: { key: 'value' } },
			null
		]);
		expect(JSON.parse(yamlToJson(src, { multi: 'first' }).json)).toEqual({
			apiVersion: 'v1',
			kind: 'Service'
		});
	});
});

describe('yaml: scalars and the core schema', () => {
	it('resolves plain scalars like YAML 1.2', () => {
		expect(
			y(`a: ~
b: null
c:
d: true
e: False
f: 0o17
g: 0x1F
h: -12
i: +1.5
j: .5
k: 1e3
l: 007
m: yes
n: 1_000
o: 2024-01-02
p: 3.
`)
		).toEqual({
			a: null,
			b: null,
			c: null,
			d: true,
			e: false,
			f: 15,
			g: 31,
			h: -12,
			i: 1.5,
			j: 0.5,
			k: 1000,
			l: 7,
			m: 'yes',
			n: '1_000',
			o: '2024-01-02',
			p: 3
		});
	});

	it('keeps number digits exactly', () => {
		expect(
			yamlToJson('n: 12345678901234567890\nf: 1.10\nh: 0xFFFFFFFFFFFFFFFFFF', { indent: 'min' })
				.json
		).toBe('{"n":12345678901234567890,"f":1.10,"h":4722366482869645213695}');
	});

	it('writes .inf and .nan as null with a warning', () => {
		const r = yamlToJson('a: .inf\nb: -.Inf\nc: .NaN');
		expect(JSON.parse(r.json)).toEqual({ a: null, b: null, c: null });
		expect(r.warnings).toHaveLength(3);
		expect(r.warnings[0].message).toBe('.inf has no JSON form, written as null');
	});

	it('warns about YAML 1.1 octal and dates', () => {
		const w = warnings('mode: 0644\nwhen: 2001-12-14\nok: "0644"');
		expect(w).toHaveLength(2);
		expect(w[0]).toContain('decimal number 644 in YAML 1.2, but octal 420');
		expect(w[1]).toContain('date');
	});

	it('handles quoted scalars and escapes', () => {
		expect(
			y(`a: 'it''s'
b: "tab\\tnew\\nline \\u00e9 \\x41 \\U0001F600 \\"q\\" \\\\"
c: '# not a comment'
d: "true"
e: 'multi
  line

  folded'
f: "join \\
   ed"
`)
		).toEqual({
			a: "it's",
			b: 'tab\tnew\nline \u00e9 A \u{1F600} "q" \\',
			c: '# not a comment',
			d: 'true',
			e: 'multi line\nfolded',
			f: 'join ed'
		});
	});

	it('folds multi-line plain scalars', () => {
		expect(y('key: first\n  second\n\n  third\nnext: 1')).toEqual({
			key: 'first second\nthird',
			next: 1
		});
	});

	it('handles comments everywhere', () => {
		expect(
			y(`# leading
a: 1 # trailing
# between
b: "x" # after quoted
c: [1, 2] # after flow
d: x#y
`)
		).toEqual({ a: 1, b: 'x', c: [1, 2], d: 'x#y' });
	});
});

describe('yaml: block scalars', () => {
	it('handles literal and folded with chomping', () => {
		const src = `clip: |
  a
  b

strip: |-
  a
  b

keep: |+
  a
  b

folded: >
  one
  two

  three
    indented
  four
last: x
`;
		expect(y(src)).toEqual({
			clip: 'a\nb\n',
			strip: 'a\nb',
			keep: 'a\nb\n\n',
			folded: 'one two\nthree\n  indented\nfour\n',
			last: 'x'
		});
	});

	it('supports indentation indicators', () => {
		expect(y('a: |2\n    leading spaces\n  normal\n')).toEqual({ a: '  leading spaces\nnormal\n' });
		expect(y('a: >-2\n   x\n  y\n')).toEqual({ a: ' x\ny' });
	});

	it('handles empty block scalars and block scalars in sequences', () => {
		expect(y('a: |\nb: >-\n')).toEqual({ a: '', b: '' });
		expect(y('- |\n  one\n- >\n  two\n  three\n')).toEqual(['one\n', 'two three\n']);
	});

	it('keeps # inside block scalars', () => {
		expect(y('s: |\n  # not a comment\n  x\n# real comment\n')).toEqual({
			s: '# not a comment\nx\n'
		});
	});
});

describe('yaml: collections', () => {
	it('reads compact and same-indent sequences', () => {
		expect(y('a:\n- 1\n- 2\nb: 3')).toEqual({ a: [1, 2], b: 3 });
		expect(y('- - a\n  - b\n- - c')).toEqual([['a', 'b'], ['c']]);
		expect(y('- name: x\n  v: 1\n-\n  name: y')).toEqual([{ name: 'x', v: 1 }, { name: 'y' }]);
	});

	it('reads flow collections across lines', () => {
		expect(
			y(`a: [1, "two", {x: y, z: [ ]}, ]
b: {
  k: v,   # comment
  "q":1,
  empty,
}
c: [a: 1, b]
d: [http://example.com, a:b]
`)
		).toEqual({
			a: [1, 'two', { x: 'y', z: [] }],
			b: { k: 'v', q: 1, empty: null },
			c: [{ a: 1 }, 'b'],
			d: ['http://example.com', 'a:b']
		});
	});

	it('reads JSON as YAML', () => {
		const json = '{"a": [1, 2.5, true, null, "x"], "b": {"c": "d"}}';
		expect(y(json)).toEqual(JSON.parse(json));
	});

	it('resolves aliases, including inside sequences', () => {
		expect(y('a: &x [1, 2]\nb: *x\nc:\n  - &s hello\n  - *s')).toEqual({
			a: [1, 2],
			b: [1, 2],
			c: ['hello', 'hello']
		});
	});

	it('merges keys: own keys win, earlier sources win', () => {
		const src = `base: &base
  a: 1
  b: 1
over: &over
  b: 2
  c: 2
x:
  <<: [*over, *base]
  c: 3
`;
		expect(y(src).x).toEqual({ b: 2, c: 3, a: 1 });
	});

	it('handles anchors on keys and properties on their own line', () => {
		expect(y('- &a key: value\n- *a')).toEqual([{ key: 'value' }, 'key']);
		expect(y('a: !!str\n  123\nb: &n\n  x: 1\nc: *n')).toEqual({
			a: '123',
			b: { x: 1 },
			c: { x: 1 }
		});
	});

	it('supports standard tags', () => {
		expect(
			y('a: !!str 1\nb: !!int "7"\nc: !!float 1\nd: !!bool "true"\ne: ! 12\nf: !!null ""')
		).toEqual({
			a: '1',
			b: 7,
			c: 1,
			d: true,
			e: '12',
			f: null
		});
	});

	it('handles CRLF and a BOM', () => {
		expect(y('\uFEFFa: 1\r\nb:\r\n  - x\r\n  - |\r\n    l1\r\n    l2\r\n')).toEqual({
			a: 1,
			b: ['x', 'l1\nl2\n']
		});
	});

	it('returns null for an empty stream', () => {
		expect(yamlToJson('# only a comment\n').json).toBe('null');
		expect(yamlToJson('').documents).toBe(0);
	});
});

describe('yaml: errors with line and column', () => {
	it('rejects custom and unsupported tags', () => {
		expect(errorOf('Resources:\n  Bucket: !Ref MyBucket')).toEqual({
			msg: 'Custom tag !Ref is not supported (for example CloudFormation !Ref or Ansible !vault), it has no JSON equivalent',
			line: 2,
			col: 11
		});
		expect(errorOf('a: !!binary R0lG').msg).toBe(
			'Tag !!binary is not supported, it has no JSON equivalent'
		);
		expect(errorOf('%TAG ! tag:example.com,2000:\n---\na: 1').msg).toContain('%TAG');
	});

	it('rejects complex keys', () => {
		expect(errorOf('? a\n: b').msg).toContain('Complex mapping keys');
		expect(errorOf('[a, b]: c').msg).toContain('Complex mapping keys');
		expect(errorOf('{a: 1}: c').msg).toContain('Complex mapping keys');
		expect(errorOf('x: {[a]: 1}').msg).toContain('Complex mapping keys');
	});

	it('rejects bad aliases', () => {
		expect(errorOf('a: *nope')).toEqual({
			msg: 'Alias *nope refers to an anchor that is not defined above',
			line: 1,
			col: 4
		});
		expect(errorOf('a: &x [1, *x]').msg).toContain('contains it');
	});

	it('stops alias bombs', () => {
		let src = 'a: &a ["lol","lol","lol","lol","lol","lol","lol","lol","lol"]\n';
		const names = 'bcdefghi';
		let prev = 'a';
		for (const n of names) {
			src += `${n}: &${n} [${Array(9).fill(`*${prev}`).join(',')}]\n`;
			prev = n;
		}
		expect(errorOf(src).msg).toContain('billion laughs');
	});

	it('reports indentation mistakes', () => {
		expect(errorOf('a:\n  b: 1\n   c: 2')).toMatchObject({ line: 3, col: 5 });
		expect(errorOf('a:\n  b:\n    x: 1\n   c: 2')).toMatchObject({
			msg: 'Bad indentation of a mapping entry',
			line: 4
		});
		expect(errorOf('a: 1\n  b: 2')).toEqual({
			msg: 'Mapping values are not allowed here, check the indentation or quote the value',
			line: 2,
			col: 4
		});
		expect(errorOf('a: b: c').msg).toContain('cannot start on the same line');
		expect(errorOf('a:\n\t- x').msg).toBe('Tab used for indentation, YAML only allows spaces');
		expect(errorOf('a: 1\n- b').msg).toContain('found a sequence entry');
		expect(errorOf('- a\nb: 1').msg).toContain('Unexpected content');
	});

	it('reports duplicate keys', () => {
		expect(errorOf('a: 1\nb: 2\na: 3')).toEqual({ msg: 'Duplicate key "a"', line: 3, col: 1 });
		expect(errorOf('{a: 1, a: 2}').msg).toBe('Duplicate key "a"');
	});

	it('reports unterminated strings and flow collections', () => {
		expect(errorOf('a: "open\nb: 1').msg).toBe('Unterminated double-quoted string');
		expect(errorOf('a: [1, 2').msg).toBe('Unterminated flow collection, expected ]');
		expect(errorOf('a: "x" y').msg).toContain('Unexpected text after the value');
		expect(errorOf('a: "\\q"').msg).toBe('Invalid escape \\q');
	});

	it('rejects reserved indicators', () => {
		expect(errorOf('a: @x').msg).toContain('reserved');
		expect(errorOf('a: %x').msg).toContain('Unexpected %');
	});

	it('rejects bad tag values', () => {
		expect(errorOf('a: !!int abc').msg).toBe('!!int value "abc" is not an integer');
	});
});

describe('yaml: JSON to YAML', () => {
	it('emits block style with indented sequences', () => {
		expect(
			jsonToYaml(
				'{"apiVersion":"v1","kind":"Pod","metadata":{"name":"x","labels":{}},"spec":{"containers":[{"name":"a","ports":[{"containerPort":80}],"args":["-v",["nested",1]]}],"tags":[]}}'
			)
		).toBe(`apiVersion: v1
kind: Pod
metadata:
  name: x
  labels: {}
spec:
  containers:
    - name: a
      ports:
        - containerPort: 80
      args:
        - '-v'
        - - nested
          - 1
  tags: []
`);
	});

	it('quotes strings that would read back as something else', () => {
		const tricky = [
			'',
			'true',
			'no',
			'Yes',
			'on',
			'null',
			'~',
			'123',
			'1.5',
			'0x1F',
			'0644',
			'1e3',
			'.inf',
			'12:30',
			'2024-01-01',
			'- item',
			'a: b',
			'x #y',
			'#c',
			'*alias',
			'&anchor',
			'!tag',
			'@at',
			'{x}',
			'[x]',
			' lead',
			'trail ',
			'<<',
			'---',
			'%x',
			'tab\there',
			'ctrl\u0007',
			'back\\slash: x'
		];
		for (const s of tricky) {
			const yaml = jsonToYaml(JSON.stringify({ k: s }));
			expect(y(yaml)).toEqual({ k: s });
			expect(needsQuotes(s)).toBe(true);
		}
		expect(jsonToYaml('{"k":"no"}')).toBe("k: 'no'\n");
		expect(jsonToYaml('{"k":"it\'s 12:30"}')).toBe("k: it's 12:30\n");
		expect(jsonToYaml('{"k":"tab\\there"}')).toBe('k: "tab\\there"\n');
	});

	it('leaves ordinary strings plain', () => {
		for (const s of [
			'hello world',
			'nginx:1.25',
			'a-b',
			'http://x.y/z?q=1',
			'C:\\path',
			'x: ',
			'éø'
		])
			expect(needsQuotes(s)).toBe(s === 'x: ');
	});

	it('uses literal blocks for multi-line strings', () => {
		expect(jsonToYaml('{"s":"a\\nb\\n","t":"a\\nb","u":"a\\n\\n","v":"  x\\ny\\n"}')).toBe(
			's: |\n  a\n  b\nt: |-\n  a\n  b\nu: |+\n  a\n\nv: |2\n    x\n  y\n'
		);
		expect(jsonToYaml('["one\\ntwo\\n"]')).toBe('- |\n  one\n  two\n');
		// Trailing spaces would be lost in a block, so these are double-quoted
		expect(jsonToYaml('{"s":"a \\nb"}')).toBe('s: "a \\nb"\n');
	});

	it('keeps numbers exactly and quotes odd keys', () => {
		expect(
			jsonToYaml('{"big":12345678901234567890,"f":1.0,"e":1E5,"true":1,"a b":2,"":3,"n":0}')
		).toBe("big: 12345678901234567890\nf: 1.0\ne: 1E5\n'true': 1\na b: 2\n'': 3\n'n': 0\n");
	});

	it('handles scalars and empty roots', () => {
		expect(jsonToYaml('"text"')).toBe('text\n');
		expect(jsonToYaml('null')).toBe('null\n');
		expect(jsonToYaml('[]')).toBe('[]\n');
		expect(jsonToYaml('{}')).toBe('{}\n');
	});

	it('round-trips', () => {
		const values = [
			{ a: [1, { b: [null, true, 'x\ny'] }], 'k:y': 'v', nested: [[[]], [{}]] },
			[{ a: 1, b: { c: ['d'] } }, 'Norway', 'NO', '', ' ', '\n', 'a\n\n\nb\n\n'],
			{ unicode: 'æøå \u2028 \u00a0 😀', esc: '\u0000\u001b' }
		];
		for (const v of values) {
			const back = y(jsonToYaml(JSON.stringify(v)));
			expect(back).toEqual(v);
		}
	});

	it('reports invalid JSON', () => {
		expect(() => jsonToYaml('{a:1}')).toThrow('Property names need double quotes');
	});
});

describe('yaml: helpers', () => {
	it('resolves with the core schema', () => {
		expect(resolvePlain('0o10')).toEqual({ type: 'number', json: '8' });
		expect(resolvePlain('-0.0')).toEqual({ type: 'number', json: '-0.0' });
		expect(resolvePlain('+5')).toEqual({ type: 'number', json: '5' });
		expect(resolvePlain('1.e2')).toEqual({ type: 'number', json: '1.0e2' });
		expect(resolvePlain('TRUE')).toEqual({ type: 'bool', value: true });
		expect(resolvePlain('tRue')).toEqual({ type: 'string', value: 'tRue' });
	});

	it('detects YAML conservatively', () => {
		expect(looksLikeYaml('apiVersion: v1\nkind: Pod\nmetadata:\n  name: x')).toBe(0.6);
		expect(looksLikeYaml('---\na: 1\nb: 2')).toBe(0.7);
		expect(looksLikeYaml('Host: example.com\nAccept: */*')).toBe(0);
		expect(looksLikeYaml('{"a": 1}')).toBe(0);
		expect(looksLikeYaml('hello world')).toBe(0);
	});
});

describe('yaml: chain ops', () => {
	const get = (id: string) => ops.find((o) => o.id === id)!;
	it('converts both ways with located errors', async () => {
		expect(await get('yaml.to-json').run('a: [1, x]')).toBe('{\n  "a": [\n    1,\n    "x"\n  ]\n}');
		expect(await get('yaml.from-json').run('{"a":"yes"}')).toBe("a: 'yes'\n");
		expect(() => get('yaml.to-json').run('a: 1\nb: !Ref x')).toThrow(/line 2 column 4/);
		expect(() => get('yaml.from-json').run('{"a":}')).toThrow(/line 1 column 6/);
	});
});
