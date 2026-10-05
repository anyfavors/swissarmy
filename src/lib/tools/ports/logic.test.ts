import { describe, expect, it } from 'vitest';
import { ports } from './data';
import { find, portLabel, rangeOf, validPort } from './logic';

const all = { q: '', proto: 'all' as const, risky: false };

describe('data', () => {
	it('is well formed', () => {
		for (const p of ports) {
			expect(p.port).toBeGreaterThanOrEqual(0);
			expect(p.to ?? p.port).toBeLessThanOrEqual(65535);
			if (p.to) expect(p.to).toBeGreaterThan(p.port);
			expect(p.name.length).toBeGreaterThan(1);
			expect(p.desc.length).toBeGreaterThan(3);
			// an entry is either IANA-named or marked as common use
			expect(Boolean(p.iana) !== Boolean(p.common), `${p.port} ${p.name}`).toBe(true);
		}
	});
	it('is sorted and has no duplicate port/protocol pairs', () => {
		const keys = ports.map((p) => `${p.port}/${p.proto}`);
		expect(new Set(keys).size).toBe(keys.length);
		for (let i = 1; i < ports.length; i++)
			expect(ports[i].port).toBeGreaterThanOrEqual(ports[i - 1].port);
	});
	it('has the IANA names for well-known services', () => {
		const iana = (n: number, proto?: string) =>
			ports.find((p) => p.port === n && (!proto || p.proto === proto))?.iana;
		expect(iana(22)).toBe('ssh');
		expect(iana(53)).toBe('domain');
		expect(iana(445)).toBe('microsoft-ds');
		expect(iana(3389)).toBe('ms-wbt-server');
		expect(iana(5985)).toBe('wsman');
		expect(iana(5986)).toBe('wsmans');
		expect(iana(514, 'tcp')).toBe('shell');
		expect(iana(514, 'udp')).toBe('syslog');
	});
	it('flags risky services', () => {
		for (const n of [23, 445, 3389, 2375, 11211, 161]) {
			expect(ports.find((p) => p.port === n)?.risk, String(n)).toBeTruthy();
		}
	});
});

describe('find', () => {
	it('finds by number, including ranges', () => {
		expect(find(ports, { ...all, q: '443' }).map((p) => p.name)).toEqual(['HTTPS']);
		expect(find(ports, { ...all, q: '6667' }).map((p) => p.name)).toEqual(['IRC']);
		expect(find(ports, { ...all, q: '31000' }).map((p) => p.name)).toEqual(['Kubernetes NodePort']);
	});
	it('filters by protocol', () => {
		expect(find(ports, { ...all, q: '514/udp' }).map((p) => p.name)).toEqual(['Syslog']);
		expect(find(ports, { ...all, q: '514', proto: 'tcp' }).map((p) => p.name)).toEqual(['rsh']);
		expect(find(ports, { ...all, q: '53', proto: 'udp' })).toHaveLength(1);
		expect(find(ports, { ...all, proto: 'udp' }).every((p) => p.proto !== 'tcp')).toBe(true);
	});
	it('finds by name and description', () => {
		expect(find(ports, { ...all, q: 'winrm' }).map((p) => p.port)).toEqual([5985, 5986]);
		expect(find(ports, { ...all, q: 'ms-wbt' }).map((p) => p.port)).toEqual([3389]);
		expect(find(ports, { ...all, q: 'kubernetes' }).map((p) => p.port)).toContain(6443);
	});
	it('shows only risky ones on request', () => {
		expect(find(ports, { ...all, risky: true }).every((p) => p.risk)).toBe(true);
	});
	it('labels and validates', () => {
		expect(portLabel({ port: 6000, to: 6063, proto: 'tcp', name: 'X', desc: 'x' })).toBe(
			'6000-6063'
		);
		expect(rangeOf(80)).toMatch(/System/);
		expect(rangeOf(8080)).toMatch(/User/);
		expect(rangeOf(50000)).toMatch(/Dynamic/);
		expect(validPort('65535')).toBe(65535);
		expect(validPort('65536')).toBeNull();
	});
});
