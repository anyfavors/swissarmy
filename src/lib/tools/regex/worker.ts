import { runRegex } from './logic';

export interface RegexRequest {
	id: number;
	pattern: string;
	flags: string;
	text: string;
	replacement?: string;
}

self.onmessage = (e: MessageEvent<RegexRequest>) => {
	const { id, pattern, flags, text, replacement } = e.data;
	postMessage({ id, result: runRegex(pattern, flags, text, replacement) });
};
