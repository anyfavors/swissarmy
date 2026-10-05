import { describe, expect, it } from 'vitest';
import { crossCheck } from './crosscheck';
import {
	buildVector,
	looksLikeCvss,
	parseVector,
	roundup,
	scoreV3,
	severity,
	v4Nomenclature
} from './logic';

const score = (v: string) => scoreV3(parseVector(v).values);

describe('Roundup (CVSS v3.1 appendix A)', () => {
	it('rounds up to one decimal', () => {
		expect(roundup(4.02)).toBe(4.1);
		expect(roundup(4.0)).toBe(4.0);
		expect(roundup(4.1)).toBe(4.1);
		expect(roundup(0)).toBe(0);
		expect(roundup(9.99)).toBe(10);
	});
	it('ignores floating point noise', () => {
		// The case the appendix was written for: plain ceil(x * 10) / 10 would give 4.1.
		expect(roundup(4.000000000000001)).toBe(4.0);
		expect(Math.ceil(4.000000000000001 * 10) / 10).toBe(4.1);
		expect(roundup(0.1 + 0.2)).toBe(0.3); // 0.30000000000000004 is 0.3 plus noise
		expect(roundup(2.9999999)).toBe(3.0);
	});
});

describe('severity bands (v3.1 table 14)', () => {
	it.each([
		[0, 'None'],
		[0.1, 'Low'],
		[3.9, 'Low'],
		[4.0, 'Medium'],
		[6.9, 'Medium'],
		[7.0, 'High'],
		[8.9, 'High'],
		[9.0, 'Critical'],
		[10, 'Critical']
	] as const)('%f is %s', (s, label) => {
		expect(severity(s)).toBe(label);
	});
});

describe('base scores: FIRST "CVSS v3.1 Examples" document', () => {
	// https://www.first.org/cvss/v3.1/examples
	const examples: [string, string, number][] = [
		['CVE-2013-1937 phpMyAdmin reflected XSS', 'AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N', 6.1],
		['CVE-2013-0375 MySQL stored SQL injection', 'AV:N/AC:L/PR:L/UI:N/S:C/C:L/I:L/A:N', 6.4],
		['CVE-2014-3566 SSLv3 POODLE', 'AV:N/AC:H/PR:N/UI:R/S:U/C:L/I:N/A:N', 3.1],
		['CVE-2012-1516 VMware guest to host escape', 'AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:H', 9.9],
		['CVE-2009-0783 Apache Tomcat XML parser', 'AV:L/AC:L/PR:H/UI:N/S:U/C:L/I:L/A:L', 4.2],
		['CVE-2012-0384 Cisco IOS command execution', 'AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H', 8.8],
		['CVE-2015-1098 iWork denial of service', 'AV:L/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:H', 7.8],
		['CVE-2014-0160 Heartbleed', 'AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N', 7.5],
		['CVE-2014-6271 Shellshock', 'AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H', 9.8],
		['CVE-2008-1447 DNS cache poisoning', 'AV:N/AC:H/PR:N/UI:N/S:C/C:N/I:H/A:N', 6.8],
		['CVE-2014-2005 Sophos login screen bypass', 'AV:P/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H', 6.8],
		['CVE-2010-0467 Joomla directory traversal', 'AV:N/AC:L/PR:N/UI:N/S:C/C:L/I:N/A:N', 5.8],
		['CVE-2012-1342 Cisco ACL bypass', 'AV:N/AC:L/PR:N/UI:N/S:C/C:N/I:L/A:N', 5.8],
		['CVE-2013-6014 Juniper proxy ARP DoS', 'AV:A/AC:L/PR:N/UI:N/S:C/C:H/I:N/A:H', 9.3],
		['CVE-2014-9253 DokuWiki reflected XSS', 'AV:N/AC:L/PR:L/UI:R/S:C/C:L/I:L/A:N', 5.4],
		['CVE-2011-1265 Windows Bluetooth RCE', 'AV:A/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H', 8.8],
		['CVE-2016-1645 Chrome PDFium RCE', 'AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:H', 8.8],
		['CVE-2016-0128 Badlock', 'AV:N/AC:H/PR:N/UI:R/S:U/C:H/I:H/A:N', 6.8]
	];
	it.each(examples)('%s', (_, v, expected) => {
		expect(score(`CVSS:3.1/${v}`).base).toBe(expected);
	});

	it('well-known vectors', () => {
		expect(score('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H').base).toBe(9.8);
		expect(score('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H').base).toBe(10.0);
		expect(score('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N').base).toBe(0);
	});

	it('subscores', () => {
		const s = score('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H');
		expect(s.impact).toBeCloseTo(5.873, 3);
		expect(s.exploitability).toBeCloseTo(3.887, 3);
	});
});

describe('temporal and environmental', () => {
	it('temporal multiplies and rounds up', () => {
		// 9.8 * 0.91 * 0.95 * 0.92 = 7.794 -> 7.8
		const s = score('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/E:U/RL:O/RC:U');
		expect(s.temporal).toBe(7.8);
		expect(s.environmental).toBe(7.8);
	});
	it('no temporal or environmental metrics: both equal base', () => {
		const s = score('CVSS:3.1/AV:L/AC:H/PR:L/UI:R/S:C/C:L/I:L/A:N');
		expect(s.temporal).toBe(s.base);
		expect(s.environmental).toBe(s.base);
	});
	it('modified metrics, scope change and requirements', () => {
		const s = score(
			'CVSS:3.1/AV:L/AC:H/PR:H/UI:R/S:U/C:L/I:N/A:N/CR:H/IR:H/AR:H/MAV:N/MAC:L/MPR:N/MUI:N/MS:C/MC:H/MI:H/MA:H'
		);
		expect(s.base).toBe(1.8);
		expect(s.environmental).toBe(10.0);
	});
	it('modified impact none gives 0', () => {
		expect(score('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/MC:N/MI:N/MA:N').environmental).toBe(
			0
		);
	});
	it.each(crossCheck)('cross-check %s', (v, b, t, e) => {
		const s = score(v);
		expect([s.base, s.temporal, s.environmental]).toEqual([b, t, e]);
	});
});

describe('vector strings', () => {
	it('round-trips in canonical order, dropping X', () => {
		const p = parseVector('CVSS:3.1/S:U/AV:N/AC:L/PR:N/UI:N/C:H/I:H/A:H/E:X/RL:O');
		expect(buildVector(p.version, p.values)).toBe(
			'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/RL:O'
		);
		expect(p.warnings[0]).toContain('reordered');
	});
	it('accepts a missing prefix with a warning, and parentheses', () => {
		const p = parseVector('(AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H)');
		expect(p.version).toBe('3.1');
		expect(p.warnings[0]).toContain('No CVSS: prefix');
	});
	it('accepts 3.0 with a note on the equations', () => {
		const p = parseVector('CVSS:3.0/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H');
		expect(p.version).toBe('3.0');
		expect(p.warnings[0]).toContain('v3.1 equations');
	});
	it('rejects bad vectors with specific messages', () => {
		expect(() => parseVector('')).toThrow('Empty');
		expect(() => parseVector('CVSS:2.0/AV:N')).toThrow('not supported');
		expect(() => parseVector('AV:N/AC:L/Au:N/C:P/I:P/A:P')).toThrow('CVSS v2');
		expect(() => parseVector('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H')).toThrow(
			'Missing base metric: A'
		);
		expect(() => parseVector('CVSS:3.1/AV:N/AV:L/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H')).toThrow('twice');
		expect(() => parseVector('CVSS:3.1/AV:X/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H')).toThrow(
			'cannot be "X"'
		);
		expect(() => parseVector('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/AT:N')).toThrow(
			'Unknown metric "AT"'
		);
		expect(() => parseVector('CVSS:3.1/AV:N//AC:L')).toThrow('not a metric:value pair');
		expect(() => parseVector('hello')).toThrow('starts with CVSS');
	});
});

describe('CVSS v4.0 (parse and explain)', () => {
	const v = 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N';
	it('parses base vectors', () => {
		const p = parseVector(v);
		expect(p.version).toBe('4.0');
		expect(p.values.VC).toBe('H');
		expect(v4Nomenclature(p.values)).toBe('CVSS-B');
		expect(buildVector('4.0', p.values)).toBe(v);
	});
	it('nomenclature with threat and environmental metrics', () => {
		expect(v4Nomenclature(parseVector(`${v}/E:A`).values)).toBe('CVSS-BT');
		expect(v4Nomenclature(parseVector(`${v}/MSI:S`).values)).toBe('CVSS-BE');
		expect(v4Nomenclature(parseVector(`${v}/E:P/CR:H`).values)).toBe('CVSS-BTE');
		// Supplemental metrics do not change the nomenclature.
		expect(v4Nomenclature(parseVector(`${v}/AU:Y/U:Red`).values)).toBe('CVSS-B');
	});
	it('validates v4 values', () => {
		expect(() => parseVector(v.replace('UI:N', 'UI:R'))).toThrow('cannot be "R"');
		expect(() => parseVector(`${v}/MSC:S`)).toThrow('cannot be "S"');
		expect(() => parseVector('CVSS:4.0/AV:N/AC:L/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N')).toThrow(
			'Missing base metric: AT'
		);
		expect(() => parseVector(`${v}/S:C`)).toThrow('Safety (S) cannot be "C"');
	});
	it('infers v4 without a prefix', () => {
		expect(parseVector(v.slice(9)).version).toBe('4.0');
	});
});

describe('detect', () => {
	it('matches CVSS vectors only', () => {
		expect(looksLikeCvss('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H')).toBe(0.95);
		expect(looksLikeCvss('CVSS:4.0/AV:N')).toBe(0.95);
		expect(looksLikeCvss('AV:N/AC:L')).toBe(0);
		expect(looksLikeCvss('CVSS:2.0/AV:N')).toBe(0);
	});
});
