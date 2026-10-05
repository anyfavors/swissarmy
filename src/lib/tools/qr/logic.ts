import type { QrCode } from './encoder';

/* ---------------------------------------------------------- payloads */

/**
 * Wi-Fi network config, the de facto format from ZXing
 * (https://github.com/zxing/zxing/wiki/Barcode-Contents#wi-fi-network-config-android-ios-11).
 * Backslash, semicolon, comma, double quote and colon are escaped with a backslash.
 */
export type WifiAuth = 'WPA' | 'WEP' | 'nopass';
const wifiEscape = (s: string) => s.replace(/([\\;,":])/g, '\\$1');

export function wifiPayload(o: {
	ssid: string;
	password: string;
	auth: WifiAuth;
	hidden: boolean;
}): string {
	if (!o.ssid) throw new Error('Enter the network name (SSID)');
	if (o.auth !== 'nopass' && !o.password)
		throw new Error('Enter the password, or choose no password');
	if (o.auth === 'WPA' && o.password.length < 8)
		throw new Error('A WPA password has at least 8 characters');
	let s = `WIFI:T:${o.auth};S:${wifiEscape(o.ssid)};`;
	if (o.auth !== 'nopass') s += `P:${wifiEscape(o.password)};`;
	if (o.hidden) s += 'H:true;';
	return s + ';';
}

/** vCard 3.0 (RFC 2426) text value escaping. */
const vEscape = (s: string) =>
	s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');

export interface VCard {
	first: string;
	last: string;
	org: string;
	title: string;
	phone: string;
	email: string;
	url: string;
}

export function vcardPayload(v: VCard): string {
	if (!v.first.trim() && !v.last.trim() && !v.org.trim())
		throw new Error('Enter a name or an organisation');
	const fn =
		[v.first, v.last]
			.map((x) => x.trim())
			.filter(Boolean)
			.join(' ') || v.org.trim();
	const lines = [
		'BEGIN:VCARD',
		'VERSION:3.0',
		`N:${vEscape(v.last.trim())};${vEscape(v.first.trim())};;;`,
		`FN:${vEscape(fn)}`
	];
	if (v.org.trim()) lines.push(`ORG:${vEscape(v.org.trim())}`);
	if (v.title.trim()) lines.push(`TITLE:${vEscape(v.title.trim())}`);
	if (v.phone.trim()) lines.push(`TEL;TYPE=CELL:${v.phone.trim()}`);
	if (v.email.trim()) lines.push(`EMAIL:${v.email.trim()}`);
	if (v.url.trim()) lines.push(`URL:${v.url.trim()}`);
	lines.push('END:VCARD');
	return lines.join('\r\n');
}

/**
 * Key URI for authenticator apps
 * (https://github.com/google/google-authenticator/wiki/Key-Uri-Format).
 */
export interface Otp {
	type: 'totp' | 'hotp';
	issuer: string;
	account: string;
	secret: string;
	algorithm: 'SHA1' | 'SHA256' | 'SHA512';
	digits: number;
	period: number;
	counter: number;
}

export function normaliseBase32(s: string): string {
	const t = s.replace(/[\s-]/g, '').replace(/=+$/, '').toUpperCase();
	if (!t) throw new Error('Enter the shared secret (Base32)');
	const bad = t.match(/[^A-Z2-7]/);
	if (bad) throw new Error(`"${bad[0]}" is not a Base32 character (A-Z, 2-7)`);
	return t;
}

export function otpPayload(o: Otp): string {
	if (!o.account.trim()) throw new Error('Enter the account name, for example an email address');
	if (o.issuer.includes(':') || o.account.includes(':'))
		throw new Error('Issuer and account must not contain a colon');
	const secret = normaliseBase32(o.secret);
	const label = o.issuer.trim()
		? `${encodeURIComponent(o.issuer.trim())}:${encodeURIComponent(o.account.trim())}`
		: encodeURIComponent(o.account.trim());
	const q = new URLSearchParams({ secret });
	if (o.issuer.trim()) q.set('issuer', o.issuer.trim());
	if (o.algorithm !== 'SHA1') q.set('algorithm', o.algorithm);
	if (o.digits !== 6) q.set('digits', String(o.digits));
	if (o.type === 'totp' && o.period !== 30) q.set('period', String(o.period));
	if (o.type === 'hotp') q.set('counter', String(o.counter));
	return `otpauth://${o.type}/${label}?${q.toString().replace(/\+/g, '%20')}`;
}

/** mailto: URI per RFC 6068. */
export function emailPayload(o: { to: string; subject: string; body: string }): string {
	if (!o.to.trim()) throw new Error('Enter an address');
	const q: string[] = [];
	if (o.subject) q.push(`subject=${encodeURIComponent(o.subject)}`);
	if (o.body) q.push(`body=${encodeURIComponent(o.body.replace(/\r?\n/g, '\r\n'))}`);
	const to = o.to
		.split(',')
		.map((a) => encodeURI(a.trim()).replace(/\?/g, '%3F').replace(/&/g, '%26'))
		.join(',');
	return `mailto:${to}${q.length ? '?' + q.join('&') : ''}`;
}

/** SMS in the SMSTO form that ZXing and the iOS and Android camera apps read. */
export function smsPayload(o: { number: string; message: string }): string {
	const n = o.number.replace(/[\s().-]/g, '');
	if (!/^\+?\d{3,}$/.test(n)) throw new Error('Enter a phone number, digits with an optional +');
	return o.message ? `SMSTO:${n}:${o.message}` : `SMSTO:${n}`;
}

/* ------------------------------------------------------------- render */

/** One path for all dark modules, as horizontal runs. */
export function svgPath(modules: boolean[][], border: number): string {
	let d = '';
	modules.forEach((row, y) => {
		let x = 0;
		while (x < row.length) {
			if (!row[x]) {
				x++;
				continue;
			}
			const start = x;
			while (x < row.length && row[x]) x++;
			d += `M${start + border} ${y + border}h${x - start}v1h-${x - start}z`;
		}
	});
	return d;
}

/** Standalone SVG file. Black on white: scanners need dark modules on a light background. */
export function svgFile(code: QrCode, border = 4, scale = 8): string {
	const n = code.size + border * 2;
	return (
		`<?xml version="1.0" encoding="UTF-8"?>\n` +
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${n * scale}" height="${n * scale}" shape-rendering="crispEdges">` +
		`<rect width="${n}" height="${n}" fill="#ffffff"/>` +
		`<path d="${svgPath(code.modules, border)}" fill="#000000"/></svg>\n`
	);
}

export const eclInfo: Record<string, string> = {
	L: 'about 7% of the symbol can be damaged',
	M: 'about 15%',
	Q: 'about 25%',
	H: 'about 30%'
};
