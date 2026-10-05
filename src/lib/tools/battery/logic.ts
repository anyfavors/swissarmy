/**
 * Battery runtime and small off-grid solar sizing.
 *
 * Plain energy bookkeeping: average current from a duty-cycle profile, runtime = usable
 * capacity / average draw. Solar: panel W = daily Wh / (peak sun hours × system efficiency),
 * battery Wh = daily Wh × days of autonomy / depth of discharge. "Peak sun hours" means kWh/m²
 * per day of irradiation on the panel plane, the figure PVGIS (EU Joint Research Centre) and
 * similar irradiation tools report. The defaults are conservative rules of thumb, not standards.
 */

export interface Phase {
	/** Amps */
	current: number;
	/** Seconds per cycle spent in this phase */
	time: number;
}

/** Time-weighted average current over one cycle. */
export function averageCurrent(phases: Phase[]): number {
	if (!phases.length) throw new Error('Add at least one phase');
	let q = 0;
	let t = 0;
	for (const p of phases) {
		if (!(p.current >= 0)) throw new Error('Current cannot be negative');
		if (!(p.time >= 0)) throw new Error('Time cannot be negative');
		q += p.current * p.time;
		t += p.time;
	}
	if (t === 0) throw new Error('Total cycle time is zero');
	return q / t;
}

export interface Runtime {
	/** Hours */
	hours: number;
	/** Usable capacity in Ah after derating */
	usableAh: number;
	/** Energy in Wh, if voltage given */
	wh?: number;
}

/**
 * Runtime from capacity in Ah and average current in A. `derate` (0 to 1] covers
 * temperature, ageing, cutoff voltage and self-discharge, typically 0.7 to 0.85.
 */
export function runtime(capacityAh: number, avgA: number, derate = 0.8, volts?: number): Runtime {
	if (!(capacityAh > 0)) throw new Error('Capacity must be above zero');
	if (!(avgA > 0)) throw new Error('Average current must be above zero');
	if (!(derate > 0 && derate <= 1))
		throw new Error('Derating factor must be above 0 and at most 1');
	const usableAh = capacityAh * derate;
	return { hours: usableAh / avgA, usableAh, wh: volts ? capacityAh * volts : undefined };
}

/** Ah from Wh at a nominal voltage. */
export function whToAh(wh: number, volts: number): number {
	if (!(volts > 0)) throw new Error('Voltage must be above zero to convert Wh to Ah');
	return wh / volts;
}

/** 1234.5 hours → "51 d 10 h 30 min" */
export function humanHours(h: number): string {
	if (!Number.isFinite(h)) return '∞';
	if (h < 1 / 60) return `${(h * 3600).toPrecision(3)} s`;
	const totalMin = Math.round(h * 60);
	const years = h / (24 * 365.25);
	const d = Math.floor(totalMin / 1440);
	const hh = Math.floor((totalMin % 1440) / 60);
	const mm = totalMin % 60;
	const parts: string[] = [];
	if (d) parts.push(`${d} d`);
	if (hh || d) parts.push(`${hh} h`);
	if (!d || d < 10) parts.push(`${mm} min`);
	let s = parts.join(' ');
	if (years >= 1) s += ` (${years.toFixed(1)} years)`;
	return s;
}

export interface Solar {
	/** Panel peak watts needed */
	panelW: number;
	/** Battery energy needed, Wh */
	batteryWh: number;
	/** Battery capacity in Ah at the system voltage */
	batteryAh: number;
	/** Energy the panel must deliver per day before losses */
	dailyWh: number;
}

/**
 * Off-grid sizing.
 * @param dailyWh energy the load uses per day
 * @param psh peak sun hours (kWh/m² per day on the panel) for the worst month you design for
 * @param days days of autonomy without sun
 * @param dod usable depth of discharge, 0 to 1 (lead-acid about 0.5, LiFePO4 about 0.8)
 * @param volts battery system voltage
 * @param eff overall efficiency: charge controller, wiring, battery round trip, dirt, heat
 */
export function solar(
	dailyWh: number,
	psh: number,
	days: number,
	dod: number,
	volts: number,
	eff = 0.75
): Solar {
	if (!(dailyWh > 0)) throw new Error('Daily energy must be above zero');
	if (!(psh > 0)) throw new Error('Peak sun hours must be above zero');
	if (!(days > 0)) throw new Error('Days of autonomy must be above zero');
	if (!(dod > 0 && dod <= 1))
		throw new Error('Depth of discharge must be above 0 and at most 100 %');
	if (!(volts > 0)) throw new Error('System voltage must be above zero');
	if (!(eff > 0 && eff <= 1)) throw new Error('Efficiency must be above 0 and at most 100 %');
	const panelW = dailyWh / (psh * eff);
	const batteryWh = (dailyWh * days) / dod;
	return { panelW, batteryWh, batteryAh: batteryWh / volts, dailyWh };
}

export interface Load {
	name: string;
	watts: number;
	hours: number;
}

/** Daily Wh from a list of loads (W × hours per day). */
export function dailyEnergy(loads: Load[]): number {
	let wh = 0;
	for (const l of loads) {
		if (!(l.watts >= 0) || !(l.hours >= 0))
			throw new Error(`Check the numbers for ${l.name || 'a load'}`);
		if (l.hours > 24) throw new Error(`${l.name || 'A load'} runs more than 24 h a day`);
		wh += l.watts * l.hours;
	}
	return wh;
}

/**
 * Rough peak sun hours for Denmark on a south-facing panel tilted 35 to 45°. User-facing
 * estimates rounded from typical PVGIS results for Danish sites, not cited figures.
 */
export const DK_PSH_ESTIMATE = { winter: '0.5 to 1', summer: '4.5 to 5.5', year: 'about 3' };
