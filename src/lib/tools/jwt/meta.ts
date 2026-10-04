import type { ToolMeta } from '../types';
import { looksLikeJwt } from './logic';

export const meta: ToolMeta = {
	id: 'jwt',
	chapter: 4,
	section: 2,
	title: 'JWT decoder',
	summary: 'Decode a JSON Web Token, check its time claims and verify HS, RS, PS or ES signatures.',
	keywords: [
		'jws',
		'jwe',
		'bearer',
		'token',
		'oauth',
		'oidc',
		'id token',
		'jwk',
		'claims',
		'rfc7519'
	],
	network: false,
	detect: looksLikeJwt
};
