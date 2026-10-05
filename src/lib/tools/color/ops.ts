import type { ChainOp } from '../types';
import { parseColor, toHex, toHslString, toOklchString, toRgbString } from './logic';

const conv = (f: (c: ReturnType<typeof parseColor>['color']) => string) => (s: string) =>
	f(parseColor(s).color);

export const ops: ChainOp[] = [
	{ id: 'color.hex', label: 'Colour to HEX', run: conv(toHex) },
	{ id: 'color.rgb', label: 'Colour to rgb()', run: conv(toRgbString) },
	{ id: 'color.hsl', label: 'Colour to hsl()', run: conv(toHslString) },
	{ id: 'color.oklch', label: 'Colour to oklch()', run: conv(toOklchString) }
];
