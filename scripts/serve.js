// Serves build/ the way Cloudflare Pages does: /x maps to x.html, and the headers from
// build/_headers are applied, so tests run against the real CSP. Used by Playwright.
import http from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const root = join(import.meta.dirname, '..', 'build');
const port = Number(process.env.PORT ?? 4174);

/** Parses the "/*" block of _headers into a header object. */
function globalHeaders() {
	const lines = readFileSync(join(root, '_headers'), 'utf8').split('\n');
	const out = {};
	let inGlobal = false;
	for (const line of lines) {
		if (!line.startsWith(' ')) inGlobal = line.trim() === '/*';
		else if (inGlobal) {
			const i = line.indexOf(':');
			out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
		}
	}
	return out;
}

const headers = globalHeaders();
const types = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript',
	'.css': 'text/css',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.woff2': 'font/woff2',
	'.woff': 'font/woff',
	'.json': 'application/json',
	'.webmanifest': 'application/manifest+json',
	'.txt': 'text/plain'
};

http
	.createServer((req, res) => {
		const path = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname));
		let file = join(root, path);
		if (!file.startsWith(root)) file = join(root, '404');
		if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
		else if (!existsSync(file) && existsSync(`${file}.html`)) file = `${file}.html`;
		if (!existsSync(file)) {
			res.writeHead(404, headers);
			return res.end('Not found');
		}
		res.writeHead(200, {
			...headers,
			'Content-Type': types[extname(file)] ?? 'application/octet-stream'
		});
		res.end(readFileSync(file));
	})
	.listen(port, () => console.log(`serving build/ on http://localhost:${port}`));
