/**
 * OpenSSH public keys: plain .pub lines, authorized_keys lines with options (sshd(8)
 * AUTHORIZED_KEYS FILE FORMAT), known_hosts lines incl. hashed hosts and markers (sshd(8)
 * SSH_KNOWN_HOSTS FILE FORMAT) and RFC 4716 blocks.
 *
 * Blob layouts: RFC 4253 6.6 (ssh-rsa, ssh-dss), RFC 5656 3.1 (ecdsa-sha2-*), RFC 8709 4
 * (ssh-ed25519), OpenSSH PROTOCOL.u2f (sk-*) and PROTOCOL.certkeys (*-cert-v01@openssh.com).
 * Fingerprints follow ssh-keygen -l: SHA256 base64 without padding, MD5 as colon hex, both over
 * the plain public key blob (for certificates: the certified key, not the certificate).
 */
import { md5 } from './md5';

export type Level = 'danger' | 'warn' | 'info';
export interface Flag {
	level: Level;
	text: string;
}

export interface HostPattern {
	text: string;
	/** |1|salt|hash form written by ssh-keygen -H / HashKnownHosts. */
	hashed?: { salt: Uint8Array; hash: Uint8Array };
	negated?: boolean;
}

export interface KeyOption {
	name: string;
	value?: string;
}

export interface CertInfo {
	kind: 'user' | 'host' | 'unknown';
	serial: bigint;
	keyId: string;
	principals: string[];
	validAfter: bigint;
	validBefore: bigint;
	criticalOptions: string[];
	extensions: string[];
	/** Type and SHA256 fingerprint of the signing CA key. */
	caType: string;
	caSha256: string;
}

export interface ParsedKey {
	line: number;
	source: 'public' | 'authorized_keys' | 'known_hosts' | 'rfc4716';
	marker?: '@cert-authority' | '@revoked';
	hosts?: HostPattern[];
	options?: KeyOption[];
	/** Key type as in the blob, e.g. ssh-ed25519. */
	type: string;
	/** ssh-keygen style label: RSA, ED25519, ECDSA-SK, RSA-CERT ... */
	label: string;
	bits: number;
	comment: string;
	/** FIDO application string for -sk keys (usually "ssh:"). */
	application?: string;
	rsaExponent?: string;
	sha256: string;
	md5: string;
	cert?: CertInfo;
	flags: Flag[];
}

export interface LineError {
	line: number;
	text: string;
	error: string;
}

export type LineResult = ParsedKey | LineError;

export const isError = (r: LineResult): r is LineError => 'error' in r;

// ---------------------------------------------------------------- bytes

export function b64decode(s: string): Uint8Array | null {
	if (!/^[A-Za-z0-9+/]+={0,2}$/.test(s) || s.replace(/=+$/, '').length % 4 === 1) return null;
	try {
		return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
	} catch {
		return null;
	}
}

function b64encode(b: Uint8Array): string {
	let s = '';
	for (const x of b) s += String.fromCharCode(x);
	return btoa(s);
}

class Reader {
	pos = 0;
	constructor(public buf: Uint8Array) {}
	u32(): number {
		if (this.pos + 4 > this.buf.length) throw new Error('Key data is truncated');
		const b = this.buf;
		const v =
			((b[this.pos] << 24) | (b[this.pos + 1] << 16) | (b[this.pos + 2] << 8) | b[this.pos + 3]) >>>
			0;
		this.pos += 4;
		return v;
	}
	u64(): bigint {
		const hi = BigInt(this.u32());
		return (hi << 32n) | BigInt(this.u32());
	}
	bytes(): Uint8Array {
		const n = this.u32();
		if (this.pos + n > this.buf.length) throw new Error('Key data is truncated');
		const out = this.buf.subarray(this.pos, this.pos + n);
		this.pos += n;
		return out;
	}
	string(): string {
		return new TextDecoder().decode(this.bytes());
	}
	get done() {
		return this.pos === this.buf.length;
	}
}

function sshString(b: Uint8Array): Uint8Array {
	const out = new Uint8Array(4 + b.length);
	new DataView(out.buffer).setUint32(0, b.length);
	out.set(b, 4);
	return out;
}

/** Bit length of an mpint (two's complement, big-endian). */
function mpintBits(b: Uint8Array): number {
	if (b.length && b[0] & 0x80) throw new Error('Negative integer in key data');
	let i = 0;
	while (i < b.length && b[i] === 0) i++;
	if (i === b.length) return 0;
	return (b.length - i - 1) * 8 + (32 - Math.clz32(b[i]));
}

function mpintDecimal(b: Uint8Array): string {
	let v = 0n;
	for (const x of b) v = (v << 8n) | BigInt(x);
	return v.toString();
}

// ---------------------------------------------------------------- key types

interface TypeInfo {
	label: string;
	/** Reads the type-specific fields; returns bits and extras. */
	read: (r: Reader) => { bits: number; application?: string; rsaExponent?: string };
}

const curveBits: Record<string, number> = { nistp256: 256, nistp384: 384, nistp521: 521 };

function readEcdsa(r: Reader, curve: string) {
	const c = r.string();
	if (c !== curve) throw new Error(`Curve "${c}" does not match the key type (${curve})`);
	const q = r.bytes();
	const n = Math.ceil(curveBits[curve] / 8);
	if (q.length !== 1 + 2 * n || q[0] !== 4)
		throw new Error(`ECDSA point has the wrong length or form for ${curve}`);
	return { bits: curveBits[curve] };
}

function readEd25519(r: Reader) {
	if (r.bytes().length !== 32) throw new Error('Ed25519 public key must be 32 bytes');
	return { bits: 256 };
}

export const keyTypes: Record<string, TypeInfo> = {
	'ssh-rsa': {
		label: 'RSA',
		read: (r) => {
			const e = r.bytes();
			const n = r.bytes();
			return { bits: mpintBits(n), rsaExponent: mpintDecimal(e) };
		}
	},
	'ssh-dss': {
		label: 'DSA',
		read: (r) => {
			const p = r.bytes();
			r.bytes();
			r.bytes();
			r.bytes();
			return { bits: mpintBits(p) };
		}
	},
	'ecdsa-sha2-nistp256': { label: 'ECDSA', read: (r) => readEcdsa(r, 'nistp256') },
	'ecdsa-sha2-nistp384': { label: 'ECDSA', read: (r) => readEcdsa(r, 'nistp384') },
	'ecdsa-sha2-nistp521': { label: 'ECDSA', read: (r) => readEcdsa(r, 'nistp521') },
	'ssh-ed25519': { label: 'ED25519', read: readEd25519 },
	'sk-ecdsa-sha2-nistp256@openssh.com': {
		label: 'ECDSA-SK',
		read: (r) => ({ ...readEcdsa(r, 'nistp256'), application: r.string() })
	},
	'sk-ssh-ed25519@openssh.com': {
		label: 'ED25519-SK',
		read: (r) => ({ ...readEd25519(r), application: r.string() })
	}
};

/** Certificate type name to the plain key type it certifies. */
const certTypes: Record<string, string> = {
	'ssh-rsa-cert-v01@openssh.com': 'ssh-rsa',
	'ssh-dss-cert-v01@openssh.com': 'ssh-dss',
	'ecdsa-sha2-nistp256-cert-v01@openssh.com': 'ecdsa-sha2-nistp256',
	'ecdsa-sha2-nistp384-cert-v01@openssh.com': 'ecdsa-sha2-nistp384',
	'ecdsa-sha2-nistp521-cert-v01@openssh.com': 'ecdsa-sha2-nistp521',
	'ssh-ed25519-cert-v01@openssh.com': 'ssh-ed25519',
	'sk-ecdsa-sha2-nistp256-cert-v01@openssh.com': 'sk-ecdsa-sha2-nistp256@openssh.com',
	'sk-ssh-ed25519-cert-v01@openssh.com': 'sk-ssh-ed25519@openssh.com'
};

export const knownTypeNames = [...Object.keys(keyTypes), ...Object.keys(certTypes)];

function namesList(b: Uint8Array): string[] {
	const r = new Reader(b);
	const out: string[] = [];
	while (!r.done) out.push(r.string());
	return out;
}

/** Critical options and extensions: name/data pairs. */
function optionList(b: Uint8Array): string[] {
	const r = new Reader(b);
	const out: string[] = [];
	while (!r.done) {
		const name = r.string();
		const data = r.bytes();
		if (data.length) {
			try {
				out.push(`${name} ${new Reader(data).string()}`);
				continue;
			} catch {
				/* fall through */
			}
		}
		out.push(name);
	}
	return out;
}

export interface BlobInfo {
	type: string;
	label: string;
	bits: number;
	/** The plain public key blob that fingerprints are taken over. */
	plain: Uint8Array;
	application?: string;
	rsaExponent?: string;
	cert?: Omit<CertInfo, 'caSha256'> & { caBlob: Uint8Array };
}

/** Decodes a key blob. Throws with a readable message when it does not fit the layout. */
export function parseBlob(blob: Uint8Array): BlobInfo {
	const r = new Reader(blob);
	const type = r.string();
	const plainType = certTypes[type];
	if (plainType) {
		r.bytes(); // nonce
		const start = r.pos;
		const info = keyTypes[plainType].read(r);
		const fields = blob.subarray(start, r.pos);
		const plain = new Uint8Array([...sshString(new TextEncoder().encode(plainType)), ...fields]);
		const serial = r.u64();
		const ctype = r.u32();
		const keyId = r.string();
		const principals = namesList(r.bytes());
		const validAfter = r.u64();
		const validBefore = r.u64();
		const criticalOptions = optionList(r.bytes());
		const extensions = optionList(r.bytes());
		r.bytes(); // reserved
		const caBlob = r.bytes();
		r.bytes(); // signature
		if (!r.done) throw new Error('Trailing bytes after the certificate');
		const ca = new Reader(caBlob).string();
		return {
			type,
			label: `${keyTypes[plainType].label}-CERT`,
			plain,
			...info,
			cert: {
				kind: ctype === 1 ? 'user' : ctype === 2 ? 'host' : 'unknown',
				serial,
				keyId,
				principals,
				validAfter,
				validBefore,
				criticalOptions,
				extensions,
				caType: ca,
				caBlob
			}
		};
	}
	const t = keyTypes[type];
	if (!t) throw new Error(`Unknown key type "${type}"`);
	const info = t.read(r);
	if (!r.done) throw new Error('Trailing bytes after the key');
	return { type, label: t.label, plain: blob, ...info };
}

// ---------------------------------------------------------------- fingerprints

export async function sha256Fingerprint(blob: Uint8Array): Promise<string> {
	const d = new Uint8Array(await crypto.subtle.digest('SHA-256', blob as BufferSource));
	return `SHA256:${b64encode(d).replace(/=+$/, '')}`;
}

export function md5Fingerprint(blob: Uint8Array): string {
	return `MD5:${Array.from(md5(blob), (x) => x.toString(16).padStart(2, '0')).join(':')}`;
}

// ---------------------------------------------------------------- line parsing

/** Splits on blanks outside double quotes. Backslash escapes a quote inside quotes (as sshd does). */
export function tokenize(line: string): { text: string; start: number; end: number }[] {
	const out: { text: string; start: number; end: number }[] = [];
	let i = 0;
	while (i < line.length) {
		while (i < line.length && /[ \t]/.test(line[i])) i++;
		if (i >= line.length) break;
		const start = i;
		let quoted = false;
		while (i < line.length && (quoted || !/[ \t]/.test(line[i]))) {
			if (line[i] === '\\' && quoted && line[i + 1] === '"') i++;
			else if (line[i] === '"') quoted = !quoted;
			i++;
		}
		out.push({ text: line.slice(start, i), start, end: i });
	}
	return out;
}

/** authorized_keys options, sshd(8) AUTHORIZED_KEYS FILE FORMAT (OpenSSH 9.x). */
const optionNames = new Set([
	'agent-forwarding',
	'cert-authority',
	'command',
	'environment',
	'expiry-time',
	'from',
	'no-agent-forwarding',
	'no-port-forwarding',
	'no-pty',
	'no-user-rc',
	'no-x11-forwarding',
	'permitlisten',
	'permitopen',
	'port-forwarding',
	'principals',
	'pty',
	'no-touch-required',
	'verify-required',
	'restrict',
	'tunnel',
	'user-rc',
	'x11-forwarding'
]);

function splitOutsideQuotes(s: string, sep: string): string[] {
	const out: string[] = [];
	let cur = '';
	let quoted = false;
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (c === '\\' && quoted && s[i + 1] === '"') {
			cur += '\\"';
			i++;
			continue;
		}
		if (c === '"') quoted = !quoted;
		if (c === sep && !quoted) {
			out.push(cur);
			cur = '';
		} else cur += c;
	}
	out.push(cur);
	return out;
}

export function parseOptions(s: string): KeyOption[] | null {
	const out: KeyOption[] = [];
	for (const part of splitOutsideQuotes(s, ',')) {
		const m = part.match(/^([A-Za-z0-9-]+)(?:="((?:[^"\\]|\\")*)")?$/);
		if (!m || !optionNames.has(m[1].toLowerCase())) return null;
		out.push(
			m[2] === undefined ? { name: m[1] } : { name: m[1], value: m[2].replace(/\\"/g, '"') }
		);
	}
	return out;
}

export function parseHosts(s: string): HostPattern[] {
	return s.split(',').map((text) => {
		const m = text.match(/^\|1\|([A-Za-z0-9+/=]+)\|([A-Za-z0-9+/=]+)$/);
		if (m) {
			const salt = b64decode(m[1]);
			const hash = b64decode(m[2]);
			if (salt && hash && salt.length === 20 && hash.length === 20)
				return { text, hashed: { salt, hash } };
		}
		return text.startsWith('!') ? { text, negated: true } : { text };
	});
}

interface Located {
	index: number;
	blob: Uint8Array;
}

function locateKey(tokens: { text: string }[]): Located | { error: string } {
	let typeMismatch = '';
	for (let i = 0; i + 1 < tokens.length && i <= 3; i++) {
		const blob = b64decode(tokens[i + 1].text);
		if (!blob) continue;
		let inner: string;
		try {
			inner = new Reader(blob).string();
		} catch {
			continue;
		}
		if (inner === tokens[i].text) return { index: i, blob };
		if (/^[a-z0-9@.-]+$/i.test(tokens[i].text) && knownTypeNames.includes(tokens[i].text))
			typeMismatch = `The line says ${tokens[i].text} but the key data is ${inner || 'not a key'}`;
	}
	if (typeMismatch) return { error: typeMismatch };
	const t = tokens.findIndex((x) => knownTypeNames.includes(x.text));
	if (t >= 0)
		return {
			error: tokens[t + 1]
				? 'Key data after the key type is not valid base64 (truncated or wrapped line?)'
				: 'Key type without key data'
		};
	return { error: 'No OpenSSH public key on this line' };
}

function describeExpiry(v: bigint): string {
	if (v === 0xffffffffffffffffn) return 'forever';
	return new Date(Number(v) * 1000).toISOString().replace('.000Z', 'Z');
}

export function certValidity(c: CertInfo): string {
	if (c.validAfter === 0n && c.validBefore === 0xffffffffffffffffn) return 'forever';
	return `from ${c.validAfter === 0n ? 'always' : describeExpiry(c.validAfter)} to ${describeExpiry(c.validBefore)}`;
}

function flagsFor(info: BlobInfo, now: number): Flag[] {
	const flags: Flag[] = [];
	const base = info.label.replace(/-CERT$/, '');
	if (base === 'RSA') {
		if (info.bits < 2048)
			flags.push({
				level: 'danger',
				text: `RSA ${info.bits} bit is weak: replace it. NIST SP 800-131A disallows RSA below 2048 bits for signatures.`
			});
		else if (info.bits < 3072)
			flags.push({
				level: 'warn',
				text: `RSA ${info.bits} bit is below current guidance (3072 bit). 2048 bit gives 112-bit security, which NIST SP 800-57 accepts only through 2030. Prefer Ed25519 for new keys.`
			});
		if (info.rsaExponent && info.rsaExponent !== '65537')
			flags.push({ level: 'info', text: `Unusual RSA public exponent ${info.rsaExponent}.` });
	}
	if (base === 'DSA')
		flags.push({
			level: 'danger',
			text: 'DSA (ssh-dss) is deprecated: disabled by default since OpenSSH 7.0 and removed in OpenSSH 10.0. Replace it.'
		});
	if (base.endsWith('-SK'))
		flags.push({
			level: 'info',
			text: `FIDO security key (the private key never leaves the token)${info.application ? `, application ${info.application}` : ''}.`
		});
	if (info.cert) {
		const nowS = BigInt(Math.floor(now / 1000));
		if (info.cert.validBefore <= nowS)
			flags.push({ level: 'danger', text: 'Certificate has expired.' });
		else if (info.cert.validAfter > nowS)
			flags.push({ level: 'warn', text: 'Certificate is not valid yet.' });
		if (info.cert.validBefore === 0xffffffffffffffffn)
			flags.push({ level: 'warn', text: 'Certificate never expires.' });
	}
	return flags;
}

/** RFC 4716 "---- BEGIN SSH2 PUBLIC KEY ----" blocks become one-line keys (line = block start). */
function unwrapRfc4716(text: string): { line: number; text: string; rfc4716?: boolean }[] {
	const lines = text.split(/\r?\n/);
	const out: { line: number; text: string; rfc4716?: boolean }[] = [];
	for (let i = 0; i < lines.length; i++) {
		if (!/^---- BEGIN SSH2 PUBLIC KEY ----\s*$/.test(lines[i])) {
			out.push({ line: i + 1, text: lines[i] });
			continue;
		}
		const start = i;
		let comment = '';
		let body = '';
		let header = '';
		for (i++; i < lines.length && !/^---- END SSH2 PUBLIC KEY ----/.test(lines[i]); i++) {
			const l = lines[i].trim();
			if (header || (!body && /^[\x21-\x39\x3b-\x7e]{1,64}:/.test(l))) {
				// Header (RFC 4716 3.3), possibly continued with a trailing backslash.
				header += l.endsWith('\\') ? l.slice(0, -1) : l;
				if (!l.endsWith('\\')) {
					const m = header.match(/^comment:\s*(.*)$/i);
					if (m) comment = m[1].replace(/^"(.*)"$/, '$1');
					header = '';
				}
			} else body += l;
		}
		if (i >= lines.length) {
			out.push({ line: start + 1, text: lines[start] });
			continue;
		}
		const blob = b64decode(body);
		let type = 'unknown';
		try {
			if (blob) type = new Reader(blob).string();
		} catch {
			/* reported below */
		}
		out.push({ line: start + 1, text: `${type} ${body} ${comment}`.trim(), rfc4716: true });
	}
	return out;
}

export async function parseKeys(text: string, now = Date.now()): Promise<LineResult[]> {
	const results: LineResult[] = [];
	for (const { line, text: raw, rfc4716 } of unwrapRfc4716(text)) {
		const l = raw.trim();
		if (!l || l.startsWith('#')) continue;
		if (/-----BEGIN [A-Z ]*PRIVATE KEY-----|PuTTY-User-Key-File/.test(l)) {
			results.push({
				line,
				text: l,
				error:
					'This is a PRIVATE key. Paste the .pub file instead. If this key was shared or pasted somewhere, treat it as exposed and replace it.'
			});
			continue;
		}
		if (/^-----(BEGIN|END) /.test(l) || /^---- END SSH2/.test(l)) {
			results.push({ line, text: l, error: 'PEM or RFC 4716 armour without a usable key' });
			continue;
		}
		const tokens = tokenize(l);
		const loc = locateKey(tokens);
		if ('error' in loc) {
			results.push({ line, text: l, error: loc.error });
			continue;
		}
		let info: BlobInfo;
		try {
			info = parseBlob(loc.blob);
		} catch (e) {
			results.push({ line, text: l, error: (e as Error).message });
			continue;
		}
		const prefix = tokens.slice(0, loc.index).map((t) => t.text);
		const keyEnd = tokens[loc.index + 1].end;
		const comment = l.slice(keyEnd).trim();
		const parsed: ParsedKey = {
			line,
			source: rfc4716 ? 'rfc4716' : 'public',
			type: info.type,
			label: info.label,
			bits: info.bits,
			comment,
			application: info.application,
			rsaExponent: info.rsaExponent,
			sha256: await sha256Fingerprint(info.plain),
			md5: md5Fingerprint(info.plain),
			flags: flagsFor(info, now)
		};
		if (prefix.length) {
			let rest = prefix;
			if (rest[0].startsWith('@')) {
				if (rest[0] !== '@cert-authority' && rest[0] !== '@revoked') {
					results.push({ line, text: l, error: `Unknown known_hosts marker ${rest[0]}` });
					continue;
				}
				parsed.marker = rest[0];
				rest = rest.slice(1);
				if (rest.length !== 1) {
					results.push({
						line,
						text: l,
						error: 'A known_hosts marker needs exactly one host field'
					});
					continue;
				}
				parsed.source = 'known_hosts';
				parsed.hosts = parseHosts(rest[0]);
			} else if (rest.length === 1) {
				const opts = rest[0].startsWith('|1|') ? null : parseOptions(rest[0]);
				if (opts) {
					parsed.source = 'authorized_keys';
					parsed.options = opts;
				} else {
					parsed.source = 'known_hosts';
					parsed.hosts = parseHosts(rest[0]);
				}
			} else {
				results.push({
					line,
					text: l,
					error: `Unexpected text before the key type: ${prefix.join(' ')}`
				});
				continue;
			}
			if (parsed.marker === '@revoked')
				parsed.flags.unshift({ level: 'danger', text: 'Marked @revoked: ssh refuses this key.' });
			if (parsed.marker === '@cert-authority')
				parsed.flags.push({
					level: 'info',
					text: 'Marked @cert-authority: trusted to sign host certificates for these hosts.'
				});
			if (parsed.options?.some((o) => o.name.toLowerCase() === 'cert-authority'))
				parsed.flags.push({
					level: 'info',
					text: 'cert-authority option: this key is trusted as a CA for user certificates.'
				});
		}
		if (info.cert) {
			const { caBlob, ...c } = info.cert;
			parsed.cert = { ...c, caSha256: await sha256Fingerprint(caBlob) };
		}
		results.push(parsed);
	}
	return results;
}

/** ssh-keygen -l style line: "256 SHA256:... comment (ED25519)". */
export function keygenLine(k: ParsedKey, fp: 'sha256' | 'md5' = 'sha256'): string {
	const name =
		k.source === 'known_hosts' && k.hosts ? k.hosts.map((h) => h.text).join(',') : k.comment;
	return `${k.bits} ${k[fp]} ${name || 'no comment'} (${k.label})`;
}

/**
 * Checks a host name against a hashed known_hosts entry: HMAC-SHA1 keyed with the salt over the
 * name, or over "[name]:port" for a port other than 22 (OpenSSH hostfile.c, host_hash).
 */
export async function hashedHostMatches(h: HostPattern, host: string, port = 22): Promise<boolean> {
	if (!h.hashed) return false;
	const name = port === 22 ? host.toLowerCase() : `[${host.toLowerCase()}]:${port}`;
	const key = await crypto.subtle.importKey(
		'raw',
		h.hashed.salt as BufferSource,
		{ name: 'HMAC', hash: 'SHA-1' },
		false,
		['sign']
	);
	const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(name)));
	return mac.length === h.hashed.hash.length && mac.every((x, i) => x === h.hashed!.hash[i]);
}

/** Intake detection: a line that starts with an OpenSSH key type followed by key data. */
export function looksLikeSshKey(s: string): number {
	return /^\s*(?:ssh-|ecdsa-sha2-|sk-)[a-z0-9@.-]+\s+AAAA[A-Za-z0-9+/]/.test(s) ? 0.9 : 0;
}
