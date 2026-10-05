/**
 * MTU and MSS through a stack of encapsulations. The base is the IP MTU of the underlay link
 * (1500 on standard Ethernet). Each layer, outermost first, takes the space it is given and
 * returns the largest packet it can carry inside. Most layers subtract a fixed header; ESP
 * rounds to its cipher block, so it is computed exactly for the largest fitting payload.
 */

export type OuterIp = 4 | 6;

export type EspCipher = 'aes-gcm' | 'chacha20-poly1305' | 'aes-cbc-sha1' | 'aes-cbc-sha256';
export type OvpnCipher = 'aead' | 'cbc-sha1';

export type Layer =
	| { kind: 'ethernet' }
	| { kind: 'vlan' }
	| { kind: 'qinq' }
	| { kind: 'pppoe' }
	| { kind: 'mpls'; labels: number }
	| { kind: 'gre'; outer: OuterIp; key: boolean; seq: boolean; tap: boolean }
	| { kind: 'esp'; outer: OuterIp; cipher: EspCipher; natt: boolean }
	| { kind: 'vxlan'; outer: OuterIp }
	| { kind: 'geneve'; outer: OuterIp; options: number }
	| { kind: 'wireguard'; outer: OuterIp }
	| { kind: 'openvpn'; outer: OuterIp; cipher: OvpnCipher; tap: boolean };

export type LayerKind = Layer['kind'];

export const ipHeader = (v: OuterIp) => (v === 4 ? 20 : 40);

/** IV, ICV and padding alignment per ESP transform. */
export const espCiphers: Record<
	EspCipher,
	{ label: string; iv: number; icv: number; block: number; source: string }
> = {
	'aes-gcm': {
		label: 'AES-GCM, 16-byte ICV',
		iv: 8,
		icv: 16,
		block: 4,
		source: 'RFC 4106'
	},
	'chacha20-poly1305': {
		label: 'ChaCha20-Poly1305',
		iv: 8,
		icv: 16,
		block: 4,
		source: 'RFC 7634'
	},
	'aes-cbc-sha1': {
		label: 'AES-CBC with HMAC-SHA1-96',
		iv: 16,
		icv: 12,
		block: 16,
		source: 'RFC 3602, RFC 2404'
	},
	'aes-cbc-sha256': {
		label: 'AES-CBC with HMAC-SHA-256-128',
		iv: 16,
		icv: 16,
		block: 16,
		source: 'RFC 3602, RFC 4868'
	}
};

export interface Applied {
	layer: Layer;
	title: string;
	/** Bytes this layer takes from the space it was given. */
	overhead: number;
	/** Space the layer was given, and what is left inside. */
	outer: number;
	inner: number;
	parts: string[];
	source: string;
	estimate: boolean;
	note?: string;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/**
 * Largest ESP payload P such that IP + ESP header + IV + pad(P + 2) + ICV + NAT-T <= space,
 * where pad rounds up to the cipher block (RFC 4303 section 2.4: at least 4-byte alignment).
 */
export function espInner(space: number, outer: OuterIp, cipher: EspCipher, natt: boolean): number {
	const c = espCiphers[cipher];
	const fixed = ipHeader(outer) + (natt ? 8 : 0) + 8 + c.iv + c.icv;
	const room = space - fixed;
	if (room < c.block) return 0;
	return Math.floor(room / c.block) * c.block - 2;
}

function apply(
	layer: Layer,
	space: number
): Omit<Applied, 'outer' | 'inner' | 'overhead'> & {
	inner: number;
} {
	const fixed = (
		title: string,
		parts: [string, number][],
		source: string,
		estimate = false,
		note?: string
	) => ({
		layer,
		title,
		inner: space - sum(parts.map((p) => p[1])),
		parts: parts.map(([k, v]) => `${k} ${v}`),
		source,
		estimate,
		note
	});
	switch (layer.kind) {
		case 'ethernet':
			return fixed(
				'Inner Ethernet header',
				[['MAC header', 14]],
				'IEEE 802.3',
				false,
				'Counts when a tunnel carries Ethernet frames (GRE TAP, EoMPLS). The outer Ethernet header on the wire does not reduce the IP MTU. FCS is not carried inside tunnels.'
			);
		case 'vlan':
			return fixed(
				'802.1Q VLAN tag',
				[['Tag', 4]],
				'IEEE 802.1Q',
				false,
				'Counts inside a tunnel, or on a link whose maximum frame stays at 1518 bytes. Most switches accept 1522-byte tagged frames, so a tag on the wire usually costs nothing.'
			);
		case 'qinq':
			return fixed(
				'QinQ (802.1ad), two tags',
				[
					['S-tag', 4],
					['C-tag', 4]
				],
				'IEEE 802.1ad',
				false,
				'Counts unless every switch on the path accepts frames of at least 1526 bytes.'
			);
		case 'pppoe':
			return fixed(
				'PPPoE',
				[
					['PPPoE header', 6],
					['PPP protocol', 2]
				],
				'RFC 2516',
				false,
				'Gives the familiar 1492. RFC 4638 lets PPPoE carry 1500 when the access network supports baby jumbo frames.'
			);
		case 'mpls': {
			const n = Math.max(1, Math.min(10, Math.floor(layer.labels)));
			return fixed(
				`MPLS, ${n} label${n === 1 ? '' : 's'}`,
				[[`${n} × label`, 4 * n]],
				'RFC 3032',
				false,
				'Counts when the core links have no headroom above the customer MTU.'
			);
		}
		case 'gre': {
			const parts: [string, number][] = [
				[`IPv${layer.outer}`, ipHeader(layer.outer)],
				['GRE', 4]
			];
			if (layer.key) parts.push(['Key', 4]);
			if (layer.seq) parts.push(['Sequence', 4]);
			if (layer.tap) parts.push(['Inner Ethernet', 14]);
			return fixed(
				`GRE${layer.tap ? ' TAP' : ''} over IPv${layer.outer}`,
				parts,
				layer.tap ? 'RFC 2784, RFC 2890, RFC 1701 (TEB)' : 'RFC 2784, RFC 2890'
			);
		}
		case 'esp': {
			const c = espCiphers[layer.cipher];
			const inner = espInner(space, layer.outer, layer.cipher, layer.natt);
			const enc = Math.ceil((inner + 2) / c.block) * c.block;
			const pad = enc - inner - 2;
			const parts = [
				`IPv${layer.outer} ${ipHeader(layer.outer)}`,
				...(layer.natt ? ['UDP (NAT-T) 8'] : []),
				'ESP header 8',
				`IV ${c.iv}`,
				`padding ${pad}`,
				'pad length and next header 2',
				`ICV ${c.icv}`
			];
			return {
				layer,
				title: `IPsec ESP tunnel, ${c.label}${layer.natt ? ', NAT-T' : ''}`,
				inner,
				parts,
				source: `RFC 4303, ${c.source}${layer.natt ? ', RFC 3948' : ''}`,
				estimate: true,
				note: `Padding rounds the encrypted part up to ${c.block} bytes, so the overhead depends on the packet size. Some implementations add more padding or traffic flow confidentiality padding: treat this as an estimate.`
			};
		}
		case 'vxlan':
			return fixed(
				`VXLAN over IPv${layer.outer}`,
				[
					[`IPv${layer.outer}`, ipHeader(layer.outer)],
					['UDP', 8],
					['VXLAN', 8],
					['Inner Ethernet', 14]
				],
				'RFC 7348',
				false,
				'VXLAN carries Ethernet frames, so the inner MAC header counts. An inner VLAN tag adds 4 more: add a VLAN layer below.'
			);
		case 'geneve': {
			const opt = Math.max(0, Math.min(252, Math.floor(layer.options / 4) * 4));
			const parts: [string, number][] = [
				[`IPv${layer.outer}`, ipHeader(layer.outer)],
				['UDP', 8],
				['Geneve', 8]
			];
			if (opt) parts.push(['Options', opt]);
			parts.push(['Inner Ethernet', 14]);
			return fixed(
				`Geneve over IPv${layer.outer}`,
				parts,
				'RFC 8926',
				false,
				'Options are variable, in multiples of 4 bytes up to 252.'
			);
		}
		case 'wireguard':
			return fixed(
				`WireGuard over IPv${layer.outer}`,
				[
					[`IPv${layer.outer}`, ipHeader(layer.outer)],
					['UDP', 8],
					['Type and reserved', 4],
					['Receiver index', 4],
					['Counter', 8],
					['Poly1305 tag', 16]
				],
				'WireGuard whitepaper, transport data message: 60 bytes over IPv4, 80 over IPv6',
				false,
				'The default interface MTU of 1420 is 1500 minus the IPv6 overhead, so it works over either. Padding to 16 bytes never exceeds the interface MTU.'
			);
		case 'openvpn': {
			const parts: [string, number][] = [
				[`IPv${layer.outer}`, ipHeader(layer.outer)],
				['UDP', 8]
			];
			if (layer.cipher === 'aead')
				parts.push(['Opcode and peer ID', 4], ['Packet ID', 4], ['AEAD tag', 16]);
			else
				parts.push(
					['Opcode', 1],
					['HMAC-SHA1', 20],
					['IV', 16],
					['Packet ID', 4],
					['CBC padding, up to', 16]
				);
			if (layer.tap) parts.push(['Inner Ethernet', 14]);
			return fixed(
				`OpenVPN over UDP/IPv${layer.outer}, ${layer.cipher === 'aead' ? 'AES-GCM or ChaCha20' : 'AES-CBC and SHA1'}${layer.tap ? ', TAP' : ''}`,
				parts,
				'OpenVPN data channel format; depends on version and options',
				true,
				'Compression framing, tls-crypt and other options change this. Estimate only: check with ping and the do-not-fragment bit.'
			);
		}
	}
}

export interface StackResult {
	base: number;
	layers: Applied[];
	/** MTU left for the innermost IP packet. */
	inner: number;
}

export function computeStack(base: number, layers: Layer[]): StackResult {
	if (!Number.isInteger(base) || base < 68 || base > 65535)
		throw new Error('Base MTU must be a whole number from 68 to 65535');
	let space = base;
	const out: Applied[] = [];
	for (const layer of layers) {
		const a = apply(layer, space);
		const inner = Math.max(0, a.inner);
		out.push({ ...a, outer: space, inner, overhead: space - inner });
		space = inner;
	}
	return { base, layers: out, inner: space };
}

export interface Mss {
	ip: OuterIp;
	/** MSS to advertise or clamp to: MTU minus IP and the fixed 20-byte TCP header. */
	mss: number;
	/** Payload per segment once TCP options are sent on every segment. */
	payload: number;
	options: number;
	warnings: string[];
}

/** RFC 879 and RFC 6691: the MSS value excludes TCP and IP options. */
export function mssFor(mtu: number, ip: OuterIp, tcpOptions: number): Mss {
	const mss = mtu - ipHeader(ip) - 20;
	const warnings: string[] = [];
	if (ip === 6 && mtu < 1280)
		warnings.push(
			'Below 1280, the minimum IPv6 link MTU (RFC 8200). IPv6 will not work over this.'
		);
	if (ip === 4 && mtu < 576)
		warnings.push('Below 576, the datagram size every IPv4 host must accept (RFC 791).');
	if (mss <= 0) warnings.push('No room for TCP payload.');
	return {
		ip,
		mss: Math.max(0, mss),
		payload: Math.max(0, mss - tcpOptions),
		options: tcpOptions,
		warnings
	};
}

/* ------------------------------------------------------------- hash form */

const outerOf = (s: string | undefined): OuterIp => (s === '6' ? 6 : 4);

/** Compact text form for the URL, e.g. "pppoe,wg4,esp:6:gcm:n". */
export function encodeStack(layers: Layer[]): string {
	return layers
		.map((l) => {
			switch (l.kind) {
				case 'mpls':
					return `mpls:${l.labels}`;
				case 'gre':
					return `gre:${l.outer}:${l.key ? 'k' : ''}${l.seq ? 's' : ''}${l.tap ? 't' : ''}`;
				case 'esp':
					return `esp:${l.outer}:${l.cipher}:${l.natt ? 'n' : ''}`;
				case 'vxlan':
					return `vxlan:${l.outer}`;
				case 'geneve':
					return `geneve:${l.outer}:${l.options}`;
				case 'wireguard':
					return `wg:${l.outer}`;
				case 'openvpn':
					return `ovpn:${l.outer}:${l.cipher}:${l.tap ? 't' : ''}`;
				default:
					return l.kind;
			}
		})
		.join(',');
}

export function decodeStack(s: string): Layer[] {
	const out: Layer[] = [];
	for (const part of s.split(',')) {
		const [k, a, b, c] = part.split(':');
		switch (k) {
			case 'ethernet':
			case 'vlan':
			case 'qinq':
			case 'pppoe':
				out.push({ kind: k });
				break;
			case 'mpls':
				out.push({ kind: 'mpls', labels: Math.max(1, Math.min(10, Number(a) || 1)) });
				break;
			case 'gre':
				out.push({
					kind: 'gre',
					outer: outerOf(a),
					key: (b ?? '').includes('k'),
					seq: (b ?? '').includes('s'),
					tap: (b ?? '').includes('t')
				});
				break;
			case 'esp':
				out.push({
					kind: 'esp',
					outer: outerOf(a),
					cipher: b && b in espCiphers ? (b as EspCipher) : 'aes-gcm',
					natt: c === 'n'
				});
				break;
			case 'vxlan':
				out.push({ kind: 'vxlan', outer: outerOf(a) });
				break;
			case 'geneve':
				out.push({ kind: 'geneve', outer: outerOf(a), options: Number(b) || 0 });
				break;
			case 'wg':
				out.push({ kind: 'wireguard', outer: outerOf(a) });
				break;
			case 'ovpn':
				out.push({
					kind: 'openvpn',
					outer: outerOf(a),
					cipher: b === 'cbc-sha1' ? 'cbc-sha1' : 'aead',
					tap: c === 't'
				});
				break;
		}
	}
	return out;
}

export function newLayer(kind: LayerKind): Layer {
	switch (kind) {
		case 'mpls':
			return { kind, labels: 1 };
		case 'gre':
			return { kind, outer: 4, key: false, seq: false, tap: false };
		case 'esp':
			return { kind, outer: 4, cipher: 'aes-gcm', natt: false };
		case 'vxlan':
		case 'wireguard':
			return { kind, outer: 4 };
		case 'geneve':
			return { kind, outer: 4, options: 0 };
		case 'openvpn':
			return { kind, outer: 4, cipher: 'aead', tap: false };
		default:
			return { kind };
	}
}

export const layerKinds: [LayerKind, string][] = [
	['pppoe', 'PPPoE'],
	['vlan', '802.1Q VLAN'],
	['qinq', 'QinQ'],
	['mpls', 'MPLS'],
	['ethernet', 'Ethernet'],
	['gre', 'GRE'],
	['esp', 'IPsec ESP'],
	['vxlan', 'VXLAN'],
	['geneve', 'Geneve'],
	['wireguard', 'WireGuard'],
	['openvpn', 'OpenVPN']
];

export const presets: { label: string; base: number; stack: string }[] = [
	{ label: 'WireGuard over IPv4', base: 1500, stack: 'wg:4' },
	{ label: 'WireGuard over IPv6', base: 1500, stack: 'wg:6' },
	{ label: 'WireGuard over PPPoE', base: 1500, stack: 'pppoe,wg:4' },
	{ label: 'IPsec NAT-T, AES-GCM', base: 1500, stack: 'esp:4:aes-gcm:n' },
	{ label: 'VXLAN over IPv4', base: 1500, stack: 'vxlan:4' },
	{ label: 'GRE over PPPoE', base: 1500, stack: 'pppoe,gre:4:' }
];
