/**
 * Minimal DER encoder (ITU-T X.690, distinguished encoding rules): only what a PKCS#10
 * request needs. Every function returns the complete TLV (tag, length, value).
 */

export function concat(parts: Uint8Array[]): Uint8Array {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let o = 0;
	for (const p of parts) {
		out.set(p, o);
		o += p.length;
	}
	return out;
}

/** X.690 8.1.3: short form below 128, otherwise long form with the minimum number of octets. */
export function encodeLength(n: number): Uint8Array {
	if (!Number.isInteger(n) || n < 0) throw new Error(`Bad DER length ${n}`);
	if (n < 0x80) return Uint8Array.of(n);
	const bytes: number[] = [];
	for (let v = n; v > 0; v = Math.floor(v / 256)) bytes.unshift(v & 0xff);
	return Uint8Array.of(0x80 | bytes.length, ...bytes);
}

/** One TLV with a single-octet identifier (tag numbers below 31, which is all we use). */
export function tlv(identifier: number, value: Uint8Array): Uint8Array {
	return concat([Uint8Array.of(identifier), encodeLength(value.length), value]);
}

export const sequence = (...items: Uint8Array[]) => tlv(0x30, concat(items));

/**
 * SET OF: DER (X.690 11.6) sorts the encoded elements as octet strings. Shorter elements are
 * padded with trailing zero octets for the comparison.
 */
export function setOf(...items: Uint8Array[]): Uint8Array {
	const sorted = [...items].sort((a, b) => {
		const n = Math.max(a.length, b.length);
		for (let i = 0; i < n; i++) {
			const d = (a[i] ?? 0) - (b[i] ?? 0);
			if (d) return d;
		}
		return 0;
	});
	return tlv(0x31, concat(sorted));
}

export const nullValue = () => Uint8Array.of(0x05, 0x00);

/** INTEGER from unsigned big-endian bytes: minimal form, 0x00 prefix when the top bit is set. */
export function integer(unsigned: Uint8Array): Uint8Array {
	let i = 0;
	while (i < unsigned.length - 1 && unsigned[i] === 0) i++;
	let b = unsigned.subarray(i);
	if (b.length === 0) b = Uint8Array.of(0);
	if (b[0] & 0x80) b = concat([Uint8Array.of(0), b]);
	return tlv(0x02, b);
}

export const smallInteger = (n: number) => {
	if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) throw new Error(`Bad integer ${n}`);
	const bytes: number[] = [];
	for (let v = n; v > 0; v = Math.floor(v / 256)) bytes.unshift(v & 0xff);
	return integer(Uint8Array.from(bytes));
};

/** OBJECT IDENTIFIER, X.690 8.19: first two arcs combined, then base-128 with continuation bits. */
export function oid(dotted: string): Uint8Array {
	if (!/^[0-2](\.\d+)+$/.test(dotted)) throw new Error(`Bad OID ${dotted}`);
	const arcs = dotted.split('.').map(Number);
	if (arcs[0] < 2 && arcs[1] > 39) throw new Error(`Bad OID ${dotted}`);
	const out: number[] = [];
	const push = (v: number) => {
		const group: number[] = [v & 0x7f];
		for (v = Math.floor(v / 128); v > 0; v = Math.floor(v / 128)) group.unshift((v & 0x7f) | 0x80);
		out.push(...group);
	};
	push(arcs[0] * 40 + arcs[1]);
	for (const a of arcs.slice(2)) push(a);
	return tlv(0x06, Uint8Array.from(out));
}

/** BIT STRING with zero unused bits (signatures and keys are whole octets). */
export const bitString = (bytes: Uint8Array) => tlv(0x03, concat([Uint8Array.of(0), bytes]));

export const octetString = (bytes: Uint8Array) => tlv(0x04, bytes);

export const utf8String = (s: string) => tlv(0x0c, new TextEncoder().encode(s));

/** X.680 41.4: A-Z a-z 0-9 space ' ( ) + , - . / : = ? */
export const PRINTABLE = /^[A-Za-z0-9 '()+,\-./:=?]*$/;

export function printableString(s: string): Uint8Array {
	if (!PRINTABLE.test(s)) throw new Error(`"${s}" is not a PrintableString`);
	return tlv(0x13, new TextEncoder().encode(s));
}

export function ia5String(s: string): Uint8Array {
	// IA5 is 7-bit ASCII.
	if (!/^[\x00-\x7f]*$/.test(s)) throw new Error(`"${s}" is not ASCII (IA5String)`);
	return tlv(0x16, new TextEncoder().encode(s));
}

/** Context-specific tag [n]. Constructed for EXPLICIT/IMPLICIT constructed types. */
export function context(n: number, value: Uint8Array, constructed: boolean): Uint8Array {
	if (n > 30) throw new Error('Context tag too large');
	return tlv(0x80 | (constructed ? 0x20 : 0) | n, value);
}
