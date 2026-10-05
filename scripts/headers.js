// Writes build/_headers for Cloudflare Pages. Runs after `vite build`.
import { writeFileSync } from 'node:fs';
import { headerPolicy } from './csp.js';

const headers = `/*
  Content-Security-Policy: ${headerPolicy}
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Resource-Policy: same-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Strict-Transport-Security: max-age=31536000; includeSubDomains

/_app/immutable/*
  Cache-Control: public, max-age=31536000, immutable
`;

writeFileSync('build/_headers', headers);
console.log('wrote build/_headers');
