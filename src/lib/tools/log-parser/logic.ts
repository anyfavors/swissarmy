/*
 * Log line parser.
 * - NCSA common and combined formats as written by Apache httpd (mod_log_config,
 *   https://httpd.apache.org/docs/current/mod/mod_log_config.html) and nginx
 *   (https://nginx.org/en/docs/http/ngx_http_log_module.html#log_format).
 * - Custom nginx log_format and Apache LogFormat definitions, turned into a line parser.
 * - Syslog: RFC 3164 (BSD) and RFC 5424, PRI decoded with the facility and severity tables
 *   of RFC 5424 section 6.2.1.
 * - JSON lines and logfmt (key=value pairs, as used by Heroku and Go's logfmt packages).
 */

export type Format =
	'combined' | 'common' | 'custom' | 'json' | 'syslog5424' | 'syslog3164' | 'logfmt';

export const FORMAT_NAMES: Record<Format, string> = {
	combined: 'Combined (nginx, Apache)',
	common: 'Common log format',
	custom: 'Custom log_format',
	json: 'JSON lines',
	syslog5424: 'Syslog RFC 5424',
	syslog3164: 'Syslog RFC 3164',
	logfmt: 'logfmt'
};

export type Fields = Record<string, string>;
export type LineParser = (line: string) => Fields | null;

/* ---------- syslog PRI ---------- */

/** RFC 5424 table 1, with the usual short keyword in front. */
export const FACILITIES = [
	'kern: kernel messages',
	'user: user-level messages',
	'mail: mail system',
	'daemon: system daemons',
	'auth: security/authorization messages',
	'syslog: messages generated internally by syslogd',
	'lpr: line printer subsystem',
	'news: network news subsystem',
	'uucp: UUCP subsystem',
	'cron: clock daemon',
	'authpriv: security/authorization messages',
	'ftp: FTP daemon',
	'ntp: NTP subsystem',
	'security: log audit',
	'console: log alert',
	'solaris-cron: clock daemon',
	'local0: local use 0',
	'local1: local use 1',
	'local2: local use 2',
	'local3: local use 3',
	'local4: local use 4',
	'local5: local use 5',
	'local6: local use 6',
	'local7: local use 7'
];

/** RFC 5424 table 2. */
export const SEVERITIES = [
	'emerg: system is unusable',
	'alert: action must be taken immediately',
	'crit: critical conditions',
	'err: error conditions',
	'warning: warning conditions',
	'notice: normal but significant condition',
	'info: informational messages',
	'debug: debug-level messages'
];

export function decodePri(pri: number): { facility: string; severity: string } {
	if (!Number.isInteger(pri) || pri < 0 || pri > 191)
		throw new Error(`PRI ${pri} is out of range 0-191`);
	return {
		facility: FACILITIES[pri >> 3].split(':')[0],
		severity: SEVERITIES[pri & 7].split(':')[0]
	};
}

function addPri(f: Fields, raw: string | undefined) {
	if (raw === undefined) return;
	const n = Number(raw);
	f.pri = raw;
	try {
		const d = decodePri(n);
		f.facility = d.facility;
		f.severity = d.severity;
	} catch {
		f.facility = '?';
		f.severity = '?';
	}
}

/* ---------- time ---------- */

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * Epoch milliseconds from the usual log time formats, or undefined. Times without a year
 * (RFC 3164) are placed in `year`; times without a zone are read as UTC.
 */
export function parseTime(s: string, year = new Date().getUTCFullYear()): number | undefined {
	const t = s.trim().replace(/^\[|\]$/g, '');
	// 10/Oct/2000:13:55:36 -0700
	let m =
		/^(\d{1,2})\/([A-Za-z]{3})\/(\d{4}):(\d\d):(\d\d):(\d\d)(?:\s*([+-])(\d\d):?(\d\d))?$/.exec(t);
	if (m) {
		const mo = MONTHS.indexOf(m[2].toLowerCase());
		if (mo < 0) return undefined;
		const off = m[7] ? (m[7] === '-' ? -1 : 1) * (Number(m[8]) * 60 + Number(m[9])) : 0;
		return Date.UTC(+m[3], mo, +m[1], +m[4], +m[5], +m[6]) - off * 60_000;
	}
	// ISO 8601 / RFC 3339
	m =
		/^(\d{4})-(\d\d)-(\d\d)[T ](\d\d):(\d\d)(?::(\d\d)(?:[.,](\d+))?)?\s*(Z|[+-]\d\d:?\d\d)?$/i.exec(
			t
		);
	if (m) {
		const ms = m[7] ? Number(('0.' + m[7]).slice(0, 5)) * 1000 : 0;
		let off = 0;
		if (m[8] && m[8].toUpperCase() !== 'Z') {
			const z = m[8].replace(':', '');
			off = (z[0] === '-' ? -1 : 1) * (Number(z.slice(1, 3)) * 60 + Number(z.slice(3, 5)));
		}
		return (
			Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0), Math.round(ms)) - off * 60_000
		);
	}
	// Oct 11 22:14:15
	m = /^([A-Za-z]{3})\s+(\d{1,2})\s+(\d\d):(\d\d):(\d\d)$/.exec(t);
	if (m) {
		const mo = MONTHS.indexOf(m[1].toLowerCase());
		if (mo < 0) return undefined;
		return Date.UTC(year, mo, +m[2], +m[3], +m[4], +m[5]);
	}
	// Epoch seconds or milliseconds (also nginx $msec, 1700000000.123)
	if (/^\d{9,13}(?:\.\d+)?$/.test(t)) {
		const n = Number(t);
		return n < 1e11 ? Math.round(n * 1000) : Math.round(n);
	}
	return undefined;
}

/* ---------- access logs ---------- */

const Q = '"((?:[^"\\\\]|\\\\.)*)"';
const COMMON_RE = new RegExp(`^(\\S+) (\\S+) (\\S+) \\[([^\\]]+)\\] ${Q} (\\d{3}|-) (\\d+|-)`);
const COMBINED_RE = new RegExp(`${COMMON_RE.source} ${Q} ${Q}`);

/** Adds method, path, query and protocol from a "GET /x?y HTTP/1.1" request line. */
function splitRequest(f: Fields) {
	const r = f.request;
	if (r === undefined) return;
	const m = /^([A-Z]+) (\S+)(?: (HTTP\/[\d.]+))?$/.exec(r);
	if (!m) return;
	f.method = m[1];
	const q = m[2].indexOf('?');
	f.path = q < 0 ? m[2] : m[2].slice(0, q);
	if (q >= 0) f.query = m[2].slice(q + 1);
	if (m[3]) f.protocol = m[3];
}

function accessParser(re: RegExp, names: string[]): LineParser {
	return (line) => {
		const m = re.exec(line);
		if (!m) return null;
		const f: Fields = {};
		names.forEach((n, i) => (f[n] = m[i + 1] ?? ''));
		splitRequest(f);
		return f;
	};
}

const COMMON_NAMES = [
	'remote_addr',
	'ident',
	'remote_user',
	'time_local',
	'request',
	'status',
	'body_bytes_sent'
];

/* ---------- custom formats ---------- */

export interface CustomFormat {
	kind: 'nginx' | 'apache';
	name?: string;
	format: string;
	fields: string[];
	regex: RegExp;
}

function escapeRe(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/** Capture for a value that runs until the next literal text. */
function captureUntil(next: string | undefined): string {
	if (next === undefined) return '(.*)';
	if (next === '') return '(.*?)';
	const c = next[0];
	if (c === '"') return '((?:[^"\\\\]|\\\\.)*)';
	return `([^${escapeRe(c)}]*)`;
}

/** Reads the quoted pieces of an nginx log_format directive and joins them. */
function nginxFormatString(def: string): { name?: string; format: string } {
	let s = def.trim().replace(/;\s*$/, '');
	let name: string | undefined;
	const head = /^log_format\s+(\S+)\s*/.exec(s);
	if (head) {
		name = head[1];
		s = s.slice(head[0].length);
		s = s.replace(/^escape=\S+\s*/, '');
	}
	if (!/^['"]/.test(s)) return { name, format: s };
	let out = '';
	const re = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(s))) out += (m[1] ?? m[2]).replace(/\\(.)/g, '$1');
	return { name, format: out };
}

/** Builds a parser from an nginx log_format definition or bare format string. */
export function nginxFormat(def: string): CustomFormat {
	const { name, format } = nginxFormatString(def);
	if (!format.includes('$')) throw new Error('No $variables found in the log_format');
	const parts = format.split(/(\$\{\w+\}|\$\w+)/);
	// parts: literal, var, literal, var, ..., literal
	const fields: string[] = [];
	let src = '^';
	for (let i = 0; i < parts.length; i++) {
		const p = parts[i];
		if (i % 2 === 0) {
			src += escapeRe(p);
			continue;
		}
		const v = p.replace(/^\$\{?|\}$/g, '');
		const nextLit = parts[i + 1];
		const atEnd = i + 1 === parts.length - 1 && nextLit === '';
		src += captureUntil(atEnd ? undefined : nextLit);
		fields.push(v);
	}
	return { kind: 'nginx', name, format, fields, regex: new RegExp(src + '$') };
}

const APACHE_DIRECTIVES: Record<string, string> = {
	a: 'client_ip',
	A: 'local_ip',
	B: 'bytes',
	b: 'body_bytes_sent',
	D: 'duration_us',
	f: 'filename',
	h: 'remote_addr',
	H: 'protocol',
	k: 'keepalive_requests',
	l: 'ident',
	L: 'log_id',
	m: 'method',
	p: 'port',
	P: 'pid',
	q: 'query_string',
	r: 'request',
	R: 'handler',
	s: 'status',
	t: 'time_local',
	T: 'duration_s',
	u: 'remote_user',
	U: 'path',
	v: 'server_name',
	V: 'server_name_used',
	X: 'connection_status',
	I: 'bytes_in',
	O: 'bytes_out',
	S: 'bytes_transferred'
};

/** Builds a parser from an Apache LogFormat line or bare format string. */
export function apacheFormat(def: string): CustomFormat {
	let s = def.trim();
	let name: string | undefined;
	const m = /^(?:Custom)?LogFormat\s+"((?:[^"\\]|\\.)*)"\s*(\S+)?/i.exec(s);
	if (m) {
		s = m[1].replace(/\\(["\\])/g, '$1');
		name = m[2];
	}
	const fields: string[] = [];
	const tokens: ({ lit: string } | { field: string; bracket?: boolean })[] = [];
	let lit = '';
	for (let i = 0; i < s.length; i++) {
		if (s[i] !== '%') {
			lit += s[i];
			continue;
		}
		const d = /^%(?:!?[\d,]+)?[<>]?(?:\{([^}]*)\})?([a-zA-Z%])/.exec(s.slice(i));
		if (!d) throw new Error(`Cannot read the directive at "${s.slice(i, i + 8)}"`);
		i += d[0].length - 1;
		const [, arg, ch] = d;
		if (ch === '%') {
			lit += '%';
			continue;
		}
		let field: string;
		if (arg !== undefined && ch === 'i') field = 'http_' + arg.toLowerCase().replace(/-/g, '_');
		else if (arg !== undefined && ch === 'o')
			field = 'sent_http_' + arg.toLowerCase().replace(/-/g, '_');
		else if (arg !== undefined && ch === 'e') field = 'env_' + arg;
		else if (arg !== undefined && ch === 'C') field = 'cookie_' + arg;
		else if (arg !== undefined && ch === 'n') field = 'note_' + arg;
		else if (arg !== undefined && ch === 't') field = 'time';
		else if (APACHE_DIRECTIVES[ch]) field = APACHE_DIRECTIVES[ch];
		else throw new Error(`Unknown directive %${ch}`);
		tokens.push({ lit });
		lit = '';
		tokens.push({ field, bracket: ch === 't' && arg === undefined });
	}
	tokens.push({ lit });
	let src = '^';
	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i];
		if ('lit' in t) {
			src += escapeRe(t.lit);
			continue;
		}
		let name = t.field;
		let n = 2;
		while (fields.includes(name)) name = `${t.field}_${n++}`;
		fields.push(name);
		if (t.bracket) {
			// %t writes the brackets itself: [10/Oct/2000:13:55:36 -0700]
			src += '\\[([^\\]]*)\\]';
			continue;
		}
		const next = tokens[i + 1] as { lit: string };
		const atEnd = i + 2 === tokens.length && next.lit === '';
		src += captureUntil(atEnd ? undefined : next.lit);
	}
	return { kind: 'apache', name, format: s, fields, regex: new RegExp(src + '$') };
}

/** Reads a custom format definition, nginx ($var) or Apache (%x). */
export function customFormat(def: string): CustomFormat {
	const t = def.trim();
	if (!t) throw new Error('Paste a log_format line or a format string');
	if (/^log_format\b/.test(t) || (t.includes('$') && !/%[>{a-zA-Z]/.test(t))) return nginxFormat(t);
	if (/^(?:Custom)?LogFormat\b/i.test(t) || /%[>{a-zA-Z]/.test(t)) return apacheFormat(t);
	throw new Error('No $variables (nginx) or %directives (Apache) found');
}

function customParser(c: CustomFormat): LineParser {
	return (line) => {
		const m = c.regex.exec(line);
		if (!m) return null;
		const f: Fields = {};
		c.fields.forEach((n, i) => (f[n] = m[i + 1] ?? ''));
		splitRequest(f);
		return f;
	};
}

/* ---------- syslog ---------- */

const RE_3164 =
	/^(?:<(\d{1,3})>)?([A-Z][a-z]{2} [ \d]\d \d\d:\d\d:\d\d) (\S+) ([^\s:[]+)(?:\[([^\]]*)\])?:? ?([\s\S]*)$/;

function parse3164(line: string): Fields | null {
	const m = RE_3164.exec(line);
	if (!m) return null;
	const f: Fields = {};
	addPri(f, m[1]);
	f.timestamp = m[2];
	f.hostname = m[3];
	f.app_name = m[4];
	if (m[5] !== undefined) f.procid = m[5];
	f.msg = m[6];
	return f;
}

const SD_RE = /^\[([^\s\]=]+)((?:\s+[^\s=\]]+="(?:[^"\\]|\\.)*")*)\s*\]/;

/** Parses RFC 5424 STRUCTURED-DATA into sd.<id>.<param> fields. Returns the rest of the text. */
function parseSd(s: string, f: Fields): string | null {
	if (s.startsWith('-')) return s.slice(1);
	if (!s.startsWith('[')) return null;
	let rest = s;
	while (rest.startsWith('[')) {
		const m = SD_RE.exec(rest);
		if (!m) return null;
		const id = m[1];
		if (!m[2].trim()) f[`sd.${id}`] = '';
		for (const p of m[2].matchAll(/([^\s=\]]+)="((?:[^"\\]|\\.)*)"/g))
			f[`sd.${id}.${p[1]}`] = p[2].replace(/\\(["\\\]])/g, '$1');
		rest = rest.slice(m[0].length);
	}
	return rest;
}

const RE_5424 = /^<(\d{1,3})>(\d{1,2}) (\S+) (\S+) (\S+) (\S+) (\S+) ([\s\S]*)$/;

function parse5424(line: string): Fields | null {
	const m = RE_5424.exec(line);
	if (!m) return null;
	const f: Fields = {};
	addPri(f, m[1]);
	f.version = m[2];
	const nil = (v: string) => (v === '-' ? '' : v);
	f.timestamp = nil(m[3]);
	f.hostname = nil(m[4]);
	f.app_name = nil(m[5]);
	f.procid = nil(m[6]);
	f.msgid = nil(m[7]);
	const rest = parseSd(m[8], f);
	if (rest === null) return null;
	// A UTF-8 message starts with a byte order mark (section 6.4).
	f.msg = rest.replace(/^ /, '').replace(/^\uFEFF/, '');
	return f;
}

/* ---------- JSON lines and logfmt ---------- */

function flatten(v: unknown, prefix: string, out: Fields, depth: number) {
	if (v !== null && typeof v === 'object' && !Array.isArray(v) && depth < 4) {
		for (const [k, x] of Object.entries(v))
			flatten(x, prefix ? `${prefix}.${k}` : k, out, depth + 1);
		return;
	}
	out[prefix || 'value'] =
		typeof v === 'string'
			? v
			: v === null
				? 'null'
				: typeof v === 'object'
					? JSON.stringify(v)
					: String(v);
}

function parseJsonLine(line: string): Fields | null {
	const t = line.trim();
	if (!t.startsWith('{')) return null;
	try {
		const v = JSON.parse(t);
		if (v === null || typeof v !== 'object' || Array.isArray(v)) return null;
		const f: Fields = {};
		flatten(v, '', f, 0);
		return f;
	} catch {
		return null;
	}
}

export function parseLogfmt(line: string): Fields | null {
	const f: Fields = {};
	let n = 0;
	const re = /([^\s=]+)(?:=("(?:[^"\\]|\\.)*"|[^\s"]*))?/g;
	let m: RegExpExecArray | null;
	let pairs = 0;
	while ((m = re.exec(line))) {
		const [, k, v] = m;
		n++;
		if (v === undefined) {
			f[k] = 'true';
			continue;
		}
		pairs++;
		if (v.startsWith('"')) {
			try {
				f[k] = JSON.parse(v) as string;
			} catch {
				f[k] = v.slice(1, -1);
			}
		} else f[k] = v;
	}
	return n && pairs ? f : null;
}

/* ---------- parsers ---------- */

export function parserFor(format: Format, custom?: CustomFormat): LineParser {
	switch (format) {
		case 'combined':
			return accessParser(COMBINED_RE, [...COMMON_NAMES, 'http_referer', 'http_user_agent']);
		case 'common':
			return accessParser(COMMON_RE, COMMON_NAMES);
		case 'custom':
			if (!custom) throw new Error('Paste the log_format definition first');
			return customParser(custom);
		case 'json':
			return parseJsonLine;
		case 'syslog5424':
			return parse5424;
		case 'syslog3164':
			return parse3164;
		case 'logfmt':
			return parseLogfmt;
	}
}

const AUTO_ORDER: Format[] = ['json', 'syslog5424', 'combined', 'common', 'syslog3164', 'logfmt'];

/** Picks the format that reads the most of the first lines, or null. */
export function detectFormat(lines: string[]): Format | null {
	const sample = lines.filter((l) => l.trim()).slice(0, 25);
	if (!sample.length) return null;
	let best: Format | null = null;
	let bestN = 0;
	for (const f of AUTO_ORDER) {
		const p = parserFor(f);
		let n = 0;
		for (const l of sample) if (p(l)) n++;
		if (n > bestN) {
			best = f;
			bestN = n;
		}
	}
	// logfmt reads almost anything with an = sign; require most lines to fit.
	if (best === 'logfmt' && bestN < sample.length * 0.8) return null;
	return best;
}

/* ---------- well-known fields ---------- */

const ROLE_KEYS: Record<'ip' | 'status' | 'path' | 'time' | 'level', string[]> = {
	ip: [
		'remote_addr',
		'client_ip',
		'clientip',
		'remote_ip',
		'ip',
		'src_ip',
		'client.ip',
		'source.ip',
		'http_x_forwarded_for'
	],
	status: [
		'status',
		'status_code',
		'statuscode',
		'http.status_code',
		'http.response.status_code',
		'response'
	],
	path: ['path', 'uri', 'request_uri', 'url.path', 'http.path', 'url'],
	time: [
		'time_local',
		'time',
		'timestamp',
		'@timestamp',
		'ts',
		'time_iso8601',
		'datetime',
		'date',
		'msec'
	],
	level: ['level', 'severity', 'lvl', 'log.level', 'loglevel']
};

export type Role = keyof typeof ROLE_KEYS;

/** The field that plays a role (client address, status, path, time), if any. */
export function roleField(fields: string[], role: Role): string | undefined {
	const lower = new Map(fields.map((f) => [f.toLowerCase(), f]));
	for (const k of ROLE_KEYS[role]) {
		const f = lower.get(k);
		if (f) return f;
	}
	return undefined;
}

/** Fields worth counting by default: status, level, client, path; or severity, host, app for syslog. */
export function defaultAggregations(r: { format: Format | null; fields: string[] }): string[] {
	if (r.format === 'syslog3164' || r.format === 'syslog5424')
		return ['severity', 'hostname', 'app_name'].filter((f) => r.fields.includes(f));
	const out: string[] = [];
	for (const role of ['status', 'level', 'ip', 'path'] as Role[]) {
		const f = roleField(r.fields, role);
		if (f && !out.includes(f)) out.push(f);
	}
	return out.slice(0, 3);
}

/* ---------- parse a paste ---------- */

export interface LogRecord {
	line: number;
	fields: Fields;
	ts?: number;
}

export interface ParseResult {
	format: Format | null;
	records: LogRecord[];
	failed: { line: number; text: string }[];
	failedCount: number;
	fields: string[];
	timeField?: string;
	range?: { from: number; to: number };
	totalLines: number;
	truncated: boolean;
}

export const MAX_LINES = 100_000;
const MAX_FAILED = 50;

export function parseLog(
	text: string,
	format: Format | 'auto',
	custom?: CustomFormat,
	year?: number
): ParseResult {
	let lines = text.split(/\r?\n/);
	if (lines.at(-1) === '') lines.pop();
	const totalLines = lines.length;
	const truncated = lines.length > MAX_LINES;
	if (truncated) lines = lines.slice(0, MAX_LINES);
	const fmt = format === 'auto' ? detectFormat(lines) : format;
	const out: ParseResult = {
		format: fmt,
		records: [],
		failed: [],
		failedCount: 0,
		fields: [],
		totalLines,
		truncated
	};
	if (!fmt) return out;
	const p = parserFor(fmt, custom);
	const seen = new Set<string>();
	lines.forEach((l, i) => {
		if (!l.trim()) return;
		const f = p(l);
		if (!f) {
			out.failedCount++;
			if (out.failed.length < MAX_FAILED) out.failed.push({ line: i + 1, text: l });
			return;
		}
		for (const k of Object.keys(f)) if (!seen.has(k)) seen.add(k);
		out.records.push({ line: i + 1, fields: f });
	});
	out.fields = [...seen];
	const tf = roleField(out.fields, 'time');
	if (tf) {
		out.timeField = tf;
		let from = Infinity;
		let to = -Infinity;
		for (const r of out.records) {
			const v = r.fields[tf];
			if (!v) continue;
			const ts = parseTime(v, year);
			if (ts === undefined) continue;
			r.ts = ts;
			if (ts < from) from = ts;
			if (ts > to) to = ts;
		}
		if (from <= to) out.range = { from, to };
	}
	return out;
}

/* ---------- aggregation ---------- */

export interface Count {
	value: string;
	count: number;
}

export function topN(
	records: LogRecord[],
	field: string,
	n = 10
): { top: Count[]; distinct: number } {
	const m = new Map<string, number>();
	for (const r of records) {
		const v = r.fields[field];
		if (v === undefined) continue;
		m.set(v, (m.get(v) ?? 0) + 1);
	}
	const top = [...m]
		.map(([value, count]) => ({ value, count }))
		.sort((a, b) => b.count - a.count || (a.value < b.value ? -1 : 1))
		.slice(0, n);
	return { top, distinct: m.size };
}

/** Human span such as "2 h 5 min" between two instants. */
export function span(ms: number): string {
	const s = Math.round(ms / 1000);
	if (s < 60) return `${s} s`;
	const d = Math.floor(s / 86400);
	const h = Math.floor((s % 86400) / 3600);
	const m = Math.floor((s % 3600) / 60);
	return [d && `${d} d`, h && `${h} h`, m && `${m} min`].filter(Boolean).join(' ') || '0 s';
}

/** All records as a JSON array of field objects. */
export function toJson(r: ParseResult): string {
	return JSON.stringify(
		r.records.map((x) => x.fields),
		null,
		2
	);
}

/* ---------- intake ---------- */

export function looksLikeLog(s: string): number {
	const lines = s
		.split(/\r?\n/)
		.filter((l) => l.trim())
		.slice(0, 10);
	if (!lines.length) return 0;
	const all = (p: LineParser) => lines.every((l) => p(l) !== null);
	if (all(parserFor('combined')) || all(parserFor('common'))) return 0.85;
	if (all(parse5424)) return 0.8;
	if (lines.every((l) => /^<\d{1,3}>/.test(l)) && all(parse3164)) return 0.75;
	if (lines.length >= 2 && all(parseJsonLine)) return 0.6;
	return 0;
}
