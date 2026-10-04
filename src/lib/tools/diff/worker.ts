import { diffText, type DiffOptions } from './logic';

export interface DiffRequest {
	id: number;
	a: string;
	b: string;
	o: DiffOptions;
}

self.onmessage = (e: MessageEvent<DiffRequest>) => {
	const { id, a, b, o } = e.data;
	postMessage({ id, result: diffText(a, b, o) });
};
