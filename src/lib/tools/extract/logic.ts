/**
 * Finds indicators in free text. Each kind is a regex that finds candidates, plus a validator
 * where a regex alone would accept junk (IP octets above 255, malformed IPv6).
 */

export type Kind =
	| 'ipv4'
	| 'ipv6'
	| 'cidr'
	| 'email'
	| 'url'
	| 'domain'
	| 'mac'
	| 'md5'
	| 'sha1'
	| 'sha256'
	| 'sha512'
	| 'cve'
	| 'winpath'
	| 'uuid'
	| 'arn';

export const kinds: { id: Kind; label: string }[] = [
	{ id: 'ipv4', label: 'IPv4' },
	{ id: 'ipv6', label: 'IPv6' },
	{ id: 'cidr', label: 'CIDR' },
	{ id: 'url', label: 'URL' },
	{ id: 'domain', label: 'Domain' },
	{ id: 'email', label: 'Email' },
	{ id: 'mac', label: 'MAC' },
	{ id: 'md5', label: 'MD5' },
	{ id: 'sha1', label: 'SHA-1' },
	{ id: 'sha256', label: 'SHA-256' },
	{ id: 'sha512', label: 'SHA-512' },
	{ id: 'cve', label: 'CVE' },
	{ id: 'uuid', label: 'UUID' },
	{ id: 'winpath', label: 'Windows path' },
	{ id: 'arn', label: 'AWS ARN' }
];

export function isIPv4(s: string): boolean {
	const p = s.split('.');
	return p.length === 4 && p.every((o) => /^(0|[1-9]\d{0,2})$/.test(o) && Number(o) <= 255);
}

export function isIPv6(s: string): boolean {
	let str = s;
	const lastColon = str.lastIndexOf(':');
	const tail = str.slice(lastColon + 1);
	if (tail.includes('.')) {
		if (!isIPv4(tail)) return false;
		str = str.slice(0, lastColon + 1) + '0:0';
	}
	const dbl = str.split('::');
	if (dbl.length > 2) return false;
	const parse = (part: string) => (part === '' ? [] : part.split(':'));
	const head = parse(dbl[0]);
	const rest = dbl.length === 2 ? parse(dbl[1]) : [];
	const all = [...head, ...rest];
	if (!all.every((g) => /^[0-9a-fA-F]{1,4}$/.test(g))) return false;
	// With :: at least one group is compressed, so fewer than 8 are written.
	return dbl.length === 2 ? all.length < 8 : all.length === 8;
}

// Trailing characters that are usually sentence punctuation, not part of the value.
const TRAIL = /[.,;:!?'"*>\]}]+$/;

function trimUrl(u: string): string {
	let s = u.replace(TRAIL, '');
	// Drop a closing parenthesis only when it is unbalanced: (see https://x.dk/a_(b))
	while (s.endsWith(')') && (s.match(/\(/g)?.length ?? 0) < (s.match(/\)/g)?.length ?? 0)) {
		s = s.slice(0, -1).replace(TRAIL, '');
	}
	return s;
}

// Common file extensions that would otherwise be read as top-level domains (report.pdf, logic.ts).
// Some are real TLDs (.zip, .mov, .sh, .py), so a name like x.zip is skipped by design.
const FILE_EXT = new Set(
	'exe dll sys bat cmd ps1 psm1 vbs js mjs cjs ts tsx jsx json txt log ini cfg conf yml yaml toml xml html htm css scss md pdf doc docx xls xlsx ppt pptx csv tsv png jpg jpeg gif bmp svg webp ico tif tiff mp3 mp4 mov avi mkv wav zip gz tgz bz2 xz tar rar 7z iso img msi dmg pkg deb rpm apk jar war class py pyc rb pl php sh java c h cpp hpp cs go rs swift kt lua sql db bak tmp old lnk eml msg pst ost key pem crt cer der p12 pfx csr'.split(
		' '
	)
);

interface Finder {
	re: RegExp;
	clean?: (m: string) => string;
	valid?: (m: string) => boolean;
	norm?: (m: string) => string;
}

const IPV4 = String.raw`(?:\d{1,3}\.){3}\d{1,3}`;
const IPV6C = String.raw`[0-9A-Fa-f]{0,4}(?::[0-9A-Fa-f]{0,4}){2,7}(?:\.\d{1,3}){0,3}`;

const finders: Record<Kind, Finder> = {
	ipv4: {
		re: new RegExp(String.raw`(?<![\w.])${IPV4}(?![\w/]|\.\d)`, 'g'),
		valid: isIPv4
	},
	ipv6: {
		re: new RegExp(String.raw`(?<![\w:.])${IPV6C}(?![\w:/])`, 'g'),
		valid: (m) => /[0-9a-fA-F]/.test(m) && m.includes(':') && isIPv6(m),
		norm: (m) => m.toLowerCase()
	},
	cidr: {
		re: new RegExp(String.raw`(?<![\w.:])(?:${IPV4}|${IPV6C})\/\d{1,3}(?![\w/]|\.\d)`, 'g'),
		valid: (m) => {
			const [ip, len] = m.split('/');
			const n = Number(len);
			if (/^0\d/.test(len)) return false;
			return ip.includes(':') ? isIPv6(ip) && n <= 128 : isIPv4(ip) && n <= 32;
		},
		norm: (m) => m.toLowerCase()
	},
	email: {
		re: /(?<![\w.+-])[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}(?![\w-])/g,
		valid: (m) => !m.startsWith('.') && !m.includes('..') && !m.split('@')[0].endsWith('.'),
		norm: (m) => {
			const [l, d] = m.split('@');
			return `${l}@${d.toLowerCase()}`;
		}
	},
	url: {
		re: /\b(?:https?|ftp|wss?):\/\/[^\s<>"'`{}|\\^]+/gi,
		clean: trimUrl,
		valid: (m) => /:\/\/[^/?#]+/.test(m)
	},
	domain: {
		re: /(?<![\w.-])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9](?![\w@+%-]|\.[a-z0-9])/gi,
		valid: (m) => {
			const tld = m.slice(m.lastIndexOf('.') + 1).toLowerCase();
			return !FILE_EXT.has(tld) && /^(?:[a-z]{2,63}|xn--[a-z0-9-]+)$/.test(tld) && m.length <= 253;
		},
		norm: (m) => m.toLowerCase()
	},
	mac: {
		re: /(?<![\w:.-])(?:[0-9A-Fa-f]{2}([:-])(?:[0-9A-Fa-f]{2}\1){4}[0-9A-Fa-f]{2}|[0-9A-Fa-f]{4}\.[0-9A-Fa-f]{4}\.[0-9A-Fa-f]{4})(?![\w:.-])/g,
		norm: (m) => m.toLowerCase()
	},
	md5: { re: /(?<![\w-])[0-9A-Fa-f]{32}(?![\w-])/g, norm: (m) => m.toLowerCase() },
	sha1: { re: /(?<![\w-])[0-9A-Fa-f]{40}(?![\w-])/g, norm: (m) => m.toLowerCase() },
	sha256: { re: /(?<![\w-])[0-9A-Fa-f]{64}(?![\w-])/g, norm: (m) => m.toLowerCase() },
	sha512: { re: /(?<![\w-])[0-9A-Fa-f]{128}(?![\w-])/g, norm: (m) => m.toLowerCase() },
	cve: { re: /\bCVE-(?:19|20)\d{2}-\d{4,7}\b/gi, norm: (m) => m.toUpperCase() },
	uuid: {
		re: /(?<![\w-])[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}(?![\w-])/g,
		norm: (m) => m.toLowerCase()
	},
	winpath: {
		// Quoted paths may contain spaces; unquoted ones end at the first space.
		re: /"(?:[A-Za-z]:\\|\\\\[\w.$-]+\\)[^"\r\n<>|*?]*"|(?<![\w\\])(?:[A-Za-z]:\\|\\\\[\w.$-]+\\[\w.$-])[^\s"<>|*?]*/g,
		clean: (m) => (m.startsWith('"') ? m.slice(1, -1) : m.replace(/[.,;:!?)'\]]+$/, ''))
	},
	arn: {
		re: /\barn:aws(?:-cn|-us-gov|-iso|-iso-b)?:[a-z0-9-]+:[a-z0-9-]*:(?:\d{12}|aws)?:[^\s"'<>,;`]+/g,
		clean: (m) => m.replace(/[.)\]}]+$/, '')
	}
};

export interface Options {
	dedupe: boolean;
	sort: boolean;
}

/** Finds all values of one kind, in order of appearance. */
export function find(
	text: string,
	kind: Kind,
	opts: Options = { dedupe: true, sort: false }
): string[] {
	const f = finders[kind];
	const out: string[] = [];
	for (const m of text.matchAll(f.re)) {
		let v = f.clean ? f.clean(m[0]) : m[0];
		if (!v || (f.valid && !f.valid(v))) continue;
		if (f.norm) v = f.norm(v);
		out.push(v);
	}
	let res = opts.dedupe ? [...new Set(out)] : out;
	if (opts.sort) res = [...res].sort(kind === 'ipv4' || kind === 'cidr' ? ipSort : undefined);
	return res;
}

function ipSort(a: string, b: string): number {
	const key = (s: string) =>
		s
			.split('/')[0]
			.split('.')
			.map((o) => o.padStart(3, '0'))
			.join('.') + (s.includes('/') ? '/' + s.split('/')[1].padStart(3, '0') : '');
	return key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0;
}

/** Runs every selected kind. Refangs first, so defanged indicators are found too. */
export function extractAll(
	text: string,
	selected: Kind[],
	opts: Options
): { kind: Kind; label: string; values: string[] }[] {
	const t = refang(text);
	return kinds
		.filter((k) => selected.includes(k.id))
		.map((k) => ({ kind: k.id, label: k.label, values: find(t, k.id, opts) }));
}

/** Defangs one indicator: hxxps[:]//example[.]com, user[@]example[.]com, 192.0.2[.]1 style. */
export function defangValue(v: string): string {
	return v
		.replace(/^(h)tt(ps?)/i, (_, h, p) => `${h}xx${p}`)
		.replace(/^ftp/i, 'fxp')
		.replace(/^(\w+):\/\//, '$1[:]//')
		.replace(/@/g, '[@]')
		.replace(/\./g, '[.]');
}

/**
 * Defangs the URLs, emails, IPv4 addresses and domains found in text, leaving the rest alone.
 * In a URL only the scheme and the host are changed, so paths stay readable.
 */
export function defang(text: string): string {
	const t = refang(text);
	const spans: { start: number; end: number; rep: string }[] = [];
	const collect = (kind: Kind, rep: (v: string) => string) => {
		const f = finders[kind];
		for (const m of t.matchAll(f.re)) {
			const v = f.clean ? f.clean(m[0]) : m[0];
			if (!v || (f.valid && !f.valid(v))) continue;
			const start = m.index!;
			const end = start + v.length;
			if (spans.some((s) => start < s.end && end > s.start)) continue;
			spans.push({ start, end, rep: rep(v) });
		}
	};
	collect('url', (u) => {
		const i = u.indexOf('://');
		const hostEnd = u.slice(i + 3).search(/[/?#]/);
		const cut = hostEnd < 0 ? u.length : i + 3 + hostEnd;
		return defangValue(u.slice(0, cut)) + u.slice(cut);
	});
	collect('email', defangValue);
	collect('cidr', defangValue);
	collect('ipv4', defangValue);
	collect('domain', defangValue);
	spans.sort((a, b) => a.start - b.start);
	let out = '';
	let pos = 0;
	for (const s of spans) {
		out += t.slice(pos, s.start) + s.rep;
		pos = s.end;
	}
	return out + t.slice(pos);
}

/** Reverses common defanging styles: hxxp, fxp, [.], (.), {.}, [dot], [:], [://], [@], [at]. */
export function refang(text: string): string {
	return text
		.replace(/\bh(?:xx|XX|\[xx\]|\*\*)p(s?)(?=\[?:|:)/g, 'http$1')
		.replace(/\bfxp(?=\[?:)/gi, 'ftp')
		.replace(/\[:\/\/\]/g, '://')
		.replace(/\[:\]/g, ':')
		.replace(/\s?(?:\[\.\]|\(\.\)|\{\.\}|\[dot\]|\(dot\)|\{dot\})\s?/gi, '.')
		.replace(/\s?(?:\[@\]|\(@\)|\{@\}|\[at\]|\(at\)|\{at\})\s?/gi, '@');
}

export { looksDefanged } from './detect';
