/**
 * Kubernetes resource quantities and pod QoS.
 *
 * Sources: Kubernetes docs "Resource Management for Pods and Containers" (units, the 400m memory
 * pitfall, 1m CPU precision) and "Pod Quality of Service Classes"; the Quantity grammar in
 * k8s.io/apimachinery/pkg/api/resource/quantity.go.
 */
import { divDecimal } from '../windows-time/logic';

const NANO = 1_000_000_000n;

const BIN: Record<string, bigint> = {
	Ki: 1n << 10n,
	Mi: 1n << 20n,
	Gi: 1n << 30n,
	Ti: 1n << 40n,
	Pi: 1n << 50n,
	Ei: 1n << 60n
};
const DEC: Record<string, number> = {
	n: -9,
	u: -6,
	m: -3,
	'': 0,
	k: 3,
	M: 6,
	G: 9,
	T: 12,
	P: 15,
	E: 18
};

export interface Quantity {
	raw: string;
	/** Value × 10⁹, rounded up like Kubernetes does below 1n */
	nano: bigint;
	suffix: string;
	rounded: boolean;
}

const Q_RE = /^([+-]?)(\d+(?:\.\d*)?|\.\d+)(Ki|Mi|Gi|Ti|Pi|Ei|n|u|m|k|M|G|T|P|E|[eE][+-]?\d+)?$/;

export function parseQuantity(raw: string): Quantity {
	const t = raw.trim().replace(/^["']|["']$/g, '');
	if (!t) throw new Error('Enter a quantity');
	const m = Q_RE.exec(t);
	if (!m) {
		const hint = suffixHint(t);
		throw new Error(`"${t}" is not a Kubernetes quantity.${hint ? ' ' + hint : ''}`);
	}
	const [, sign, num, suffix = ''] = m;
	const [i, f = ''] = num.split('.');
	let n = BigInt((i || '0') + f) * NANO;
	let d = 10n ** BigInt(f.length);
	if (suffix in BIN) n *= BIN[suffix];
	else {
		const e = suffix in DEC ? DEC[suffix] : Number(suffix.slice(1));
		if (Math.abs(e) > 30) throw new Error('Exponent out of range');
		if (e >= 0) n *= 10n ** BigInt(e);
		else d *= 10n ** BigInt(-e);
	}
	const rounded = n % d !== 0n;
	let nano = n / d + (rounded ? 1n : 0n);
	if (sign === '-') nano = -nano;
	return { raw: t, nano, suffix, rounded };
}

function suffixHint(t: string): string {
	if (/^\d+(\.\d+)?K$/.test(t)) return 'Use k (1000) or Ki (1024), uppercase K is not valid.';
	const b = /^(\d+(?:\.\d+)?)([kmgt])b$/i.exec(t);
	if (b) {
		const letter = b[2].toUpperCase();
		return `Drop the B: ${b[1]}${letter === 'K' ? 'k' : letter} (decimal) or ${b[1]}${letter}i (binary).`;
	}
	if (/^\d+(\.\d+)?(ki|mi|gi|ti|KI|MI|GI|TI|kI|mI|gI)$/.test(t))
		return 'Binary suffixes are written Ki, Mi, Gi, Ti: capital letter, small i.';
	if (/^\d+(\.\d+)?\s+\S+$/.test(t)) return 'No space between number and suffix.';
	return '';
}

export type Kind = 'cpu' | 'memory';

export interface Warning {
	text: string;
}

export function warnings(q: Quantity, kind: Kind): Warning[] {
	const w: Warning[] = [];
	if (q.nano < 0n) w.push({ text: 'Negative quantities are not allowed for requests and limits.' });
	if (kind === 'memory') {
		if (q.suffix === 'm' || q.suffix === 'u' || q.suffix === 'n')
			w.push({
				text: `${q.raw} is ${fmtDec(q.nano)} bytes: "m" means milli, not mega. You probably meant ${q.raw.slice(0, -1)}Mi or ${q.raw.slice(0, -1)}M.`
			});
		else if (q.nano % NANO !== 0n) w.push({ text: 'Not a whole number of bytes.' });
		if (q.suffix in DEC && ['k', 'M', 'G', 'T'].includes(q.suffix)) {
			const bin = q.suffix === 'k' ? 'Ki' : q.suffix + 'i';
			w.push({
				text: `${q.suffix} is decimal (1000ⁿ). ${bin} is binary (1024ⁿ), about ${q.suffix === 'k' ? '2.4' : q.suffix === 'M' ? '4.9' : q.suffix === 'G' ? '7.4' : '10'}% bigger.`
			});
		}
	} else {
		if (q.nano % 1_000_000n !== 0n)
			w.push({ text: 'CPU precision finer than 1m is not allowed; the API server rejects it.' });
		if (['Ki', 'Mi', 'Gi', 'Ti', 'Pi', 'Ei', 'k', 'M', 'G', 'T', 'P', 'E'].includes(q.suffix))
			w.push({ text: `${q.suffix} on CPU is unusual. CPU is counted in cores or millicores (m).` });
	}
	if (q.rounded) w.push({ text: 'Below 1n precision, rounded up as Kubernetes does.' });
	return w;
}

export function fmtDec(nano: bigint, places = 9): string {
	return divDecimal(nano, NANO, places);
}

/** CPU as cores and millicores. */
export function fmtCpu(nano: bigint): string {
	const milli = divDecimal(nano, 1_000_000n, 6);
	return `${fmtDec(nano, 6)} cores (${milli}m)`;
}

/** Bytes with the best binary unit. */
export function fmtBytes(nano: bigint): string {
	const bytes = nano / NANO;
	for (const u of ['Ei', 'Pi', 'Ti', 'Gi', 'Mi', 'Ki'])
		if (bytes >= BIN[u]) return `${divDecimal(nano, BIN[u] * NANO, 3)}${u}`;
	return `${fmtDec(nano, 3)} B`;
}

export interface MemoryViews {
	bytes: string;
	binary: { unit: string; value: string }[];
	decimal: { unit: string; value: string }[];
}

export function memoryViews(nano: bigint): MemoryViews {
	return {
		bytes: fmtDec(nano, 3),
		binary: ['Ki', 'Mi', 'Gi', 'Ti'].map((u) => ({
			unit: u,
			value: divDecimal(nano, BIN[u] * NANO, 6)
		})),
		decimal: ['k', 'M', 'G', 'T'].map((u) => ({
			unit: u,
			value: divDecimal(nano, 10n ** BigInt(DEC[u]) * NANO, 6)
		}))
	};
}

// ---------- resources blocks ----------

export type Section = 'requests' | 'limits';

export interface Container {
	name: string;
	requests: Record<string, bigint>;
	limits: Record<string, bigint>;
}

export interface ParseResult {
	containers: Container[];
	errors: string[];
}

/**
 * Reads YAML resources blocks or kubectl describe output, without a YAML parser: section headers
 * requests:/limits: (any case) and "resource: quantity" lines indented below them. A repeated
 * section header or a new resources: line starts the next container.
 */
export function parseResources(text: string): ParseResult {
	const containers: Container[] = [];
	const errors: string[] = [];
	let cur: Container | null = null;
	let section: Section | null = null;
	let sectionIndent = -1;
	let lastName = '';
	const newContainer = () => {
		cur = { name: lastName || `container ${containers.length + 1}`, requests: {}, limits: {} };
		containers.push(cur);
		return cur;
	};
	const add = (c: Container, sec: Section, key: string, val: string, lineNo: number) => {
		try {
			c[sec][key] = parseQuantity(val).nano;
		} catch (e) {
			errors.push(`Line ${lineNo}: ${(e as Error).message}`);
		}
	};
	text.split(/\r?\n/).forEach((line, idx) => {
		const lineNo = idx + 1;
		const l = line.replace(/\s+#.*$/, '').replace(/^#.*$/, '');
		if (!l.trim()) return;
		const indent = l.search(/\S/);
		const body = l.trim().replace(/^-\s+/, '');
		const kv = /^([A-Za-z0-9./_-]+):\s*(.*)$/.exec(body);
		if (!kv) return;
		const [, key, rest] = kv;
		const lk = key.toLowerCase();
		if (section && indent <= sectionIndent) section = null;
		if (lk === 'name' && rest) {
			lastName = rest.replace(/^["']|["']$/g, '');
			return;
		}
		if (lk === 'resources') {
			if (!cur || Object.keys(cur.requests).length || Object.keys(cur.limits).length)
				newContainer();
			section = null;
			return;
		}
		if (lk === 'requests' || lk === 'limits') {
			const sec = lk as Section;
			let c: Container = cur ?? newContainer();
			if (Object.keys(c[sec]).length) c = newContainer();
			const flow = /^\{(.*)\}$/.exec(rest.trim());
			if (flow) {
				for (const part of flow[1].split(',')) {
					const p = /^\s*["']?([A-Za-z0-9./_-]+)["']?\s*:\s*(.+?)\s*$/.exec(part);
					if (p) add(c, sec, p[1], p[2], lineNo);
				}
				section = null;
			} else {
				section = sec;
				sectionIndent = indent;
			}
			return;
		}
		if (section && cur && rest) add(cur, section, key, rest, lineNo);
	});
	if (!containers.length) errors.push('No requests: or limits: found');
	return { containers, errors };
}

/** Kubernetes copies a limit into the request when only the limit is set. */
export function effective(c: Container): Container {
	const requests = { ...c.requests };
	for (const [k, v] of Object.entries(c.limits)) if (!(k in requests)) requests[k] = v;
	return { ...c, requests };
}

export type Qos = 'Guaranteed' | 'Burstable' | 'BestEffort';

export function qosClass(containers: Container[]): { qos: Qos; reason: string } {
	const eff = containers.map(effective);
	const any = eff.some((c) => ['cpu', 'memory'].some((r) => r in c.requests || r in c.limits));
	if (!any)
		return { qos: 'BestEffort', reason: 'No container sets a CPU or memory request or limit.' };
	for (const c of eff) {
		for (const r of ['cpu', 'memory']) {
			if (!(r in c.limits)) return { qos: 'Burstable', reason: `${c.name} has no ${r} limit.` };
			if (c.requests[r] !== c.limits[r])
				return { qos: 'Burstable', reason: `${c.name}: ${r} request differs from its limit.` };
		}
	}
	return {
		qos: 'Guaranteed',
		reason: 'Every container has CPU and memory limits equal to its requests.'
	};
}

export interface Totals {
	resources: string[];
	requests: Record<string, bigint>;
	limits: Record<string, bigint | null>;
}

/** Sums per resource; a limit total is null when some container has no limit for it. */
export function totals(containers: Container[], replicas = 1): Totals {
	const eff = containers.map(effective);
	const set = new Set<string>();
	for (const c of eff)
		for (const k of [...Object.keys(c.requests), ...Object.keys(c.limits)]) set.add(k);
	const order = ['cpu', 'memory', 'ephemeral-storage'];
	const resources = [...set].sort(
		(a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99) || a.localeCompare(b)
	);
	const requests: Record<string, bigint> = {};
	const limits: Record<string, bigint | null> = {};
	const n = BigInt(replicas);
	for (const r of resources) {
		requests[r] = eff.reduce((a, c) => a + (c.requests[r] ?? 0n), 0n) * n;
		limits[r] = eff.every((c) => r in c.limits)
			? eff.reduce((a, c) => a + c.limits[r], 0n) * n
			: null;
	}
	return { resources, requests, limits };
}

/** Formats a total for a resource name. */
export function fmtResource(name: string, nano: bigint): string {
	if (name === 'cpu') return fmtCpu(nano);
	if (name === 'memory' || name.endsWith('storage') || name.startsWith('hugepages-'))
		return fmtBytes(nano);
	return fmtDec(nano);
}

export function looksLikeResources(s: string): number {
	if (!/\b(requests|limits):/i.test(s)) return 0;
	if (/\b(cpu|memory):\s*["']?\d/i.test(s)) return 0.8;
	return 0;
}
