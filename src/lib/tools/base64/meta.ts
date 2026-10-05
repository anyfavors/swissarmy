import type { ToolMeta } from '../types';

export const meta: ToolMeta = {
	id: 'base64',
	chapter: 1,
	section: 1,
	title: 'Base64',
	summary: 'Encode and decode Base64, standard or URL-safe, UTF-8 aware.',
	keywords: ['b64', 'encode', 'decode', 'rfc4648', 'url-safe', 'atob', 'btoa'],
	network: false,
	chain: { in: 'text', out: 'text' }
};
