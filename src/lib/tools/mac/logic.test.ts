import { describe, expect, it } from 'vitest';
import {
	analyse,
	formatMac,
	interfaceId,
	linkLocal,
	looksLikeMac,
	lookupVendor,
	macFromIpv6,
	modifiedEui64,
	parseMac,
	slaacAddress,
	slapQuadrant,
	toEui64,
	vendors
} from './logic';

const mac = [0x00, 0x1a, 0x2b, 0x3c, 0x4d, 0x5e];

describe('parseMac', () => {
	it('reads every common notation', () => {
		for (const s of [
			'00:1a:2b:3c:4d:5e',
			'00-1A-2B-3C-4D-5E',
			'001a.2b3c.4d5e',
			'001A2B3C4D5E',
			'00 1a 2b 3c 4d 5e',
			'0:1a:2b:3c:4d:5e',
			'  00:1a:2b:3c:4d:5e  '
		])
			expect(parseMac(s)).toEqual(mac);
	});
	it('rejects other input with a reason', () => {
		expect(() => parseMac('')).toThrow('Enter a MAC');
		expect(() => parseMac('00:1a:2b:3c:4d')).toThrow('12 hex digits');
		expect(() => parseMac('00:1a-2b:3c:4d:5e')).toThrow('12 hex digits');
		expect(() => parseMac('00:1a:2b:ff:fe:3c:4d:5e')).toThrow('EUI-64');
		expect(() => parseMac('gg:1a:2b:3c:4d:5e')).toThrow('not a MAC');
	});
});

describe('formatMac', () => {
	it('writes all four forms', () => {
		expect(formatMac(mac, 'colon')).toBe('00:1a:2b:3c:4d:5e');
		expect(formatMac(mac, 'dash', true)).toBe('00-1A-2B-3C-4D-5E');
		expect(formatMac(mac, 'dot')).toBe('001a.2b3c.4d5e');
		expect(formatMac(mac, 'bare', true)).toBe('001A2B3C4D5E');
	});
});

describe('bits', () => {
	it('reads I/G and U/L', () => {
		expect(analyse('00:1a:2b:3c:4d:5e')).toMatchObject({
			multicast: false,
			local: false,
			randomised: false
		});
		expect(analyse('01:00:5e:00:00:fb')).toMatchObject({ multicast: true, local: false });
		expect(analyse('ff:ff:ff:ff:ff:ff')).toMatchObject({
			multicast: true,
			broadcast: true,
			local: true
		});
		expect(analyse('33:33:00:00:00:01').vendor?.name).toBe('IPv6 multicast');
	});
	it('flags locally administered unicast as likely randomised, but not known virtual prefixes', () => {
		expect(analyse('da:a1:19:12:34:56').randomised).toBe(true);
		expect(analyse('52:54:00:12:34:56')).toMatchObject({ local: true, randomised: false });
		expect(analyse('02:42:ac:11:00:02').vendor?.name).toMatch(/^Docker/);
		expect(analyse('03:00:00:00:00:01').randomised).toBe(false);
	});
	it('names the SLAP quadrant (IEEE 802c)', () => {
		expect(slapQuadrant(parseMac('02:00:00:00:00:01'))).toMatch(/^AAI/);
		expect(slapQuadrant(parseMac('06:00:00:00:00:01'))).toBe('Reserved');
		expect(slapQuadrant(parseMac('0a:00:00:00:00:01'))).toMatch(/^ELI/);
		expect(slapQuadrant(parseMac('0e:00:00:00:00:01'))).toMatch(/^SAI/);
		expect(slapQuadrant(mac)).toBeUndefined();
	});
});

describe('EUI-64 and IPv6', () => {
	it('inserts FF-FE and flips the U/L bit (RFC 4291 appendix A)', () => {
		expect(formatMac(toEui64(mac), 'colon')).toBe('00:1a:2b:ff:fe:3c:4d:5e');
		expect(formatMac(modifiedEui64(mac), 'colon')).toBe('02:1a:2b:ff:fe:3c:4d:5e');
		expect(interfaceId(mac)).toBe(0x021a2bfffe3c4d5en);
		expect(linkLocal(mac)).toBe('fe80::21a:2bff:fe3c:4d5e');
		// A locally administered address gets the bit cleared
		expect(linkLocal(parseMac('52:54:00:12:34:56'))).toBe('fe80::5054:ff:fe12:3456');
	});
	it('builds a SLAAC address in a /64', () => {
		expect(slaacAddress('2001:db8:1:2::/64', mac)).toBe('2001:db8:1:2:21a:2bff:fe3c:4d5e');
		expect(slaacAddress('2001:db8:1:2::', mac)).toBe('2001:db8:1:2:21a:2bff:fe3c:4d5e');
		expect(() => slaacAddress('2001:db8::/48', mac)).toThrow('/64');
		expect(() => slaacAddress('nope', mac)).toThrow('IPv6 /64');
	});
	it('recovers the MAC from an EUI-64 based address', () => {
		expect(macFromIpv6('fe80::21a:2bff:fe3c:4d5e%eth0')).toEqual(mac);
		expect(macFromIpv6('fe80::1')).toBeUndefined();
		expect(macFromIpv6('bogus')).toBeUndefined();
	});
});

describe('vendors', () => {
	it('matches the longest prefix', () => {
		expect(lookupVendor(parseMac('00:50:56:aa:bb:cc'))?.name).toBe('VMware');
		expect(lookupVendor(parseMac('00:15:5d:01:02:03'))?.name).toMatch(/Hyper-V/);
		expect(lookupVendor(parseMac('00:00:0c:07:ac:01'))?.name).toMatch(/HSRP/);
		expect(lookupVendor(parseMac('00:00:0c:12:34:56'))?.name).toBe('Cisco');
		expect(lookupVendor(parseMac('00:00:5e:00:01:0a'))?.name).toMatch(/VRRP IPv4/);
		expect(lookupVendor(parseMac('b8:27:eb:00:00:01'))?.name).toMatch(/Raspberry Pi/);
		expect(lookupVendor(parseMac('12:34:56:78:9a:bc'))).toBeUndefined();
	});
	it('has well-formed, unique prefixes', () => {
		for (const v of vendors) expect(v.prefix).toMatch(/^([0-9a-f]{2})+$/);
		expect(new Set(vendors.map((v) => v.prefix)).size).toBe(vendors.length);
	});
});

describe('looksLikeMac', () => {
	it('claims separated MACs only', () => {
		expect(looksLikeMac('00:1a:2b:3c:4d:5e')).toBe(0.9);
		expect(looksLikeMac('00-1A-2B-3C-4D-5E')).toBe(0.9);
		expect(looksLikeMac('001a.2b3c.4d5e')).toBe(0.9);
		expect(looksLikeMac('001a2b3c4d5e')).toBe(0);
		expect(looksLikeMac('fe80::1')).toBe(0);
		expect(looksLikeMac('10.0.0.1')).toBe(0);
		expect(looksLikeMac('2001:db8:0:0:0:0:0:1')).toBe(0);
	});
});
