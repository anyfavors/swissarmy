/**
 * QR Code Model 2 encoder after ISO/IEC 18004:2015.
 * Numeric, alphanumeric and byte (UTF-8) mode, versions 1 to 40, error correction L/M/Q/H,
 * Reed-Solomon over GF(256) with polynomial 0x11D, and mask choice by the four penalty rules
 * (§7.8.3). The block tables are Table 9 of the standard.
 */

export type Ecl = 'L' | 'M' | 'Q' | 'H';
export type Mode = 'numeric' | 'alphanumeric' | 'byte';

const ECL_INDEX: Record<Ecl, number> = { L: 0, M: 1, Q: 2, H: 3 };
/** Format information bits for each level (§7.9.1, Table 12). */
const ECL_FORMAT: Record<Ecl, number> = { L: 1, M: 0, Q: 3, H: 2 };

/** Error correction codewords per block, index [ecl][version]. ISO/IEC 18004 Table 9. */
// prettier-ignore
const ECC_PER_BLOCK: number[][] = [
	[-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
	[-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
	[-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
	[-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
];

/** Number of error correction blocks, index [ecl][version]. ISO/IEC 18004 Table 9. */
// prettier-ignore
const NUM_BLOCKS: number[][] = [
	[-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
	[-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
	[-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
	[-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
];

export const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

const MODE_BITS: Record<Mode, number> = { numeric: 0b0001, alphanumeric: 0b0010, byte: 0b0100 };
/** Character count indicator length for versions 1-9, 10-26, 27-40 (Table 3). */
const COUNT_BITS: Record<Mode, [number, number, number]> = {
	numeric: [10, 12, 14],
	alphanumeric: [9, 11, 13],
	byte: [8, 16, 16]
};

export function countBits(mode: Mode, version: number): number {
	return COUNT_BITS[mode][version < 10 ? 0 : version < 27 ? 1 : 2];
}

/** Modules available for data and EC codewords (everything but function patterns). */
export function rawDataModules(ver: number): number {
	let r = (16 * ver + 128) * ver + 64;
	if (ver >= 2) {
		const n = Math.floor(ver / 7) + 2;
		r -= (25 * n - 10) * n - 55;
		if (ver >= 7) r -= 36;
	}
	return r;
}

export function dataCodewords(ver: number, ecl: Ecl): number {
	const e = ECL_INDEX[ecl];
	return Math.floor(rawDataModules(ver) / 8) - ECC_PER_BLOCK[e][ver] * NUM_BLOCKS[e][ver];
}

export function blockInfo(ver: number, ecl: Ecl): { blocks: number; eccPerBlock: number } {
	const e = ECL_INDEX[ecl];
	return { blocks: NUM_BLOCKS[e][ver], eccPerBlock: ECC_PER_BLOCK[e][ver] };
}

/* ----------------------------------------------------------- bit buffer */

class Bits {
	data: number[] = [];
	put(value: number, len: number) {
		for (let i = len - 1; i >= 0; i--) this.data.push((value >>> i) & 1);
	}
	get length() {
		return this.data.length;
	}
}

export function pickMode(text: string): Mode {
	if (/^\d*$/.test(text)) return 'numeric';
	if ([...text].every((c) => ALNUM.includes(c))) return 'alphanumeric';
	return 'byte';
}

function dataBits(mode: Mode, text: string, bytes: Uint8Array): Bits {
	const b = new Bits();
	if (mode === 'numeric') {
		for (let i = 0; i < text.length; i += 3) {
			const chunk = text.slice(i, i + 3);
			b.put(Number(chunk), chunk.length * 3 + 1);
		}
	} else if (mode === 'alphanumeric') {
		for (let i = 0; i < text.length; i += 2) {
			const a = ALNUM.indexOf(text[i]);
			if (i + 1 < text.length) b.put(a * 45 + ALNUM.indexOf(text[i + 1]), 11);
			else b.put(a, 6);
		}
	} else {
		for (const x of bytes) b.put(x, 8);
	}
	return b;
}

function charCount(mode: Mode, text: string, bytes: Uint8Array): number {
	return mode === 'byte' ? bytes.length : text.length;
}

/* ------------------------------------------------------- Reed-Solomon */

function gfMul(x: number, y: number): number {
	let z = 0;
	for (let i = 7; i >= 0; i--) {
		z = (z << 1) ^ ((z >>> 7) * 0x11d);
		z ^= ((y >>> i) & 1) * x;
	}
	return z;
}

/** Generator polynomial of the given degree, coefficients highest first, leading 1 dropped. */
export function rsDivisor(degree: number): number[] {
	const r = new Array<number>(degree).fill(0);
	r[degree - 1] = 1;
	let root = 1;
	for (let i = 0; i < degree; i++) {
		for (let j = 0; j < r.length; j++) {
			r[j] = gfMul(r[j], root);
			if (j + 1 < r.length) r[j] ^= r[j + 1];
		}
		root = gfMul(root, 0x02);
	}
	return r;
}

export function rsRemainder(data: number[], divisor: number[]): number[] {
	const r = new Array<number>(divisor.length).fill(0);
	for (const b of data) {
		const factor = b ^ (r.shift() as number);
		r.push(0);
		divisor.forEach((coef, i) => (r[i] ^= gfMul(coef, factor)));
	}
	return r;
}

/* ----------------------------------------------------------- matrix */

export interface QrCode {
	version: number;
	ecl: Ecl;
	mask: number;
	mode: Mode;
	size: number;
	/** modules[y][x], true = dark. */
	modules: boolean[][];
	/** Data codewords before error correction (with padding). */
	data: number[];
	/** Final interleaved codeword sequence placed in the symbol. */
	codewords: number[];
	/** Penalty score of each mask, in order 0 to 7. */
	penalties: number[];
}

export function alignmentPositions(ver: number): number[] {
	if (ver === 1) return [];
	const n = Math.floor(ver / 7) + 2;
	const size = ver * 4 + 17;
	const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
	const out = [6];
	for (let pos = size - 7; out.length < n; pos -= step) out.splice(1, 0, pos);
	return out;
}

/** BCH(15,5) format information with the 101010000010010 mask (§7.9). */
export function formatBits(ecl: Ecl, mask: number): number {
	const data = (ECL_FORMAT[ecl] << 3) | mask;
	let rem = data;
	for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
	return ((data << 10) | rem) ^ 0x5412;
}

/** BCH(18,6) version information for versions 7 and up (§7.10). */
export function versionBits(ver: number): number {
	let rem = ver;
	for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
	return (ver << 12) | rem;
}

const bit = (x: number, i: number) => ((x >>> i) & 1) !== 0;

class Matrix {
	size: number;
	m: boolean[][];
	fn: boolean[][];
	constructor(
		public ver: number,
		public ecl: Ecl
	) {
		this.size = ver * 4 + 17;
		this.m = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
		this.fn = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
		this.functionPatterns();
	}

	set(x: number, y: number, dark: boolean) {
		this.m[y][x] = dark;
		this.fn[y][x] = true;
	}

	functionPatterns() {
		const s = this.size;
		for (let i = 0; i < s; i++) {
			this.set(6, i, i % 2 === 0);
			this.set(i, 6, i % 2 === 0);
		}
		for (const [x, y] of [
			[3, 3],
			[s - 4, 3],
			[3, s - 4]
		]) {
			for (let dy = -4; dy <= 4; dy++)
				for (let dx = -4; dx <= 4; dx++) {
					const d = Math.max(Math.abs(dx), Math.abs(dy));
					const xx = x + dx;
					const yy = y + dy;
					if (xx >= 0 && xx < s && yy >= 0 && yy < s) this.set(xx, yy, d !== 2 && d !== 4);
				}
		}
		const pos = alignmentPositions(this.ver);
		const n = pos.length;
		for (let i = 0; i < n; i++)
			for (let j = 0; j < n; j++) {
				if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
				for (let dy = -2; dy <= 2; dy++)
					for (let dx = -2; dx <= 2; dx++)
						this.set(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
			}
		this.format(0);
		this.version();
	}

	format(mask: number) {
		const b = formatBits(this.ecl, mask);
		const s = this.size;
		for (let i = 0; i <= 5; i++) this.set(8, i, bit(b, i));
		this.set(8, 7, bit(b, 6));
		this.set(8, 8, bit(b, 7));
		this.set(7, 8, bit(b, 8));
		for (let i = 9; i < 15; i++) this.set(14 - i, 8, bit(b, i));
		for (let i = 0; i < 8; i++) this.set(s - 1 - i, 8, bit(b, i));
		for (let i = 8; i < 15; i++) this.set(8, s - 15 + i, bit(b, i));
		this.set(8, s - 8, true); // the dark module
	}

	version() {
		if (this.ver < 7) return;
		const b = versionBits(this.ver);
		for (let i = 0; i < 18; i++) {
			const a = this.size - 11 + (i % 3);
			const c = Math.floor(i / 3);
			this.set(a, c, bit(b, i));
			this.set(c, a, bit(b, i));
		}
	}

	place(codewords: number[]) {
		const s = this.size;
		let i = 0;
		for (let right = s - 1; right >= 1; right -= 2) {
			if (right === 6) right = 5;
			for (let v = 0; v < s; v++)
				for (let j = 0; j < 2; j++) {
					const x = right - j;
					const up = ((right + 1) & 2) === 0;
					const y = up ? s - 1 - v : v;
					if (!this.fn[y][x] && i < codewords.length * 8) {
						this.m[y][x] = bit(codewords[i >>> 3], 7 - (i & 7));
						i++;
					}
					// remainder bits stay light
				}
		}
	}

	mask(k: number) {
		const s = this.size;
		for (let y = 0; y < s; y++)
			for (let x = 0; x < s; x++) {
				if (this.fn[y][x]) continue;
				let inv: boolean;
				switch (k) {
					case 0:
						inv = (x + y) % 2 === 0;
						break;
					case 1:
						inv = y % 2 === 0;
						break;
					case 2:
						inv = x % 3 === 0;
						break;
					case 3:
						inv = (x + y) % 3 === 0;
						break;
					case 4:
						inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
						break;
					case 5:
						inv = ((x * y) % 2) + ((x * y) % 3) === 0;
						break;
					case 6:
						inv = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
						break;
					default:
						inv = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
				}
				if (inv) this.m[y][x] = !this.m[y][x];
			}
	}

	penalty(): number {
		return penalty(this.m);
	}
}

/* ------------------------------------------------------------ penalty */

const N1 = 3;
const N2 = 3;
const N3 = 40;
const N4 = 10;

/** Penalty score of a finished symbol, ISO/IEC 18004 §7.8.3. */
export function penalty(m: boolean[][]): number {
	const s = m.length;
	let result = 0;

	const addHistory = (run: number, h: number[]) => {
		if (h[0] === 0) run += s; // light border before the first run
		h.pop();
		h.unshift(run);
	};
	const countPatterns = (h: number[]) => {
		const n = h[1];
		const core = n > 0 && h[2] === n && h[3] === n * 3 && h[4] === n && h[5] === n;
		return (
			(core && h[0] >= n * 4 && h[6] >= n ? 1 : 0) + (core && h[6] >= n * 4 && h[0] >= n ? 1 : 0)
		);
	};
	const terminate = (color: boolean, run: number, h: number[]) => {
		if (color) {
			addHistory(run, h);
			run = 0;
		}
		run += s; // light border after the last run
		addHistory(run, h);
		return countPatterns(h);
	};

	for (let pass = 0; pass < 2; pass++) {
		for (let a = 0; a < s; a++) {
			let color = false;
			let run = 0;
			const h = [0, 0, 0, 0, 0, 0, 0];
			for (let b = 0; b < s; b++) {
				const v = pass === 0 ? m[a][b] : m[b][a];
				if (v === color) {
					run++;
					if (run === 5) result += N1;
					else if (run > 5) result++;
				} else {
					addHistory(run, h);
					if (!color) result += countPatterns(h) * N3;
					color = v;
					run = 1;
				}
			}
			result += terminate(color, run, h) * N3;
		}
	}

	for (let y = 0; y < s - 1; y++)
		for (let x = 0; x < s - 1; x++) {
			const c = m[y][x];
			if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) result += N2;
		}

	let dark = 0;
	for (const row of m) for (const v of row) if (v) dark++;
	const total = s * s;
	const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
	result += k * N4;
	return result;
}

/* ------------------------------------------------------------- encode */

export interface EncodeOptions {
	ecl?: Ecl;
	/** Force a mask 0-7; otherwise the lowest penalty wins. */
	mask?: number;
	minVersion?: number;
	/** Force a mode; must be able to represent the text. */
	mode?: Mode;
}

export function capacityBytes(ver: number, ecl: Ecl): number {
	return Math.floor((dataCodewords(ver, ecl) * 8 - 4 - countBits('byte', ver)) / 8);
}

export function encode(text: string, opts: EncodeOptions = {}): QrCode {
	const ecl = opts.ecl ?? 'M';
	const bytes = new TextEncoder().encode(text);
	const mode = opts.mode ?? pickMode(text);
	if (mode === 'numeric' && !/^\d*$/.test(text)) throw new Error('Numeric mode takes digits only');
	if (mode === 'alphanumeric' && ![...text].every((c) => ALNUM.includes(c)))
		throw new Error('Alphanumeric mode takes 0-9, A-Z, space and $ % * + - . / : only');
	const payload = dataBits(mode, text, bytes);
	const count = charCount(mode, text, bytes);

	let ver = Math.max(1, opts.minVersion ?? 1);
	for (; ; ver++) {
		if (ver > 40) {
			throw new Error(
				`Too long: ${bytes.length} bytes. The largest code (version 40) holds ${capacityBytes(40, ecl)} bytes at level ${ecl}`
			);
		}
		const cb = countBits(mode, ver);
		if (count < 1 << cb && 4 + cb + payload.length <= dataCodewords(ver, ecl) * 8) break;
	}

	const bb = new Bits();
	bb.put(MODE_BITS[mode], 4);
	bb.put(count, countBits(mode, ver));
	bb.data.push(...payload.data);
	const capBits = dataCodewords(ver, ecl) * 8;
	bb.put(0, Math.min(4, capBits - bb.length));
	bb.put(0, (8 - (bb.length % 8)) % 8);
	for (let pad = 0xec; bb.length < capBits; pad ^= 0xec ^ 0x11) bb.put(pad, 8);
	const data: number[] = [];
	for (let i = 0; i < bb.length; i += 8) {
		let v = 0;
		for (let j = 0; j < 8; j++) v = (v << 1) | bb.data[i + j];
		data.push(v);
	}

	// Split into blocks, add error correction and interleave (§7.5, §7.6)
	const { blocks: nb, eccPerBlock } = blockInfo(ver, ecl);
	const rawCodewords = Math.floor(rawDataModules(ver) / 8);
	const numShort = nb - (rawCodewords % nb);
	const shortLen = Math.floor(rawCodewords / nb);
	const divisor = rsDivisor(eccPerBlock);
	const dBlocks: number[][] = [];
	const eBlocks: number[][] = [];
	for (let i = 0, k = 0; i < nb; i++) {
		const len = shortLen - eccPerBlock + (i < numShort ? 0 : 1);
		const d = data.slice(k, k + len);
		k += len;
		dBlocks.push(d);
		eBlocks.push(rsRemainder(d, divisor));
	}
	const codewords: number[] = [];
	const maxLen = Math.max(...dBlocks.map((d) => d.length));
	for (let i = 0; i < maxLen; i++) for (const d of dBlocks) if (i < d.length) codewords.push(d[i]);
	for (let i = 0; i < eccPerBlock; i++) for (const e of eBlocks) codewords.push(e[i]);

	const mx = new Matrix(ver, ecl);
	mx.place(codewords);

	const penalties: number[] = [];
	for (let k = 0; k < 8; k++) {
		mx.mask(k);
		mx.format(k);
		penalties.push(mx.penalty());
		mx.mask(k); // undo
	}
	let mask = opts.mask ?? -1;
	if (mask < 0 || mask > 7) mask = penalties.indexOf(Math.min(...penalties));
	mx.mask(mask);
	mx.format(mask);

	return {
		version: ver,
		ecl,
		mask,
		mode,
		size: mx.size,
		modules: mx.m,
		data,
		codewords,
		penalties
	};
}

/** Reads the format information next to the top-left finder back out of a symbol. */
export function readFormat(m: boolean[][]): { ecl: Ecl; mask: number } | null {
	let b = 0;
	const get = (x: number, y: number) => (m[y][x] ? 1 : 0);
	const bits: number[] = [];
	for (let i = 0; i <= 5; i++) bits[i] = get(8, i);
	bits[6] = get(8, 7);
	bits[7] = get(8, 8);
	bits[8] = get(7, 8);
	for (let i = 9; i < 15; i++) bits[i] = get(14 - i, 8);
	bits.forEach((v, i) => (b |= v << i));
	for (const ecl of ['L', 'M', 'Q', 'H'] as Ecl[])
		for (let mask = 0; mask < 8; mask++) if (formatBits(ecl, mask) === b) return { ecl, mask };
	return null;
}
