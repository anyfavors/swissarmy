import { describe, expect, it } from 'vitest';
import {
	bestIndex,
	binaryUnits,
	bitUnits,
	decimalUnits,
	fmt,
	formatDuration,
	gapPercent,
	parseSize,
	transferSeconds,
	windowsLabel
} from './logic';

const b = (s: string) => parseSize(s).bytes;

describe('byte-units: parsing', () => {
	it('reads decimal and binary prefixes', () => {
		expect(b('1.5 TB')).toBe(1.5e12);
		expect(b('500 GiB')).toBe(500 * 1024 ** 3);
		expect(b('1 KiB')).toBe(1024);
		expect(b('1 kB')).toBe(1000);
		expect(b('2 PB')).toBe(2e15);
		expect(b('1 MiB')).toBe(1048576);
	});

	it('reads a bare number as bytes', () => {
		expect(b('1048576')).toBe(1048576);
		expect(parseSize('1048576').readAs).toBe('bytes');
		expect(b('1,048,576')).toBe(1048576);
		expect(b('1_000')).toBe(1000);
		expect(b('1e6 B')).toBe(1e6);
	});

	it('tells bytes from bits by the case of B', () => {
		expect(b('4 Tbit')).toBe(4e12 / 8);
		expect(b('8 Mb')).toBe(1e6);
		expect(b('8 MB')).toBe(8e6);
		expect(b('1 Gibit')).toBe(1024 ** 3 / 8);
		expect(parseSize('8 Mb').warning).toMatch(/Lowercase b means bits. Write MB/);
		expect(b('16 bits')).toBe(2);
	});

	it('handles the k/K ambiguity', () => {
		expect(b('1 KB')).toBe(1000);
		expect(parseSize('1 KB').warning).toMatch(/KiB/);
		expect(parseSize('1 kB').warning).toBeUndefined();
	});

	it('reads lowercase prefixes as mega/giga with a warning', () => {
		expect(b('5 mB')).toBe(5e6);
		expect(parseSize('5 mB').warning).toMatch(/milli/);
	});

	it('reads a bare prefix letter as binary like df -h', () => {
		expect(b('500G')).toBe(500 * 1024 ** 3);
		expect(parseSize('1.5T').warning).toMatch(/1024-based/);
	});

	it('accepts spelled-out units and octets', () => {
		expect(b('3 gigabytes')).toBe(3e9);
		expect(b('1 mebibyte')).toBe(1048576);
		expect(b('10 kilobits')).toBe(1250);
		expect(b('2 Go')).toBe(2e9);
	});

	it('rejects bad input', () => {
		expect(() => parseSize('')).toThrow(/Enter a size/);
		expect(() => parseSize('1,5 GB')).toThrow(/decimal mark/);
		expect(() => parseSize('5 XB')).toThrow(/Unknown unit "XB"/);
		expect(() => parseSize('lots')).toThrow(/Could not read/);
	});
});

describe('byte-units: conversion', () => {
	it('converts 2 TB into binary units and bits', () => {
		const bytes = b('2 TB');
		const bin = binaryUnits(bytes);
		expect(bin[4].unit).toBe('TiB');
		expect(bin[4].value.toFixed(2)).toBe('1.82');
		expect(bin[bestIndex(bin)].unit).toBe('TiB');
		expect(decimalUnits(bytes)[4].value).toBe(2);
		expect(bitUnits(bytes)[4]).toEqual({ unit: 'Tbit', value: 16 });
	});

	it('mimics the Windows Explorer label (truncated, 1024-based)', () => {
		expect(windowsLabel(2e12)).toBe('1.81 TB');
		expect(windowsLabel(500e9)).toBe('465 GB');
		expect(windowsLabel(1e12)).toBe('931 GB');
		expect(windowsLabel(1023 * 1024 * 1024)).toBe('0.99 GB');
		expect(windowsLabel(512)).toBe('512 bytes');
	});

	it('computes the gap per prefix level', () => {
		expect(gapPercent(1).toFixed(2)).toBe('2.34');
		expect(gapPercent(3).toFixed(2)).toBe('6.87');
		expect(gapPercent(4).toFixed(2)).toBe('9.05');
	});

	it('formats numbers', () => {
		expect(fmt(1048576)).toBe('1,048,576');
		expect(fmt(1.364242052659392)).toBe('1.364242');
		expect(fmt(0.000123456789)).toBe('0.000123457');
	});
});

describe('byte-units: transfer time', () => {
	it('computes duration with efficiency', () => {
		expect(transferSeconds(1e9, 1, 'Gbit/s')).toBe(8);
		expect(transferSeconds(1e9, 100, 'Mbit/s', 80)).toBe(100);
		expect(transferSeconds(1e6, 1, 'MB/s')).toBe(1);
	});

	it('rejects zero speed and bad efficiency', () => {
		expect(() => transferSeconds(1, 0, 'Mbit/s')).toThrow(/above 0/);
		expect(() => transferSeconds(1, 1, 'Mbit/s', 0)).toThrow(/Efficiency/);
		expect(() => transferSeconds(1, 1, 'Mbit/s', 120)).toThrow(/Efficiency/);
	});

	it('formats durations', () => {
		expect(formatDuration(0.25)).toBe('250 ms');
		expect(formatDuration(8)).toBe('8.00 s');
		expect(formatDuration(42.25)).toBe('42.3 s');
		expect(formatDuration(3725)).toBe('1 h 2 min 5 s');
		expect(formatDuration(90061)).toBe('1 d 1 h 1 min');
	});
});
