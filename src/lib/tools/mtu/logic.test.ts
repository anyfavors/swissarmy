import { describe, expect, it } from 'vitest';
import {
	computeStack,
	decodeStack,
	encodeStack,
	espInner,
	layerKinds,
	mssFor,
	newLayer,
	presets
} from './logic';

const inner = (base: number, stack: string) => computeStack(base, decodeStack(stack)).inner;

describe('fixed overheads', () => {
	it('matches the commonly quoted figures', () => {
		expect(inner(1500, 'pppoe')).toBe(1492);
		expect(inner(1500, 'wg:4')).toBe(1440);
		expect(inner(1500, 'wg:6')).toBe(1420);
		expect(inner(1500, 'pppoe,wg:4')).toBe(1432);
		expect(inner(1500, 'vxlan:4')).toBe(1450);
		expect(inner(1500, 'vxlan:6')).toBe(1430);
		expect(inner(1500, 'geneve:4:0')).toBe(1450);
		expect(inner(1500, 'geneve:4:8')).toBe(1442);
		expect(inner(1500, 'gre:4:')).toBe(1476);
		expect(inner(1500, 'gre:4:k')).toBe(1472);
		expect(inner(1500, 'gre:6:t')).toBe(1442);
		expect(inner(1500, 'mpls:2')).toBe(1492);
		expect(inner(1500, 'vlan')).toBe(1496);
		expect(inner(1500, 'qinq')).toBe(1492);
		expect(inner(1500, 'ethernet')).toBe(1486);
		expect(inner(1500, 'ovpn:4:aead:')).toBe(1448);
		expect(inner(1500, 'ovpn:4:aead:t')).toBe(1434);
	});
	it('reports each layer with its overhead and source', () => {
		const r = computeStack(1500, decodeStack('pppoe,wg:6'));
		expect(r.layers.map((l) => [l.outer, l.overhead, l.inner])).toEqual([
			[1500, 8, 1492],
			[1492, 80, 1412]
		]);
		expect(r.layers[1].source).toContain('80 over IPv6');
		expect(r.layers[0].source).toBe('RFC 2516');
		expect(r.layers.find((l) => l.estimate)).toBeUndefined();
		expect(computeStack(1500, decodeStack('ovpn:4:aead:')).layers[0].estimate).toBe(true);
	});
});

describe('ESP', () => {
	it('fills the packet exactly for 4-byte aligned AEAD ciphers', () => {
		// 20 IP + 8 ESP + 8 IV + 1446 payload + 2 trailer + 16 ICV = 1500
		expect(espInner(1500, 4, 'aes-gcm', false)).toBe(1446);
		expect(espInner(1500, 4, 'aes-gcm', true)).toBe(1438);
		expect(espInner(1500, 6, 'chacha20-poly1305', false)).toBe(1426);
	});
	it('rounds down to the 16-byte block for CBC', () => {
		// 1500 - 20 - 8 - 16 - 12 = 1444 -> 1440 encrypted -> 1438 payload
		expect(espInner(1500, 4, 'aes-cbc-sha1', false)).toBe(1438);
		expect(espInner(1500, 4, 'aes-cbc-sha256', false)).toBe(1438);
		expect(espInner(1400, 4, 'aes-cbc-sha256', true)).toBe(1326);
		const l = computeStack(1500, decodeStack('esp:4:aes-cbc-sha1:')).layers[0];
		expect(l.parts).toContain('padding 0');
		expect(l.estimate).toBe(true);
	});
	it('returns zero when nothing fits', () => {
		expect(espInner(60, 6, 'aes-gcm', true)).toBe(0);
	});
});

describe('MSS', () => {
	it('subtracts IP and the fixed TCP header (RFC 6691)', () => {
		expect(mssFor(1500, 4, 0).mss).toBe(1460);
		expect(mssFor(1500, 6, 0).mss).toBe(1440);
		expect(mssFor(1440, 4, 12)).toMatchObject({ mss: 1400, payload: 1388 });
		expect(mssFor(1420, 6, 12).mss).toBe(1360);
	});
	it('warns below the protocol minimums', () => {
		expect(mssFor(1279, 6, 0).warnings[0]).toContain('1280');
		expect(mssFor(1280, 6, 0).warnings).toEqual([]);
		expect(mssFor(500, 4, 0).warnings[0]).toContain('576');
	});
});

describe('stack', () => {
	it('validates the base MTU', () => {
		expect(() => computeStack(40, [])).toThrow('68 to 65535');
		expect(() => computeStack(1500.5, [])).toThrow('whole number');
		expect(computeStack(9000, []).inner).toBe(9000);
	});
	it('never goes below zero', () => {
		expect(inner(100, 'wg:6,wg:6')).toBe(0);
	});
	it('round-trips through the URL form', () => {
		const stack = layerKinds.map(([k]) => newLayer(k));
		expect(decodeStack(encodeStack(stack))).toEqual(stack);
		const odd = decodeStack('esp:6:chacha20-poly1305:n,ovpn:6:cbc-sha1:t,gre:6:kst,mpls:3,bogus');
		expect(decodeStack(encodeStack(odd))).toEqual(odd);
		expect(odd).toHaveLength(4);
	});
	it('has working presets', () => {
		for (const p of presets) expect(inner(p.base, p.stack)).toBeGreaterThan(1300);
	});
});
