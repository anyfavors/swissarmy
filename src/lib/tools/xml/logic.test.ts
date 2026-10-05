import { describe, expect, it } from 'vitest';
import { locate } from '../json/logic';
import { formatXml, isXmlName, looksLikeXml, minifyXml, parseXml, XmlError } from './logic';
import { ops } from './ops';

function errorOf(text: string): { msg: string; line: number; col: number } {
	try {
		parseXml(text);
	} catch (e) {
		if (!(e instanceof XmlError)) throw e;
		const l = locate(text, e.pos);
		return { msg: e.message, line: l.line, col: l.col };
	}
	throw new Error('expected a parse error');
}

describe('xml: formatting', () => {
	it('indents element-only content', () => {
		expect(
			formatXml(
				'<?xml version="1.0" encoding="UTF-8"?><a><b x="1"  y=\'2\'>text</b><c/><d></d><!-- note --></a>'
			)
		).toBe(
			[
				'<?xml version="1.0" encoding="UTF-8"?>',
				'<a>',
				'  <b x="1" y=\'2\'>text</b>',
				'  <c/>',
				'  <d></d>',
				'  <!-- note -->',
				'</a>'
			].join('\n')
		);
	});

	it('reindents already formatted XML', () => {
		const src = '<root>\n\t\t<item id="1">\n\t\t\t<name>A</name>\n\t\t</item>\n</root>\n';
		expect(formatXml(src, { indent: 4 })).toBe(
			'<root>\n    <item id="1">\n        <name>A</name>\n    </item>\n</root>'
		);
		expect(formatXml(src, { indent: 'tab' })).toBe(
			'<root>\n\t<item id="1">\n\t\t<name>A</name>\n\t</item>\n</root>'
		);
	});

	it('keeps mixed content and text exactly', () => {
		const src = '<doc><p>Hello <b>bold</b> and <i>it</i>.</p><pre>  keep\n   this </pre></doc>';
		expect(formatXml(src)).toBe(
			'<doc>\n  <p>Hello <b>bold</b> and <i>it</i>.</p>\n  <pre>  keep\n   this </pre>\n</doc>'
		);
	});

	it('respects xml:space="preserve"', () => {
		const src = '<a><b xml:space="preserve">\n  <c/>\n</b><d>\n  <e/>\n</d></a>';
		expect(formatXml(src)).toBe(
			'<a>\n  <b xml:space="preserve">\n  <c/>\n</b>\n  <d>\n    <e/>\n  </d>\n</a>'
		);
		expect(minifyXml(src)).toBe('<a><b xml:space="preserve">\n  <c/>\n</b><d><e/></d></a>');
	});

	it('keeps CDATA, PIs, entities and the DOCTYPE as written', () => {
		const src =
			'<!DOCTYPE note [<!ENTITY who "World">]><?style href="a.css"?><note><to>&who; &amp; &#169; &#x1F600;</to><code><![CDATA[if (a < b && c) {}]]></code><?php echo 1; ?></note>';
		expect(formatXml(src)).toBe(
			[
				'<!DOCTYPE note [<!ENTITY who "World">]>',
				'<?style href="a.css"?>',
				'<note>',
				'  <to>&who; &amp; &#169; &#x1F600;</to>',
				'  <code><![CDATA[if (a < b && c) {}]]></code>',
				'  <?php echo 1; ?>',
				'</note>'
			].join('\n')
		);
	});

	it('wraps long attribute lists', () => {
		const src =
			'<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120" viewBox="0 0 240 120" fill="none"><path d="M0 0"/></svg>';
		expect(formatXml(src, { wrap: 60 })).toBe(
			[
				'<svg',
				'  xmlns="http://www.w3.org/2000/svg"',
				'  width="240"',
				'  height="120"',
				'  viewBox="0 0 240 120"',
				'  fill="none"',
				'>',
				'  <path d="M0 0"/>',
				'</svg>'
			].join('\n')
		);
		expect(formatXml(src, { wrap: 0 }).split('\n')[0]).toBe(src.slice(0, src.indexOf('<path')));
	});

	it('can drop comments', () => {
		expect(formatXml('<a><!-- x --><b/></a>', { keepComments: false })).toBe('<a>\n  <b/>\n</a>');
	});
});

describe('xml: minify', () => {
	it('removes blank text and comments', () => {
		expect(
			minifyXml('<?xml version="1.0"?>\n<a>\n  <!-- c -->\n  <b  x = "1" >t</b>\n  <c />\n</a>\n')
		).toBe('<?xml version="1.0"?><a><b x="1">t</b><c/></a>');
		expect(minifyXml('<a> <!-- c --> <b/></a>', { keepComments: true })).toBe(
			'<a><!-- c --><b/></a>'
		);
	});

	it('round-trips with the formatter', () => {
		const src = '<r><a k="v"><b>1</b><b>2</b></a><c><![CDATA[x]]></c></r>';
		expect(minifyXml(formatXml(src))).toBe(src);
	});
});

describe('xml: well-formedness errors', () => {
	it('reports mismatched and unclosed tags', () => {
		expect(errorOf('<a>\n  <b></c>\n</a>')).toEqual({
			msg: 'Expected </b>, found </c>',
			line: 2,
			col: 6
		});
		expect(errorOf('<a><b>')).toEqual({ msg: 'Element <b> is not closed', line: 1, col: 4 });
		expect(errorOf('<a/></a>').msg).toBe('Unexpected end tag </a>');
		expect(errorOf('<a></a><b/>').msg).toBe('Only one root element is allowed');
		expect(errorOf('').msg).toBe('No root element');
		expect(errorOf('hello').msg).toBe('Text before the root element');
		expect(errorOf('<a/>x').msg).toBe('Text after the root element');
	});

	it('reports attribute problems', () => {
		expect(errorOf('<a x=1/>').msg).toBe('Attribute values must be in quotes');
		expect(errorOf('<a x="1" x="2"/>')).toEqual({ msg: 'Duplicate attribute x', line: 1, col: 10 });
		expect(errorOf('<a x="1"y="2"/>').msg).toBe('Expected white space between attributes');
		expect(errorOf('<a x="<"/>').msg).toBe('< is not allowed in an attribute value, write &lt;');
		expect(errorOf('<a x/>').msg).toBe('Expected = after the attribute name x');
	});

	it('reports entity problems', () => {
		expect(errorOf('<a>AT&T</a>')).toEqual({
			msg: '& must start an entity reference like &amp;',
			line: 1,
			col: 6
		});
		expect(errorOf('<a>&nbsp;</a>').msg).toBe('Undefined entity &nbsp;');
		expect(errorOf('<a>&#0;</a>').msg).toBe('&#0; refers to a character not allowed in XML');
		expect(errorOf('<a>&#xZZ;</a>').msg).toBe('Invalid character reference &#xZZ;');
	});

	it('accepts undeclared entities when the DTD is external, without fetching it', () => {
		const d = parseXml(
			'<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd"><html>&nbsp;</html>'
		);
		expect(d.stats.unchecked).toEqual(['nbsp']);
		expect(d.doctype).toContain('xhtml1-strict.dtd');
	});

	it('records external entity declarations but never resolves them', () => {
		const src =
			'<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd"><!ENTITY ok "fine">]><foo>&xxe;&ok;</foo>';
		const d = parseXml(src);
		expect(d.stats.entities).toEqual(['xxe', 'ok']);
		expect(d.stats.externalEntities).toEqual(['xxe']);
		expect(formatXml(src)).toContain('<foo>&xxe;&ok;</foo>');
	});

	it('reports comment, CDATA and PI problems', () => {
		expect(errorOf('<a><!-- a -- b --></a>').msg).toBe('-- is not allowed inside a comment');
		expect(errorOf('<a><!-- x ---></a>').msg).toBe('A comment cannot end with --->');
		expect(errorOf('<a><!-- open</a>').msg).toBe('Unterminated comment, expected -->');
		expect(errorOf('<a><![CDATA[x</a>').msg).toBe('Unterminated CDATA section, expected ]]>');
		expect(errorOf('<a>x]]>y</a>').msg).toBe(']]> is not allowed in text, write ]]&gt;');
		expect(errorOf('<a/>\n<?xml version="1.0"?>')).toMatchObject({
			msg: 'The XML declaration is only allowed at the very start of the document',
			line: 2
		});
		expect(errorOf('<?xml encoding="UTF-8"?><a/>').msg).toContain('Malformed XML declaration');
		expect(errorOf('<![CDATA[x]]><a/>').msg).toBe('CDATA outside the root element');
	});

	it('reports namespace problems', () => {
		expect(errorOf('<x:a/>').msg).toBe('Namespace prefix x is not declared');
		expect(errorOf('<a xmlns:x="u"><b y:z="1"/></a>').msg).toBe(
			'Namespace prefix y is not declared'
		);
		expect(errorOf('<a:b:c xmlns:a="u"/>').msg).toBe(
			'a:b:c is not a valid namespace-qualified name'
		);
		expect(errorOf('<a xmlns:x=""/>').msg).toBe(
			'Namespace prefix x cannot be undeclared in XML 1.0'
		);
		// Scope ends with the element
		expect(errorOf('<r><a xmlns:x="u"/><x:b/></r>').msg).toBe('Namespace prefix x is not declared');
	});

	it('reports invalid characters and names', () => {
		expect(errorOf('<a>\u0001</a>').msg).toBe('Character U+0001 is not allowed in XML');
		expect(errorOf('<1a/>').msg).toBe('Expected an element name, found "1"');
		expect(isXmlName('café')).toBe(true);
		expect(isXmlName('-x')).toBe(false);
	});
});

describe('xml: stats', () => {
	it('counts elements and collects namespaces', () => {
		const d = parseXml(
			'<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns="urn:x"><soap:Body><m:Get xmlns:m="urn:m" a="1"/></soap:Body></soap:Envelope>'
		);
		expect(d.stats.elements).toBe(3);
		expect(d.stats.depth).toBe(3);
		expect(d.stats.attributes).toBe(4);
		expect([...d.stats.namespaces]).toEqual([
			['soap', 'http://www.w3.org/2003/05/soap-envelope'],
			['', 'urn:x'],
			['m', 'urn:m']
		]);
	});

	it('handles a BOM and CRLF', () => {
		expect(formatXml('\ufeff<a>\r\n  <b/>\r\n</a>')).toBe('<a>\n  <b/>\n</a>');
	});

	it('handles deep nesting', () => {
		const deep = '<a>'.repeat(2000) + '</a>'.repeat(2000);
		expect(parseXml(deep).stats.depth).toBe(2000);
	});
});

describe('xml: detection and ops', () => {
	it('detects XML but not HTML', () => {
		expect(looksLikeXml('<?xml version="1.0"?><a/>')).toBe(0.9);
		expect(looksLikeXml('<note><to>x</to></note>')).toBe(0.6);
		expect(looksLikeXml('<html><body></body></html>')).toBe(0);
		expect(looksLikeXml('<!DOCTYPE html><p>x')).toBe(0);
		expect(looksLikeXml('<a><b></a>')).toBe(0);
		expect(looksLikeXml('a < b')).toBe(0);
	});

	it('runs format and minify with located errors', async () => {
		const get = (id: string) => ops.find((o) => o.id === id)!;
		expect(await get('xml.format').run('<a><b/></a>')).toBe('<a>\n  <b/>\n</a>');
		expect(await get('xml.minify').run('<a>\n <b/>\n</a>')).toBe('<a><b/></a>');
		expect(() => get('xml.format').run('<a>\n<b></a>')).toThrow(
			'Expected </b>, found </a>, line 2 column 4'
		);
	});
});
