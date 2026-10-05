/**
 * Cookie and Set-Cookie parsing following RFC 6265 and its revision draft-ietf-httpbis-rfc6265bis
 * (cookie prefixes, SameSite, the 400-day limit on Expires / Max-Age).
 * Partitioned is from CHIPS (draft-cutler-httpbis-partitioned-cookies), Priority is Chromium only.
 */

export interface CookiePair {
	name: string;
	raw: string;
	/** URL-decoded value, or the raw value when it is not valid percent-encoding. */
	value: string;
	decoded: boolean;
}

export type Level = 'danger' | 'warn' | 'info';
export interface Finding {
	level: Level;
	text: string;
}

function decode(v: string): { value: string; decoded: boolean } {
	const unq = v.length >= 2 && v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v;
	if (!/%[0-9a-f]{2}/i.test(unq)) return { value: unq, decoded: false };
	try {
		return { value: decodeURIComponent(unq), decoded: true };
	} catch {
		return { value: unq, decoded: false };
	}
}

/** Parses a Cookie request header: "Cookie: a=1; b=2" or just "a=1; b=2". */
export function parseCookieHeader(input: string): CookiePair[] {
	const t = input.trim().replace(/^cookie\s*:\s*/i, '');
	if (!t) return [];
	return t
		.split(';')
		.map((p) => p.trim())
		.filter(Boolean)
		.map((p) => {
			const eq = p.indexOf('=');
			const name = eq < 0 ? '' : p.slice(0, eq).trim();
			const raw = eq < 0 ? p : p.slice(eq + 1).trim();
			return { name, raw, ...decode(raw) };
		});
}

export type SameSite = 'Strict' | 'Lax' | 'None';

export interface SetCookie {
	name: string;
	value: string;
	rawValue: string;
	expires?: { raw: string; date: Date | null };
	maxAge?: { raw: string; seconds: number | null };
	domain?: string;
	path?: string;
	secure: boolean;
	httpOnly: boolean;
	sameSite?: { raw: string; value: SameSite | null };
	partitioned: boolean;
	priority?: string;
	unknown: string[];
	/** Effective lifetime in seconds from `now`, null for a session cookie. */
	lifetime: number | null;
	findings: Finding[];
}

const SESSIONISH =
	/(^|[_.-])(sess|session|sid|ssid|auth|token|jwt|login|remember|phpsessid|jsessionid|connect\.sid|asp\.net_sessionid|laravel_session|_session)([_.-]|$)|sessionid|session_id|authtoken|access_token|refresh_token/i;
const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const DAY = 86400;

/** Parses one Set-Cookie header value (with or without the "Set-Cookie:" name). */
export function parseSetCookie(line: string, now = Date.now()): SetCookie {
	const t = line.trim().replace(/^set-cookie\s*:\s*/i, '');
	const parts = t.split(';');
	const first = parts.shift()!.trim();
	const eq = first.indexOf('=');
	if (eq < 0) throw new Error(`"${first.slice(0, 40)}" has no "=", not a name=value pair`);
	const name = first.slice(0, eq).trim();
	const rawValue = first.slice(eq + 1).trim();
	const c: SetCookie = {
		name,
		rawValue,
		value: decode(rawValue).value,
		secure: false,
		httpOnly: false,
		partitioned: false,
		unknown: [],
		lifetime: null,
		findings: []
	};
	const f = c.findings;

	for (const part of parts) {
		const p = part.trim();
		if (!p) continue;
		const i = p.indexOf('=');
		const key = (i < 0 ? p : p.slice(0, i)).trim();
		const val = i < 0 ? '' : p.slice(i + 1).trim();
		switch (key.toLowerCase()) {
			case 'expires': {
				const ms = Date.parse(val);
				c.expires = { raw: val, date: Number.isNaN(ms) ? null : new Date(ms) };
				if (Number.isNaN(ms))
					f.push({
						level: 'warn',
						text: `Expires "${val}" is not a date browsers can read, it is ignored`
					});
				break;
			}
			case 'max-age': {
				const ok = /^-?\d+$/.test(val);
				c.maxAge = { raw: val, seconds: ok ? Number(val) : null };
				if (!ok)
					f.push({ level: 'warn', text: `Max-Age "${val}" is not an integer, it is ignored` });
				break;
			}
			case 'domain':
				c.domain = val.replace(/^\./, '').toLowerCase();
				break;
			case 'path':
				c.path = val;
				break;
			case 'secure':
				c.secure = true;
				break;
			case 'httponly':
				c.httpOnly = true;
				break;
			case 'samesite': {
				const v = val.toLowerCase();
				const value: SameSite | null =
					v === 'strict' ? 'Strict' : v === 'lax' ? 'Lax' : v === 'none' ? 'None' : null;
				c.sameSite = { raw: val, value };
				if (!value)
					f.push({
						level: 'warn',
						text: `SameSite "${val}" is not Strict, Lax or None, browsers ignore it`
					});
				break;
			}
			case 'partitioned':
				c.partitioned = true;
				break;
			case 'priority':
				c.priority = val;
				break;
			default:
				c.unknown.push(p);
		}
	}

	// Lifetime: Max-Age wins over Expires (RFC 6265 §5.3 step 3)
	if (c.maxAge?.seconds != null) c.lifetime = c.maxAge.seconds;
	else if (c.expires?.date) c.lifetime = Math.round((c.expires.date.getTime() - now) / 1000);

	// Name and value checks
	if (!name)
		f.push({ level: 'warn', text: 'Empty cookie name. Browsers accept it, many servers do not' });
	else if (!TOKEN.test(name))
		f.push({ level: 'warn', text: 'Name contains characters outside the RFC 6265 token set' });
	if (/[\s",\\]/.test(c.rawValue.replace(/^"(.*)"$/, '$1')))
		f.push({
			level: 'info',
			text: 'Value contains spaces, quotes, commas or backslashes. Percent-encode it'
		});
	if (new TextEncoder().encode(name + c.rawValue).length > 4096)
		f.push({ level: 'warn', text: 'Name plus value is over 4096 bytes, browsers drop it' });

	// Prefixes, matched case-insensitively per rfc6265bis
	const lname = name.toLowerCase();
	if (lname.startsWith('__secure-') && !c.secure)
		f.push({
			level: 'danger',
			text: '__Secure- prefix requires Secure. Browsers reject this cookie'
		});
	if (lname.startsWith('__host-')) {
		if (!c.secure)
			f.push({
				level: 'danger',
				text: '__Host- prefix requires Secure. Browsers reject this cookie'
			});
		if (c.domain !== undefined)
			f.push({
				level: 'danger',
				text: '__Host- prefix forbids Domain. Browsers reject this cookie'
			});
		if (c.path !== '/')
			f.push({
				level: 'danger',
				text: '__Host- prefix requires Path=/. Browsers reject this cookie'
			});
	}

	// SameSite
	if (c.sameSite?.value === 'None' && !c.secure)
		f.push({
			level: 'danger',
			text: 'SameSite=None without Secure is rejected by current browsers'
		});
	if (!c.sameSite?.value)
		f.push({
			level: 'info',
			text: 'No SameSite. Chromium treats it as Lax, other browsers may send it cross-site'
		});
	if (c.partitioned && !c.secure)
		f.push({ level: 'danger', text: 'Partitioned requires Secure. Browsers reject this cookie' });

	// Security of session-looking cookies
	const sessionish = SESSIONISH.test(name);
	if (sessionish && !c.httpOnly)
		f.push({
			level: 'warn',
			text: 'Looks like a session or auth cookie but has no HttpOnly, so scripts can read it'
		});
	if (sessionish && !c.secure)
		f.push({
			level: 'warn',
			text: 'Looks like a session or auth cookie but has no Secure, so it is sent over plain HTTP'
		});
	if (!sessionish && !c.secure && !lname.startsWith('__'))
		f.push({ level: 'info', text: 'No Secure: the cookie is also sent over plain HTTP' });

	// Lifetime
	if (c.lifetime !== null && c.lifetime <= 0)
		f.push({
			level: 'info',
			text: 'Expiry is in the past or Max-Age is 0 or less: this deletes the cookie'
		});
	else if (c.lifetime !== null && c.lifetime > 400 * DAY)
		f.push({
			level: 'warn',
			text: `Lifetime is ${Math.round(c.lifetime / DAY)} days. Browsers cap it at 400 days (rfc6265bis)`
		});
	if (c.domain)
		f.push({ level: 'info', text: `Domain=${c.domain} also sends the cookie to every subdomain` });
	if (c.priority && !/^(low|medium|high)$/i.test(c.priority))
		f.push({ level: 'warn', text: `Priority "${c.priority}" is not Low, Medium or High` });
	for (const u of c.unknown) f.push({ level: 'info', text: `Unknown attribute "${u}" is ignored` });

	return c;
}

/** Parses several Set-Cookie lines; each line is one header. */
export function parseSetCookies(
	text: string,
	now = Date.now()
): { cookie?: SetCookie; error?: string; line: string }[] {
	return text
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter(Boolean)
		.map((line) => {
			try {
				return { line, cookie: parseSetCookie(line, now) };
			} catch (e) {
				return { line, error: (e as Error).message };
			}
		});
}

export function describeLifetime(sec: number | null): string {
	if (sec === null) return 'Session cookie, deleted when the browser session ends';
	if (sec <= 0) return 'Expired, deletes the cookie';
	const d = sec / DAY;
	if (d >= 2) return `${Math.round(d)} days`;
	const h = sec / 3600;
	if (h >= 2) return `${Math.round(h)} hours`;
	if (sec >= 120) return `${Math.round(sec / 60)} minutes`;
	return `${sec} seconds`;
}

/** Which input this is: request Cookie header or Set-Cookie response headers. */
export function guessKind(input: string): 'cookie' | 'set-cookie' {
	const t = input.trim();
	if (/^set-cookie\s*:/im.test(t)) return 'set-cookie';
	if (/^cookie\s*:/i.test(t)) return 'cookie';
	if (/;\s*(expires|max-age|path|domain|secure|httponly|samesite)\b/i.test(t)) return 'set-cookie';
	return 'cookie';
}

export { looksLikeCookie } from './detect';
