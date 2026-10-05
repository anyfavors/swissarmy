/*
 * DMARC aggregate reports.
 * Format: RFC 7489 appendix C (XML schema), also the DMARCbis aggregate reporting draft, whose
 * files use a namespace and may add np, testing and envelope_from. Elements are matched by local
 * name, so both work.
 * Containers: gzip (RFC 1952) and ZIP (PKWARE APPNOTE.TXT, local file header and central
 * directory). Decompression uses the browser's DecompressionStream.
 */

/* ------------------------------------------------------------------ */
/* Containers                                                          */
/* ------------------------------------------------------------------ */

export type Container = 'gzip' | 'zip' | 'xml';

export function sniff(b: Uint8Array): Container {
	if (b[0] === 0x1f && b[1] === 0x8b) return 'gzip';
	if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return 'zip';
	return 'xml';
}

/** Refuse to inflate more than this, guards against zip bombs. */
export const MAX_OUTPUT = 256 * 1024 * 1024;

async function decompress(
	data: Uint8Array,
	format: 'gzip' | 'deflate-raw',
	limit = MAX_OUTPUT
): Promise<Uint8Array> {
	const input = new ReadableStream<Uint8Array>({
		start(c) {
			c.enqueue(data);
			c.close();
		}
	});
	const reader = input
		.pipeThrough(
			new DecompressionStream(format) as unknown as TransformStream<Uint8Array, Uint8Array>
		)
		.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.length;
			if (size > limit) {
				await reader.cancel();
				throw new Error(`Decompressed size is over ${Math.round(limit / 1048576)} MB, stopped`);
			}
			chunks.push(value);
		}
	} catch (e) {
		if ((e as Error).message.startsWith('Decompressed size')) throw e;
		throw new Error(
			`The ${format === 'gzip' ? 'gzip' : 'deflate'} data is damaged or truncated (${(e as Error).message})`
		);
	}
	const out = new Uint8Array(size);
	let o = 0;
	for (const c of chunks) {
		out.set(c, o);
		o += c.length;
	}
	return out;
}

export function gunzip(data: Uint8Array): Promise<Uint8Array> {
	return decompress(data, 'gzip');
}

let crcTable: Uint32Array | null = null;

/** CRC-32 as used by ZIP and gzip (IEEE 802.3 polynomial, reflected). */
export function crc32(b: Uint8Array): number {
	if (!crcTable) {
		crcTable = new Uint32Array(256);
		for (let n = 0; n < 256; n++) {
			let c = n;
			for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
			crcTable[n] = c >>> 0;
		}
	}
	let c = 0xffffffff;
	for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
	name: string;
	method: number;
	flags: number;
	crc: number;
	compressedSize: number;
	size: number;
	/** Offset of the local file header. */
	offset: number;
}

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) =>
	(b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

function entryName(b: Uint8Array, flags: number): string {
	// Bit 11: name is UTF-8. Otherwise CP437; ASCII names read the same either way.
	return new TextDecoder(flags & 0x800 ? 'utf-8' : 'latin1').decode(b);
}

/** Lists entries from the central directory, or by walking local headers when there is none. */
export function zipEntries(b: Uint8Array): ZipEntry[] {
	let eocd = -1;
	for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) {
		if (u32(b, i) === 0x06054b50) {
			eocd = i;
			break;
		}
	}
	const entries: ZipEntry[] = [];
	if (eocd >= 0) {
		const count = u16(b, eocd + 10);
		let p = u32(b, eocd + 16);
		if (p === 0xffffffff || count === 0xffff) throw new Error('ZIP64 archives are not supported');
		for (let k = 0; k < count; k++) {
			if (p + 46 > b.length || u32(b, p) !== 0x02014b50)
				throw new Error('The ZIP central directory is damaged');
			const flags = u16(b, p + 8);
			const nameLen = u16(b, p + 28);
			const extraLen = u16(b, p + 30);
			const commentLen = u16(b, p + 32);
			entries.push({
				flags,
				method: u16(b, p + 10),
				crc: u32(b, p + 16),
				compressedSize: u32(b, p + 20),
				size: u32(b, p + 24),
				offset: u32(b, p + 42),
				name: entryName(b.subarray(p + 46, p + 46 + nameLen), flags)
			});
			p += 46 + nameLen + extraLen + commentLen;
		}
		return entries;
	}
	// No central directory (truncated download): walk local headers.
	let p = 0;
	while (p + 30 <= b.length && u32(b, p) === 0x04034b50) {
		const flags = u16(b, p + 6);
		if (flags & 0x8)
			throw new Error('The ZIP file is truncated and its sizes are stored after the data');
		const nameLen = u16(b, p + 26);
		const extraLen = u16(b, p + 28);
		const e: ZipEntry = {
			flags,
			method: u16(b, p + 8),
			crc: u32(b, p + 14),
			compressedSize: u32(b, p + 18),
			size: u32(b, p + 22),
			offset: p,
			name: entryName(b.subarray(p + 30, p + 30 + nameLen), flags)
		};
		entries.push(e);
		p += 30 + nameLen + extraLen + e.compressedSize;
	}
	if (!entries.length) throw new Error('No files found in the ZIP archive');
	return entries;
}

/** Extracts one entry: stored (method 0) or deflate (method 8). Checks the CRC. */
export async function zipExtract(b: Uint8Array, e: ZipEntry): Promise<Uint8Array> {
	if (e.flags & 0x1) throw new Error(`${e.name} is encrypted`);
	const p = e.offset;
	if (p + 30 > b.length || u32(b, p) !== 0x04034b50)
		throw new Error(`Local header of ${e.name} not found`);
	const start = p + 30 + u16(b, p + 26) + u16(b, p + 28);
	const end = start + e.compressedSize;
	if (end > b.length) throw new Error(`${e.name} is cut off: the ZIP file is incomplete`);
	const raw = b.subarray(start, end);
	let out: Uint8Array;
	if (e.method === 0) out = raw;
	else if (e.method === 8) out = await decompress(raw, 'deflate-raw');
	else
		throw new Error(
			`${e.name} uses compression method ${e.method}, only stored and deflate are supported`
		);
	if (out.length !== e.size) throw new Error(`${e.name}: size after inflating does not match`);
	if (crc32(out) !== e.crc) throw new Error(`${e.name}: CRC check failed, the file is damaged`);
	return out;
}

export interface XmlFile {
	name: string;
	text: string;
}

/** Turns an uploaded file into one or more XML texts. */
export async function openFile(name: string, bytes: Uint8Array): Promise<XmlFile[]> {
	const kind = sniff(bytes);
	const dec = new TextDecoder();
	if (kind === 'xml') return [{ name, text: dec.decode(bytes) }];
	if (kind === 'gzip')
		return [{ name: name.replace(/\.gz$/i, ''), text: dec.decode(await gunzip(bytes)) }];
	const entries = zipEntries(bytes).filter((e) => !e.name.endsWith('/'));
	const xml = entries.filter((e) => /\.xml$/i.test(e.name));
	const pick = xml.length ? xml : entries;
	if (!pick.length) throw new Error('The ZIP archive is empty');
	const out: XmlFile[] = [];
	for (const e of pick) {
		let data = await zipExtract(bytes, e);
		if (sniff(data) === 'gzip') data = await gunzip(data);
		out.push({ name: e.name, text: dec.decode(data) });
	}
	return out;
}

/* ------------------------------------------------------------------ */
/* XML to report                                                       */
/* ------------------------------------------------------------------ */

/**
 * The parts of a DOM Element this code reads. In the browser this is a real Element from
 * DOMParser; tests pass plain objects of the same shape.
 */
export interface XEl {
	localName: string;
	children: ArrayLike<XEl>;
	textContent: string | null;
}

function kids(el: XEl | undefined, name: string): XEl[] {
	if (!el) return [];
	const out: XEl[] = [];
	for (let i = 0; i < el.children.length; i++)
		if (el.children[i].localName === name) out.push(el.children[i]);
	return out;
}

const kid = (el: XEl | undefined, name: string) => kids(el, name)[0];
const txt = (el: XEl | undefined, name: string) => kid(el, name)?.textContent?.trim() || undefined;

export interface ReportRecord {
	sourceIp: string;
	count: number;
	disposition: string;
	dkimEval: string;
	spfEval: string;
	reasons: { type: string; comment?: string }[];
	headerFrom?: string;
	envelopeFrom?: string;
	dkim: { domain: string; selector?: string; result: string }[];
	spf: { domain: string; scope?: string; result: string }[];
}

export interface Report {
	version?: string;
	meta: {
		orgName?: string;
		email?: string;
		extra?: string;
		reportId?: string;
		begin?: number;
		end?: number;
		errors: string[];
	};
	policy: Record<string, string>;
	records: ReportRecord[];
}

/** Gives the browser a chance to paint between batches. */
const pause = () => new Promise<void>((r) => setTimeout(r, 0));

export function readRecord(r: XEl): ReportRecord {
	const row = kid(r, 'row');
	const pe = kid(row, 'policy_evaluated');
	const ids = kid(r, 'identifiers');
	const auth = kid(r, 'auth_results');
	const count = Number(txt(row, 'count') ?? '0');
	return {
		sourceIp: txt(row, 'source_ip') ?? '(missing)',
		count: Number.isFinite(count) ? count : 0,
		disposition: txt(pe, 'disposition') ?? 'none',
		dkimEval: txt(pe, 'dkim') ?? 'fail',
		spfEval: txt(pe, 'spf') ?? 'fail',
		reasons: kids(pe, 'reason').map((x) => ({
			type: txt(x, 'type') ?? '',
			comment: txt(x, 'comment')
		})),
		headerFrom: txt(ids, 'header_from'),
		envelopeFrom: txt(ids, 'envelope_from'),
		dkim: kids(auth, 'dkim').map((x) => ({
			domain: txt(x, 'domain') ?? '',
			selector: txt(x, 'selector'),
			result: txt(x, 'result') ?? ''
		})),
		spf: kids(auth, 'spf').map((x) => ({
			domain: txt(x, 'domain') ?? '',
			scope: txt(x, 'scope'),
			result: txt(x, 'result') ?? ''
		}))
	};
}

/** Reads a parsed report. Works through records in batches so a large file does not freeze the page. */
export async function readReport(
	root: XEl,
	onProgress?: (done: number, total: number) => void,
	batch = 2000
): Promise<Report> {
	if (root.localName !== 'feedback')
		throw new Error(
			`Not a DMARC aggregate report: the root element is <${root.localName}>, expected <feedback>`
		);
	const md = kid(root, 'report_metadata');
	const range = kid(md, 'date_range');
	const pp = kid(root, 'policy_published');
	const policy: Record<string, string> = {};
	if (pp)
		for (let i = 0; i < pp.children.length; i++) {
			const c = pp.children[i];
			policy[c.localName] = c.textContent?.trim() ?? '';
		}
	const num = (s?: string) => (s && /^\d+$/.test(s) ? Number(s) : undefined);
	const recs = kids(root, 'record');
	const records: ReportRecord[] = [];
	for (let i = 0; i < recs.length; i++) {
		records.push(readRecord(recs[i]));
		if ((i + 1) % batch === 0) {
			onProgress?.(i + 1, recs.length);
			await pause();
		}
	}
	onProgress?.(recs.length, recs.length);
	return {
		version: txt(root, 'version'),
		meta: {
			orgName: txt(md, 'org_name'),
			email: txt(md, 'email'),
			extra: txt(md, 'extra_contact_info'),
			reportId: txt(md, 'report_id'),
			begin: num(txt(range, 'begin')),
			end: num(txt(range, 'end')),
			errors: kids(md, 'error').map((e) => e.textContent?.trim() ?? '')
		},
		policy,
		records
	};
}

/* ------------------------------------------------------------------ */
/* Aggregation                                                         */
/* ------------------------------------------------------------------ */

export interface SourceRow {
	ip: string;
	count: number;
	pass: number;
	fail: number;
	/** Messages where DKIM gave an aligned pass (policy_evaluated). */
	dkimAligned: number;
	spfAligned: number;
	dispositions: Record<string, number>;
	/** "domain result" -> messages, from auth_results (raw, not alignment). */
	dkimResults: Record<string, number>;
	spfResults: Record<string, number>;
	headerFrom: string[];
	reasons: string[];
}

export interface Summary {
	total: number;
	pass: number;
	fail: number;
	dkimAligned: number;
	spfAligned: number;
	both: number;
	dispositions: Record<string, number>;
	rows: SourceRow[];
	sources: number;
}

const add = (m: Record<string, number>, k: string, n: number) => (m[k] = (m[k] ?? 0) + n);

export function summarise(records: ReportRecord[]): Summary {
	const by = new Map<string, SourceRow>();
	const s: Summary = {
		total: 0,
		pass: 0,
		fail: 0,
		dkimAligned: 0,
		spfAligned: 0,
		both: 0,
		dispositions: {},
		rows: [],
		sources: 0
	};
	for (const r of records) {
		let row = by.get(r.sourceIp);
		if (!row) {
			row = {
				ip: r.sourceIp,
				count: 0,
				pass: 0,
				fail: 0,
				dkimAligned: 0,
				spfAligned: 0,
				dispositions: {},
				dkimResults: {},
				spfResults: {},
				headerFrom: [],
				reasons: []
			};
			by.set(r.sourceIp, row);
		}
		const n = r.count;
		const dk = r.dkimEval === 'pass';
		const sp = r.spfEval === 'pass';
		row.count += n;
		s.total += n;
		if (dk || sp) {
			row.pass += n;
			s.pass += n;
		} else {
			row.fail += n;
			s.fail += n;
		}
		if (dk) {
			row.dkimAligned += n;
			s.dkimAligned += n;
		}
		if (sp) {
			row.spfAligned += n;
			s.spfAligned += n;
		}
		if (dk && sp) s.both += n;
		add(row.dispositions, r.disposition, n);
		add(s.dispositions, r.disposition, n);
		for (const d of r.dkim)
			add(row.dkimResults, `${d.domain}${d.selector ? ` (${d.selector})` : ''} ${d.result}`, n);
		if (!r.dkim.length) add(row.dkimResults, 'not signed', n);
		for (const x of r.spf) add(row.spfResults, `${x.domain} ${x.result}`, n);
		if (r.headerFrom && !row.headerFrom.includes(r.headerFrom)) row.headerFrom.push(r.headerFrom);
		for (const reason of r.reasons) {
			const t = reason.comment ? `${reason.type}: ${reason.comment}` : reason.type;
			if (t && !row.reasons.includes(t)) row.reasons.push(t);
		}
	}
	s.rows = [...by.values()];
	s.sources = s.rows.length;
	return s;
}

export type SortKey = 'count' | 'fail' | 'ip';

export function sortRows(rows: SourceRow[], key: SortKey): SourceRow[] {
	const r = [...rows];
	if (key === 'ip') return r.sort((a, b) => compareIp(a.ip, b.ip));
	if (key === 'fail')
		return r.sort((a, b) => b.fail - a.fail || b.count - a.count || compareIp(a.ip, b.ip));
	return r.sort((a, b) => b.count - a.count || compareIp(a.ip, b.ip));
}

/** Numeric order for IPv4, IPv4 before IPv6, IPv6 by expanded text. */
export function compareIp(a: string, b: string): number {
	const key = (ip: string) => {
		if (/^\d+(\.\d+){3}$/.test(ip))
			return (
				'4' +
				ip
					.split('.')
					.map((x) => x.padStart(3, '0'))
					.join('.')
			);
		if (ip.includes(':')) {
			const [h, t = ''] = ip.split('::');
			const hs = h ? h.split(':') : [];
			const ts = t ? t.split(':') : [];
			const mid = ip.includes('::') ? Array(Math.max(0, 8 - hs.length - ts.length)).fill('0') : [];
			return '6' + [...hs, ...mid, ...ts].map((x) => x.padStart(4, '0')).join(':');
		}
		return '9' + ip;
	};
	const ka = key(a.toLowerCase());
	const kb = key(b.toLowerCase());
	return ka < kb ? -1 : ka > kb ? 1 : 0;
}

export function topFailing(rows: SourceRow[], n = 10): SourceRow[] {
	return sortRows(
		rows.filter((r) => r.fail > 0),
		'fail'
	).slice(0, n);
}

export function percent(part: number, total: number): string {
	if (!total) return '0%';
	const p = (part / total) * 100;
	return `${p >= 99.95 || p === 0 ? p.toFixed(0) : p.toFixed(1)}%`;
}

export function formatRange(begin?: number, end?: number): string {
	const f = (s: number) =>
		new Date(s * 1000)
			.toISOString()
			.replace('T', ' ')
			.replace(/:\d\d\.\d+Z$/, ' UTC');
	if (begin === undefined || end === undefined) return 'not given';
	return `${f(begin)} to ${f(end)}`;
}
