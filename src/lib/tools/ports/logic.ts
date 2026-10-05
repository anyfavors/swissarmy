import type { Port, Proto } from './data';

export type ProtoFilter = 'all' | 'tcp' | 'udp';

export interface Query {
	q: string;
	proto: ProtoFilter;
	risky: boolean;
}

function hasProto(p: Proto, f: ProtoFilter): boolean {
	return f === 'all' || p === 'tcp/udp' || p === f;
}

/** RFC 6335 range name for a port number. */
export function rangeOf(n: number): string {
	if (n < 1024) return 'System port (0-1023)';
	if (n < 49152) return 'User port (1024-49151)';
	return 'Dynamic port (49152-65535)';
}

/**
 * Filters the list. A number matches its port or a range containing it; "443/tcp" also
 * filters by protocol; text matches name, IANA service name or description.
 */
export function find(list: Port[], query: Query): Port[] {
	let q = query.q.trim().toLowerCase();
	let proto = query.proto;
	const slash = /^(\d{1,5})\s*\/\s*(tcp|udp)$/.exec(q);
	if (slash) {
		q = slash[1];
		proto = slash[2] as ProtoFilter;
	}
	const num = /^\d{1,5}$/.test(q) ? Number(q) : null;
	return list.filter((p) => {
		if (!hasProto(p.proto, proto)) return false;
		if (query.risky && !p.risk) return false;
		if (!q) return true;
		if (num !== null) return p.port === num || (p.to !== undefined && num >= p.port && num <= p.to);
		return (
			p.name.toLowerCase().includes(q) ||
			(p.iana ?? '').toLowerCase().includes(q) ||
			p.desc.toLowerCase().includes(q)
		);
	});
}

export function portLabel(p: Port): string {
	return p.to ? `${p.port}-${p.to}` : String(p.port);
}

export function validPort(q: string): number | null {
	const t = q.trim();
	if (!/^\d{1,5}$/.test(t)) return null;
	const n = Number(t);
	return n <= 65535 ? n : null;
}
