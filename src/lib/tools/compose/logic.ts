/*
 * docker run ⇄ Compose service. Flag names and meanings follow the docker run reference
 * (https://docs.docker.com/reference/cli/docker/container/run/), service keys follow the
 * Compose Specification (https://docs.docker.com/reference/compose-file/services/).
 * YAML is written and read with the YAML tool's emitter and parser.
 */
import type { JNode } from '../json/logic';
import { emitYaml, yamlToJson } from '../yaml/logic';

/* ---------- shell words ---------- */

/**
 * Splits a POSIX shell command line into words: single quotes, double quotes with \ escapes,
 * backslash escapes and line continuations. Variables and command substitutions are kept
 * as written, never expanded.
 */
export function shellSplit(input: string): string[] {
	const out: string[] = [];
	let cur = '';
	let has = false;
	let i = 0;
	const s = input;
	while (i < s.length) {
		const c = s[i];
		if (c === '\\') {
			const n = s[i + 1];
			if (n === '\n') i += 2;
			else if (n === '\r' && s[i + 2] === '\n') i += 3;
			else if (n === undefined) i++;
			else {
				cur += n;
				has = true;
				i += 2;
			}
			continue;
		}
		if (c === "'") {
			const end = s.indexOf("'", i + 1);
			if (end < 0) throw new Error('Unterminated single quote');
			cur += s.slice(i + 1, end);
			has = true;
			i = end + 1;
			continue;
		}
		if (c === '"') {
			i++;
			has = true;
			while (true) {
				if (i >= s.length) throw new Error('Unterminated double quote');
				const d = s[i];
				if (d === '"') {
					i++;
					break;
				}
				if (d === '\\' && i + 1 < s.length) {
					const n = s[i + 1];
					// Inside double quotes a backslash only escapes $ ` " \ and newline.
					if (n === '\n') i += 2;
					else if ('$`"\\'.includes(n)) {
						cur += n;
						i += 2;
					} else {
						cur += d;
						i++;
					}
					continue;
				}
				cur += d;
				i++;
			}
			continue;
		}
		if (c === '#' && !has) {
			// Comment to end of line.
			while (i < s.length && s[i] !== '\n') i++;
			continue;
		}
		if (/\s/.test(c)) {
			if (has) out.push(cur);
			cur = '';
			has = false;
			i++;
			continue;
		}
		if ((c === ';' || c === '|' || c === '&') && !has) {
			throw new Error(
				`"${c}" ends the docker run command. Paste a single command without pipes, && or ;`
			);
		}
		cur += c;
		has = true;
		i++;
	}
	if (has) out.push(cur);
	return out;
}

/** Quotes a word for a POSIX shell only when needed. */
export function shellQuote(w: string): string {
	if (w === '') return "''";
	if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(w)) return w;
	return `'${w.replace(/'/g, `'\\''`)}'`;
}

/* ---------- docker run flags ---------- */

type FlagKind = 'value' | 'bool';

/** Long names of docker run options and whether they take a value. Short forms map to them. */
const FLAGS: Record<string, FlagKind> = {
	'add-host': 'value',
	annotation: 'value',
	attach: 'value',
	'blkio-weight': 'value',
	'blkio-weight-device': 'value',
	'cap-add': 'value',
	'cap-drop': 'value',
	'cgroup-parent': 'value',
	cgroupns: 'value',
	cidfile: 'value',
	'cpu-period': 'value',
	'cpu-quota': 'value',
	'cpu-rt-period': 'value',
	'cpu-rt-runtime': 'value',
	'cpu-shares': 'value',
	cpus: 'value',
	'cpuset-cpus': 'value',
	'cpuset-mems': 'value',
	detach: 'bool',
	'detach-keys': 'value',
	device: 'value',
	'device-cgroup-rule': 'value',
	'device-read-bps': 'value',
	'device-read-iops': 'value',
	'device-write-bps': 'value',
	'device-write-iops': 'value',
	'disable-content-trust': 'bool',
	dns: 'value',
	'dns-option': 'value',
	'dns-opt': 'value',
	'dns-search': 'value',
	domainname: 'value',
	entrypoint: 'value',
	env: 'value',
	'env-file': 'value',
	expose: 'value',
	gpus: 'value',
	'group-add': 'value',
	'health-cmd': 'value',
	'health-interval': 'value',
	'health-retries': 'value',
	'health-start-interval': 'value',
	'health-start-period': 'value',
	'health-timeout': 'value',
	help: 'bool',
	hostname: 'value',
	init: 'bool',
	interactive: 'bool',
	ip: 'value',
	ip6: 'value',
	ipc: 'value',
	isolation: 'value',
	'kernel-memory': 'value',
	label: 'value',
	'label-file': 'value',
	link: 'value',
	'link-local-ip': 'value',
	'log-driver': 'value',
	'log-opt': 'value',
	'mac-address': 'value',
	memory: 'value',
	'memory-reservation': 'value',
	'memory-swap': 'value',
	'memory-swappiness': 'value',
	mount: 'value',
	name: 'value',
	network: 'value',
	net: 'value',
	'network-alias': 'value',
	'net-alias': 'value',
	'no-healthcheck': 'bool',
	'oom-kill-disable': 'bool',
	'oom-score-adj': 'value',
	pid: 'value',
	'pids-limit': 'value',
	platform: 'value',
	privileged: 'bool',
	publish: 'value',
	'publish-all': 'bool',
	pull: 'value',
	quiet: 'bool',
	'read-only': 'bool',
	restart: 'value',
	rm: 'bool',
	runtime: 'value',
	'security-opt': 'value',
	'shm-size': 'value',
	'sig-proxy': 'bool',
	'stop-signal': 'value',
	'stop-timeout': 'value',
	'storage-opt': 'value',
	sysctl: 'value',
	tmpfs: 'value',
	tty: 'bool',
	ulimit: 'value',
	user: 'value',
	userns: 'value',
	uts: 'value',
	volume: 'value',
	'volume-driver': 'value',
	'volumes-from': 'value',
	workdir: 'value'
};

const SHORT: Record<string, string> = {
	a: 'attach',
	c: 'cpu-shares',
	d: 'detach',
	e: 'env',
	h: 'hostname',
	i: 'interactive',
	l: 'label',
	m: 'memory',
	p: 'publish',
	P: 'publish-all',
	q: 'quiet',
	t: 'tty',
	u: 'user',
	v: 'volume',
	w: 'workdir'
};

/** Flags with no Compose equivalent, and why. */
const NO_COMPOSE: Record<string, string> = {
	attach: 'Compose attaches to all services with docker compose up',
	cidfile: 'no Compose equivalent',
	'detach-keys': 'set it on docker compose attach instead',
	'disable-content-trust': 'no Compose equivalent',
	gpus: 'Compose uses deploy.resources.reservations.devices with capabilities: [gpu]',
	help: 'not a container option',
	'label-file': 'list the labels under labels: instead',
	'publish-all': 'Compose has no publish-all, list the ports',
	quiet: 'not a container option',
	'sig-proxy': 'no Compose equivalent',
	'kernel-memory': 'deprecated in Docker and not in the Compose Specification',
	'volume-driver': 'set driver on the named volume under the top-level volumes: instead',
	'link-local-ip': 'use networks.<name>.link_local_ips',
	'device-read-bps': 'use blkio_config.device_read_bps',
	'device-read-iops': 'use blkio_config.device_read_iops',
	'device-write-bps': 'use blkio_config.device_write_bps',
	'device-write-iops': 'use blkio_config.device_write_iops',
	'blkio-weight': 'use blkio_config.weight',
	'blkio-weight-device': 'use blkio_config.weight_device',
	annotation: 'use annotations:',
	'cpu-rt-period': 'use cpu_rt_period',
	'cpu-rt-runtime': 'use cpu_rt_runtime',
	'cpuset-mems': 'no direct Compose key in this converter',
	cgroupns: 'use cgroup: host or private',
	'memory-swappiness': 'use mem_swappiness',
	'oom-kill-disable': 'use oom_kill_disable',
	'storage-opt': 'use storage_opt',
	ip6: 'use networks.<name>.ipv6_address',
	isolation: 'use isolation:',
	'dns-option': 'use dns_opt',
	'dns-opt': 'use dns_opt',
	'device-cgroup-rule': 'use device_cgroup_rules',
	domainname: 'use domainname:',
	'cgroup-parent': 'use cgroup_parent',
	'cpu-period': 'use cpu_period',
	'cpu-quota': 'use cpu_quota',
	uts: 'use uts:'
};

export interface Flag {
	name: string;
	value?: string;
	/** As written, for messages. */
	raw: string;
}

export interface RunCommand {
	flags: Flag[];
	image: string;
	args: string[];
	/** docker, podman, nerdctl */
	tool: string;
}

/** Reads a docker run (or podman run) command into flags, image and command. */
export function parseRun(input: string): RunCommand {
	let w = shellSplit(input);
	while (w[0] === 'sudo' || /^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0] ?? '')) w = w.slice(1);
	if (!w.length) throw new Error('Paste a docker run command');
	const tool = w[0].replace(/^.*\//, '');
	if (!['docker', 'podman', 'nerdctl'].includes(tool))
		throw new Error(`Expected a command starting with docker run, got "${w[0]}"`);
	let i = 1;
	if (w[i] === 'container') i++;
	if (w[i] !== 'run')
		throw new Error(`Expected "${tool} run", got "${w.slice(0, i + 1).join(' ')}"`);
	i++;
	const flags: Flag[] = [];
	for (; i < w.length; i++) {
		const t = w[i];
		if (t === '--') {
			i++;
			break;
		}
		if (!t.startsWith('-') || t === '-') break;
		if (t.startsWith('--')) {
			const eq = t.indexOf('=');
			const name = eq >= 0 ? t.slice(2, eq) : t.slice(2);
			const kind = FLAGS[name];
			if (!kind) throw new Error(`Unknown option ${t}. Is it written correctly?`);
			if (kind === 'bool') {
				const v = eq >= 0 ? t.slice(eq + 1) : undefined;
				if (v !== undefined && !/^(?:true|false)$/.test(v))
					throw new Error(`${t}: a switch takes true or false`);
				flags.push({ name, value: v, raw: t });
			} else if (eq >= 0) flags.push({ name, value: t.slice(eq + 1), raw: t });
			else {
				if (i + 1 >= w.length) throw new Error(`${t} needs a value`);
				flags.push({ name, value: w[++i], raw: `${t} ${w[i]}` });
			}
			continue;
		}
		// Short options, possibly combined (-dit) with a value-taking one last (-it -p 80:80).
		for (let j = 1; j < t.length; j++) {
			const name = SHORT[t[j]];
			if (!name) throw new Error(`Unknown option -${t[j]} in ${t}`);
			if (FLAGS[name] === 'bool') {
				flags.push({ name, raw: `-${t[j]}` });
				continue;
			}
			let v = t.slice(j + 1);
			if (v.startsWith('=')) v = v.slice(1);
			if (!v) {
				if (i + 1 >= w.length) throw new Error(`-${t[j]} needs a value`);
				v = w[++i];
			}
			flags.push({ name, value: v, raw: `-${t[j]} ${v}` });
			break;
		}
	}
	if (i >= w.length) throw new Error('No image found after the options');
	return { flags, image: w[i], args: w.slice(i + 1), tool };
}

/* ---------- run → compose ---------- */

export interface Note {
	level: 'unsupported' | 'info';
	text: string;
}

export interface ToCompose {
	yaml: string;
	service: string;
	notes: Note[];
}

type Obj = [string, JNode][];
const str = (v: string): JNode => ({ t: 'p', raw: JSON.stringify(v) });
const num = (v: number): JNode => ({ t: 'p', raw: String(v) });
const bool = (v: boolean): JNode => ({ t: 'p', raw: String(v) });
const arr = (v: JNode[]): JNode => ({ t: 'a', v });
/** Object node; keys are stored as JSON string literals, as the JSON parser does. */
const obj = (e: Obj): JNode => ({ t: 'o', e: e.map(([k, v]) => [JSON.stringify(k), v]) });

function serviceName(name: string | undefined, image: string): string {
	const base =
		name ??
		image
			.replace(/@.*$/, '')
			.replace(/:[^/]*$/, '')
			.split('/')
			.pop() ??
		'app';
	const s = base
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, '-')
		.replace(/^[^a-z0-9]+/, '');
	return s || 'app';
}

/** Parses a docker --mount value: comma-separated key=value pairs, quoted fields allowed. */
export function parseMountSpec(v: string): Record<string, string> {
	const out: Record<string, string> = {};
	const fields: string[] = [];
	let cur = '';
	let q = false;
	for (const c of v) {
		if (c === '"') q = !q;
		else if (c === ',' && !q) {
			fields.push(cur);
			cur = '';
		} else cur += c;
	}
	fields.push(cur);
	for (const f of fields) {
		if (!f) continue;
		const eq = f.indexOf('=');
		const k = (eq < 0 ? f : f.slice(0, eq)).trim().toLowerCase();
		out[k] = eq < 0 ? 'true' : f.slice(eq + 1);
	}
	return out;
}

const truthy = (v: string | undefined) => v === undefined || /^(?:true|1|yes)$/i.test(v);

function mountToLong(v: string, notes: Note[]): { node: JNode; named?: string } {
	const m = parseMountSpec(v);
	const e: Obj = [];
	const type = m.type ?? 'volume';
	e.push(['type', str(type)]);
	const src = m.source ?? m.src;
	if (src !== undefined) e.push(['source', str(src)]);
	const dst = m.target ?? m.destination ?? m.dst;
	if (dst === undefined) throw new Error(`--mount ${v}: target= is required`);
	e.push(['target', str(dst)]);
	if ('readonly' in m || 'ro' in m) {
		if (truthy(m.readonly ?? m.ro)) e.push(['read_only', bool(true)]);
	}
	if (m.consistency) e.push(['consistency', str(m.consistency)]);
	if (m['bind-propagation']) e.push(['bind', obj([['propagation', str(m['bind-propagation'])]])]);
	if ('volume-nocopy' in m && truthy(m['volume-nocopy']))
		e.push(['volume', obj([['nocopy', bool(true)]])]);
	const tmp: Obj = [];
	if (m['tmpfs-size']) {
		const n = Number(m['tmpfs-size']);
		tmp.push(['size', Number.isFinite(n) ? num(n) : str(m['tmpfs-size'])]);
	}
	if (m['tmpfs-mode']) {
		const n = parseInt(m['tmpfs-mode'], 8);
		if (Number.isFinite(n)) tmp.push(['mode', num(n)]);
	}
	if (tmp.length) e.push(['tmpfs', obj(tmp)]);
	const known = new Set([
		'type',
		'source',
		'src',
		'target',
		'destination',
		'dst',
		'readonly',
		'ro',
		'consistency',
		'bind-propagation',
		'volume-nocopy',
		'tmpfs-size',
		'tmpfs-mode'
	]);
	for (const k of Object.keys(m))
		if (!known.has(k))
			notes.push({
				level: 'unsupported',
				text: `--mount ${k}=${m[k]} has no counterpart in this converter, it was dropped`
			});
	return { node: obj(e), named: type === 'volume' && src ? src : undefined };
}

/** Named volume in a -v short spec (the source is a name, not a path). */
function namedVolume(spec: string): string | undefined {
	const parts = spec.split(':');
	if (parts.length < 2) return undefined;
	const src = parts[0];
	if (!src || /^[./~$]/.test(src) || /^[A-Za-z]$/.test(src)) return undefined;
	return src;
}

function durationSeconds(v: string): string {
	return /^\d+$/.test(v) ? `${v}s` : v;
}

/** Converts a docker run command to a Compose file with one service. */
export function runToCompose(input: string): ToCompose {
	const run = parseRun(input);
	const notes: Note[] = [];
	const svc: Obj = [];
	const lists = new Map<string, JNode[]>();
	const add = (k: string, v: JNode) => {
		if (!lists.has(k)) lists.set(k, []);
		lists.get(k)!.push(v);
	};
	const set = (k: string, v: JNode) => {
		const i = svc.findIndex(([x]) => x === k);
		if (i >= 0) svc[i] = [k, v];
		else svc.push([k, v]);
	};
	const health: Obj = [];
	const logging: Obj = [];
	const logOpts: Obj = [];
	const ulimits: Obj = [];
	const sysctls: Obj = [];
	const namedVols = new Set<string>();
	let name: string | undefined;
	let network: string | undefined;
	const aliases: JNode[] = [];
	let ipv4: string | undefined;

	set('image', str(run.image));
	for (const f of run.flags) {
		const v = f.value ?? '';
		const on = f.value === undefined || f.value === 'true';
		switch (f.name) {
			case 'name':
				name = v;
				set('container_name', str(v));
				break;
			case 'publish':
				add('ports', str(v));
				break;
			case 'volume': {
				add('volumes', str(v));
				const n = namedVolume(v);
				if (n) namedVols.add(n);
				break;
			}
			case 'mount': {
				const m = mountToLong(v, notes);
				add('volumes', m.node);
				if (m.named) namedVols.add(m.named);
				break;
			}
			case 'tmpfs':
				add('tmpfs', str(v));
				break;
			case 'env':
				add('environment', str(v));
				break;
			case 'env-file':
				add('env_file', str(v));
				break;
			case 'restart':
				set('restart', str(v));
				break;
			case 'network':
			case 'net':
				network = v;
				break;
			case 'network-alias':
			case 'net-alias':
				aliases.push(str(v));
				break;
			case 'ip':
				ipv4 = v;
				break;
			case 'detach':
				if (on)
					notes.push({
						level: 'info',
						text: '-d has no service key: run docker compose up -d to start in the background'
					});
				break;
			case 'rm':
				if (on)
					notes.push({
						level: 'info',
						text: '--rm has no service key: docker compose down removes the containers, docker compose run --rm does it for one-off runs'
					});
				break;
			case 'interactive':
				if (on) set('stdin_open', bool(true));
				break;
			case 'tty':
				if (on) set('tty', bool(true));
				break;
			case 'workdir':
				set('working_dir', str(v));
				break;
			case 'user':
				set('user', str(v));
				break;
			case 'cap-add':
				add('cap_add', str(v));
				break;
			case 'cap-drop':
				add('cap_drop', str(v));
				break;
			case 'device':
				add('devices', str(v));
				break;
			case 'health-cmd':
				health.unshift(['test', arr([str('CMD-SHELL'), str(v)])]);
				break;
			case 'health-interval':
				health.push(['interval', str(durationSeconds(v))]);
				break;
			case 'health-timeout':
				health.push(['timeout', str(durationSeconds(v))]);
				break;
			case 'health-retries':
				health.push(['retries', /^\d+$/.test(v) ? num(Number(v)) : str(v)]);
				break;
			case 'health-start-period':
				health.push(['start_period', str(durationSeconds(v))]);
				break;
			case 'health-start-interval':
				health.push(['start_interval', str(durationSeconds(v))]);
				break;
			case 'no-healthcheck':
				if (on) health.push(['disable', bool(true)]);
				break;
			case 'label':
				add('labels', str(v));
				break;
			case 'entrypoint':
				// docker run --entrypoint is one executable, never split; the list form keeps it so.
				set('entrypoint', v === '' ? arr([str('')]) : arr([str(v)]));
				break;
			case 'hostname':
				set('hostname', str(v));
				break;
			case 'privileged':
				if (on) set('privileged', bool(true));
				break;
			case 'init':
				if (on) set('init', bool(true));
				break;
			case 'read-only':
				if (on) set('read_only', bool(true));
				break;
			case 'add-host':
				add('extra_hosts', str(v));
				break;
			case 'dns':
				add('dns', str(v));
				break;
			case 'dns-search':
				add('dns_search', str(v));
				break;
			case 'expose':
				add('expose', str(v));
				break;
			case 'ulimit': {
				const m = /^([a-z]+)=(-?\d+)(?::(-?\d+))?$/.exec(v);
				if (!m) {
					notes.push({ level: 'unsupported', text: `--ulimit ${v}: expected name=soft[:hard]` });
					break;
				}
				ulimits.push([
					m[1],
					m[3] === undefined
						? num(Number(m[2]))
						: obj([
								['soft', num(Number(m[2]))],
								['hard', num(Number(m[3]))]
							])
				]);
				break;
			}
			case 'sysctl': {
				const eq = v.indexOf('=');
				if (eq < 0) notes.push({ level: 'unsupported', text: `--sysctl ${v}: expected key=value` });
				else sysctls.push([v.slice(0, eq), str(v.slice(eq + 1))]);
				break;
			}
			case 'security-opt':
				add('security_opt', str(v));
				break;
			case 'shm-size':
				set('shm_size', str(v));
				break;
			case 'stop-signal':
				set('stop_signal', str(v));
				break;
			case 'stop-timeout':
				set('stop_grace_period', str(durationSeconds(v)));
				break;
			case 'log-driver':
				logging.push(['driver', str(v)]);
				break;
			case 'log-opt': {
				const eq = v.indexOf('=');
				if (eq < 0)
					notes.push({ level: 'unsupported', text: `--log-opt ${v}: expected key=value` });
				else logOpts.push([v.slice(0, eq), str(v.slice(eq + 1))]);
				break;
			}
			case 'memory':
				set('mem_limit', str(v));
				break;
			case 'memory-reservation':
				set('mem_reservation', str(v));
				break;
			case 'memory-swap':
				set('memswap_limit', str(v));
				break;
			case 'cpus':
				set('cpus', /^\d+(?:\.\d+)?$/.test(v) ? num(Number(v)) : str(v));
				break;
			case 'cpu-shares':
				set('cpu_shares', /^\d+$/.test(v) ? num(Number(v)) : str(v));
				break;
			case 'cpuset-cpus':
				set('cpuset', str(v));
				break;
			case 'pids-limit':
				set('pids_limit', /^-?\d+$/.test(v) ? num(Number(v)) : str(v));
				break;
			case 'oom-score-adj':
				set('oom_score_adj', /^-?\d+$/.test(v) ? num(Number(v)) : str(v));
				break;
			case 'pid':
				set('pid', str(v));
				break;
			case 'ipc':
				set('ipc', str(v));
				break;
			case 'platform':
				set('platform', str(v));
				break;
			case 'pull':
				set('pull_policy', str(v));
				break;
			case 'group-add':
				add('group_add', str(v));
				break;
			case 'mac-address':
				set('mac_address', str(v));
				break;
			case 'runtime':
				set('runtime', str(v));
				break;
			case 'userns':
				set('userns_mode', str(v));
				break;
			case 'link':
				add('links', str(v));
				notes.push({
					level: 'info',
					text: '--link is legacy. On a Compose network services reach each other by service name'
				});
				break;
			case 'volumes-from':
				add('volumes_from', str(v));
				break;
			case 'dns-option':
			case 'dns-opt':
			default:
				notes.push({
					level: 'unsupported',
					text: `${f.raw} is not converted: ${NO_COMPOSE[f.name] ?? 'no Compose equivalent in this converter'}`
				});
		}
	}
	for (const [k, v] of lists) set(k, arr(v));
	if (network) {
		if (/^(?:host|none|bridge|default)$/.test(network) || /^(?:container|service):/.test(network)) {
			set('network_mode', str(network));
			if (aliases.length || ipv4)
				notes.push({
					level: 'unsupported',
					text: `--network-alias and --ip need a user-defined network, not network_mode ${network}`
				});
		} else if (aliases.length || ipv4) {
			const opts: Obj = [];
			if (aliases.length) opts.push(['aliases', arr(aliases)]);
			if (ipv4) opts.push(['ipv4_address', str(ipv4)]);
			set('networks', obj([[network, obj(opts)]]));
		} else set('networks', arr([str(network)]));
	} else if (aliases.length || ipv4)
		notes.push({
			level: 'unsupported',
			text: '--network-alias and --ip are only meaningful with --network'
		});
	if (health.length) set('healthcheck', obj(health));
	if (logOpts.length) logging.push(['options', obj(logOpts)]);
	if (logging.length) set('logging', obj(logging));
	if (ulimits.length) set('ulimits', obj(ulimits));
	if (sysctls.length) set('sysctls', obj(sysctls));
	if (run.args.length) set('command', arr(run.args.map(str)));

	const service = serviceName(name, run.image);
	const root: Obj = [['services', obj([[service, obj(svc)]])]];
	const userNet =
		network && !/^(?:host|none|bridge|default)$/.test(network) && !network.includes(':');
	if (userNet) root.push(['networks', obj([[network!, obj([['external', bool(true)]])]])]);
	if (namedVols.size)
		root.push([
			'volumes',
			obj([...namedVols].map((n) => [n, obj([['external', bool(true)]])] as [string, JNode]))
		]);
	if (userNet || namedVols.size)
		notes.push({
			level: 'info',
			text: 'Networks and named volumes are marked external: true so Compose uses the existing ones instead of creating project-prefixed copies. Remove it to let Compose manage them'
		});
	if (/\$/.test(input))
		notes.push({
			level: 'info',
			text: 'Compose interpolates $VAR and ${VAR} from the environment and .env. Write $$ for a literal $'
		});
	if (run.tool !== 'docker')
		notes.push({ level: 'info', text: `Read as docker run, ${run.tool} options may differ` });
	return { yaml: emitYaml(obj(root)), service, notes };
}

/* ---------- compose → run ---------- */

export interface ToRun {
	command: string;
	service: string;
	services: string[];
	notes: Note[];
}

type J = null | boolean | number | string | J[] | { [k: string]: J };

const isObj = (v: J | undefined): v is { [k: string]: J } =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

function scalar(v: J, key: string): string {
	if (v === null) return '';
	if (typeof v === 'object') throw new Error(`${key}: expected a single value`);
	return String(v);
}

/** List or mapping form (environment, labels, sysctls...) as KEY=value strings. */
function pairs(v: J, key: string): string[] {
	if (Array.isArray(v)) return v.map((x) => scalar(x, key));
	if (isObj(v))
		return Object.entries(v).map(([k, x]) => (x === null ? k : `${k}=${scalar(x, key)}`));
	return [scalar(v, key)];
}

function list(v: J, key: string): string[] {
	if (Array.isArray(v)) return v.map((x) => scalar(x, key));
	return [scalar(v, key)];
}

function durationArg(v: J, key: string): string {
	return scalar(v, key);
}

const IGNORED: Record<string, string> = {
	build: 'docker run needs a built image: build it with docker build first',
	depends_on: 'start order only matters to Compose, start the other containers first',
	deploy: 'Swarm and resource settings under deploy: are not converted',
	profiles: 'profiles only matter to Compose',
	develop: 'watch settings only matter to Compose',
	secrets: 'Compose secrets have no docker run flag, mount the file with -v instead',
	configs: 'Compose configs have no docker run flag, mount the file with -v instead',
	scale: 'docker run starts one container',
	extends: 'resolve extends first (docker compose config)',
	post_start: 'lifecycle hooks only run under Compose',
	pre_stop: 'lifecycle hooks only run under Compose'
};

/** Converts one service of a Compose file (or a bare service mapping) to a docker run command. */
export function composeToRun(text: string, pick?: string): ToRun {
	const { json } = yamlToJson(text, { multi: 'first' });
	const doc = JSON.parse(json) as J;
	if (!isObj(doc))
		throw new Error('Expected a Compose file with services:, or one service mapping');
	let services: string[];
	let name: string;
	let svc: { [k: string]: J };
	if (isObj(doc.services)) {
		services = Object.keys(doc.services);
		if (!services.length) throw new Error('services: is empty');
		name = pick && services.includes(pick) ? pick : services[0];
		const s = doc.services[name];
		if (!isObj(s)) throw new Error(`services.${name} is not a mapping`);
		svc = s;
	} else if ('image' in doc || 'build' in doc) {
		services = [];
		name = '';
		svc = doc;
	} else if (Object.keys(doc).length === 1 && isObj(Object.values(doc)[0])) {
		name = Object.keys(doc)[0];
		services = [name];
		svc = Object.values(doc)[0] as { [k: string]: J };
	} else throw new Error('No services: found, and this does not look like a single service');

	const notes: Note[] = [];
	const args: string[] = [];
	const opt = (flag: string, value?: string) => {
		args.push(value === undefined ? flag : `${flag} ${shellQuote(value)}`);
	};
	let entry: string[] | undefined;
	let cmd: string[] | undefined;
	let image = '';

	for (const [k, v] of Object.entries(svc)) {
		switch (k) {
			case 'image':
				image = scalar(v, k);
				break;
			case 'container_name':
				opt('--name', scalar(v, k));
				break;
			case 'ports':
				for (const p of Array.isArray(v) ? v : [v]) {
					if (isObj(p)) {
						const host = p.published !== undefined ? scalar(p.published, k) : '';
						const ip = p.host_ip !== undefined ? scalar(p.host_ip, k) + ':' : '';
						const proto = p.protocol && p.protocol !== 'tcp' ? '/' + scalar(p.protocol, k) : '';
						const target = scalar(p.target ?? null, k);
						opt('-p', `${ip}${host ? host + ':' : ip ? ':' : ''}${target}${proto}`);
					} else opt('-p', scalar(p, k));
				}
				break;
			case 'volumes':
				for (const m of Array.isArray(v) ? v : [v]) {
					if (isObj(m)) {
						const parts = [`type=${scalar(m.type ?? 'volume', k)}`];
						if (m.source !== undefined) parts.push(`source=${scalar(m.source, k)}`);
						parts.push(`target=${scalar(m.target ?? null, k)}`);
						if (m.read_only === true) parts.push('readonly');
						if (m.consistency) parts.push(`consistency=${scalar(m.consistency, k)}`);
						if (isObj(m.bind) && m.bind.propagation)
							parts.push(`bind-propagation=${scalar(m.bind.propagation, k)}`);
						if (isObj(m.volume) && m.volume.nocopy === true) parts.push('volume-nocopy');
						if (isObj(m.tmpfs) && m.tmpfs.size !== undefined)
							parts.push(`tmpfs-size=${scalar(m.tmpfs.size, k)}`);
						if (isObj(m.tmpfs) && typeof m.tmpfs.mode === 'number')
							parts.push(`tmpfs-mode=${m.tmpfs.mode.toString(8)}`);
						opt('--mount', parts.join(','));
					} else opt('-v', scalar(m, k));
				}
				break;
			case 'environment':
				for (const e of pairs(v, k)) opt('-e', e);
				break;
			case 'env_file':
				for (const e of Array.isArray(v) ? v : [v])
					opt('--env-file', isObj(e) ? scalar(e.path ?? null, k) : scalar(e, k));
				break;
			case 'restart':
				opt('--restart', scalar(v, k));
				break;
			case 'network_mode':
				opt('--network', scalar(v, k));
				break;
			case 'networks': {
				const nets = Array.isArray(v)
					? v.map((x) => [scalar(x, k), null] as const)
					: isObj(v)
						? Object.entries(v)
						: [];
				nets.forEach(([n, o], i) => {
					if (i === 0) opt('--network', n);
					else
						notes.push({
							level: 'unsupported',
							text: `Network ${n}: docker run joins one network, connect the others with docker network connect`
						});
					if (i === 0 && isObj(o as J)) {
						const oo = o as { [k: string]: J };
						if (Array.isArray(oo.aliases))
							for (const a of oo.aliases) opt('--network-alias', scalar(a, k));
						if (oo.ipv4_address) opt('--ip', scalar(oo.ipv4_address, k));
						if (oo.ipv6_address) opt('--ip6', scalar(oo.ipv6_address, k));
					}
				});
				break;
			}
			case 'stdin_open':
				if (v === true) opt('-i');
				break;
			case 'tty':
				if (v === true) opt('-t');
				break;
			case 'working_dir':
				opt('-w', scalar(v, k));
				break;
			case 'user':
				opt('-u', scalar(v, k));
				break;
			case 'cap_add':
				for (const c of list(v, k)) opt('--cap-add', c);
				break;
			case 'cap_drop':
				for (const c of list(v, k)) opt('--cap-drop', c);
				break;
			case 'devices':
				for (const d of Array.isArray(v) ? v : [v]) {
					if (isObj(d))
						opt(
							'--device',
							[d.source, d.target, d.permissions]
								.filter((x) => x !== undefined)
								.map((x) => scalar(x!, k))
								.join(':')
						);
					else opt('--device', scalar(d, k));
				}
				break;
			case 'healthcheck': {
				if (!isObj(v)) break;
				if (v.disable === true) {
					opt('--no-healthcheck');
					break;
				}
				const t = v.test;
				if (Array.isArray(t)) {
					const [kind, ...rest] = t.map((x) => scalar(x, k));
					if (kind === 'NONE') opt('--no-healthcheck');
					else if (kind === 'CMD-SHELL') opt('--health-cmd', rest.join(' '));
					else if (kind === 'CMD') {
						opt('--health-cmd', rest.map(shellQuote).join(' '));
						notes.push({
							level: 'info',
							text: 'healthcheck test CMD becomes --health-cmd, which docker runs through /bin/sh -c'
						});
					}
				} else if (t !== undefined) opt('--health-cmd', scalar(t, k));
				if (v.interval !== undefined) opt('--health-interval', durationArg(v.interval, k));
				if (v.timeout !== undefined) opt('--health-timeout', durationArg(v.timeout, k));
				if (v.retries !== undefined) opt('--health-retries', scalar(v.retries, k));
				if (v.start_period !== undefined)
					opt('--health-start-period', durationArg(v.start_period, k));
				if (v.start_interval !== undefined)
					opt('--health-start-interval', durationArg(v.start_interval, k));
				break;
			}
			case 'labels':
				for (const l of pairs(v, k)) opt('-l', l);
				break;
			case 'entrypoint':
				entry = Array.isArray(v) ? v.map((x) => scalar(x, k)) : shellSplit(scalar(v, k));
				break;
			case 'command':
				cmd = Array.isArray(v) ? v.map((x) => scalar(x, k)) : shellSplit(scalar(v, k));
				break;
			case 'hostname':
				opt('-h', scalar(v, k));
				break;
			case 'privileged':
				if (v === true) opt('--privileged');
				break;
			case 'init':
				if (v === true) opt('--init');
				break;
			case 'read_only':
				if (v === true) opt('--read-only');
				break;
			case 'extra_hosts':
				for (const h of pairs(v, k)) opt('--add-host', isObj(v) ? h.replace('=', ':') : h);
				break;
			case 'dns':
				for (const d of list(v, k)) opt('--dns', d);
				break;
			case 'dns_search':
				for (const d of list(v, k)) opt('--dns-search', d);
				break;
			case 'expose':
				for (const d of list(v, k)) opt('--expose', d);
				break;
			case 'tmpfs':
				for (const d of list(v, k)) opt('--tmpfs', d);
				break;
			case 'ulimits':
				if (isObj(v))
					for (const [n, u] of Object.entries(v))
						opt(
							'--ulimit',
							isObj(u)
								? `${n}=${scalar(u.soft ?? null, k)}:${scalar(u.hard ?? null, k)}`
								: `${n}=${scalar(u, k)}`
						);
				break;
			case 'sysctls':
				for (const s of pairs(v, k)) opt('--sysctl', s);
				break;
			case 'security_opt':
				for (const s of list(v, k)) opt('--security-opt', s);
				break;
			case 'shm_size':
				opt('--shm-size', scalar(v, k));
				break;
			case 'stop_signal':
				opt('--stop-signal', scalar(v, k));
				break;
			case 'stop_grace_period': {
				const s = scalar(v, k);
				const m = /^(\d+)s?$/.exec(s);
				if (m) opt('--stop-timeout', m[1]);
				else
					notes.push({
						level: 'unsupported',
						text: `stop_grace_period ${s}: --stop-timeout takes whole seconds, convert it by hand`
					});
				break;
			}
			case 'logging':
				if (isObj(v)) {
					if (v.driver) opt('--log-driver', scalar(v.driver, k));
					if (isObj(v.options)) for (const o of pairs(v.options, k)) opt('--log-opt', o);
				}
				break;
			case 'mem_limit':
				opt('-m', scalar(v, k));
				break;
			case 'mem_reservation':
				opt('--memory-reservation', scalar(v, k));
				break;
			case 'memswap_limit':
				opt('--memory-swap', scalar(v, k));
				break;
			case 'cpus':
				opt('--cpus', scalar(v, k));
				break;
			case 'cpu_shares':
				opt('--cpu-shares', scalar(v, k));
				break;
			case 'cpuset':
				opt('--cpuset-cpus', scalar(v, k));
				break;
			case 'pids_limit':
				opt('--pids-limit', scalar(v, k));
				break;
			case 'oom_score_adj':
				opt('--oom-score-adj', scalar(v, k));
				break;
			case 'pid':
				opt('--pid', scalar(v, k));
				break;
			case 'ipc':
				opt('--ipc', scalar(v, k));
				break;
			case 'platform':
				opt('--platform', scalar(v, k));
				break;
			case 'pull_policy': {
				const p = scalar(v, k);
				if (['always', 'missing', 'never'].includes(p)) opt('--pull', p);
				else
					notes.push({
						level: 'unsupported',
						text: `pull_policy ${p}: docker run --pull takes always, missing or never`
					});
				break;
			}
			case 'group_add':
				for (const g of list(v, k)) opt('--group-add', g);
				break;
			case 'mac_address':
				opt('--mac-address', scalar(v, k));
				break;
			case 'runtime':
				opt('--runtime', scalar(v, k));
				break;
			case 'userns_mode':
				opt('--userns', scalar(v, k));
				break;
			case 'links':
				for (const l of list(v, k)) opt('--link', l);
				break;
			case 'volumes_from':
				for (const l of list(v, k)) opt('--volumes-from', l);
				break;
			default:
				notes.push({
					level: 'unsupported',
					text: `${k}: ${IGNORED[k] ?? 'not converted, no docker run flag in this converter'}`
				});
		}
	}
	if (!image)
		throw new Error(
			`${name ? `Service ${name}` : 'The service'} has no image:, docker run needs one`
		);
	if (entry) {
		opt('--entrypoint', entry[0] ?? '');
		if (entry.length > 1) {
			notes.push({
				level: 'info',
				text: '--entrypoint takes one executable, so the other entrypoint words go before the command'
			});
			cmd = [...entry.slice(1), ...(cmd ?? [])];
		}
	}
	if (/\$\{?[A-Za-z_]/.test(text))
		notes.push({
			level: 'info',
			text: 'The file uses ${VAR} interpolation. Values are single-quoted here, so the shell will not expand them: substitute them first (docker compose config shows the result)'
		});
	const head = 'docker run -d';
	const tail = [shellQuote(image), ...(cmd ?? []).map(shellQuote)].join(' ');
	const command = [head, ...args, tail].join(' \\\n  ');
	return { command, service: name, services, notes };
}

/** Front page intake: a docker run command, or a Compose file. */
export function looksLikeCompose(s: string): number {
	const t = s.trim();
	if (/^(?:sudo\s+)?(?:docker|podman)\s+(?:container\s+)?run\s/.test(t)) return 0.9;
	if (t.length < 20_000 && /^services:\s*$/m.test(t) && /^\s+image:\s*\S/m.test(t)) return 0.75;
	return 0;
}
