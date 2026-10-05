import type { ToolMeta } from '../types';
import { looksLikeHeaders } from './logic';

export const meta: ToolMeta = {
	id: 'email-headers',
	chapter: 8,
	section: 1,
	title: 'Email header analyser',
	summary:
		'Trace the Received path of a message with delays per hop, and read its SPF, DKIM, DMARC and ARC results.',
	keywords: [
		'email',
		'headers',
		'received',
		'authentication-results',
		'dkim-signature',
		'arc',
		'spf',
		'dmarc',
		'phishing',
		'spoofing',
		'message-id',
		'rfc5322',
		'rfc2047',
		'mail trace'
	],
	network: false,
	detect: looksLikeHeaders
};
