import type { ChainOp } from '../types';
import { defang, find, refang } from './logic';

const opts = { dedupe: true, sort: false };

function nonEmpty(values: string[], what: string): string {
	if (!values.length) throw new Error(`No ${what} found`);
	return values.join('\n');
}

export const ops: ChainOp[] = [
	{
		id: 'extract.ips',
		label: 'Extract IP addresses',
		run: (s) => {
			const t = refang(s);
			return nonEmpty([...find(t, 'ipv4', opts), ...find(t, 'ipv6', opts)], 'IP addresses');
		}
	},
	{
		id: 'extract.urls',
		label: 'Extract URLs',
		run: (s) => nonEmpty(find(refang(s), 'url', opts), 'URLs')
	},
	{
		id: 'extract.emails',
		label: 'Extract email addresses',
		run: (s) => nonEmpty(find(refang(s), 'email', opts), 'email addresses')
	},
	{ id: 'extract.defang', label: 'Defang URLs, domains and IPs', run: defang },
	{ id: 'extract.refang', label: 'Refang (hxxp, [.] back to normal)', run: refang }
];
