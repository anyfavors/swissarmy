import type { ToolMeta } from '../types';
import { looksLikeOtpauth } from './logic';

export const meta: ToolMeta = {
	id: 'totp',
	chapter: 4,
	section: 7,
	title: 'TOTP codes',
	summary: 'Current, previous and next TOTP or HOTP codes from a base32 secret or otpauth:// URI.',
	keywords: [
		'otp',
		'totp',
		'hotp',
		'2fa',
		'mfa',
		'authenticator',
		'otpauth',
		'one-time password',
		'rfc6238',
		'rfc4226',
		'base32'
	],
	network: false,
	detect: looksLikeOtpauth
};
