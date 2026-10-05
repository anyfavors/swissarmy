import { runGrok, type Compiled } from './logic';

export interface GrokRequest {
	id: number;
	compiled: Compiled;
	text: string;
}

self.onmessage = (e: MessageEvent<GrokRequest>) => {
	const { id, compiled, text } = e.data;
	postMessage({ id, result: runGrok(compiled, text) });
};
