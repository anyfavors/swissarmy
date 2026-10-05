/**
 * Colour parsing and conversion. Conversions follow CSS Color Module Level 4
 * (https://www.w3.org/TR/css-color-4/), OKLab per Björn Ottosson
 * (https://bottosson.github.io/posts/oklab/), contrast per WCAG 2.2 (relative luminance and
 * contrast ratio definitions, success criteria 1.4.3, 1.4.6 and 1.4.11).
 */
import { named } from './named';

/** sRGB, gamma encoded, channels 0..1 (may lie outside for out-of-gamut input), alpha 0..1. */
export interface Rgba {
	r: number;
	g: number;
	b: number;
	a: number;
}

export interface Parsed {
	color: Rgba;
	/** The input was outside the sRGB gamut and has been clipped for sRGB formats. */
	outOfGamut: boolean;
	source: string;
}

const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));

/* ------------------------------------------------------------ transfer */

export function toLinear(c: number): number {
	const a = Math.abs(c);
	const v = a <= 0.04045 ? a / 12.92 : ((a + 0.055) / 1.055) ** 2.4;
	return Math.sign(c) * v;
}

export function fromLinear(c: number): number {
	const a = Math.abs(c);
	const v = a <= 0.0031308 ? a * 12.92 : 1.055 * a ** (1 / 2.4) - 0.055;
	return Math.sign(c) * v;
}

/* ------------------------------------------------------------- OKLab */

export function rgbToOklab({ r, g, b }: Rgba): { L: number; a: number; b: number } {
	const lr = toLinear(r);
	const lg = toLinear(g);
	const lb = toLinear(b);
	const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
	const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
	const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
	return {
		L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
	};
}

export function oklabToRgb(L: number, A: number, B: number, alpha = 1): Rgba {
	const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
	const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
	const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
	return {
		r: fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
		g: fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
		b: fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
		a: alpha
	};
}

export function rgbToOklch(c: Rgba): { L: number; C: number; H: number } {
	const { L, a, b } = rgbToOklab(c);
	const C = Math.hypot(a, b);
	let H = (Math.atan2(b, a) * 180) / Math.PI;
	if (H < 0) H += 360;
	return { L, C, H: C < 1e-4 ? 0 : H };
}

/* -------------------------------------------------------- HSL and HWB */

export function rgbToHsl({ r, g, b }: Rgba): { h: number; s: number; l: number } {
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const d = max - min;
	const l = (max + min) / 2;
	let h = 0;
	let s = 0;
	if (d > 1e-9) {
		s = l === 0 || l === 1 ? 0 : (max - l) / Math.min(l, 1 - l);
		if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
		else if (max === g) h = (b - r) / d + 2;
		else h = (r - g) / d + 4;
		h *= 60;
	}
	return { h, s, l };
}

export function hslToRgb(h: number, s: number, l: number, a = 1): Rgba {
	h = ((h % 360) + 360) % 360;
	const f = (n: number) => {
		const k = (n + h / 30) % 12;
		const t = s * Math.min(l, 1 - l);
		return l - t * Math.max(-1, Math.min(k - 3, 9 - k, 1));
	};
	return { r: f(0), g: f(8), b: f(4), a };
}

export function rgbToHwb(c: Rgba): { h: number; w: number; bl: number } {
	const { h } = rgbToHsl(c);
	return { h, w: Math.min(c.r, c.g, c.b), bl: 1 - Math.max(c.r, c.g, c.b) };
}

export function hwbToRgb(h: number, w: number, bl: number, a = 1): Rgba {
	if (w + bl >= 1) {
		const gray = w / (w + bl);
		return { r: gray, g: gray, b: gray, a };
	}
	const base = hslToRgb(h, 1, 0.5);
	const k = 1 - w - bl;
	return { r: base.r * k + w, g: base.g * k + w, b: base.b * k + w, a };
}

/* --------------------------------------------------------------- CMYK */

/** Naive device CMYK with no colour profile. Print shops will give different numbers. */
export function rgbToCmyk({ r, g, b }: Rgba): { c: number; m: number; y: number; k: number } {
	const k = 1 - Math.max(r, g, b);
	if (k >= 1 - 1e-9) return { c: 0, m: 0, y: 0, k: 1 };
	return { c: (1 - r - k) / (1 - k), m: (1 - g - k) / (1 - k), y: (1 - b - k) / (1 - k), k };
}

export function cmykToRgb(c: number, m: number, y: number, k: number, a = 1): Rgba {
	return { r: (1 - c) * (1 - k), g: (1 - m) * (1 - k), b: (1 - y) * (1 - k), a };
}

/* ------------------------------------------------------------ parsing */

function hue(tok: string): number {
	const m = tok.match(/^(-?[\d.]+(?:e-?\d+)?)(deg|turn|rad|grad)?$/i);
	if (!m) throw new Error(`"${tok}" is not a hue`);
	const n = Number(m[1]);
	switch ((m[2] ?? 'deg').toLowerCase()) {
		case 'turn':
			return n * 360;
		case 'rad':
			return (n * 180) / Math.PI;
		case 'grad':
			return n * 0.9;
		default:
			return n;
	}
}

/** Number or percentage; `pctOf` is what 100% means, `numScale` divides plain numbers. */
function amount(tok: string, pctOf: number, numScale: number, what: string): number {
	if (tok === 'none') return 0;
	const m = tok.match(/^(-?[\d.]+(?:e-?\d+)?)(%)?$/i);
	if (!m || Number.isNaN(Number(m[1]))) throw new Error(`"${tok}" is not a valid ${what}`);
	const n = Number(m[1]);
	return m[2] ? (n / 100) * pctOf : n / numScale;
}

function alpha(tok: string | undefined): number {
	if (tok === undefined) return 1;
	return clamp(amount(tok, 1, 1, 'alpha'));
}

function args(body: string, need: number): { parts: string[]; a?: string } {
	const [main, a] = body.split('/');
	const parts = main
		.trim()
		.split(/[\s,]+/)
		.filter(Boolean);
	if (a !== undefined) return { parts, a: a.trim() };
	// legacy comma syntax with alpha as the last value: rgba(1, 2, 3, 0.5)
	if (parts.length === need + 1) return { parts: parts.slice(0, need), a: parts[need] };
	return { parts };
}

function hex(h: string): Rgba {
	const s = h.length <= 4 ? [...h].map((c) => c + c).join('') : h;
	const n = (i: number) => parseInt(s.slice(i, i + 2), 16) / 255;
	return { r: n(0), g: n(2), b: n(4), a: s.length === 8 ? n(6) : 1 };
}

export function parseColor(input: string): Parsed {
	const source = input.trim();
	const t = source.toLowerCase();
	if (!t) throw new Error('Enter a colour');
	let color: Rgba;
	let wide = false;

	const hx = t.match(/^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/);
	const fn = t.match(/^([a-z-]+)\(\s*(.*?)\s*\)$/);
	if (hx && (t.startsWith('#') || /[a-f]/.test(hx[1]) || hx[1].length >= 6)) color = hex(hx[1]);
	else if (named[t]) color = hex(named[t]);
	else if (t === 'transparent') color = { r: 0, g: 0, b: 0, a: 0 };
	else if (fn) {
		const name = fn[1];
		const need = name === 'cmyk' || name === 'device-cmyk' ? 4 : 3;
		const { parts, a } = args(fn[2], need);
		if (parts.length !== need)
			throw new Error(`${name}() needs ${need} values, got ${parts.length}`);
		switch (name) {
			case 'rgb':
			case 'rgba':
				color = {
					r: amount(parts[0], 1, 255, 'red'),
					g: amount(parts[1], 1, 255, 'green'),
					b: amount(parts[2], 1, 255, 'blue'),
					a: alpha(a)
				};
				color = { ...color, r: clamp(color.r), g: clamp(color.g), b: clamp(color.b) };
				break;
			case 'hsl':
			case 'hsla':
				color = hslToRgb(
					hue(parts[0]),
					clamp(amount(parts[1], 1, 100, 'saturation')),
					clamp(amount(parts[2], 1, 100, 'lightness')),
					alpha(a)
				);
				break;
			case 'hwb':
				color = hwbToRgb(
					hue(parts[0]),
					clamp(amount(parts[1], 1, 100, 'whiteness')),
					clamp(amount(parts[2], 1, 100, 'blackness')),
					alpha(a)
				);
				break;
			case 'oklch': {
				const L = clamp(amount(parts[0], 1, 1, 'lightness'));
				const C = Math.max(0, amount(parts[1], 0.4, 1, 'chroma'));
				const H = parts[2] === 'none' ? 0 : hue(parts[2]);
				color = oklabToRgb(
					L,
					C * Math.cos((H * Math.PI) / 180),
					C * Math.sin((H * Math.PI) / 180),
					alpha(a)
				);
				wide = true;
				break;
			}
			case 'oklab':
				color = oklabToRgb(
					clamp(amount(parts[0], 1, 1, 'lightness')),
					amount(parts[1], 0.4, 1, 'a'),
					amount(parts[2], 0.4, 1, 'b'),
					alpha(a)
				);
				wide = true;
				break;
			case 'cmyk':
			case 'device-cmyk': {
				const v = parts.map((p, i) => clamp(amount(p, 1, 1, 'CMYK'[i] + ' value')));
				color = cmykToRgb(v[0], v[1], v[2], v[3], alpha(a));
				break;
			}
			default:
				throw new Error(`${name}() is not supported. Use hex, rgb, hsl, hwb, oklch, oklab or cmyk`);
		}
	} else
		throw new Error(
			`"${source}" is not a colour. Try #1e90ff, rgb(30 144 255) or a name like tomato`
		);

	const eps = 1e-4;
	const outOfGamut = wide && [color.r, color.g, color.b].some((v) => v < -eps || v > 1 + eps);
	return { color, outOfGamut, source };
}

/* --------------------------------------------------------- formatting */

const r1 = (n: number, d = 1) => {
	const v = Number(n.toFixed(d));
	return String(Object.is(v, -0) ? 0 : v);
};
const pct = (n: number, d = 1) => `${r1(n * 100, d)}%`;
const alphaPart = (a: number) => (a < 1 ? ` / ${r1(a * 100, 0)}%` : '');

export function clip(c: Rgba): Rgba {
	return { r: clamp(c.r), g: clamp(c.g), b: clamp(c.b), a: clamp(c.a) };
}

const byte = (v: number) => Math.round(clamp(v) * 255);

export function toHex(c: Rgba): string {
	const h = (v: number) => byte(v).toString(16).padStart(2, '0');
	return `#${h(c.r)}${h(c.g)}${h(c.b)}${c.a < 1 ? h(c.a) : ''}`;
}

export function toRgbString(c: Rgba): string {
	return `rgb(${byte(c.r)} ${byte(c.g)} ${byte(c.b)}${alphaPart(c.a)})`;
}

export function toHslString(c: Rgba): string {
	const { h, s, l } = rgbToHsl(clip(c));
	return `hsl(${r1(h)} ${pct(s)} ${pct(l)}${alphaPart(c.a)})`;
}

export function toHwbString(c: Rgba): string {
	const { h, w, bl } = rgbToHwb(clip(c));
	return `hwb(${r1(h)} ${pct(w)} ${pct(bl)}${alphaPart(c.a)})`;
}

export function toOklchString(c: Rgba): string {
	const { L, C, H } = rgbToOklch(c);
	return `oklch(${pct(L, 2)} ${r1(C, 4)} ${r1(H, 2)}${alphaPart(c.a)})`;
}

export function toCmykString(c: Rgba): string {
	const { c: cc, m, y, k } = rgbToCmyk(clip(c));
	return `cmyk(${pct(cc, 0)} ${pct(m, 0)} ${pct(y, 0)} ${pct(k, 0)})`;
}

export function formats(c: Rgba): { id: string; label: string; value: string }[] {
	return [
		{ id: 'hex', label: 'HEX', value: toHex(c) },
		{ id: 'rgb', label: 'RGB', value: toRgbString(c) },
		{ id: 'hsl', label: 'HSL', value: toHslString(c) },
		{ id: 'hwb', label: 'HWB', value: toHwbString(c) },
		{ id: 'oklch', label: 'OKLCH', value: toOklchString(c) },
		{ id: 'cmyk', label: 'CMYK (naive)', value: toCmykString(c) }
	];
}

export function nameOf(c: Rgba): string | null {
	if (c.a < 1) return null;
	const h = toHex(c).slice(1);
	return Object.keys(named).find((k) => named[k] === h) ?? null;
}

/* ----------------------------------------------------------- contrast */

/** WCAG 2.x relative luminance of an opaque sRGB colour. */
export function luminance(c: Rgba): number {
	const x = clip(c);
	return 0.2126 * toLinear(x.r) + 0.7152 * toLinear(x.g) + 0.0722 * toLinear(x.b);
}

/** Simple alpha compositing in gamma-encoded sRGB, as browsers paint. */
export function over(top: Rgba, bottom: Rgba): Rgba {
	const a = top.a + bottom.a * (1 - top.a);
	if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
	const mix = (t: number, b: number) => (t * top.a + b * bottom.a * (1 - top.a)) / a;
	return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a };
}

const WHITE: Rgba = { r: 1, g: 1, b: 1, a: 1 };

export function contrast(fg: Rgba, bg: Rgba): number {
	const b = bg.a < 1 ? over(clip(bg), WHITE) : clip(bg);
	const f = fg.a < 1 ? over(clip(fg), b) : clip(fg);
	const l1 = luminance(f);
	const l2 = luminance(b);
	return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

export interface Verdict {
	id: string;
	label: string;
	need: number;
	pass: boolean;
}

/** WCAG 2.2 thresholds. Ratios are compared unrounded: 4.499 fails 4.5. */
export function verdicts(ratio: number): Verdict[] {
	const v = (id: string, label: string, need: number) => ({ id, label, need, pass: ratio >= need });
	return [
		v('aa', 'AA normal text (1.4.3)', 4.5),
		v('aa-large', 'AA large text (1.4.3)', 3),
		v('aaa', 'AAA normal text (1.4.6)', 7),
		v('aaa-large', 'AAA large text (1.4.6)', 4.5),
		v('ui', 'UI components and graphics (1.4.11)', 3)
	];
}

/** Two decimals, rounded down so a failing ratio never displays as passing. */
export function formatRatio(r: number): string {
	return `${(Math.floor(r * 100) / 100).toFixed(2)}:1`;
}

export { looksLikeColor } from './detect';
