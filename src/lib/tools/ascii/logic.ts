/**
 * ASCII (ANSI X3.4-1986 / ISO 646 IRV) with control names from ECMA-48 / ISO 6429,
 * ISO 8859-1 (Latin-1) for 160-255, C1 control names from ECMA-48 for 128-159, and the
 * Windows-1252 assignments for 128-159 from the Unicode mapping table
 * (unicode.org/Public/MAPPINGS/VENDORS/MICSFT/WINDOWS/CP1252.TXT).
 * Character names are the Unicode character names.
 */

export interface Row {
	code: number;
	hex: string;
	oct: string;
	bin: string;
	/** What to show in the table; control codes use Unicode control pictures. */
	glyph: string;
	control: boolean;
	abbr?: string;
	name: string;
	caret?: string;
	escape?: string;
	/** Windows-1252 differs from Latin-1 here (128-159 only). */
	cp1252?: { char: string; cp: number; name: string } | null;
	utf8: string;
	note?: string;
}

const c0: [string, string][] = [
	['NUL', 'Null'],
	['SOH', 'Start of Heading'],
	['STX', 'Start of Text'],
	['ETX', 'End of Text'],
	['EOT', 'End of Transmission'],
	['ENQ', 'Enquiry'],
	['ACK', 'Acknowledge'],
	['BEL', 'Bell'],
	['BS', 'Backspace'],
	['HT', 'Horizontal Tab'],
	['LF', 'Line Feed'],
	['VT', 'Vertical Tab'],
	['FF', 'Form Feed'],
	['CR', 'Carriage Return'],
	['SO', 'Shift Out'],
	['SI', 'Shift In'],
	['DLE', 'Data Link Escape'],
	['DC1', 'Device Control 1 (XON)'],
	['DC2', 'Device Control 2'],
	['DC3', 'Device Control 3 (XOFF)'],
	['DC4', 'Device Control 4'],
	['NAK', 'Negative Acknowledge'],
	['SYN', 'Synchronous Idle'],
	['ETB', 'End of Transmission Block'],
	['CAN', 'Cancel'],
	['EM', 'End of Medium'],
	['SUB', 'Substitute'],
	['ESC', 'Escape'],
	['FS', 'File Separator'],
	['GS', 'Group Separator'],
	['RS', 'Record Separator'],
	['US', 'Unit Separator']
];

/** C1 controls, ECMA-48. PAD, HOP and SGC were never standardised (Unicode lists them as aliases only). */
const c1: [string, string][] = [
	['PAD', 'Padding Character (not standardised)'],
	['HOP', 'High Octet Preset (not standardised)'],
	['BPH', 'Break Permitted Here'],
	['NBH', 'No Break Here'],
	['IND', 'Index (withdrawn)'],
	['NEL', 'Next Line'],
	['SSA', 'Start of Selected Area'],
	['ESA', 'End of Selected Area'],
	['HTS', 'Character Tabulation Set'],
	['HTJ', 'Character Tabulation with Justification'],
	['VTS', 'Line Tabulation Set'],
	['PLD', 'Partial Line Forward'],
	['PLU', 'Partial Line Backward'],
	['RI', 'Reverse Line Feed'],
	['SS2', 'Single Shift Two'],
	['SS3', 'Single Shift Three'],
	['DCS', 'Device Control String'],
	['PU1', 'Private Use One'],
	['PU2', 'Private Use Two'],
	['STS', 'Set Transmit State'],
	['CCH', 'Cancel Character'],
	['MW', 'Message Waiting'],
	['SPA', 'Start of Guarded Area'],
	['EPA', 'End of Guarded Area'],
	['SOS', 'Start of String'],
	['SGC', 'Single Graphic Character Introducer (not standardised)'],
	['SCI', 'Single Character Introducer'],
	['CSI', 'Control Sequence Introducer'],
	['ST', 'String Terminator'],
	['OSC', 'Operating System Command'],
	['PM', 'Privacy Message'],
	['APC', 'Application Program Command']
];

const escapes: Record<number, string> = {
	0: '\\0',
	7: '\\a',
	8: '\\b',
	9: '\\t',
	10: '\\n',
	11: '\\v',
	12: '\\f',
	13: '\\r',
	27: '\\e'
};

const punct: Record<number, string> = {
	32: 'Space',
	33: 'Exclamation Mark',
	34: 'Quotation Mark',
	35: 'Number Sign',
	36: 'Dollar Sign',
	37: 'Percent Sign',
	38: 'Ampersand',
	39: 'Apostrophe',
	40: 'Left Parenthesis',
	41: 'Right Parenthesis',
	42: 'Asterisk',
	43: 'Plus Sign',
	44: 'Comma',
	45: 'Hyphen-Minus',
	46: 'Full Stop',
	47: 'Solidus',
	58: 'Colon',
	59: 'Semicolon',
	60: 'Less-Than Sign',
	61: 'Equals Sign',
	62: 'Greater-Than Sign',
	63: 'Question Mark',
	64: 'Commercial At',
	91: 'Left Square Bracket',
	92: 'Reverse Solidus',
	93: 'Right Square Bracket',
	94: 'Circumflex Accent',
	95: 'Low Line',
	96: 'Grave Accent',
	123: 'Left Curly Bracket',
	124: 'Vertical Line',
	125: 'Right Curly Bracket',
	126: 'Tilde'
};

const digitNames = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];

const latin1Symbols = [
	'No-Break Space',
	'Inverted Exclamation Mark',
	'Cent Sign',
	'Pound Sign',
	'Currency Sign',
	'Yen Sign',
	'Broken Bar',
	'Section Sign',
	'Diaeresis',
	'Copyright Sign',
	'Feminine Ordinal Indicator',
	'Left-Pointing Double Angle Quotation Mark',
	'Not Sign',
	'Soft Hyphen',
	'Registered Sign',
	'Macron',
	'Degree Sign',
	'Plus-Minus Sign',
	'Superscript Two',
	'Superscript Three',
	'Acute Accent',
	'Micro Sign',
	'Pilcrow Sign',
	'Middle Dot',
	'Cedilla',
	'Superscript One',
	'Masculine Ordinal Indicator',
	'Right-Pointing Double Angle Quotation Mark',
	'Vulgar Fraction One Quarter',
	'Vulgar Fraction One Half',
	'Vulgar Fraction Three Quarters',
	'Inverted Question Mark'
];

/** Letter part of the names for 0xC0-0xDF; 0xE0-0xFF are the small forms. */
const latin1Letters = [
	'A with Grave',
	'A with Acute',
	'A with Circumflex',
	'A with Tilde',
	'A with Diaeresis',
	'A with Ring Above',
	'AE',
	'C with Cedilla',
	'E with Grave',
	'E with Acute',
	'E with Circumflex',
	'E with Diaeresis',
	'I with Grave',
	'I with Acute',
	'I with Circumflex',
	'I with Diaeresis',
	'Eth',
	'N with Tilde',
	'O with Grave',
	'O with Acute',
	'O with Circumflex',
	'O with Tilde',
	'O with Diaeresis',
	'',
	'O with Stroke',
	'U with Grave',
	'U with Acute',
	'U with Circumflex',
	'U with Diaeresis',
	'Y with Acute',
	'Thorn',
	''
];

/** Windows-1252 0x80-0x9F. null = not assigned (Windows maps them to the C1 code points). */
const cp1252: ([number, string] | null)[] = [
	[0x20ac, 'Euro Sign'],
	null,
	[0x201a, 'Single Low-9 Quotation Mark'],
	[0x0192, 'Latin Small Letter F with Hook'],
	[0x201e, 'Double Low-9 Quotation Mark'],
	[0x2026, 'Horizontal Ellipsis'],
	[0x2020, 'Dagger'],
	[0x2021, 'Double Dagger'],
	[0x02c6, 'Modifier Letter Circumflex Accent'],
	[0x2030, 'Per Mille Sign'],
	[0x0160, 'Latin Capital Letter S with Caron'],
	[0x2039, 'Single Left-Pointing Angle Quotation Mark'],
	[0x0152, 'Latin Capital Ligature OE'],
	null,
	[0x017d, 'Latin Capital Letter Z with Caron'],
	null,
	null,
	[0x2018, 'Left Single Quotation Mark'],
	[0x2019, 'Right Single Quotation Mark'],
	[0x201c, 'Left Double Quotation Mark'],
	[0x201d, 'Right Double Quotation Mark'],
	[0x2022, 'Bullet'],
	[0x2013, 'En Dash'],
	[0x2014, 'Em Dash'],
	[0x02dc, 'Small Tilde'],
	[0x2122, 'Trade Mark Sign'],
	[0x0161, 'Latin Small Letter S with Caron'],
	[0x203a, 'Single Right-Pointing Angle Quotation Mark'],
	[0x0153, 'Latin Small Ligature OE'],
	null,
	[0x017e, 'Latin Small Letter Z with Caron'],
	[0x0178, 'Latin Capital Letter Y with Diaeresis']
];

function nameOf(c: number): string {
	if (c < 32) return c0[c][1];
	if (c === 127) return 'Delete';
	if (punct[c]) return punct[c];
	if (c >= 48 && c <= 57) return `Digit ${digitNames[c - 48]}`;
	if (c >= 65 && c <= 90) return `Latin Capital Letter ${String.fromCharCode(c)}`;
	if (c >= 97 && c <= 122) return `Latin Small Letter ${String.fromCharCode(c - 32)}`;
	if (c >= 128 && c < 160) return c1[c - 128][1];
	if (c < 192) return latin1Symbols[c - 160];
	if (c === 0xd7) return 'Multiplication Sign';
	if (c === 0xf7) return 'Division Sign';
	if (c === 0xdf) return 'Latin Small Letter Sharp S';
	if (c === 0xff) return 'Latin Small Letter Y with Diaeresis';
	if (c < 224) return `Latin Capital Letter ${latin1Letters[c - 192]}`;
	return `Latin Small Letter ${latin1Letters[c - 224]}`;
}

function utf8Hex(c: number): string {
	return Array.from(new TextEncoder().encode(String.fromCodePoint(c)), (b) =>
		b.toString(16).toUpperCase().padStart(2, '0')
	).join(' ');
}

function row(c: number): Row {
	const control = c < 32 || (c >= 127 && c < 160);
	let glyph: string;
	if (c < 32) glyph = String.fromCodePoint(0x2400 + c);
	else if (c === 32) glyph = '␠';
	else if (c === 127) glyph = '␡';
	else if (control) glyph = '';
	else if (c === 0xa0) glyph = 'NBSP';
	else if (c === 0xad) glyph = 'SHY';
	else glyph = String.fromCharCode(c);
	const r: Row = {
		code: c,
		hex: c.toString(16).toUpperCase().padStart(2, '0'),
		oct: c.toString(8).padStart(3, '0'),
		bin: c.toString(2).padStart(8, '0'),
		glyph,
		control,
		name: nameOf(c),
		utf8: utf8Hex(c)
	};
	if (c < 32) {
		r.abbr = c0[c][0];
		r.caret = `^${String.fromCharCode(c + 64)}`;
	} else if (c === 127) {
		r.abbr = 'DEL';
		r.caret = '^?';
	} else if (c === 32) r.abbr = 'SP';
	else if (c >= 128 && c < 160) r.abbr = c1[c - 128][0];
	if (escapes[c]) r.escape = escapes[c];
	if (c === 27) r.note = '\\e is a GNU C and shell extension, portable C uses \\033 or \\x1b';
	if (c === 0) r.note = '\\0 is an octal escape in C';
	if (c >= 128 && c < 160) {
		const w = cp1252[c - 128];
		r.cp1252 = w ? { char: String.fromCodePoint(w[0]), cp: w[0], name: w[1] } : null;
	}
	return r;
}

export const rows: Row[] = Array.from({ length: 256 }, (_, i) => row(i));

export function codepoint(cp: number): string {
	return `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
}

/**
 * Finds rows by decimal, hex (0x41, \x41, U+0041, or bare 2-digit hex), the character itself,
 * caret notation (^C), escape (\n), abbreviation or a word of the name.
 */
export function search(q: string, max = 255): Row[] {
	const list = rows.slice(0, max + 1);
	const raw = q;
	const t = q.trim();
	if (!raw) return list;
	if ([...raw].length === 1)
		return list.filter((r) => String.fromCharCode(r.code) === raw || r.cp1252?.char === raw);
	const lower = t.toLowerCase();
	const hits = new Set<number>();
	const hex = /^(?:0x|\\x|u\+|%)([0-9a-f]{1,4})$/i.exec(t);
	if (hex) hits.add(parseInt(hex[1], 16));
	if (/^\d{1,3}$/.test(t)) hits.add(Number(t));
	if (/^[0-9a-f]{2}$/i.test(t)) hits.add(parseInt(t, 16));
	if (/^0[0-7]{2,3}$/.test(t)) hits.add(parseInt(t, 8));
	if (/^[01]{8}$/.test(t)) hits.add(parseInt(t, 2));
	for (const r of list) {
		if (r.caret && r.caret.toLowerCase() === lower) hits.add(r.code);
		if (r.escape && r.escape === t) hits.add(r.code);
		if (r.abbr && r.abbr.toLowerCase() === lower) hits.add(r.code);
		if (t.length >= 3 && r.name.toLowerCase().includes(lower)) hits.add(r.code);
		if (t.length >= 3 && r.cp1252?.name.toLowerCase().includes(lower)) hits.add(r.code);
		if (r.cp1252 && r.cp1252.char === t) hits.add(r.code);
	}
	return list.filter((r) => hits.has(r.code));
}
