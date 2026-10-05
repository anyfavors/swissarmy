import { describe, expect, it } from 'vitest';
import {
	alignmentPositions,
	capacityBytes,
	dataCodewords,
	encode,
	formatBits,
	penalty,
	readFormat,
	rsDivisor,
	rsRemainder,
	versionBits
} from './encoder';
import { fixtures } from './fixtures';
import {
	emailPayload,
	normaliseBase32,
	otpPayload,
	smsPayload,
	svgFile,
	svgPath,
	vcardPayload,
	wifiPayload
} from './logic';

const hex = (a: number[]) => a.map((x) => x.toString(16).padStart(2, '0')).join(' ');
const rows = (m: boolean[][]) => m.map((r) => r.map((v) => (v ? '1' : '0')).join(''));

describe('ISO/IEC 18004 Annex I example: "01234567", 1-M', () => {
	const q = encode('01234567', { ecl: 'M' });

	it('picks version 1, numeric mode', () => {
		expect(q.version).toBe(1);
		expect(q.mode).toBe('numeric');
		expect(q.size).toBe(21);
	});

	it('produces the data codewords of the annex', () => {
		expect(hex(q.data)).toBe('10 20 0c 56 61 80 ec 11 ec 11 ec 11 ec 11 ec 11');
	});

	it('produces the error correction codewords of the annex', () => {
		expect(hex(q.codewords.slice(16))).toBe('a5 24 d4 c1 ed 36 c7 87 2c 55');
	});
});

describe('Reed-Solomon', () => {
	it('builds the degree 7 generator of Annex A (α exponents 87 229 146 149 238 102 21)', () => {
		// g(x) = x^7 + α^87 x^6 + α^229 x^5 + α^146 x^4 + α^149 x^3 + α^238 x^2 + α^102 x + α^21
		const exp = [1];
		for (let i = 1; i < 256; i++) {
			let v = exp[i - 1] << 1;
			if (v & 0x100) v ^= 0x11d;
			exp.push(v);
		}
		expect(rsDivisor(7)).toEqual([87, 229, 146, 149, 238, 102, 21].map((e) => exp[e]));
	});

	it('gives a zero remainder for a valid codeword sequence', () => {
		const q = encode('01234567', { ecl: 'M' });
		const div = rsDivisor(10);
		expect(rsRemainder(q.codewords, div)).toEqual(new Array(10).fill(0));
	});
});

describe('format and version information', () => {
	it('matches the BCH values of the standard', () => {
		// §7.9.1 example: M, mask 101 -> 100000011001110
		expect(formatBits('M', 5).toString(2).padStart(15, '0')).toBe('100000011001110');
		expect(formatBits('M', 0).toString(2).padStart(15, '0')).toBe('101010000010010');
		expect(formatBits('L', 0).toString(2).padStart(15, '0')).toBe('111011111000100');
		// §7.10 / Annex D: version 7 -> 000111110010010100
		expect(versionBits(7).toString(2).padStart(18, '0')).toBe('000111110010010100');
		expect(versionBits(40).toString(2).padStart(18, '0')).toBe('101000110001101001');
	});

	it('writes format information that reads back', () => {
		for (const ecl of ['L', 'M', 'Q', 'H'] as const) {
			for (let mask = 0; mask < 8; mask++) {
				const q = encode('FIELD MANUAL', { ecl, mask });
				expect(readFormat(q.modules)).toEqual({ ecl, mask });
			}
		}
	});

	it('places the alignment patterns of Annex E', () => {
		expect(alignmentPositions(1)).toEqual([]);
		expect(alignmentPositions(2)).toEqual([6, 18]);
		expect(alignmentPositions(7)).toEqual([6, 22, 38]);
		expect(alignmentPositions(32)).toEqual([6, 34, 60, 86, 112, 138]);
		expect(alignmentPositions(40)).toEqual([6, 30, 58, 86, 114, 142, 170]);
	});
});

describe('capacity (Table 7)', () => {
	it('knows the data codewords at the corners of the table', () => {
		expect(dataCodewords(1, 'L')).toBe(19);
		expect(dataCodewords(1, 'H')).toBe(9);
		expect(dataCodewords(40, 'L')).toBe(2956);
		expect(dataCodewords(40, 'H')).toBe(1276);
		expect(capacityBytes(40, 'L')).toBe(2953);
		expect(capacityBytes(1, 'M')).toBe(14);
	});

	it('picks the smallest version and fails clearly when too long', () => {
		expect(encode('a'.repeat(14), { ecl: 'M' }).version).toBe(1);
		expect(encode('a'.repeat(15), { ecl: 'M' }).version).toBe(2);
		expect(encode('a'.repeat(2953), { ecl: 'L' }).version).toBe(40);
		expect(() => encode('a'.repeat(2954), { ecl: 'L' })).toThrow(/Too long: 2954 bytes.*2953/);
	});

	it('chooses the compact mode', () => {
		expect(encode('12345').mode).toBe('numeric');
		expect(encode('HTTPS://EXAMPLE.COM').mode).toBe('alphanumeric');
		expect(encode('https://example.com').mode).toBe('byte');
		expect(encode('').version).toBe(1);
	});
});

describe('reference symbols (Python qrcode package)', () => {
	it.each(fixtures.map((f) => [f.text.slice(0, 20), f] as const))('%s', (_, f) => {
		const q = encode(f.text, { ecl: f.ecl, mask: f.mask });
		expect(q.version).toBe(f.version);
		expect(rows(q.modules)).toEqual(f.rows);
	});
});

describe('mask selection', () => {
	it('uses the mask with the lowest penalty', () => {
		const q = encode('https://fm.stephanmh.dev/', { ecl: 'M' });
		expect(q.penalties[q.mask]).toBe(Math.min(...q.penalties));
		expect(penalty(q.modules)).toBe(q.penalties[q.mask]);
	});

	it('scores rule 4 (balance) on an all-dark matrix', () => {
		// 21x21 all dark: N1 runs 21 per row and column, N2 every 2x2, N4 k = 9
		const m = Array.from({ length: 21 }, () => new Array(21).fill(true));
		const n1 = 42 * (3 + 16);
		const n2 = 20 * 20 * 3;
		expect(penalty(m)).toBe(n1 + n2 + 90);
	});
});

describe('payloads', () => {
	it('builds and escapes Wi-Fi configs', () => {
		expect(
			wifiPayload({ ssid: 'Cafe;Net', password: 'p:a"s\\s,1234', auth: 'WPA', hidden: false })
		).toBe('WIFI:T:WPA;S:Cafe\\;Net;P:p\\:a\\"s\\\\s\\,1234;;');
		expect(wifiPayload({ ssid: 'Guest', password: '', auth: 'nopass', hidden: true })).toBe(
			'WIFI:T:nopass;S:Guest;H:true;;'
		);
		expect(() => wifiPayload({ ssid: 'x', password: 'short', auth: 'WPA', hidden: false })).toThrow(
			/8 characters/
		);
		expect(() => wifiPayload({ ssid: '', password: '', auth: 'nopass', hidden: false })).toThrow(
			/SSID/
		);
	});

	it('builds a minimal vCard 3.0', () => {
		const v = vcardPayload({
			first: 'Ada',
			last: 'Lovelace',
			org: 'Analytical; Engines, Ltd',
			title: '',
			phone: '+44 20 7946 0000',
			email: 'ada@example.com',
			url: ''
		});
		expect(v.split('\r\n')).toEqual([
			'BEGIN:VCARD',
			'VERSION:3.0',
			'N:Lovelace;Ada;;;',
			'FN:Ada Lovelace',
			'ORG:Analytical\\; Engines\\, Ltd',
			'TEL;TYPE=CELL:+44 20 7946 0000',
			'EMAIL:ada@example.com',
			'END:VCARD'
		]);
	});

	it('builds otpauth URIs like the Key URI Format example', () => {
		const base = { type: 'totp', algorithm: 'SHA1', digits: 6, period: 30, counter: 0 } as const;
		expect(
			otpPayload({
				...base,
				issuer: 'Example',
				account: 'alice@google.com',
				secret: 'JBSW Y3DP EHPK 3PXP'
			})
		).toBe('otpauth://totp/Example:alice%40google.com?secret=JBSWY3DPEHPK3PXP&issuer=Example');
		expect(
			otpPayload({
				...base,
				issuer: 'ACME Co',
				account: 'john',
				secret: 'jbswy3dpehpk3pxp',
				digits: 8,
				algorithm: 'SHA256'
			})
		).toBe(
			'otpauth://totp/ACME%20Co:john?secret=JBSWY3DPEHPK3PXP&issuer=ACME%20Co&algorithm=SHA256&digits=8'
		);
		expect(() => normaliseBase32('ABC1')).toThrow(/"1" is not a Base32/);
		expect(() => otpPayload({ ...base, issuer: 'a:b', account: 'x', secret: 'AAAA' })).toThrow(
			/colon/
		);
	});

	it('builds mailto and SMS', () => {
		expect(emailPayload({ to: 'ops@example.com', subject: 'Hello there', body: 'a&b' })).toBe(
			'mailto:ops@example.com?subject=Hello%20there&body=a%26b'
		);
		expect(smsPayload({ number: '+45 12 34 56 78', message: 'Hi' })).toBe('SMSTO:+4512345678:Hi');
		expect(() => smsPayload({ number: 'abc', message: '' })).toThrow(/phone number/);
	});
});

describe('SVG output', () => {
	it('draws runs as one path with a quiet zone', () => {
		expect(svgPath([[true, true, false, true]], 4)).toBe('M4 4h2v1h-2zM7 4h1v1h-1z');
		const svg = svgFile(encode('01234567', { ecl: 'M' }), 4, 10);
		expect(svg).toContain('viewBox="0 0 29 29" width="290" height="290"');
		expect(svg).not.toContain('style=');
	});
});
