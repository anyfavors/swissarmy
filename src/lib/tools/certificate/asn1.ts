/** Minimal DER reader: enough of X.690 to walk certificates and CSRs. */

export interface Node {
	/** Tag class: 0 universal, 1 application, 2 context-specific, 3 private. */
	cls: number;
	constructed: boolean;
	/** Tag number (low-tag-number form plus long form). */
	tag: number;
	/** Offset of the identifier octet in the source buffer. */
	start: number;
	/** Offset of the first content octet. */
	contentStart: number;
	/** Offset one past the last content octet. */
	end: number;
	/** The source buffer, shared by all nodes. */
	buf: Uint8Array;
	children: Node[];
}

export const UNIVERSAL = {
	BOOLEAN: 1,
	INTEGER: 2,
	BIT_STRING: 3,
	OCTET_STRING: 4,
	NULL: 5,
	OID: 6,
	UTF8String: 12,
	SEQUENCE: 16,
	SET: 17,
	PrintableString: 19,
	TeletexString: 20,
	IA5String: 22,
	UTCTime: 23,
	GeneralizedTime: 24,
	UniversalString: 28,
	BMPString: 30
} as const;

class DerError extends Error {}

function readNode(buf: Uint8Array, pos: number, limit: number, depth: number): Node {
	if (depth > 40) throw new DerError('DER nesting is too deep');
	const start = pos;
	if (pos >= limit) throw new DerError('Unexpected end of DER data');
	const id = buf[pos++];
	const cls = id >> 6;
	const constructed = (id & 0x20) !== 0;
	let tag = id & 0x1f;
	if (tag === 0x1f) {
		tag = 0;
		let b: number;
		do {
			if (pos >= limit) throw new DerError('Truncated tag');
			b = buf[pos++];
			tag = tag * 128 + (b & 0x7f);
		} while (b & 0x80);
	}
	if (pos >= limit) throw new DerError('Truncated length');
	let len = buf[pos++];
	if (len === 0x80) throw new DerError('Indefinite length is not allowed in DER');
	if (len & 0x80) {
		const n = len & 0x7f;
		if (n > 4) throw new DerError('Length field is too long');
		len = 0;
		for (let i = 0; i < n; i++) {
			if (pos >= limit) throw new DerError('Truncated length');
			len = len * 256 + buf[pos++];
		}
	}
	const contentStart = pos;
	const end = contentStart + len;
	if (end > limit) throw new DerError('Length runs past the end of the data');
	const node: Node = { cls, constructed, tag, start, contentStart, end, buf, children: [] };
	if (constructed) {
		let p = contentStart;
		while (p < end) {
			const child = readNode(buf, p, end, depth + 1);
			node.children.push(child);
			p = child.end;
		}
	}
	return node;
}

/** Parses one DER element that must span the whole buffer. */
export function parseDer(buf: Uint8Array): Node {
	const n = readNode(buf, 0, buf.length, 0);
	if (n.end !== buf.length) throw new DerError('Trailing bytes after the DER structure');
	return n;
}

/** Parses the content of a primitive node (e.g. OCTET STRING, BIT STRING) as DER. */
export function parseInner(n: Node, skip = 0): Node {
	const sub = n.buf.subarray(n.contentStart + skip, n.end);
	return parseDer(sub);
}

export function content(n: Node): Uint8Array {
	return n.buf.subarray(n.contentStart, n.end);
}

export function raw(n: Node): Uint8Array {
	return n.buf.subarray(n.start, n.end);
}

export function isUniversal(n: Node, tag: number): boolean {
	return n.cls === 0 && n.tag === tag;
}

export function isContext(n: Node, tag: number): boolean {
	return n.cls === 2 && n.tag === tag;
}

export function need(n: Node | undefined, tag: number, what: string): Node {
	if (!n || !isUniversal(n, tag)) throw new DerError(`Expected ${what}`);
	return n;
}

export function readOid(n: Node): string {
	const b = content(n);
	if (b.length === 0) throw new DerError('Empty OID');
	const parts: number[] = [];
	let v = 0;
	for (let i = 0; i < b.length; i++) {
		v = v * 128 + (b[i] & 0x7f);
		if (!(b[i] & 0x80)) {
			if (parts.length === 0) {
				const first = v < 80 ? Math.floor(v / 40) : 2;
				parts.push(first, v - first * 40);
			} else parts.push(v);
			v = 0;
		}
	}
	return parts.join('.');
}

export function hex(bytes: Uint8Array, sep = ''): string {
	return Array.from(bytes, (x) => x.toString(16).padStart(2, '0')).join(sep);
}

/** INTEGER as hex, leading sign-padding zero removed. */
export function readIntegerHex(n: Node): string {
	let b = content(n);
	while (b.length > 1 && b[0] === 0) b = b.subarray(1);
	return hex(b);
}

export function readSmallInt(n: Node): number {
	const b = content(n);
	if (b.length > 6) throw new DerError('Integer too large');
	let v = 0;
	for (const x of b) v = v * 256 + x;
	if (b.length && b[0] & 0x80) v -= 2 ** (8 * b.length);
	return v;
}

export function readBoolean(n: Node): boolean {
	return content(n)[0] !== 0;
}

/** Decodes the string types found in names and extensions. */
export function readString(n: Node): string {
	const b = content(n);
	switch (n.tag) {
		case UNIVERSAL.BMPString: {
			let s = '';
			for (let i = 0; i + 1 < b.length; i += 2) s += String.fromCharCode((b[i] << 8) | b[i + 1]);
			return s;
		}
		case UNIVERSAL.UniversalString: {
			let s = '';
			for (let i = 0; i + 3 < b.length; i += 4)
				s += String.fromCodePoint(
					((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0
				);
			return s;
		}
		case UNIVERSAL.TeletexString:
			// T.61 in theory, Latin-1 in practice.
			return String.fromCharCode(...b);
		default:
			return new TextDecoder('utf-8').decode(b);
	}
}

/** UTCTime (YYMMDDHHMMSSZ) or GeneralizedTime (YYYYMMDDHHMMSSZ), returned as epoch ms. */
export function readTime(n: Node): number {
	const s = new TextDecoder('ascii').decode(content(n));
	let m: RegExpMatchArray | null;
	let year: number;
	if (n.tag === UNIVERSAL.UTCTime) {
		m = s.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?Z$/);
		if (!m) throw new DerError(`Bad UTCTime "${s}"`);
		const yy = Number(m[1]);
		// RFC 5280 4.1.2.5.1: 50..99 means 19YY, 00..49 means 20YY.
		year = yy >= 50 ? 1900 + yy : 2000 + yy;
	} else if (n.tag === UNIVERSAL.GeneralizedTime) {
		m = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(?:\.\d+)?Z$/);
		if (!m) throw new DerError(`Bad GeneralizedTime "${s}"`);
		year = Number(m[1]);
	} else throw new DerError('Expected a time value');
	return Date.UTC(
		year,
		Number(m[2]) - 1,
		Number(m[3]),
		Number(m[4]),
		Number(m[5]),
		Number(m[6] ?? 0)
	);
}

export { DerError };
