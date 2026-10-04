export type UrlMode = 'component' | 'uri' | 'form';

export const modeLabel: Record<UrlMode, string> = {
	component: 'Component',
	uri: 'Full URI',
	form: 'Form'
};

const hex = (b: number) => '%' + b.toString(16).toUpperCase().padStart(2, '0');

/**
 * Encodes text.
 * - component: encodeURIComponent, leaves A-Z a-z 0-9 - _ . ! ~ * ' ( ) alone.
 * - uri: encodeURI, also leaves the reserved characters ; , / ? : @ & = + $ # alone.
 * - form: application/x-www-form-urlencoded (WHATWG URL standard), leaves only
 *   A-Z a-z 0-9 * - . _ alone and writes space as +.
 */
export function encode(text: string, mode: UrlMode = 'component'): string {
	if (mode === 'form') {
		let out = '';
		for (const b of new TextEncoder().encode(text)) {
			if (b === 0x20) out += '+';
			else if (
				(b >= 0x30 && b <= 0x39) ||
				(b >= 0x41 && b <= 0x5a) ||
				(b >= 0x61 && b <= 0x7a) ||
				b === 0x2a ||
				b === 0x2d ||
				b === 0x2e ||
				b === 0x5f
			)
				out += String.fromCharCode(b);
			else out += hex(b);
		}
		return out;
	}
	try {
		return mode === 'uri' ? encodeURI(text) : encodeURIComponent(text);
	} catch {
		const i = [...text].findIndex((c) => /[\uD800-\uDFFF]/.test(c));
		throw new Error(
			`Lone surrogate at position ${i + 1}: the text is not valid Unicode and cannot be encoded as UTF-8`
		);
	}
}

/** Characters decodeURI leaves encoded because decoding them would change the URL's meaning. */
const uriReserved = new Set(';/?:@&=+$,#'.split('').map((c) => c.charCodeAt(0)));

/**
 * Decodes percent-encoding. Malformed sequences are reported with their
 * 1-based character position. In form mode + is read as a space. In uri mode
 * escapes of reserved characters (%2F, %3F ...) stay encoded, like decodeURI.
 */
export function decode(input: string, mode: UrlMode = 'component'): string {
	let out = '';
	let i = 0;
	const n = input.length;
	while (i < n) {
		const c = input[i];
		if (c === '+' && mode === 'form') {
			out += ' ';
			i++;
		} else if (c === '%') {
			const start = i;
			const bytes: number[] = [];
			const raw: string[] = [];
			while (i < n && input[i] === '%') {
				const h = input.slice(i + 1, i + 3);
				if (!/^[0-9a-fA-F]{2}$/.test(h)) {
					const shown = input.slice(i, i + 3);
					throw new Error(
						`Malformed % sequence "${shown}" at position ${i + 1}: % must be followed by two hex digits`
					);
				}
				bytes.push(parseInt(h, 16));
				raw.push(input.slice(i, i + 3));
				i += 3;
			}
			let text: string;
			try {
				text = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
			} catch {
				throw new Error(`Bytes ${raw.join('')} at position ${start + 1} are not valid UTF-8`);
			}
			if (mode === 'uri') {
				// Re-encode reserved ASCII characters, keeping the original spelling.
				let k = 0;
				for (const ch of text) {
					const len = new TextEncoder().encode(ch).length;
					const code = ch.charCodeAt(0);
					out += len === 1 && uriReserved.has(code) ? raw[k] : ch;
					k += len;
				}
			} else out += text;
		} else {
			out += c;
			i++;
		}
	}
	return out;
}

export interface UrlPart {
	label: string;
	value: string;
}

export interface ParsedUrl {
	parts: UrlPart[];
	params: [string, string][];
}

const defaultPorts: Record<string, string> = {
	'http:': '80',
	'https:': '443',
	'ws:': '80',
	'wss:': '443',
	'ftp:': '21'
};

function safeDecode(s: string): string {
	try {
		return decodeURIComponent(s);
	} catch {
		return s;
	}
}

/** Splits a full URL (scheme://...) into its parts. Returns null for anything else. */
export function parseUrl(input: string): ParsedUrl | null {
	const s = input.trim();
	if (!/^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(s)) return null;
	let u: URL;
	try {
		u = new URL(s);
	} catch {
		return null;
	}
	const parts: UrlPart[] = [{ label: 'Protocol', value: u.protocol.replace(/:$/, '') }];
	if (u.username) parts.push({ label: 'User', value: safeDecode(u.username) });
	if (u.password) parts.push({ label: 'Password', value: safeDecode(u.password) });
	parts.push({ label: 'Host', value: u.hostname });
	const def = defaultPorts[u.protocol];
	parts.push({
		label: 'Port',
		value: u.port || (def ? `${def} (default)` : '')
	});
	parts.push({ label: 'Path', value: safeDecode(u.pathname) });
	if (u.search) parts.push({ label: 'Query', value: u.search.slice(1) });
	if (u.hash) parts.push({ label: 'Fragment', value: safeDecode(u.hash.slice(1)) });
	return { parts, params: [...u.searchParams.entries()] };
}

/** Likelihood that the input is percent-encoded text or a URL with a query string. */
export function looksLikeUrlEncoded(s: string): number {
	const t = s.trim();
	if (!t || /^[{[]/.test(t)) return 0;
	if (/^[a-z][a-z0-9+.-]*:\/\/[^\s?#]+\?[^\s]*=/i.test(t)) return 0.6;
	const escapes = t.match(/%[0-9a-fA-F]{2}/g)?.length ?? 0;
	if (escapes === 0) return 0;
	if (/\s/.test(t)) return 0.3;
	return escapes >= 2 ? 0.65 : 0.5;
}
