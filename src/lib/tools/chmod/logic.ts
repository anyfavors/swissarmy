/**
 * Unix permission modes. A mode is a 12-bit number: setuid (04000), setgid (02000), sticky (01000),
 * then rwx for owner, group and other. Symbolic notation follows ls -l and POSIX chmod.
 */

export const SETUID = 0o4000;
export const SETGID = 0o2000;
export const STICKY = 0o1000;

export type Who = 'u' | 'g' | 'o';
export const whoShift: Record<Who, number> = { u: 6, g: 3, o: 0 };

/** Parses 1 to 4 octal digits, optionally with a leading 0 or 0o, like 755, 0755, 4755. */
export function parseOctal(s: string): number {
	const t = s.trim().replace(/^0o/i, '');
	if (!t) throw new Error('Enter an octal mode such as 755');
	if (!/^[0-7]+$/.test(t)) {
		const bad = t.match(/[^0-7]/)![0];
		throw new Error(`"${bad}" is not an octal digit (0 to 7)`);
	}
	const n = parseInt(t, 8);
	if (t.replace(/^0+/, '').length > 4 || n > 0o7777)
		throw new Error('A mode has at most 4 octal digits');
	return n;
}

/** Four digits when a special bit is set, otherwise three: 4755, 644. */
export function toOctal(mode: number, pad4 = false): string {
	const s = (mode & 0o7777).toString(8);
	return s.padStart(pad4 || mode & 0o7000 ? 4 : 3, '0');
}

function triad(mode: number, who: Who): string {
	const b = (mode >> whoShift[who]) & 7;
	let x = b & 1 ? 'x' : '-';
	if (who === 'u' && mode & SETUID) x = b & 1 ? 's' : 'S';
	if (who === 'g' && mode & SETGID) x = b & 1 ? 's' : 'S';
	if (who === 'o' && mode & STICKY) x = b & 1 ? 't' : 'T';
	return (b & 4 ? 'r' : '-') + (b & 2 ? 'w' : '-') + x;
}

/** ls -l style: -rwsr-xr-x. `type` is the file type character (- d l ...). */
export function toSymbolic(mode: number, type = '-'): string {
	return type + triad(mode, 'u') + triad(mode, 'g') + triad(mode, 'o');
}

/** Parses rwxr-xr-x (9 chars) or -rwxr-xr-x / drwxr-xr-x (10 chars, ACL marker + or . allowed). */
export function parseSymbolic(s: string): { mode: number; type: string } {
	let t = s.trim();
	if (t.length === 11 && /[+.@]$/.test(t)) t = t.slice(0, 10);
	let type = '-';
	if (t.length === 10) {
		type = t[0];
		if (!/[-dlcbps]/.test(type)) throw new Error(`Unknown file type "${type}"`);
		t = t.slice(1);
	}
	if (t.length !== 9) throw new Error('Symbolic mode needs 9 characters like rwxr-xr-x');
	let mode = 0;
	const whos: Who[] = ['u', 'g', 'o'];
	whos.forEach((who, i) => {
		const [r, w, x] = t.slice(i * 3, i * 3 + 3);
		const at = i * 3;
		if (r !== 'r' && r !== '-') throw new Error(`Position ${at + 1} must be r or -`);
		if (w !== 'w' && w !== '-') throw new Error(`Position ${at + 2} must be w or -`);
		const special = who === 'o' ? 't' : 's';
		const ok = ['x', '-', special, special.toUpperCase()];
		if (!ok.includes(x)) throw new Error(`Position ${at + 3} must be one of ${ok.join(' ')}`);
		let b = 0;
		if (r === 'r') b |= 4;
		if (w === 'w') b |= 2;
		if (x === 'x' || x === special) b |= 1;
		mode |= b << whoShift[who];
		if (x.toLowerCase() === special) mode |= who === 'u' ? SETUID : who === 'g' ? SETGID : STICKY;
	});
	return { mode, type };
}

/** chmod argument in symbolic form: u=rwx,g=rx,o=rx. Special bits as s and t. */
export function toChmodSymbolic(mode: number): string {
	const part = (who: Who) => {
		const b = (mode >> whoShift[who]) & 7;
		let p = (b & 4 ? 'r' : '') + (b & 2 ? 'w' : '') + (b & 1 ? 'x' : '');
		if (who === 'u' && mode & SETUID) p += 's';
		if (who === 'g' && mode & SETGID) p += 's';
		if (who === 'o' && mode & STICKY) p += 't';
		return `${who}=${p}`;
	};
	return [part('u'), part('g'), part('o')].join(',');
}

/**
 * Applies a chmod symbolic expression like u+x,go-w or a=r,u+w to a mode, as POSIX chmod does.
 * Without a who letter the change applies to all; real chmod then masks it with the umask,
 * which is passed here (default 0, i.e. no masking).
 */
export function applySymbolic(mode: number, expr: string, isDir = false, umask = 0): number {
	const clauses = expr.trim().split(',');
	if (!expr.trim()) throw new Error('Enter an expression like u+x,go-w');
	let m = mode & 0o7777;
	for (const clause of clauses) {
		const c = clause.match(/^([ugoa]*)((?:[-+=][rwxXst]*|[-+=][ugo])+)$/);
		if (!c)
			throw new Error(`Cannot read "${clause}". Use who (u g o a), op (+ - =), perms (rwxXst)`);
		const whoStr = c[1];
		const who: Who[] =
			!whoStr || whoStr.includes('a') ? ['u', 'g', 'o'] : ([...new Set(whoStr)] as Who[]);
		const mask = whoStr ? 0 : umask;
		for (const action of c[2].match(/[-+=][^-+=]*/g)!) {
			const op = action[0];
			const perms = action.slice(1);
			let bits = 0;
			if (/^[ugo]$/.test(perms)) {
				const src = (m >> whoShift[perms as Who]) & 7;
				for (const w of who) bits |= src << whoShift[w];
			} else {
				for (const p of perms) {
					for (const w of who) {
						const sh = whoShift[w];
						if (p === 'r') bits |= 4 << sh;
						if (p === 'w') bits |= 2 << sh;
						if (p === 'x') bits |= 1 << sh;
						if (p === 'X' && (isDir || m & 0o111)) bits |= 1 << sh;
						if (p === 's' && w === 'u') bits |= SETUID;
						if (p === 's' && w === 'g') bits |= SETGID;
					}
					// t applies to the whole file; chmod accepts it with o or a (or no who)
					if (p === 't' && (who.includes('o') || !whoStr)) bits |= STICKY;
				}
			}
			bits &= ~mask;
			if (op === '+') m |= bits;
			else if (op === '-') m &= ~bits;
			else {
				let clear = 0;
				for (const w of who) clear |= 7 << whoShift[w];
				if (who.includes('u')) clear |= SETUID;
				if (who.includes('g')) clear |= SETGID;
				if (who.includes('o')) clear |= STICKY;
				// POSIX: = with an empty who clears only bits not masked by the umask
				m = (m & ~(clear & ~mask)) | bits;
			}
		}
	}
	return m;
}

export interface UmaskResult {
	umask: number;
	file: number;
	dir: number;
}

/** New files start from 0666, directories from 0777, minus the umask bits. */
export function applyUmask(umask: number): UmaskResult {
	const u = umask & 0o777;
	return { umask: u, file: 0o666 & ~u, dir: 0o777 & ~u };
}

/** Accepts octal (755), symbolic (-rwxr-xr-x) or a chmod expression applied to 000 (u=rwx,go=rx). */
export function parseAny(s: string): number {
	const t = s.trim();
	if (/^(0o)?[0-7]+$/i.test(t)) return parseOctal(t);
	if (/^[-dlcbps]?[-r][-w][-xsS][-r][-w][-xsS][-r][-w][-xtT][+.@]?$/.test(t))
		return parseSymbolic(t).mode;
	if (/^[ugoa]*[-+=]/.test(t)) return applySymbolic(0, t);
	throw new Error('Enter an octal mode (755), a symbolic one (rwxr-xr-x) or u=rwx,go=rx');
}

/** Plain-English reading of a mode. */
export function explain(mode: number): string[] {
	const out: string[] = [];
	const names: Record<Who, string> = { u: 'Owner', g: 'Group', o: 'Others' };
	for (const w of ['u', 'g', 'o'] as Who[]) {
		const b = (mode >> whoShift[w]) & 7;
		const can = [b & 4 && 'read', b & 2 && 'write', b & 1 && 'execute'].filter(Boolean);
		out.push(`${names[w]}: ${can.length ? can.join(', ') : 'no access'}`);
	}
	if (mode & SETUID) out.push('Setuid: runs with the file owner’s user ID');
	if (mode & SETGID)
		out.push('Setgid: runs with the file group, or on a directory new files inherit its group');
	if (mode & STICKY)
		out.push('Sticky: in a directory only the owner of a file may delete or rename it');
	if (mode & SETUID && !(mode & 0o100))
		out.push('Capital S: setuid without owner execute has no effect');
	if (mode & 0o002) out.push('Warning: anyone can write to this file');
	return out;
}

/** Likelihood that input is an octal mode like 755 or 0644. */
export function looksLikeMode(s: string): number {
	const t = s.trim();
	if (/^[0-7]{3,4}$/.test(t)) return 0.4;
	if (/^[-d][-r][-w][-xsS][-r][-w][-xsS][-r][-w][-xtT]$/.test(t)) return 0.9;
	return 0;
}
