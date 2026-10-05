import { cp1252Byte, cp1252Decode, latin1Byte, latin1Decode } from './cp1252';

/**
 * Mojibake from UTF-8 read as a single-byte charset: each byte of a multi-byte
 * character turns into its own character. Repair runs the mistake backwards:
 * characters back to bytes in that charset, bytes read as UTF-8.
 */

export type Charset = 'windows-1252' | 'latin-1';

const toByte: Record<Charset, (cp: number) => number> = {
	'windows-1252': cp1252Byte,
	'latin-1': latin1Byte
};

const fatal = new TextDecoder('utf-8', { fatal: true });

/**
 * One repair pass. Only runs of non-ASCII characters are touched, and a run is replaced
 * only when its bytes are valid UTF-8, so text that is partly fine stays fine.
 */
export function repairOnce(text: string, charset: Charset): string {
	const byte = toByte[charset];
	return text.replace(/[^\x00-\x7f]+/g, (run) => {
		const bytes: number[] = [];
		for (const ch of run) {
			const b = byte(ch.codePointAt(0)!);
			if (b < 0) return run;
			bytes.push(b);
		}
		try {
			return fatal.decode(new Uint8Array(bytes));
		} catch {
			return run;
		}
	});
}

/** The mistake itself, for testing: UTF-8 bytes shown as Windows-1252 or Latin-1. */
export function breakText(text: string, charset: Charset = 'windows-1252'): string {
	const bytes = new TextEncoder().encode(text);
	return charset === 'windows-1252' ? cp1252Decode(bytes) : latin1Decode(bytes);
}

// Typical mojibake: a UTF-8 lead byte shown as Â, Ã, Ä, Å, Æ, Ç, Ð, Ñ, Ø, Ù, â, ã, ð
// and similar, followed by a continuation byte shown in the 0x80 to 0xBF range.
const CONT =
	'\u0080-\u00bf' +
	'\u20ac\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u017d\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u017e\u0178';
const MARKER = new RegExp(`[\u00c2-\u00f4][${CONT}]`, 'g');
const C1 = /[\u0080-\u009f]/g;

/**
 * Plausibility from 0 to 1: how much the text looks like clean text rather than
 * mojibake. Lead-plus-continuation pairs and C1 control characters count against it.
 */
export function plausibility(text: string): number {
	const nonAscii = (text.match(/[^\x00-\x7f]/g) ?? []).length;
	if (!nonAscii) return 1;
	const markers = (text.match(MARKER) ?? []).length;
	const c1 = (text.match(C1) ?? []).length;
	const fffd = (text.match(/\ufffd/g) ?? []).length;
	const bad = markers * 2 + c1 + fffd;
	return Math.max(0, Math.round((1 - Math.min(1, bad / nonAscii)) * 100) / 100);
}

export interface Candidate {
	text: string;
	/** How it was produced, e.g. "Windows-1252, 2 passes". */
	via: string;
	passes: number;
	charset: Charset | null;
	score: number;
}

const names: Record<Charset, string> = { 'windows-1252': 'Windows-1252', 'latin-1': 'Latin-1' };

export const MAX_PASSES = 3;

/** The input plus every distinct repair, up to 3 passes per charset, best first. */
export function candidates(text: string): Candidate[] {
	const seen = new Set([text]);
	const out: Candidate[] = [
		{ text, via: 'As pasted', passes: 0, charset: null, score: plausibility(text) }
	];
	for (const cs of ['windows-1252', 'latin-1'] as Charset[]) {
		let cur = text;
		for (let p = 1; p <= MAX_PASSES; p++) {
			const next = repairOnce(cur, cs);
			if (next === cur) break;
			cur = next;
			if (seen.has(cur)) continue;
			seen.add(cur);
			out.push({
				text: cur,
				via: `${names[cs]}, ${p} pass${p > 1 ? 'es' : ''}`,
				passes: p,
				charset: cs,
				score: plausibility(cur)
			});
		}
	}
	// Stable: on a tie the earlier (fewer passes, Windows-1252 first) wins.
	return out
		.map((c, i) => ({ c, i }))
		.sort((a, b) => b.c.score - a.c.score || a.i - b.i)
		.map(({ c }) => c);
}

export interface Diagnosis {
	best: Candidate;
	all: Candidate[];
	/** U+FFFD found: bytes were replaced on the way in and are gone. */
	lost: number;
}

export function diagnose(text: string): Diagnosis {
	const all = candidates(text);
	return { best: all[0], all, lost: (text.match(/\ufffd/g) ?? []).length };
}

/** Best repair; the input unchanged when nothing better is found. */
export function fix(text: string): string {
	return diagnose(text).best.text;
}

/** Pasted text with clear double-encoding markers. */
export function looksLikeMojibake(s: string): number {
	const markers = (s.match(MARKER) ?? []).length;
	if (markers >= 2 && repairOnce(s, 'windows-1252') !== s) return 0.75;
	if (markers === 1 && repairOnce(s, 'windows-1252') !== s) return 0.5;
	return 0;
}
