/** Slugs and safe filenames. */

/** Letters that Unicode does not decompose into base letter + accent, so NFD alone would drop them. */
const LETTERS: Record<string, string> = {
	æ: 'ae',
	Æ: 'AE',
	ø: 'o',
	Ø: 'O',
	œ: 'oe',
	Œ: 'OE',
	ß: 'ss',
	ẞ: 'SS',
	đ: 'd',
	Đ: 'D',
	ð: 'd',
	Ð: 'D',
	þ: 'th',
	Þ: 'TH',
	ł: 'l',
	Ł: 'L',
	ı: 'i',
	ħ: 'h',
	Ħ: 'H',
	ŧ: 't',
	Ŧ: 'T',
	ŋ: 'ng',
	Ŋ: 'NG',
	ĸ: 'k',
	ſ: 's',
	ĳ: 'ij',
	Ĳ: 'IJ'
};

/** Danish convention: æ ae, ø oe, å aa (as in Aarhus, Aabenraa). */
const DANISH: Record<string, string> = { æ: 'ae', Æ: 'Ae', ø: 'oe', Ø: 'Oe', å: 'aa', Å: 'Aa' };

/** Folds Latin letters with accents to ASCII. Non-Latin scripts are left as they are. */
export function transliterate(s: string, danish = false): string {
	let out = '';
	for (const c of s) {
		if (danish && DANISH[c]) out += DANISH[c];
		else if (LETTERS[c]) out += LETTERS[c];
		else out += c;
	}
	return out.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
}

export interface SlugOptions {
	danish?: boolean;
	separator?: '-' | '_' | '.';
	lower?: boolean;
	/** Keep non-Latin letters (Greek, Cyrillic, CJK) instead of dropping them. */
	unicode?: boolean;
	maxLength?: number;
}

export function slugify(input: string, o: SlugOptions = {}): string {
	const sep = o.separator ?? '-';
	let s = transliterate(input, o.danish ?? false)
		.replace(/['’]/g, '')
		.replace(/&/g, ' and ');
	if (o.lower ?? true) s = s.toLowerCase();
	const keep = o.unicode ? /[\p{L}\p{N}]+/gu : /[A-Za-z0-9]+/g;
	s = (s.match(keep) ?? []).join(sep);
	if (o.maxLength && o.maxLength > 0 && s.length > o.maxLength) {
		s = s.slice(0, o.maxLength);
		// Cut back to the last whole word when there is one.
		const i = s.lastIndexOf(sep);
		if (i > 0) s = s.slice(0, i);
	}
	return s;
}

export type Target = 'windows' | 'macos' | 'linux' | 'portable';

/*
 * Windows rules from Microsoft, "Naming Files, Paths, and Namespaces"
 * (learn.microsoft.com/windows/win32/fileio/naming-a-file): forbidden < > : " / \ | ? * and
 * characters 0 to 31, reserved device names with or without an extension, no trailing
 * space or period. Component length 255 UTF-16 units (NTFS).
 * Linux: only / and NUL are forbidden, NAME_MAX is 255 bytes on ext4, XFS and Btrfs.
 * macOS: / is the separator and : is shown as / in Finder, so both are replaced. 255 UTF-8 bytes
 * on APFS.
 */
const RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(\..*)?$/i;

export interface FilenameResult {
	name: string;
	changes: string[];
}

const utf8Len = (s: string) => new TextEncoder().encode(s).length;

export function safeFilename(
	input: string,
	target: Target = 'portable',
	replacement = '_'
): FilenameResult {
	const changes: string[] = [];
	const win = target === 'windows' || target === 'portable';
	const mac = target === 'macos' || target === 'portable';
	let s = input;

	const forbidden = win ? /[<>:"/\\|?*\u0000-\u001f\u007f]/g : mac ? /[/:\u0000]/g : /[/\u0000]/g;
	const control = /[\u0000-\u001f\u007f]/;
	if (forbidden.test(s)) {
		changes.push(
			win
				? 'Replaced characters Windows does not allow: < > : " / \\ | ? * and control characters'
				: mac
					? 'Replaced / and :'
					: 'Replaced / and NUL'
		);
		s = s.replace(forbidden, replacement);
	}
	if (!win && control.test(s)) {
		changes.push('Replaced control characters (allowed, but awkward in shells)');
		s = s.replace(new RegExp(control.source, 'g'), replacement);
	}

	const trimmed = s.replace(/^\s+/, '').replace(win ? /[\s.]+$/ : /\s+$/, '');
	if (trimmed !== s) {
		changes.push(
			win
				? 'Removed leading spaces and trailing spaces or dots'
				: 'Removed leading and trailing spaces'
		);
		s = trimmed;
	}

	if (s === '' || s === '.' || s === '..') {
		changes.push('Name was empty or only dots, used "unnamed"');
		s = 'unnamed';
	}

	if (win && RESERVED.test(s)) {
		changes.push(
			`${s.split('.')[0].toUpperCase()} is a reserved device name on Windows, added ${replacement}`
		);
		const dot = s.indexOf('.');
		s = dot < 0 ? s + replacement : s.slice(0, dot) + replacement + s.slice(dot);
	}

	// Length: shorten the stem, keep the extension.
	const fits = (x: string) =>
		win && x.length > 255 ? false : !((mac || target === 'linux') && utf8Len(x) > 255);
	if (!fits(s)) {
		const dot = s.lastIndexOf('.');
		const ext = dot > 0 && s.length - dot <= 16 ? s.slice(dot) : '';
		let stem = Array.from(ext ? s.slice(0, dot) : s);
		while (stem.length && !fits(stem.join('') + ext)) stem.pop();
		s = stem.join('').replace(win ? /[\s.]+$/ : /\s+$/, '') + ext;
		changes.push(
			target === 'windows' ? 'Shortened to 255 UTF-16 units' : 'Shortened to 255 bytes of UTF-8'
		);
	}

	if (s.startsWith('.') && (mac || target === 'linux'))
		changes.push('Starts with a dot, so it is hidden on macOS and Linux');
	if (s.startsWith('-'))
		changes.push('Starts with -, which command-line tools may read as an option');

	return { name: s, changes };
}
