import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixtures, hashedKnownHosts } from './fixtures';
import {
	hashedHostMatches,
	isError,
	keygenLine,
	looksLikeSshKey,
	parseKeys,
	tokenize,
	type ParsedKey
} from './logic';
import { md5 } from './md5';

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const enc = (s: string) => new TextEncoder().encode(s);

async function one(text: string, now?: number): Promise<ParsedKey> {
	const r = await parseKeys(text, now);
	expect(r).toHaveLength(1);
	if (isError(r[0])) throw new Error(r[0].error);
	return r[0];
}

const fx = (name: string) => fixtures.find((f) => f.name === name)!;
const keyPart = (name: string) => fx(name).line.split(' ').slice(0, 2).join(' ');

describe('MD5 (RFC 1321 appendix A.5)', () => {
	const vectors: [string, string][] = [
		['', 'd41d8cd98f00b204e9800998ecf8427e'],
		['a', '0cc175b9c0f1b6a831c399e269772661'],
		['abc', '900150983cd24fb0d6963f7d28e17f72'],
		['message digest', 'f96b697d7cb7938d525a2f31aaf161d0'],
		['abcdefghijklmnopqrstuvwxyz', 'c3fcd3d76192e4007dfb496cca67e13b'],
		[
			'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
			'd174ab98d277d9f5a5611c2c9f419d9f'
		],
		[
			'12345678901234567890123456789012345678901234567890123456789012345678901234567890',
			'57edf4a22be3c955ac49da2e2107b67a'
		]
	];
	it.each(vectors)('md5(%j)', (input, out) => {
		expect(hex(md5(enc(input)))).toBe(out);
	});
	it('handles the 55/56/64 byte padding boundaries', () => {
		// Values from `printf 'a%.0s' {1..N} | md5sum`.
		expect(hex(md5(enc('a'.repeat(55))))).toBe('ef1772b6dff9a122358552954ad0df65');
		expect(hex(md5(enc('a'.repeat(56))))).toBe('3b0c8ac703f828b04c6c197006d17218');
		expect(hex(md5(enc('a'.repeat(64))))).toBe('014842d480b571495a4a0363793f7367');
	});
});

describe('fingerprints match ssh-keygen -lf (OpenSSH 9.6p1 fixtures)', () => {
	it.each(fixtures.map((f) => [f.name, f] as const))('%s', async (_, f) => {
		const k = await one(f.line);
		expect(keygenLine(k)).toBe(f.sha256);
		expect(keygenLine(k, 'md5')).toBe(f.md5);
	});
});

describe('key details', () => {
	it('flags weak RSA and DSA', async () => {
		expect((await one(fx('rsa1024').line)).flags[0]).toMatchObject({ level: 'danger' });
		const r2048 = await one(fx('rsa2048').line);
		expect(r2048.flags[0].level).toBe('warn');
		expect(r2048.flags[0].text).toContain('below current guidance');
		expect(r2048.rsaExponent).toBe('65537');
		expect((await one(fx('rsa3072').line)).flags).toEqual([]);
		const dsa = await one(fx('dsa').line);
		expect(dsa.flags[0].level).toBe('danger');
		expect(dsa.flags[0].text).toContain('deprecated');
		expect((await one(fx('ed').line)).flags).toEqual([]);
	});

	it('reads -sk keys', async () => {
		const k = await one(fx('sked').line);
		expect(k.type).toBe('sk-ssh-ed25519@openssh.com');
		expect(k.application).toBe('ssh:');
		expect(k.flags[0].text).toContain('FIDO');
	});

	it('reads certificates', async () => {
		const k = await one(fx('ed-cert').line, Date.UTC(2026, 5, 1));
		expect(k.label).toBe('ED25519-CERT');
		expect(k.cert).toMatchObject({
			kind: 'user',
			serial: 42n,
			keyId: 'alice-laptop',
			principals: ['alice', 'admin'],
			caType: 'ssh-ed25519',
			criticalOptions: [],
			extensions: [
				'permit-X11-forwarding',
				'permit-agent-forwarding',
				'permit-port-forwarding',
				'permit-pty',
				'permit-user-rc'
			]
		});
		// From `ssh-keygen -L`: Signing CA: ED25519 SHA256:oZVcw/V+1AiBB4qianqkSrE66eWIS4mLdd/Hu2NfQNQ
		expect(k.cert!.caSha256).toBe('SHA256:oZVcw/V+1AiBB4qianqkSrE66eWIS4mLdd/Hu2NfQNQ');
		expect(k.flags).toEqual([]);
		const expired = await one(fx('ed-cert').line, Date.UTC(2027, 5, 1));
		expect(expired.flags[0].text).toContain('expired');
		const host = await one(fx('rsa3072-cert').line, Date.UTC(2026, 5, 1));
		expect(host.cert).toMatchObject({ kind: 'host', serial: 7n, principals: ['host.example.com'] });
	});
});

describe('line formats', () => {
	it('authorized_keys with options, quoted spaces and commas', async () => {
		const k = await one(
			`from="10.0.0.0/8,192.0.2.1",command="/usr/bin/backup --dir \\"a b\\"",no-pty,restrict ${keyPart('ed')} backup key`
		);
		expect(k.source).toBe('authorized_keys');
		expect(k.options).toEqual([
			{ name: 'from', value: '10.0.0.0/8,192.0.2.1' },
			{ name: 'command', value: '/usr/bin/backup --dir "a b"' },
			{ name: 'no-pty' },
			{ name: 'restrict' }
		]);
		expect(k.comment).toBe('backup key');
		expect(k.sha256).toBe('SHA256:4zOyKRmdp4Eep/9G9CZ82wYO4ePPYBDassepRAFMwBQ');
	});

	it('known_hosts with plain, port and hashed hosts', async () => {
		const r = await parseKeys(
			`example.com,192.0.2.1 ${keyPart('ed')}\n[git.example.com]:2222 ${keyPart('e256')}\n${hashedKnownHosts}`
		);
		expect(r.every((x) => !isError(x))).toBe(true);
		const ks = r as ParsedKey[];
		expect(ks.map((k) => k.source)).toEqual(Array(5).fill('known_hosts'));
		expect(ks[0].hosts!.map((h) => h.text)).toEqual(['example.com', '192.0.2.1']);
		expect(ks[1].hosts![0].text).toBe('[git.example.com]:2222');
		expect(ks[2].hosts![0].hashed).toBeTruthy();
		// The hashed file came from ssh-keygen -H: lines are example.com, 192.0.2.1, [example.com]:2222.
		expect(await hashedHostMatches(ks[2].hosts![0], 'example.com')).toBe(true);
		expect(await hashedHostMatches(ks[2].hosts![0], 'EXAMPLE.com')).toBe(true);
		expect(await hashedHostMatches(ks[2].hosts![0], 'example.org')).toBe(false);
		expect(await hashedHostMatches(ks[3].hosts![0], '192.0.2.1')).toBe(true);
		expect(await hashedHostMatches(ks[4].hosts![0], 'example.com')).toBe(false);
		expect(await hashedHostMatches(ks[4].hosts![0], 'example.com', 2222)).toBe(true);
		expect(ks[4].sha256).toBe('SHA256:q7HX7oUiz7R/sAtZg7kAN+McPFYW5szlsxVj+HJcKgg');
	});

	it('known_hosts markers', async () => {
		const k = await one(`@revoked *.example.com ${keyPart('rsa2048')}`);
		expect(k.marker).toBe('@revoked');
		expect(k.flags[0]).toMatchObject({ level: 'danger' });
		const ca = await one(`@cert-authority *.example.com ${keyPart('ed')}`);
		expect(ca.marker).toBe('@cert-authority');
		const bad = await parseKeys(`@trusted host ${keyPart('ed')}`);
		expect(isError(bad[0]) && bad[0].error).toContain('Unknown known_hosts marker');
	});

	it('RFC 4716 block (ssh-keygen -e)', async () => {
		const block = [
			'---- BEGIN SSH2 PUBLIC KEY ----',
			'Comment: "521-bit ECDSA, converted by ssh-keygen from OpenSSH"',
			'AAAAE2VjZHNhLXNoYTItbmlzdHA1MjEAAAAIbmlzdHA1MjEAAACFBAAjtieU9FSBtyEkZc',
			'zm3XYyq0UaTnumQAUDHV7S2hMuZouULSlDTdWGQZyv/V2b0PvQkq9PxRuBS19L1qLFAxxJ',
			'qgAfJrqHIDKtcHdLAudCyC5lE01D3aX4lkhYhG0pq8fx5uIq8ykq1Hm7P5iIXfhYBx3rL+',
			'7Or6TlghehBc32+EH1QA==',
			'---- END SSH2 PUBLIC KEY ----'
		].join('\n');
		const k = await one(block);
		expect(k.source).toBe('rfc4716');
		expect(k.comment).toBe('521-bit ECDSA, converted by ssh-keygen from OpenSSH');
		expect(k.sha256).toBe('SHA256:PcwBmTw6GVLDiznwcuYaUNWzWdSJhxGX5qAiIUqBWrs');
	});

	it('several lines, comments and blanks', async () => {
		const r = await parseKeys(
			`# team keys\n\n${fx('ed').line}\n${fx('e384').line}\r\n   ${fx('rsa3072').line}`
		);
		expect(r.map((x) => (isError(x) ? 'err' : x.line))).toEqual([3, 4, 5]);
	});

	it('comments with spaces are kept', async () => {
		expect((await one(`${keyPart('ed')}  Jane Doe <jane@example.com>`)).comment).toBe(
			'Jane Doe <jane@example.com>'
		);
	});
});

describe('errors', () => {
	const err = async (s: string) => {
		const r = await parseKeys(s);
		expect(r).toHaveLength(1);
		expect(isError(r[0])).toBe(true);
		return (r[0] as { error: string }).error;
	};
	it('refuses private keys with a warning', async () => {
		expect(await err('-----BEGIN OPENSSH PRIVATE KEY-----')).toContain('PRIVATE key');
	});
	it('reports truncated data', async () => {
		const [t, b] = keyPart('rsa2048').split(' ');
		expect(await err(`${t} ${b.slice(0, 100)}`)).toMatch(/truncated|base64/);
	});
	it('reports a type mismatch', async () => {
		const b = keyPart('ed').split(' ')[1];
		expect(await err(`ssh-rsa ${b}`)).toContain('says ssh-rsa but the key data is ssh-ed25519');
	});
	it('reports missing key data', async () => {
		expect(await err('ssh-ed25519')).toContain('without key data');
		expect(await err('hello world')).toContain('No OpenSSH public key');
	});
	it('reports text before the key that is neither options nor hosts', async () => {
		expect(await err(`a b ${keyPart('ed')}`)).toContain('Unexpected text');
	});
});

describe('helpers', () => {
	it('tokenizes with quotes', () => {
		expect(tokenize('a="b c" d').map((t) => t.text)).toEqual(['a="b c"', 'd']);
	});
	it('detects key lines', () => {
		expect(looksLikeSshKey(fx('ed').line)).toBe(0.9);
		expect(looksLikeSshKey(fx('sked').line)).toBe(0.9);
		expect(looksLikeSshKey(fx('e256').line)).toBe(0.9);
		expect(looksLikeSshKey('ssh-keygen -t ed25519')).toBe(0);
		expect(looksLikeSshKey('hello')).toBe(0);
	});
});

// Live cross-check when ssh-keygen is installed: fresh keys, compared with its own output.
const keygen = spawnSync('ssh-keygen', ['-?'], { encoding: 'utf8' }).error === undefined;

describe('live ssh-keygen cross-check', () => {
	it.skipIf(!keygen)('matches ssh-keygen -l for freshly generated keys', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'sshfp-'));
		try {
			for (const [t, b] of [
				['ed25519', ''],
				['ecdsa', '384'],
				['rsa', '2048']
			]) {
				const f = join(dir, t);
				const args = ['-q', '-t', t, '-N', '', '-C', `live-${t}`, '-f', f];
				if (b) args.push('-b', b);
				spawnSync('ssh-keygen', args);
				const line = readFileSync(`${f}.pub`, 'utf8').trim();
				const sha = spawnSync('ssh-keygen', ['-lf', `${f}.pub`], {
					encoding: 'utf8'
				}).stdout.trim();
				const md = spawnSync('ssh-keygen', ['-E', 'md5', '-lf', `${f}.pub`], {
					encoding: 'utf8'
				}).stdout.trim();
				const k = await one(line);
				expect(keygenLine(k)).toBe(sha);
				expect(keygenLine(k, 'md5')).toBe(md);
			}
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
