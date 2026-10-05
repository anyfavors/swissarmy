import { describe, expect, it } from 'vitest';
import {
	compareIp,
	crc32,
	formatRange,
	gunzip,
	openFile,
	percent,
	readReport,
	sniff,
	sortRows,
	summarise,
	topFailing,
	zipEntries,
	type XEl
} from './logic';

/* A tiny XML reader for the tests only: the tool itself uses the browser's DOMParser. */
interface TestEl extends XEl {
	children: TestEl[];
	text: string[];
}
function parseXml(src: string): TestEl {
	const s = src.replace(/<\?[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '');
	const root: TestEl = { localName: '#root', children: [], text: [], textContent: '' };
	const stack: TestEl[] = [root];
	const re = /<(\/?)([A-Za-z_][\w.:-]*)([^>]*?)(\/?)>|([^<]+)/g;
	for (const m of s.matchAll(re)) {
		const top = stack[stack.length - 1];
		if (m[5] !== undefined) {
			const t = m[5].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
			for (const el of stack) el.text.push(t);
			continue;
		}
		const name = m[2].includes(':') ? m[2].split(':')[1] : m[2];
		if (m[1]) {
			stack.pop();
			continue;
		}
		const el: TestEl = { localName: name, children: [], text: [], textContent: '' };
		top.children.push(el);
		if (!m[4]) stack.push(el);
	}
	const fill = (e: TestEl) => {
		e.textContent = e.text.join('');
		e.children.forEach(fill);
	};
	fill(root);
	return root.children[0];
}

// Shaped like RFC 7489 appendix C, with two sources.
const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<feedback>
  <report_metadata>
    <org_name>receiver.example</org_name>
    <email>noreply-dmarc@receiver.example</email>
    <report_id>12345</report_id>
    <date_range><begin>1727740800</begin><end>1727827199</end></date_range>
  </report_metadata>
  <policy_published>
    <domain>example.com</domain><adkim>r</adkim><aspf>r</aspf><p>quarantine</p><sp>none</sp><pct>100</pct>
  </policy_published>
  <record>
    <row>
      <source_ip>192.0.2.10</source_ip><count>40</count>
      <policy_evaluated><disposition>none</disposition><dkim>pass</dkim><spf>pass</spf></policy_evaluated>
    </row>
    <identifiers><header_from>example.com</header_from></identifiers>
    <auth_results>
      <dkim><domain>example.com</domain><selector>s1</selector><result>pass</result></dkim>
      <spf><domain>example.com</domain><result>pass</result></spf>
    </auth_results>
  </record>
  <record>
    <row>
      <source_ip>198.51.100.5</source_ip><count>7</count>
      <policy_evaluated><disposition>quarantine</disposition><dkim>fail</dkim><spf>fail</spf>
        <reason><type>forwarded</type><comment>list</comment></reason></policy_evaluated>
    </row>
    <identifiers><header_from>example.com</header_from></identifiers>
    <auth_results>
      <spf><domain>spoof.example</domain><result>softfail</result></spf>
    </auth_results>
  </record>
  <record>
    <row>
      <source_ip>192.0.2.10</source_ip><count>3</count>
      <policy_evaluated><disposition>none</disposition><dkim>pass</dkim><spf>fail</spf></policy_evaluated>
    </row>
    <identifiers><header_from>example.com</header_from></identifiers>
    <auth_results>
      <dkim><domain>example.com</domain><selector>s1</selector><result>pass</result></dkim>
      <spf><domain>bounce.example.net</domain><result>pass</result></spf>
    </auth_results>
  </record>
</feedback>`;

describe('readReport', () => {
	it('reads metadata, policy and records', async () => {
		const progress: number[] = [];
		const r = await readReport(parseXml(xml), (d) => progress.push(d), 2);
		expect(r.meta).toEqual({
			orgName: 'receiver.example',
			email: 'noreply-dmarc@receiver.example',
			extra: undefined,
			reportId: '12345',
			begin: 1727740800,
			end: 1727827199,
			errors: []
		});
		expect(r.policy).toEqual({
			domain: 'example.com',
			adkim: 'r',
			aspf: 'r',
			p: 'quarantine',
			sp: 'none',
			pct: '100'
		});
		expect(r.records).toHaveLength(3);
		expect(r.records[1]).toMatchObject({
			sourceIp: '198.51.100.5',
			count: 7,
			disposition: 'quarantine',
			reasons: [{ type: 'forwarded', comment: 'list' }],
			dkim: []
		});
		expect(progress).toEqual([2, 3]);
	});

	it('ignores namespaces (DMARCbis files)', async () => {
		const r = await readReport(
			parseXml(
				'<feedback xmlns="urn:ietf:params:xml:ns:dmarc-2.0"><record><row><source_ip>2001:db8::1</source_ip><count>1</count></row></record></feedback>'
			)
		);
		expect(r.records[0]).toMatchObject({ sourceIp: '2001:db8::1', count: 1, dkimEval: 'fail' });
	});

	it('rejects other XML', async () => {
		await expect(readReport(parseXml('<html><body/></html>'))).rejects.toThrow(
			/root element is <html>/
		);
	});
});

describe('summarise', () => {
	it('groups by source IP and totals', async () => {
		const s = summarise((await readReport(parseXml(xml))).records);
		expect(s).toMatchObject({
			total: 50,
			pass: 43,
			fail: 7,
			dkimAligned: 43,
			spfAligned: 40,
			both: 40,
			sources: 2
		});
		expect(s.dispositions).toEqual({ none: 43, quarantine: 7 });
		const a = s.rows.find((r) => r.ip === '192.0.2.10')!;
		expect(a).toMatchObject({ count: 43, pass: 43, fail: 0, dkimAligned: 43, spfAligned: 40 });
		expect(a.dkimResults).toEqual({ 'example.com (s1) pass': 43 });
		expect(a.spfResults).toEqual({ 'example.com pass': 40, 'bounce.example.net pass': 3 });
		const b = s.rows.find((r) => r.ip === '198.51.100.5')!;
		expect(b.dkimResults).toEqual({ 'not signed': 7 });
		expect(b.reasons).toEqual(['forwarded: list']);
		expect(topFailing(s.rows).map((r) => r.ip)).toEqual(['198.51.100.5']);
	});

	it('sorts rows', () => {
		const rows = summarise([
			{
				sourceIp: '10.0.0.9',
				count: 5,
				disposition: 'none',
				dkimEval: 'fail',
				spfEval: 'fail',
				reasons: [],
				dkim: [],
				spf: []
			},
			{
				sourceIp: '10.0.0.10',
				count: 9,
				disposition: 'none',
				dkimEval: 'pass',
				spfEval: 'fail',
				reasons: [],
				dkim: [],
				spf: []
			},
			{
				sourceIp: '2001:db8::1',
				count: 1,
				disposition: 'reject',
				dkimEval: 'fail',
				spfEval: 'fail',
				reasons: [],
				dkim: [],
				spf: []
			}
		]).rows;
		expect(sortRows(rows, 'count').map((r) => r.ip)).toEqual([
			'10.0.0.10',
			'10.0.0.9',
			'2001:db8::1'
		]);
		expect(sortRows(rows, 'fail').map((r) => r.ip)).toEqual([
			'10.0.0.9',
			'2001:db8::1',
			'10.0.0.10'
		]);
		expect(sortRows(rows, 'ip').map((r) => r.ip)).toEqual(['10.0.0.9', '10.0.0.10', '2001:db8::1']);
	});

	it('handles a large report quickly', () => {
		const recs = Array.from({ length: 50000 }, (_, i) => ({
			sourceIp: `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`,
			count: 1,
			disposition: 'none',
			dkimEval: i % 3 ? 'pass' : 'fail',
			spfEval: 'fail',
			reasons: [],
			dkim: [],
			spf: []
		}));
		const t = Date.now();
		const s = summarise(recs);
		sortRows(s.rows, 'ip');
		expect(s.sources).toBe(50000);
		expect(Date.now() - t).toBeLessThan(3000);
	});
});

describe('helpers', () => {
	it('compares IPs numerically', () => {
		expect(compareIp('9.0.0.1', '10.0.0.1')).toBe(-1);
		expect(compareIp('2001:db8::2', '2001:db8::10')).toBe(-1);
		expect(compareIp('10.0.0.1', '::1')).toBe(-1);
	});

	it('formats', () => {
		expect(percent(1, 3)).toBe('33.3%');
		expect(percent(0, 0)).toBe('0%');
		expect(percent(5, 5)).toBe('100%');
		expect(formatRange(1727740800, 1727827199)).toBe(
			'2024-10-01 00:00 UTC to 2024-10-01 23:59 UTC'
		);
	});

	it('computes CRC-32 check value', () => {
		// Standard check value for "123456789"
		expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
	});
});

/* ------------------------------------------------------------------ */
/* Containers                                                          */
/* ------------------------------------------------------------------ */

async function compress(data: Uint8Array, format: 'gzip' | 'deflate-raw'): Promise<Uint8Array> {
	const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream(format));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Builds a ZIP with the given entries, using the same layout as common zip tools. */
async function makeZip(
	files: { name: string; data: Uint8Array; deflate: boolean }[]
): Promise<Uint8Array> {
	const parts: number[] = [];
	const central: number[] = [];
	const w16 = (a: number[], v: number) => a.push(v & 255, (v >> 8) & 255);
	const w32 = (a: number[], v: number) =>
		a.push(v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255);
	for (const f of files) {
		const body = f.deflate ? await compress(f.data, 'deflate-raw') : f.data;
		const name = new TextEncoder().encode(f.name);
		const offset = parts.length;
		const crc = crc32(f.data);
		w32(parts, 0x04034b50);
		w16(parts, 20);
		w16(parts, 0x800);
		w16(parts, f.deflate ? 8 : 0);
		w16(parts, 0);
		w16(parts, 0);
		w32(parts, crc);
		w32(parts, body.length);
		w32(parts, f.data.length);
		w16(parts, name.length);
		w16(parts, 0);
		parts.push(...name, ...body);
		w32(central, 0x02014b50);
		w16(central, 20);
		w16(central, 20);
		w16(central, 0x800);
		w16(central, f.deflate ? 8 : 0);
		w16(central, 0);
		w16(central, 0);
		w32(central, crc);
		w32(central, body.length);
		w32(central, f.data.length);
		w16(central, name.length);
		w16(central, 0);
		w16(central, 0);
		w16(central, 0);
		w16(central, 0);
		w32(central, 0);
		w32(central, offset);
		central.push(...name);
	}
	const cdOffset = parts.length;
	const eocd: number[] = [];
	w32(eocd, 0x06054b50);
	w16(eocd, 0);
	w16(eocd, 0);
	w16(eocd, files.length);
	w16(eocd, files.length);
	w32(eocd, central.length);
	w32(eocd, cdOffset);
	w16(eocd, 0);
	return new Uint8Array([...parts, ...central, ...eocd]);
}

describe('containers', () => {
	const bytes = new TextEncoder().encode(xml);

	it('sniffs formats', () => {
		expect(sniff(new Uint8Array([0x1f, 0x8b, 8]))).toBe('gzip');
		expect(sniff(new Uint8Array([0x50, 0x4b, 3, 4]))).toBe('zip');
		expect(sniff(bytes)).toBe('xml');
	});

	it('opens gzip', async () => {
		const gz = await compress(bytes, 'gzip');
		expect(new TextDecoder().decode(await gunzip(gz))).toBe(xml);
		const files = await openFile('report.xml.gz', gz);
		expect(files).toEqual([{ name: 'report.xml', text: xml }]);
	});

	it('opens deflated and stored ZIP entries', async () => {
		const zip = await makeZip([
			{ name: 'a.xml', data: bytes, deflate: true },
			{ name: 'readme.txt', data: new TextEncoder().encode('hi'), deflate: false },
			{ name: 'b.xml', data: new TextEncoder().encode('<feedback/>'), deflate: false }
		]);
		expect(zipEntries(zip).map((e) => [e.name, e.method])).toEqual([
			['a.xml', 8],
			['readme.txt', 0],
			['b.xml', 0]
		]);
		const files = await openFile('r.zip', zip);
		expect(files.map((f) => f.name)).toEqual(['a.xml', 'b.xml']);
		expect(files[0].text).toBe(xml);
		expect(files[1].text).toBe('<feedback/>');
	});

	it('walks local headers when the central directory is missing', async () => {
		const zip = await makeZip([{ name: 'a.xml', data: bytes, deflate: true }]);
		const cut = zip.subarray(0, zip.length - 22 - 46 - 5);
		const files = await openFile('r.zip', cut);
		expect(files[0].text).toBe(xml);
	});

	it('reports damage', async () => {
		const zip = await makeZip([{ name: 'a.xml', data: bytes, deflate: false }]);
		const bad = zip.slice();
		bad[40] ^= 0xff; // flip a byte of the stored data
		await expect(openFile('r.zip', bad)).rejects.toThrow(/CRC check failed/);
		await expect(gunzip(new Uint8Array([0x1f, 0x8b, 8, 0, 0, 0]))).rejects.toThrow(
			/damaged or truncated/
		);
	});
});
