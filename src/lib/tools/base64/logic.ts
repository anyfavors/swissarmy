export type Base64Variant = 'standard' | 'url';

export function bytesToBase64(
	bytes: Uint8Array,
	variant: Base64Variant = 'standard',
	pad = true
): string {
	let bin = '';
	for (let i = 0; i < bytes.length; i += 0x8000) {
		bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	let out = btoa(bin);
	if (variant === 'url') out = out.replace(/\+/g, '-').replace(/\//g, '_');
	if (!pad) out = out.replace(/=+$/, '');
	return out;
}

/**
 * Decodes standard or URL-safe Base64, with or without padding.
 * Whitespace is ignored so wrapped input (PEM, MIME) works.
 */
export function base64ToBytes(input: string): Uint8Array {
	const clean = input.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
	if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) {
		const bad = clean.match(/[^A-Za-z0-9+/=]/);
		throw new Error(bad ? `Invalid character "${bad[0]}"` : 'Padding in the wrong place');
	}
	const unpadded = clean.replace(/=+$/, '');
	if (unpadded.length % 4 === 1) throw new Error('Length is not valid Base64');
	const padded = unpadded + '='.repeat((4 - (unpadded.length % 4)) % 4);
	const bin = atob(padded);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return bytes;
}

export function encodeText(text: string, variant: Base64Variant = 'standard', pad = true): string {
	return bytesToBase64(new TextEncoder().encode(text), variant, pad);
}

export interface DecodedText {
	text: string;
	bytes: Uint8Array;
	/** False when the bytes are not valid UTF-8, i.e. probably binary data. */
	utf8: boolean;
}

export function decodeText(input: string): DecodedText {
	const bytes = base64ToBytes(input);
	try {
		return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), bytes, utf8: true };
	} catch {
		return { text: new TextDecoder('utf-8').decode(bytes), bytes, utf8: false };
	}
}

export function toHex(bytes: Uint8Array, max = 64): string {
	const shown = Array.from(bytes.subarray(0, max), (b) => b.toString(16).padStart(2, '0')).join(
		' '
	);
	return bytes.length > max ? `${shown} …` : shown;
}

/** Likelihood that a string is Base64 meant for decoding. */
export function looksLikeBase64(s: string): number {
	const t = s.trim();
	if (t.length < 8 || /\s/.test(t.replace(/\r?\n/g, ''))) return 0;
	const flat = t.replace(/\r?\n/g, '');
	if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(flat)) return 0;
	if (/^[0-9]+$/.test(flat) || /^[a-z]+$/i.test(flat)) return 0.05;
	// Base64 of gzip data (magic 1f 8b) belongs to the compression tool, which ranks it at 0.8.
	if (flat.startsWith('H4sI')) return 0.6;
	let score = 0.5;
	if (flat.endsWith('=')) score += 0.3;
	if (flat.length % 4 === 0) score += 0.1;
	if (/[A-Z]/.test(flat) && /[a-z]/.test(flat) && /[0-9]/.test(flat)) score += 0.1;
	return Math.min(score, 0.95);
}
