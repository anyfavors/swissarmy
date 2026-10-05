import { describe, expect, it } from 'vitest';
import {
	clean,
	fmt,
	fromSi,
	getQuantity,
	looksLikeQuantity,
	mixed,
	parseQuantity,
	quantities,
	table,
	temperatureWarning
} from './logic';

const unit = (q: string, id: string) => getQuantity(q)!.units.find((u) => u.id === id)!;
const conv = (input: string, q: string, to: string) => {
	const p = parseQuantity(input);
	expect(p.quantity.id).toBe(q);
	return clean(fromSi(p.si, unit(q, to)));
};

describe('data', () => {
	it('has unique ids per quantity and positive factors', () => {
		for (const q of quantities) {
			const ids = q.units.map((u) => u.id);
			expect(new Set(ids).size).toBe(ids.length);
			for (const u of q.units) expect(u.factor).toBeGreaterThan(0);
			expect(q.units.some((u) => u.symbol === q.defaultUnit)).toBe(true);
		}
	});

	it('uses exact definitions', () => {
		expect(unit('length', 'in').factor).toBe(0.0254);
		expect(clean(unit('length', 'mi').factor)).toBe(1609.344);
		expect(unit('mass', 'lb').factor).toBe(0.45359237);
		expect(clean(unit('volume', 'gal').factor * 1000)).toBe(3.785411784);
		expect(unit('volume', 'impgal').factor).toBe(0.00454609);
		expect(unit('energy', 'cal').factor).toBe(4.184);
		expect(unit('energy', 'btu').factor).toBe(1055.05585262);
		expect(unit('energy', 'ev').factor).toBe(1.602176634e-19);
		expect(clean(unit('area', 'acre').factor)).toBe(4046.8564224);
	});
});

describe('published conversion factors (NIST SP 811 Appendix B)', () => {
	it('pressure', () => {
		expect(conv('1 psi', 'pressure', 'pa')).toBeCloseTo(6894.757, 3);
		expect(conv('1 mmHg', 'pressure', 'pa')).toBe(133.322387415);
		expect(conv('1 atm', 'pressure', 'torr')).toBe(760);
		expect(conv('1 atm', 'pressure', 'bar')).toBe(1.01325);
		expect(conv('1 inHg', 'pressure', 'pa')).toBeCloseTo(3386.389, 3);
	});

	it('power and energy', () => {
		expect(conv('1 hp', 'power', 'w')).toBeCloseTo(745.6999, 4);
		expect(conv('1 PS', 'power', 'w')).toBe(735.49875);
		expect(conv('1 hk', 'power', 'w')).toBe(735.49875);
		expect(conv('1 BTU/h', 'power', 'w')).toBeCloseTo(0.2930711, 7);
		expect(conv('1 kWh', 'energy', 'mj')).toBe(3.6);
		expect(conv('1 kcal', 'energy', 'kj')).toBe(4.184);
		expect(conv('1 ft·lbf', 'energy', 'j')).toBeCloseTo(1.355818, 6);
		expect(conv('1 MeV', 'energy', 'j')).toBe(1.602176634e-13);
	});

	it('speed, volume, mass', () => {
		expect(conv('1 kn', 'speed', 'kmh')).toBe(1.852);
		expect(conv('60 mph', 'speed', 'kmh')).toBe(96.56064);
		expect(conv('1 US gal', 'volume', 'in3')).toBe(231);
		expect(conv('1 cup', 'volume', 'ml')).toBe(236.5882365);
		expect(conv('1 imp pt', 'volume', 'ml')).toBe(568.26125);
		expect(conv('1 stone', 'mass', 'kg')).toBe(6.35029318);
		expect(conv('1 oz t', 'mass', 'g')).toBe(31.1034768);
		expect(conv('1 gr', 'mass', 'mg')).toBe(64.79891);
	});

	it('data rate, angle, time', () => {
		expect(conv('100 Mbit/s', 'datarate', 'MBps')).toBe(12.5);
		expect(conv('1 Gbps', 'datarate', 'MiBps')).toBeCloseTo(119.209, 3);
		expect(conv('1 turn', 'angle', 'deg')).toBe(360);
		expect(conv('100 gon', 'angle', 'deg')).toBe(90);
		expect(conv('1 yr', 'time', 'd')).toBe(365.2425);
		expect(conv('1 a', 'time', 'd')).toBe(365.25);
	});
});

describe('temperature', () => {
	it('converts with offsets', () => {
		expect(conv('72 °F', 'temperature', 'c')).toBe(22.2222222222);
		expect(conv('-40 C', 'temperature', 'f')).toBe(-40);
		expect(conv('0 °C', 'temperature', 'k')).toBe(273.15);
		expect(conv('100 degC', 'temperature', 'f')).toBe(212);
		expect(conv('0 K', 'temperature', 'r')).toBe(0);
		expect(conv('32 degrees F', 'temperature', 'c')).toBe(0);
		expect(conv('491.67 °R', 'temperature', 'c')).toBe(0);
		expect(conv('72°F', 'temperature', 'c')).toBe(22.2222222222);
		expect(conv('72 ° F', 'temperature', 'c')).toBe(22.2222222222);
	});

	it('refuses to add temperatures and warns below absolute zero', () => {
		expect(() => parseQuantity('20 °C 5 °C')).toThrow(/cannot be added/);
		expect(temperatureWarning(parseQuantity('-300 °C'))).toMatch(/absolute zero/);
		expect(temperatureWarning(parseQuantity('20 °C'))).toBe(null);
	});
});

describe('free text', () => {
	it('adds compound terms', () => {
		expect(conv('5 ft 11 in', 'length', 'cm')).toBe(180.34);
		expect(conv(`5'11"`, 'length', 'cm')).toBe(180.34);
		expect(conv('5′ 11″', 'length', 'cm')).toBe(180.34);
		expect(conv('1 h 30 min', 'time', 'min')).toBe(90);
		expect(conv('2 lb + 3 oz', 'mass', 'g')).toBe(992.233309375);
		expect(conv("12°30'", 'angle', 'deg')).toBe(12.5);
		expect(conv('3 mi', 'length', 'km')).toBe(4.828032);
	});

	it('reads decimal commas, words and case', () => {
		expect(conv('1,5 km', 'length', 'm')).toBe(1500);
		expect(conv('3 Miles', 'length', 'km')).toBe(4.828032);
		expect(conv('2 KG', 'mass', 'g')).toBe(2000);
		expect(conv('10 Feet', 'length', 'm')).toBe(3.048);
	});

	it('keeps case where it matters', () => {
		expect(parseQuantity('1 mW').terms[0].unit.id).toBe('mw-milli');
		expect(parseQuantity('1 MW').terms[0].unit.id).toBe('mw');
		expect(parseQuantity('1 MB/s').terms[0].unit.id).toBe('MBps');
		expect(parseQuantity('1 Mb/s').terms[0].unit.id).toBe('mbps');
		expect(parseQuantity('1 nm').terms[0].unit.id).toBe('nm');
		expect(parseQuantity('1 NM').terms[0].unit.id).toBe('nmi');
		expect(() => parseQuantity('1 mw')).toThrow(/Unknown unit "mw"/);
	});

	it('takes a target unit', () => {
		const p = parseQuantity('3 mi to km');
		expect(p.target?.id).toBe('km');
		expect(parseQuantity('5 ft 11 in in cm').target?.id).toBe('cm');
		expect(parseQuantity('72 °F -> °C').target?.id).toBe('c');
		expect(() => parseQuantity('3 mi to kg')).toThrow(/Cannot convert length to kg/);
		expect(() => parseQuantity('3 mi to parsec')).toThrow(/Unknown target unit/);
	});

	it('explains errors', () => {
		expect(() => parseQuantity('')).toThrow(/Enter a value/);
		expect(() => parseQuantity('5')).toThrow(/5 needs a unit/);
		expect(() => parseQuantity('5 parsec')).toThrow(/Unknown unit "parsec"/);
		expect(() => parseQuantity('5 ft 2 kg')).toThrow(/Cannot add kg \(mass\) to length/);
		expect(() => parseQuantity('5 m² 3 m²')).toThrow(/cannot be added/);
		expect(() => parseQuantity('hello')).toThrow(/Cannot read/);
		expect(parseQuantity('5 ft 11 in').readAs).toBe('5 ft + 11 in');
	});
});

describe('output', () => {
	it('builds a table and mixed forms', () => {
		const p = parseQuantity('1 m');
		const rows = table(p.quantity, p.si);
		expect(rows.length).toBe(p.quantity.units.length);
		expect(mixed(p.quantity, parseQuantity('180.34 cm').si)).toBe('5 ft 11 in');
		expect(mixed(getQuantity('mass')!, parseQuantity('100 kg').si)).toBe(
			'220 lb 7.4 oz · 15 st 10.46 lb'
		);
		expect(mixed(getQuantity('time')!, 5400)).toBe('1 h 30 min');
		expect(mixed(getQuantity('time')!, 0)).toBe('0 s');
		expect(mixed(getQuantity('angle')!, parseQuantity('12.5 deg').si)).toBe('12° 30′ 0″');
		expect(mixed(getQuantity('pressure')!, 1)).toBe(null);
	});

	it('formats numbers', () => {
		expect(fmt(1609.344)).toBe('1,609.344');
		expect(fmt(1.602176634e-19)).toBe('1.602176634e-19');
		expect(fmt(0.1 + 0.2)).toBe('0.3');
	});
});

describe('detect', () => {
	it('recognises quantities and leaves other input alone', () => {
		expect(looksLikeQuantity('5 ft 11 in')).toBeGreaterThan(0);
		expect(looksLikeQuantity('72 °F')).toBeGreaterThan(0);
		expect(looksLikeQuantity('1791115200')).toBe(0);
		expect(looksLikeQuantity('10.20.0.0/22')).toBe(0);
		expect(looksLikeQuantity('2 TB')).toBe(0);
		expect(looksLikeQuantity('1 in 5 people')).toBe(0);
	});
});
