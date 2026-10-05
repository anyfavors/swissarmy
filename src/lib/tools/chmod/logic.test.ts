import { describe, expect, it } from 'vitest';
import {
	applySymbolic,
	applyUmask,
	explain,
	looksLikeMode,
	parseAny,
	parseOctal,
	parseSymbolic,
	toChmodSymbolic,
	toOctal,
	toSymbolic
} from './logic';

describe('octal and symbolic', () => {
	const cases: [number, string][] = [
		[0o755, '-rwxr-xr-x'],
		[0o644, '-rw-r--r--'],
		[0o600, '-rw-------'],
		[0o4755, '-rwsr-xr-x'],
		[0o2750, '-rwxr-s---'],
		[0o4644, '-rwSr--r--'],
		[0o1777, '-rwxrwxrwt'],
		[0o1776, '-rwxrwxrwT'],
		[0o7000, '---S--S--T'],
		[0o000, '----------']
	];
	it.each(cases)('%o is %s and back', (mode, sym) => {
		expect(toSymbolic(mode)).toBe(sym);
		expect(parseSymbolic(sym).mode).toBe(mode);
	});

	it('keeps the file type character', () => {
		expect(toSymbolic(0o1777, 'd')).toBe('drwxrwxrwt');
		expect(parseSymbolic('drwxr-x---')).toEqual({ mode: 0o750, type: 'd' });
		expect(parseSymbolic('rwxr-x---').mode).toBe(0o750);
		expect(parseSymbolic('-rw-r--r--.').mode).toBe(0o644);
	});

	it('formats octal with 3 or 4 digits', () => {
		expect(toOctal(0o755)).toBe('755');
		expect(toOctal(0o4755)).toBe('4755');
		expect(toOctal(0o644, true)).toBe('0644');
		expect(toOctal(0o7)).toBe('007');
	});

	it('parses octal input', () => {
		expect(parseOctal('0755')).toBe(0o755);
		expect(parseOctal('4755')).toBe(0o4755);
		expect(parseOctal('0o644')).toBe(0o644);
		expect(() => parseOctal('789')).toThrow(/"8" is not an octal digit/);
		expect(() => parseOctal('17777')).toThrow(/at most 4/);
		expect(() => parseOctal('')).toThrow(/Enter/);
	});

	it('rejects bad symbolic input', () => {
		expect(() => parseSymbolic('rwx')).toThrow(/9 characters/);
		expect(() => parseSymbolic('rwxrwxrws')).toThrow(/Position 9/);
		expect(() => parseSymbolic('xwxrwxrwx')).toThrow(/Position 1/);
	});
});

describe('chmod command forms', () => {
	it('writes u=,g=,o= clauses', () => {
		expect(toChmodSymbolic(0o755)).toBe('u=rwx,g=rx,o=rx');
		expect(toChmodSymbolic(0o640)).toBe('u=rw,g=r,o=');
		expect(toChmodSymbolic(0o4755)).toBe('u=rwxs,g=rx,o=rx');
		expect(toChmodSymbolic(0o1777)).toBe('u=rwx,g=rwx,o=rwxt');
	});

	it('round-trips every mode through the symbolic chmod form', () => {
		for (let m = 0; m <= 0o7777; m++) expect(applySymbolic(0o7777, toChmodSymbolic(m))).toBe(m);
	});

	it('applies POSIX symbolic expressions', () => {
		expect(applySymbolic(0o644, 'u+x,go-r')).toBe(0o700);
		expect(applySymbolic(0o644, 'a+X')).toBe(0o644);
		expect(applySymbolic(0o644, 'a+X', true)).toBe(0o755);
		expect(applySymbolic(0o744, 'a+X')).toBe(0o755);
		expect(applySymbolic(0o750, 'o=g')).toBe(0o755);
		expect(applySymbolic(0o777, '=r')).toBe(0o444);
		expect(applySymbolic(0o755, 'u+s,+t')).toBe(0o5755);
		expect(applySymbolic(0o755, 'g+s')).toBe(0o2755);
		expect(applySymbolic(0o600, 'go=u-w')).toBe(0o644);
	});

	it('masks who-less changes with the umask', () => {
		expect(applySymbolic(0o444, '+w', false, 0o022)).toBe(0o644);
		expect(applySymbolic(0o444, 'a+w', false, 0o022)).toBe(0o666);
	});

	it('rejects nonsense', () => {
		expect(() => applySymbolic(0, 'u+q')).toThrow(/Cannot read "u\+q"/);
		expect(() => applySymbolic(0, '')).toThrow(/Enter/);
	});
});

describe('umask', () => {
	it('computes default file and directory modes', () => {
		expect(applyUmask(0o022)).toEqual({ umask: 0o022, file: 0o644, dir: 0o755 });
		expect(applyUmask(0o077)).toEqual({ umask: 0o077, file: 0o600, dir: 0o700 });
		expect(applyUmask(0o002)).toEqual({ umask: 0o002, file: 0o664, dir: 0o775 });
		expect(applyUmask(0o027)).toEqual({ umask: 0o027, file: 0o640, dir: 0o750 });
	});
});

describe('parseAny, explain and detect', () => {
	it('accepts every notation', () => {
		expect(parseAny('755')).toBe(0o755);
		expect(parseAny('-rwsr-xr-x')).toBe(0o4755);
		expect(parseAny('u=rwx,go=rx')).toBe(0o755);
		expect(() => parseAny('hello')).toThrow(/octal mode/);
	});

	it('explains special bits and world-writable files', () => {
		const e = explain(0o4757);
		expect(e[0]).toBe('Owner: read, write, execute');
		expect(e.some((l) => l.startsWith('Setuid'))).toBe(true);
		expect(e.some((l) => l.includes('anyone can write'))).toBe(true);
	});

	it('detects modes conservatively', () => {
		expect(looksLikeMode('0755')).toBe(0.4);
		expect(looksLikeMode('644')).toBe(0.4);
		expect(looksLikeMode('-rwxr-xr-x')).toBeGreaterThan(0.8);
		expect(looksLikeMode('1800')).toBe(0);
		expect(looksLikeMode('12345')).toBe(0);
		expect(looksLikeMode('75')).toBe(0);
	});
});
