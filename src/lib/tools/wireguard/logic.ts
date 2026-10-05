/**
 * WireGuard keys and configuration files. Keys are Curve25519 (X25519) as in the WireGuard
 * whitepaper: 32 bytes, written in standard Base64 like `wg genkey` and `wg pubkey`.
 * Config keys follow wg(8) and wg-quick(8).
 */
import {
	formatAddress,
	formatPrefix,
	parsePrefix,
	prefixEnd,
	type Family,
	type Prefix
} from '../cidr-sets/logic';
import { clamp, publicFromPrivate } from './x25519';

export { clamp, publicFromPrivate };

export function toBase64(bytes: Uint8Array): string {
	let s = '';
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s);
}

export function fromBase64(s: string): Uint8Array {
	const bin = atob(s);
	return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

const fromBase64Url = (s: string) =>
	fromBase64(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));

/** Reads a WireGuard key: 44 characters of Base64 for 32 bytes. */
export function parseKey(raw: string): Uint8Array {
	const s = raw.trim();
	if (!s) throw new Error('Enter a key');
	if (!/^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/.test(s))
		throw new Error('A WireGuard key is 44 characters of Base64 ending in "=" (32 bytes)');
	return fromBase64(s);
}

export interface KeyPair {
	privateKey: string;
	publicKey: string;
}

/** `wg pubkey`: the public key for a Base64 private key. */
export function derivePublic(privateKey: string): string {
	return toBase64(publicFromPrivate(parseKey(privateKey)));
}

/** True when the private key is already clamped, as `wg genkey` writes it. */
export function isClamped(privateKey: string): boolean {
	const k = parseKey(privateKey);
	return toBase64(clamp(k)) === toBase64(k);
}

export function randomBytes(n: number): Uint8Array {
	const b = new Uint8Array(n);
	crypto.getRandomValues(b);
	return b;
}

/** Built-in path: 32 random bytes, clamped like `wg genkey`, public key by RFC 7748. */
export function generateBuiltin(): KeyPair {
	const priv = clamp(randomBytes(32));
	return { privateKey: toBase64(priv), publicKey: toBase64(publicFromPrivate(priv)) };
}

/** `wg genpsk`: 32 random bytes. */
export const generatePsk = (): string => toBase64(randomBytes(32));

let webCryptoSupport: Promise<boolean> | undefined;

/** Detects WebCrypto X25519 (Chrome 133+, Firefox 130+, Safari 17+, Node 20+). */
export function hasWebCryptoX25519(): Promise<boolean> {
	webCryptoSupport ??= (async () => {
		try {
			if (typeof crypto === 'undefined' || !crypto.subtle) return false;
			const k = await crypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']);
			return 'privateKey' in k;
		} catch {
			return false;
		}
	})();
	return webCryptoSupport;
}

/**
 * WebCrypto path: generate, export as JWK (d = private scalar, x = public u-coordinate), clamp
 * the private key like `wg genkey`, and check the public key against the built-in ladder.
 */
export async function generateWebCrypto(): Promise<KeyPair> {
	const k = (await crypto.subtle.generateKey({ name: 'X25519' }, true, [
		'deriveBits'
	])) as CryptoKeyPair;
	const jwk = await crypto.subtle.exportKey('jwk', k.privateKey);
	if (!jwk.d || !jwk.x) throw new Error('WebCrypto did not export the X25519 key');
	const priv = clamp(fromBase64Url(jwk.d));
	const pub = toBase64(fromBase64Url(jwk.x));
	const check = toBase64(publicFromPrivate(priv));
	if (check !== pub) throw new Error('WebCrypto and RFC 7748 public keys disagree');
	return { privateKey: toBase64(priv), publicKey: pub };
}

export type KeySource = 'webcrypto' | 'builtin';

export async function generateKeyPair(): Promise<KeyPair & { source: KeySource }> {
	if (await hasWebCryptoX25519()) {
		try {
			return { ...(await generateWebCrypto()), source: 'webcrypto' };
		} catch {
			// fall through to the built-in implementation
		}
	}
	return { ...generateBuiltin(), source: 'builtin' };
}

/* ------------------------------------------------------------- configs */

export interface WgOptions {
	/** Tunnel subnet, IPv4. Empty to leave out. */
	subnet4: string;
	/** Tunnel subnet, IPv6. Empty to leave out. */
	subnet6: string;
	clients: number;
	/** Public host name or address of the server, with or without :port. */
	endpoint: string;
	listenPort: number;
	/** DNS servers for clients, comma separated. Empty to leave out. */
	dns: string;
	/** AllowedIPs in the client configs: what the client routes into the tunnel. */
	clientAllowed: string;
	/** Seconds, 0 for off. */
	keepalive: number;
	mtu?: number;
}

export interface WgKeys {
	server: KeyPair;
	clients: (KeyPair & { psk?: string })[];
}

export interface ClientConf {
	name: string;
	address: string;
	conf: string;
}

export interface WgConfigs {
	server: string;
	clients: ClientConf[];
}

function tunnelPrefix(text: string, v: Family): Prefix | undefined {
	if (!text.trim()) return undefined;
	const p = parsePrefix(text);
	if (p.v !== v) throw new Error(`"${text.trim()}" is not an IPv${v} prefix`);
	return p;
}

/** Host i of a prefix: server is 1, clients 2 and up. Skips the IPv4 broadcast address. */
function host(p: Prefix, i: number): bigint {
	const a = p.net + BigInt(i);
	const last = p.v === 4 ? prefixEnd(p) - 1n : prefixEnd(p);
	if (a > last) {
		const room = last - p.net - 1n;
		throw new Error(
			`${formatPrefix(p)} has room for ${room} client${room === 1n ? '' : 's'}; use a larger subnet`
		);
	}
	return a;
}

export function formatEndpoint(endpoint: string, port: number): string {
	const e = endpoint.trim();
	if (!e) throw new Error('Enter the endpoint: the public host name or address of the server');
	if (/\s/.test(e)) throw new Error('The endpoint cannot contain spaces');
	if (e.startsWith('[')) return /\]:\d+$/.test(e) ? e : `${e}:${port}`;
	if ((e.match(/:/g) ?? []).length > 1) return `[${e}]:${port}`;
	return /:\d+$/.test(e) ? e : `${e}:${port}`;
}

function checkList(text: string, what: string): string {
	const items = text
		.split(/[\s,]+/)
		.map((x) => x.trim())
		.filter(Boolean);
	for (const it of items)
		if (!/^[0-9A-Za-z.:/\-[\]%]+$/.test(it)) throw new Error(`${what}: "${it}" is not valid`);
	return items.join(', ');
}

export function buildConfigs(o: WgOptions, keys: WgKeys): WgConfigs {
	if (!Number.isInteger(o.clients) || o.clients < 1 || o.clients > 250)
		throw new Error('Number of clients must be 1 to 250');
	if (!Number.isInteger(o.listenPort) || o.listenPort < 1 || o.listenPort > 65535)
		throw new Error('Listen port must be 1 to 65535');
	if (!Number.isInteger(o.keepalive) || o.keepalive < 0 || o.keepalive > 65535)
		throw new Error('PersistentKeepalive must be 0 to 65535 seconds');
	if (keys.clients.length < o.clients) throw new Error('Not enough client keys yet');
	const p4 = tunnelPrefix(o.subnet4, 4);
	const p6 = tunnelPrefix(o.subnet6, 6);
	if (!p4 && !p6) throw new Error('Enter an IPv4 or IPv6 tunnel subnet');
	if (p4 && p4.len > 30) throw new Error('The IPv4 tunnel subnet must be /30 or larger');
	if (p6 && p6.len > 126) throw new Error('The IPv6 tunnel subnet must be /126 or larger');
	const endpoint = formatEndpoint(o.endpoint, o.listenPort);
	const dns = checkList(o.dns, 'DNS');
	const allowed = checkList(o.clientAllowed, 'AllowedIPs');
	if (!allowed) throw new Error('Enter the AllowedIPs for the clients');
	for (const a of allowed.split(', ')) parsePrefix(a);

	const addr = (i: number, whole: boolean) =>
		[p4, p6]
			.filter((p): p is Prefix => !!p)
			.map((p) => `${formatAddress(p.v, host(p, i))}/${whole ? p.len : p.v === 4 ? 32 : 128}`)
			.join(', ');

	const mtu = o.mtu ? [`MTU = ${o.mtu}`] : [];
	const server = [
		'[Interface]',
		`# Server`,
		`Address = ${addr(1, true)}`,
		`ListenPort = ${o.listenPort}`,
		`PrivateKey = ${keys.server.privateKey}`,
		...mtu
	];
	const clients: ClientConf[] = [];
	for (let i = 0; i < o.clients; i++) {
		const k = keys.clients[i];
		const name = `client${i + 1}`;
		const address = addr(i + 2, false);
		server.push(
			'',
			'[Peer]',
			`# ${name}`,
			`PublicKey = ${k.publicKey}`,
			...(k.psk ? [`PresharedKey = ${k.psk}`] : []),
			`AllowedIPs = ${address}`
		);
		const conf = [
			'[Interface]',
			`# ${name}`,
			`PrivateKey = ${k.privateKey}`,
			`Address = ${address}`,
			...(dns ? [`DNS = ${dns}`] : []),
			...mtu,
			'',
			'[Peer]',
			'# Server',
			`PublicKey = ${keys.server.publicKey}`,
			...(k.psk ? [`PresharedKey = ${k.psk}`] : []),
			`AllowedIPs = ${allowed}`,
			`Endpoint = ${endpoint}`,
			...(o.keepalive ? [`PersistentKeepalive = ${o.keepalive}`] : [])
		];
		clients.push({ name, address, conf: conf.join('\n') + '\n' });
	}
	return { server: server.join('\n') + '\n', clients };
}
