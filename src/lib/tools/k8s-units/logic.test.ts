import { describe, expect, it } from 'vitest';
import {
	fmtBytes,
	fmtCpu,
	looksLikeResources,
	memoryViews,
	parseQuantity,
	parseResources,
	qosClass,
	totals,
	warnings
} from './logic';

const bytes = (s: string) => parseQuantity(s).nano / 1_000_000_000n;

describe('quantities', () => {
	it('reads the memory examples from the Kubernetes docs as about the same value', () => {
		// "128974848, 129e6, 129M, 128974848000m, 123Mi"
		expect(bytes('128974848')).toBe(128974848n);
		expect(bytes('129e6')).toBe(129000000n);
		expect(bytes('129M')).toBe(129000000n);
		expect(bytes('128974848000m')).toBe(128974848n);
		expect(bytes('123Mi')).toBe(128974848n);
	});

	it('handles binary and decimal suffixes', () => {
		expect(bytes('1Ki')).toBe(1024n);
		expect(bytes('1k')).toBe(1000n);
		expect(bytes('1.5Gi')).toBe(1610612736n);
		expect(bytes('1E')).toBe(10n ** 18n);
		expect(bytes('1E3')).toBe(1000n);
		expect(bytes('2Ei')).toBe(2n ** 61n);
	});

	it('reads CPU in cores and millicores', () => {
		expect(parseQuantity('0.5').nano).toBe(parseQuantity('500m').nano);
		expect(fmtCpu(parseQuantity('250m').nano)).toBe('0.25 cores (250m)');
		expect(fmtCpu(parseQuantity('2').nano)).toBe('2 cores (2000m)');
	});

	it('rounds below 1n up', () => {
		const q = parseQuantity('0.1n');
		expect(q.nano).toBe(1n);
		expect(q.rounded).toBe(true);
	});

	it('explains common typos', () => {
		expect(() => parseQuantity('512MB')).toThrow(/512M \(decimal\) or 512Mi/);
		expect(() => parseQuantity('1K')).toThrow(/uppercase K/);
		expect(() => parseQuantity('1gi')).toThrow(/capital letter, small i/);
		expect(() => parseQuantity('abc')).toThrow(/not a Kubernetes quantity/);
		expect(() => parseQuantity('')).toThrow(/Enter/);
	});

	it('warns about m on memory and precision on CPU', () => {
		expect(warnings(parseQuantity('400m'), 'memory')[0].text).toMatch(/0.4 bytes.*400Mi/);
		expect(warnings(parseQuantity('128M'), 'memory')[0].text).toMatch(/4.9% bigger/);
		expect(warnings(parseQuantity('0.0005'), 'cpu')[0].text).toMatch(/finer than 1m/);
		expect(warnings(parseQuantity('100m'), 'cpu')).toEqual([]);
		expect(warnings(parseQuantity('256Mi'), 'memory')).toEqual([]);
	});

	it('formats bytes', () => {
		expect(fmtBytes(parseQuantity('128974848').nano)).toBe('123Mi');
		expect(fmtBytes(parseQuantity('1.5Gi').nano)).toBe('1.5Gi');
		expect(fmtBytes(parseQuantity('500').nano)).toBe('500 B');
		const v = memoryViews(parseQuantity('128M').nano);
		expect(v.binary[1]).toEqual({ unit: 'Mi', value: '122.070313' });
		expect(v.decimal[1]).toEqual({ unit: 'M', value: '128' });
	});
});

const YAML = `
containers:
  - name: app
    image: nginx
    resources:
      requests:
        cpu: 250m
        memory: "256Mi"
      limits:
        cpu: "1"
        memory: 512Mi   # hard cap
  - name: sidecar
    resources:
      limits: {cpu: 100m, memory: 64Mi}
`;

describe('resources blocks', () => {
	it('parses YAML with block and flow maps', () => {
		const r = parseResources(YAML);
		expect(r.errors).toEqual([]);
		expect(r.containers.map((c) => c.name)).toEqual(['app', 'sidecar']);
		expect(r.containers[1].requests).toEqual({});
		const t = totals(r.containers);
		expect(t.resources).toEqual(['cpu', 'memory']);
		expect(fmtCpu(t.requests.cpu)).toBe('0.35 cores (350m)');
		expect(fmtBytes(t.requests.memory)).toBe('320Mi');
		expect(fmtCpu(t.limits.cpu!)).toBe('1.1 cores (1100m)');
		expect(fmtBytes(totals(r.containers, 3).limits.memory!)).toBe('1.688Gi');
	});

	it('reads kubectl describe output', () => {
		const r = parseResources(`    Limits:
      cpu:     500m
      memory:  128Mi
    Requests:
      cpu:        250m
      memory:     64Mi`);
		expect(r.containers).toHaveLength(1);
		expect(fmtCpu(r.containers[0].requests.cpu)).toBe('0.25 cores (250m)');
	});

	it('marks a total limit as unbounded when a container has none', () => {
		const r = parseResources(`resources:
  requests:
    cpu: 100m
resources:
  limits:
    cpu: 200m`);
		expect(r.containers).toHaveLength(2);
		expect(totals(r.containers).limits.cpu).toBeNull();
	});

	it('reports bad quantities with line numbers', () => {
		const r = parseResources('requests:\n  memory: 1GB\n');
		expect(r.errors[0]).toMatch(/Line 2: .*1G \(decimal\)/);
		expect(parseResources('hello').errors[0]).toMatch(/No requests/);
	});
});

describe('QoS class', () => {
	it('Guaranteed when limits equal requests (or only limits set)', () => {
		const r = parseResources(`resources:
  limits:
    cpu: 500m
    memory: 128Mi`);
		expect(qosClass(r.containers).qos).toBe('Guaranteed');
	});

	it('Burstable when requests are below limits', () => {
		const q = qosClass(parseResources(YAML).containers);
		expect(q.qos).toBe('Burstable');
		expect(q.reason).toMatch(/app: cpu request differs/);
	});

	it('Burstable when a container lacks a memory limit', () => {
		const r = parseResources(`requests:
  cpu: 1
limits:
  cpu: 1`);
		expect(qosClass(r.containers).reason).toMatch(/no memory limit/);
	});

	it('BestEffort without CPU or memory settings', () => {
		const r = parseResources(`resources:
  requests:
    ephemeral-storage: 1Gi`);
		expect(qosClass(r.containers).qos).toBe('BestEffort');
	});
});

describe('detect', () => {
	it('claims resources blocks only', () => {
		expect(looksLikeResources(YAML)).toBe(0.8);
		expect(looksLikeResources('cpu: 1')).toBe(0);
		expect(looksLikeResources('{"a":1}')).toBe(0);
	});
});
