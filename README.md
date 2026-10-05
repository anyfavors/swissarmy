# Field Manual

Browser-side utilities at **fm.smhansen.dev**. Static SvelteKit site, no backend. Page views are counted by the owner's own statistics service (t.vo.rs), path only.
Every tool runs in the browser; the few that need the network (DNS over HTTPS) say so and only
contact hosts allowed by the Content-Security-Policy.

## Develop

```sh
npm ci
npm run dev      # http://localhost:5173
npm test         # unit tests (Vitest)
npm run check    # type check
npm run build    # static site in build/, plus build/_headers
npm run test:e2e # Playwright against build/ with the real headers (run build first)
```

Playwright downloads its own Chromium in CI. Locally you can point it at an installed one with
`PW_CHROMIUM=/path/to/chromium npm run test:e2e`.

Node 22 (see `.nvmrc`). If a fresh `npm install` without a lockfile fails with
`Cannot read properties of null (reading 'edgesOut')`, that is an npm 10 bug; use `npx npm@11 install`.
`npm ci` against the lockfile works on npm 10.

## Adding a tool

Each tool is one folder under `src/lib/tools/<id>/`:

| File                   | Purpose                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `meta.ts`              | id, chapter/section (the manual number, e.g. FM 2-01), title, summary, search keywords, `network`, `chain`. No imports from logic: every page loads all metas |
| `intake.ts` (optional) | `export { fn as detect }` returning 0 to 1 for how likely pasted text belongs here. Loaded lazily by the front page intake only                               |
| `logic.ts`             | Pure functions, no DOM. This is what gets tested and what chaining will call                                                                                  |
| `logic.test.ts`        | Tests, preferably against published test vectors (RFCs)                                                                                                       |
| `Tool.svelte`          | The UI. Read initial state with `readHash()` and write it back with `writeHash()`                                                                             |

The registry (`src/lib/tools/registry.ts`) picks the folder up automatically and a page is prerendered at `/<id>`.
Chapters are listed in `src/lib/tools/chapters.ts`.

Rules that keep the site honest:

- `network: false` means the tool makes no requests. A tool that does must list the hosts in `meta.network`
  and in `connectSrc` in `scripts/csp.js`, and must only send on an explicit button press.
- No inline `style="..."` attributes and no inline scripts. The CSP blocks them. Use classes.
- Never write secrets (tokens, keys, passwords, certificates) to the URL fragment.
- Import from `#lib/...` with the file extension (`#lib/util/hash.ts`), as SvelteKit 3 requires.

## Offline

`src/service-worker/index.ts` precaches the whole build, so after one visit every tool works without
a connection. Only same-origin GET requests are served from the cache.

## Security headers

- `scripts/csp.js` is the single source for the policy.
- SvelteKit writes a `<meta>` CSP into every page with hashes for its own inline bootstrap script.
- `scripts/headers.js` writes `build/_headers` for Cloudflare Pages with `frame-ancestors`, `connect-src`
  and the other security headers. Both policies apply, so the effective policy is the stricter of the two.

## Deploy (Cloudflare Pages)

| Setting                | Value                                       |
| ---------------------- | ------------------------------------------- |
| Framework preset       | None                                        |
| Build command          | `npm run build`                             |
| Build output directory | `build`                                     |
| Environment variable   | `NODE_VERSION=22` (also read from `.nvmrc`) |
| Custom domain          | `fm.smhansen.dev`                           |

Leave Cloudflare Web Analytics off for this project. It injects a script the CSP would block.

### Deploys

Production deploys are triggered by CI: after the `test` job passes on a push to `main`, the
`deploy` job POSTs to a Cloudflare Pages deploy hook stored in the repository secret
`CF_DEPLOY_HOOK`. The hook URL is a bearer secret and must never be committed.

## Design

"Field manual" edition system: **paper** (off-white, black ink, Swiss red) and **blueprint**
(cyanotype blue, white lines, safety yellow). Follows the OS setting unless the reader picks one.
Type is Atkinson Hyperlegible Next and Mono, self-hosted via Fontsource.
