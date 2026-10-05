import { describe, expect, it } from 'vitest';
import {
	buildConfigs,
	derivePublic,
	formatEndpoint,
	fromBase64,
	generateBuiltin,
	generateKeyPair,
	generatePsk,
	generateWebCrypto,
	hasWebCryptoX25519,
	isClamped,
	parseKey,
	toBase64,
	type WgKeys,
	type WgOptions
} from './logic';
import { BASE, x25519 } from './x25519';

const hex = (s: string) => Uint8Array.from(s.match(/../g)!, (h) => parseInt(h, 16));
const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

describe('X25519, RFC 7748', () => {
	it('section 5.2: scalar multiplication vectors', () => {
		expect(
			toHex(
				x25519(
					hex('a546e36bf0527c9d3b16154b82465edd62144c0ac1fc5a18506a2244ba449ac4'),
					hex('e6db6867583030db3594c1a424b15f7c726624ec26b3353b10a903a6d0ab1c4c')
				)
			)
		).toBe('c3da55379de9c6908e94ea4df28d084f32eccf03491c71f754b4075577a28552');
		// The u-coordinate has its top bit set, which must be masked
		expect(
			toHex(
				x25519(
					hex('4b66e9d4d1b4673c5ad22691957d6af5c11b6421e0ea01d42ca4169e7918ba0d'),
					hex('e5210f12786811d3f4b7959d0538ae2c31dbe7106fc03c3efc4cd549c715a493')
				)
			)
		).toBe('95cbde9476e8907d7aade45cb4b873f88b595a68799fa152e6f8f7647aac7957');
	});

	it('section 5.2: iterated, 1 and 1,000 times', () => {
		let k = BASE;
		let u = BASE;
		for (let i = 1; i <= 1000; i++) {
			const r = x25519(k, u);
			u = k;
			k = r;
			if (i === 1)
				expect(toHex(k)).toBe('422c8e7a6227d7bca1350b3e2bb7279f7897b87bb6854b783c60e80311ae3079');
		}
		expect(toHex(k)).toBe('684cf59ba83309552800ef566f2f4d3c1c3887c49360e3875f2eb94d99532c51');
	});

	it('section 6.1: Diffie-Hellman', () => {
		const aPriv = hex('77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a');
		const bPriv = hex('5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb');
		const aPub = x25519(aPriv, BASE);
		const bPub = x25519(bPriv, BASE);
		expect(toHex(aPub)).toBe('8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a');
		expect(toHex(bPub)).toBe('de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f');
		const shared = '4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742';
		expect(toHex(x25519(aPriv, bPub))).toBe(shared);
		expect(toHex(x25519(bPriv, aPub))).toBe(shared);
	});

	it('rejects wrong lengths', () => {
		expect(() => x25519(new Uint8Array(31), BASE)).toThrow('32 bytes');
		expect(() => x25519(new Uint8Array(32), new Uint8Array(3))).toThrow('32 bytes');
	});
});

describe('WireGuard keys', () => {
	// RFC 7748 6.1 Alice's private key in WireGuard Base64
	const alicePriv = toBase64(
		hex('77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a')
	);
	const alicePub = toBase64(
		hex('8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a')
	);

	it('derives the public key like wg pubkey', () => {
		expect(derivePublic(alicePriv)).toBe(alicePub);
		expect(isClamped(alicePriv)).toBe(false);
	});

	it('validates the key format', () => {
		expect(parseKey(alicePriv)).toHaveLength(32);
		expect(() => parseKey('abc')).toThrow('44 characters');
		expect(() => parseKey(alicePriv.slice(0, 42) + 'B=')).toThrow('44 characters');
		expect(() => parseKey(' ')).toThrow('Enter a key');
	});

	it('generates clamped key pairs with the built-in code', () => {
		const kp = generateBuiltin();
		expect(isClamped(kp.privateKey)).toBe(true);
		expect(derivePublic(kp.privateKey)).toBe(kp.publicKey);
		expect(fromBase64(generatePsk())).toHaveLength(32);
	});

	it('uses WebCrypto when available and agrees with RFC 7748', async () => {
		const supported = await hasWebCryptoX25519();
		const kp = await generateKeyPair();
		expect(kp.source).toBe(supported ? 'webcrypto' : 'builtin');
		expect(derivePublic(kp.privateKey)).toBe(kp.publicKey);
		if (supported) {
			// Agreement between WebCrypto deriveBits and the built-in ladder
			const a = await generateWebCrypto();
			const b = generateBuiltin();
			expect(toHex(x25519(fromBase64(a.privateKey), fromBase64(b.publicKey)))).toBe(
				toHex(x25519(fromBase64(b.privateKey), fromBase64(a.publicKey)))
			);
		}
	});
});

describe('configs', () => {
	const kp = (n: number) => {
		const priv = new Uint8Array(32).fill(n);
		const privateKey = toBase64(priv);
		return { privateKey, publicKey: derivePublic(privateKey) };
	};
	const keys: WgKeys = {
		server: kp(1),
		clients: [{ ...kp(2), psk: toBase64(new Uint8Array(32).fill(9)) }, kp(3)]
	};
	const opts: WgOptions = {
		subnet4: '10.8.0.0/24',
		subnet6: 'fd00:8::/64',
		clients: 2,
		endpoint: 'vpn.example.com',
		listenPort: 51820,
		dns: '10.8.0.1, fd00:8::1',
		clientAllowed: '0.0.0.0/0, ::/0',
		keepalive: 25
	};

	it('builds matching server and client configs', () => {
		const c = buildConfigs(opts, keys);
		expect(c.server).toBe(
			[
				'[Interface]',
				'# Server',
				'Address = 10.8.0.1/24, fd00:8::1/64',
				'ListenPort = 51820',
				`PrivateKey = ${keys.server.privateKey}`,
				'',
				'[Peer]',
				'# client1',
				`PublicKey = ${keys.clients[0].publicKey}`,
				`PresharedKey = ${keys.clients[0].psk}`,
				'AllowedIPs = 10.8.0.2/32, fd00:8::2/128',
				'',
				'[Peer]',
				'# client2',
				`PublicKey = ${keys.clients[1].publicKey}`,
				'AllowedIPs = 10.8.0.3/32, fd00:8::3/128',
				''
			].join('\n')
		);
		expect(c.clients[1].conf).toBe(
			[
				'[Interface]',
				'# client2',
				`PrivateKey = ${keys.clients[1].privateKey}`,
				'Address = 10.8.0.3/32, fd00:8::3/128',
				'DNS = 10.8.0.1, fd00:8::1',
				'',
				'[Peer]',
				'# Server',
				`PublicKey = ${keys.server.publicKey}`,
				'AllowedIPs = 0.0.0.0/0, ::/0',
				'Endpoint = vpn.example.com:51820',
				'PersistentKeepalive = 25',
				''
			].join('\n')
		);
		expect(c.clients[0].conf).toContain(`PresharedKey = ${keys.clients[0].psk}`);
	});

	it('handles IPv4 only, no DNS, no keepalive and an MTU', () => {
		const c = buildConfigs(
			{ ...opts, subnet6: '', dns: '', keepalive: 0, clients: 1, mtu: 1420 },
			keys
		);
		expect(c.clients[0].address).toBe('10.8.0.2/32');
		expect(c.clients[0].conf).not.toContain('DNS');
		expect(c.clients[0].conf).not.toContain('PersistentKeepalive');
		expect(c.server).toContain('MTU = 1420');
	});

	it('formats endpoints', () => {
		expect(formatEndpoint('203.0.113.5', 51820)).toBe('203.0.113.5:51820');
		expect(formatEndpoint('vpn.example.com:443', 51820)).toBe('vpn.example.com:443');
		expect(formatEndpoint('2001:db8::1', 51820)).toBe('[2001:db8::1]:51820');
		expect(formatEndpoint('[2001:db8::1]:1234', 51820)).toBe('[2001:db8::1]:1234');
		expect(formatEndpoint('[2001:db8::1]', 51820)).toBe('[2001:db8::1]:51820');
		expect(() => formatEndpoint(' ', 1)).toThrow('Enter the endpoint');
	});

	it('reports problems', () => {
		expect(() => buildConfigs({ ...opts, subnet4: '', subnet6: '' }, keys)).toThrow(
			'tunnel subnet'
		);
		expect(() => buildConfigs({ ...opts, subnet4: 'fd00::/64' }, keys)).toThrow('not an IPv4');
		expect(() => buildConfigs({ ...opts, subnet4: '10.0.0.0/30' }, keys)).toThrow(
			'room for 1 client;'
		);
		expect(() => buildConfigs({ ...opts, subnet4: '10.0.0.0/31' }, keys)).toThrow('/30 or larger');
		expect(() => buildConfigs({ ...opts, clients: 3 }, keys)).toThrow('Not enough client keys');
		expect(() => buildConfigs({ ...opts, clients: 0 }, keys)).toThrow('1 to 250');
		expect(() => buildConfigs({ ...opts, listenPort: 70000 }, keys)).toThrow('Listen port');
		expect(() => buildConfigs({ ...opts, clientAllowed: '0.0.0.0/0, bogus' }, keys)).toThrow();
		expect(() => buildConfigs({ ...opts, dns: '1.1.1.1; rm' }, keys)).toThrow('DNS');
	});
});
