/*
 * Look-alikes for Latin letters: a curated subset of Unicode's confusables.txt
 * (Unicode Technical Standard #39, unicode.org/Public/security/latest/confusables.txt),
 * limited to Cyrillic, Greek, Armenian and a few Latin letters that pass for ASCII.
 * The value is the ASCII letter a reader would take it for. confusables.txt maps some of these
 * to a different prototype (capital I, Cyrillic І and Greek Ι all map to l there); here the
 * intended letter is used, so a cleaned text reads naturally.
 * Fullwidth and mathematical letters are not listed: NFKC already folds them to ASCII.
 */
export const confusables: Record<string, string> = {
	// Cyrillic small
	а: 'a', // U+0430
	с: 'c', // U+0441
	ԁ: 'd', // U+0501
	е: 'e', // U+0435
	һ: 'h', // U+04BB
	і: 'i', // U+0456
	ј: 'j', // U+0458
	ӏ: 'l', // U+04CF
	о: 'o', // U+043E
	р: 'p', // U+0440
	ԛ: 'q', // U+051B
	ѕ: 's', // U+0455
	ԝ: 'w', // U+051D
	х: 'x', // U+0445
	у: 'y', // U+0443
	ү: 'y', // U+04AF
	// Cyrillic capital
	А: 'A', // U+0410
	В: 'B', // U+0412
	С: 'C', // U+0421
	Е: 'E', // U+0415
	Н: 'H', // U+041D
	І: 'I', // U+0406
	Ј: 'J', // U+0408
	К: 'K', // U+041A
	М: 'M', // U+041C
	О: 'O', // U+041E
	Р: 'P', // U+0420
	Ԛ: 'Q', // U+051A
	Ѕ: 'S', // U+0405
	Т: 'T', // U+0422
	Ԝ: 'W', // U+051C
	Х: 'X', // U+0425
	Ү: 'Y', // U+04AE
	// Greek
	α: 'a', // U+03B1
	ι: 'i', // U+03B9
	ν: 'v', // U+03BD
	ο: 'o', // U+03BF
	ρ: 'p', // U+03C1
	υ: 'u', // U+03C5
	Α: 'A', // U+0391
	Β: 'B', // U+0392
	Ε: 'E', // U+0395
	Ζ: 'Z', // U+0396
	Η: 'H', // U+0397
	Ι: 'I', // U+0399
	Κ: 'K', // U+039A
	Μ: 'M', // U+039C
	Ν: 'N', // U+039D
	Ο: 'O', // U+039F
	Ρ: 'P', // U+03A1
	Τ: 'T', // U+03A4
	Υ: 'Y', // U+03A5
	Χ: 'X', // U+03A7
	// Armenian
	հ: 'h', // U+0570
	ո: 'n', // U+0578
	ս: 'u', // U+057D
	օ: 'o', // U+0585
	// Latin letters outside ASCII that look like ASCII ones
	ı: 'i', // U+0131 dotless i
	ɑ: 'a', // U+0251 alpha
	ɡ: 'g', // U+0261 script g
	ɩ: 'i', // U+0269 iota
	// Punctuation look-alikes common in pasted code
	';': ';', // Greek question mark
	'∕': '/', // division slash
	'⁄': '/', // fraction slash
	'−': '-' // minus sign
};
