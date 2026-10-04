import { describe, expect, it } from 'vitest';
import { formatIPv4, maskToPrefix, parseCidr, parseIPv4, toBinary } from './logic';

const f = formatIPv4;

describe('cidr', () => {
	it('calculates a /22', () => {
		const r = parseCidr('192.168.10.0/22');
		expect(f(r.network)).toBe('192.168.8.0');
		expect(f(r.broadcast)).toBe('192.168.11.255');
		expect(f(r.mask)).toBe('255.255.252.0');
		expect(f(r.wildcard)).toBe('0.0.3.255');
		expect(f(r.firstHost)).toBe('192.168.8.1');
		expect(f(r.lastHost)).toBe('192.168.11.254');
		expect(r.usable).toBe(1022);
		expect(r.classification.rfc).toBe('RFC 1918');
		expect(r.note).toMatch(/Host bits are set/);
	});

	it('accepts dotted masks with space or slash', () => {
		expect(parseCidr('10.1.2.3 255.255.255.0').prefix).toBe(24);
		expect(parseCidr('10.1.2.3/255.255.255.128').prefix).toBe(25);
	});

	it('handles /0, /31 and /32', () => {
		expect(parseCidr('0.0.0.0/0').total).toBe(2 ** 32);
		expect(f(parseCidr('0.0.0.0/0').broadcast)).toBe('255.255.255.255');
		const p2p = parseCidr('10.0.0.0/31');
		expect(p2p.usable).toBe(2);
		expect(f(p2p.firstHost)).toBe('10.0.0.0');
		const host = parseCidr('8.8.8.8');
		expect(host.prefix).toBe(32);
		expect(host.usable).toBe(1);
		expect(host.classification.label).toBe('Public');
	});

	it('classifies special ranges', () => {
		expect(parseCidr('100.64.1.1/32').classification.rfc).toBe('RFC 6598');
		expect(parseCidr('172.31.255.1/32').classification.label).toBe('Private');
		expect(parseCidr('172.32.0.1/32').classification.label).toBe('Public');
		expect(parseCidr('203.0.113.7/32').classification.rfc).toBe('RFC 5737');
	});

	it('rejects bad input', () => {
		expect(() => parseIPv4('256.1.1.1')).toThrow();
		expect(() => parseCidr('10.0.0.0/33')).toThrow(/0 to 32/);
		expect(() => maskToPrefix(parseIPv4('255.0.255.0'))).toThrow(/contiguous/);
	});

	it('renders binary', () => {
		expect(toBinary(parseIPv4('255.255.252.0'))).toBe('11111111.11111111.11111100.00000000');
	});
});
