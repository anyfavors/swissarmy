/*
 * Every token below is fake. Prefixes are split with string concatenation so this file does not
 * itself look like it contains credentials to push protection or other scanners.
 */
import { describe, expect, it } from 'vitest';
import { ops } from './ops';
import { classSwitchRate, entropyThreshold, mask, redact, scan, shannonEntropy } from './logic';

const AKIA = 'AK' + 'IA';
const awsId = AKIA + 'IOSFODNN7EXAMPLE'; // AWS's own documentation example
const awsSecret = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCY' + 'EXAMPLEKEY'; // AWS documentation example
const ghp = 'gh' + 'p_' + 'FAKEfake0123456789FAKEfake0123456789';
const gho = 'gh' + 'o_' + 'FAKEfake0123456789FAKEfake0123456789';
const ghPat = 'github' + '_pat_' + '11FAKEFAKE0000000000000_' + 'FAKEfake'.repeat(7) + 'FAK';
const glpat = 'gl' + 'pat-' + 'FAKEfakeFAKEfake0000';
const slack = 'xo' + 'xb-' + '000000000000-0000000000000-FAKEFAKEFAKEFAKEFAKEFAKE';
const stripe = 'sk' + '_live_' + 'FAKEFAKEFAKE0000000000000000';
const rk = 'rk' + '_live_' + 'FAKEFAKEFAKE0000';
const google = 'AI' + 'za' + 'SyFAKE-FAKE_FAKE0000000000000000000';
const azure =
	'DefaultEndpointsProtocol=https;AccountName=fakeaccount;AccountKey=' +
	'RkFLRUZBS0VGQUtFRkFLRUZBS0VGQUtFRkFLRUZBS0VGQUtFRkFLRUZBS0VGQUtFRkFLRUZBS0VGQUtFRkFLRUZBS0U=' +
	';EndpointSuffix=core.windows.net';
const jwt =
	'ey' + 'JhbGciOiJIUzI1NiJ9.' + 'ey' + 'JzdWIiOiJmYWtlIn0.' + 'FAKEsignatureFAKEsignature';
const pem = [
	'-----BEGIN ' + 'PRIVATE KEY-----',
	'MIIFAKEFAKEFAKE',
	'FAKEFAKE',
	'-----END ' + 'PRIVATE KEY-----'
].join('\n');
const webhook =
	'https://hooks.slack' + '.com/services/T00000000/B00000000/FAKEFAKEFAKEFAKEFAKEFAKE';

const types = (text: string) => scan(text).map((f) => f.type);

describe('specific token formats', () => {
	it.each([
		['AWS access key id', `aws_access_key_id = ${awsId}`, 'aws-access-key-id'],
		['GitHub classic PAT', `token ${ghp}`, 'github-token'],
		['GitHub OAuth token', `x ${gho} y`, 'github-token'],
		['GitHub fine-grained PAT', ghPat, 'github-pat'],
		['GitLab PAT', glpat, 'gitlab-token'],
		['Slack bot token', slack, 'slack-token'],
		['Slack webhook', webhook, 'slack-webhook'],
		['Stripe secret key', stripe, 'stripe-key'],
		['Stripe restricted key', rk, 'stripe-key'],
		['Google API key', `key=${google}`, 'google-api-key'],
		['Azure storage', azure, 'azure-storage-key'],
		['JWT', `Authorization: Bearer ${jwt}`, 'jwt'],
		['PEM private key', pem, 'private-key']
	])('%s', (_, text, type) => {
		expect(types(text)).toContain(type);
	});

	it('AWS secret key only near an access key id or an aws secret label', () => {
		const both = `[default]\naws_access_key_id = ${awsId}\naws_secret_access_key = ${awsSecret}\n`;
		expect(types(both)).toEqual(['aws-access-key-id', 'aws-secret-access-key']);
		// Alone, a 40-character base64 string is not called an AWS key (it may still be high-entropy).
		expect(types(`value ${awsSecret}`)).not.toContain('aws-secret-access-key');
		// A git SHA-1 is 40 hex characters and is never an AWS key.
		expect(types(`${awsId} commit 9fceb02d0ae598e95dc970b74767f19372d61af8`)).toEqual([
			'aws-access-key-id'
		]);
	});

	it('covers the whole PEM block, or the header alone', () => {
		const [f] = scan(`before\n${pem}\nafter`);
		expect(f.end - f.start).toBe(pem.length);
		expect(f.preview).toContain('(4 lines)');
		const head = scan('-----BEGIN RSA ' + 'PRIVATE KEY-----\nMIIE...');
		expect(head[0].type).toBe('private-key');
	});
});

describe('assignments', () => {
	it('flags password and secret values in common syntaxes', () => {
		const text = [
			'DB_PASSWORD=Sup3rS3cret!',
			'password: "hunter2hunter2"',
			"client_secret = 'abcd1234efgh'",
			'"apiKey": "k-123456789"',
			'export SECRET_TOKEN=s3cr3tvalue',
			'pass => letmein99'
		].join('\n');
		const fs = scan(text);
		expect(fs.map((f) => f.type)).toEqual(Array(6).fill('assignment'));
		expect(fs.map((f) => text.slice(f.start, f.end))).toEqual([
			'Sup3rS3cret!',
			'hunter2hunter2',
			'abcd1234efgh',
			'k-123456789',
			's3cr3tvalue',
			'letmein99'
		]);
		expect(fs[0].detail).toBe('key "DB_PASSWORD"');
	});

	it('ignores placeholders and references', () => {
		const text = [
			'password=${DB_PASSWORD}',
			'secret: {{ vault_secret }}',
			'token = null',
			'api_key: <your key here>',
			'password = ********',
			'PASSWORD=$DB_PASS',
			'secret = process.env.SECRET',
			'password_policy: true',
			'passwordless = yes'
		].join('\n');
		expect(scan(text)).toEqual([]);
	});

	it('flags passwords in URLs', () => {
		const t = 'DATABASE_URL=postgres://app:Pa55word99@db.internal:5432/app';
		const fs = scan(t);
		expect(fs.map((f) => [f.type, t.slice(f.start, f.end)])).toContainEqual([
			'url-password',
			'Pa55word99'
		]);
	});
});

describe('high entropy', () => {
	it('computes Shannon entropy', () => {
		expect(shannonEntropy('')).toBe(0);
		expect(shannonEntropy('aaaa')).toBe(0);
		expect(shannonEntropy('ab')).toBe(1);
		expect(shannonEntropy('abcd')).toBe(2);
		expect(shannonEntropy('0123456789abcdef')).toBe(4);
	});
	it('threshold scales with length and caps', () => {
		expect(entropyThreshold(20)).toBeCloseTo(0.85 * Math.log2(20), 10);
		expect(entropyThreshold(200)).toBe(4.5);
		expect(entropyThreshold(64, 16)).toBe(3.0);
	});
	it('class switch rate', () => {
		expect(classSwitchRate('aA1aA1')).toBe(1);
		expect(classSwitchRate('aaaa')).toBe(0);
	});
	it('flags random-looking tokens but not words, identifiers or plain hashes', () => {
		const random = 'Zq8xK2pLm9Vt4RwN7bYc3Hd'; // 23 characters, hand-typed "random"
		expect(types(`x = ${random}`)).toContain('high-entropy');
		expect(types('getUserAccountSettings2024 ConnectionTimeoutMilliseconds30')).toEqual([]);
		expect(types('commit 9fceb02d0ae598e95dc970b74767f19372d61af8')).toEqual([]);
		expect(
			types('sha256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
		).toEqual([]);
		expect(types('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1')).toEqual([]);
		// Hex next to a credential word is flagged.
		expect(
			types('signing key e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
		).toContain('high-entropy');
	});
});

describe('positions, masking and redaction', () => {
	it('reports 1-based line and column', () => {
		const text = `line one\n  token ${ghp}\n`;
		const [f] = scan(text);
		expect([f.line, f.column]).toEqual([2, 9]);
	});
	it('masks with a visible prefix and the length', () => {
		expect(mask(ghp, 4)).toBe('ghp_******** (40 chars)');
		expect(mask('abc', 4)).toBe('*** (3 chars)');
		const [f] = scan(ghp);
		expect(f.preview).not.toContain('FAKEfake0123');
	});
	it('redacts each finding', () => {
		const text = `aws_access_key_id=${awsId}\naws_secret_access_key=${awsSecret}\nuser=bob\npassword=hunter2hunter2\n`;
		expect(redact(text)).toBe(
			'aws_access_key_id=[REDACTED:aws-access-key-id]\naws_secret_access_key=[REDACTED:aws-secret-access-key]\nuser=bob\npassword=[REDACTED:assignment]\n'
		);
	});
	it('keeps clean text unchanged', () => {
		const clean = 'Deployed version 1.4.2 to production at 14:05 UTC. All checks passed.';
		expect(scan(clean)).toEqual([]);
		expect(redact(clean)).toBe(clean);
	});
	it('higher-priority findings win overlaps', () => {
		// The token is also high-entropy and sits in a "token=" assignment; it is reported once.
		const fs = scan(`token=${ghp}`);
		expect(fs).toHaveLength(1);
		expect(fs[0].type).toBe('github-token');
	});
	it('chain op', async () => {
		const op = ops.find((o) => o.id === 'secret-scan.redact')!;
		expect(await op.run(`key ${stripe}`)).toBe('key [REDACTED:stripe-key]');
	});
});

describe('noise control', () => {
	it('skips function calls and SRI hashes', () => {
		const text = [
			'const token = getToken();',
			'password = os.getenv("DB_PASSWORD")',
			'"integrity": "sha512-Jf9pKxS7vHk3qWz8Lm2Rt5Yb1Nc4Xd6Ve0Gh8Ji2Kl4Mn6Op8Qr0St2Uv4Wx6Yz8Ab0Cd2Ef4Gh6Ij8Kl0Mn2Op4Q=="',
			'GET /api/v1/users/550e8400-e29b-41d4-a716-446655440000?page=2 HTTP/1.1 200'
		].join('\n');
		expect(scan(text)).toEqual([]);
	});
});
