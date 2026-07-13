---
name: marketview-build-and-env
description: Load when setting up marketview-index from a fresh clone, when npm test/lint/build fails on a machine that "should work", when adding or renaming an environment variable, when an api/ function can't reach Redis/R2/Gemini/NIM, or when deciding how to run the serverless functions locally.
---

# MarketView — Build & Environment

Repo: `/Users/yauch/Documents/market index/marketview-index`. All commands below were
run and verified 2026-07-13 (Node v25.9.0, npm 11.12.1). CI uses Node 20; no `engines`
field or `.nvmrc` — both work.

## Rebuild from zero (verified sequence)

```bash
git clone https://github.com/firaen22/marketview-index.git   # on a genuinely fresh machine
cd "/Users/yauch/Documents/market index/marketview-index"
npm install
npm test        # vitest run — 113/113 pass, ~2s, NO env vars needed (hermetic)
npm run lint    # tsc --noEmit — clean, ~4s
npm run dev     # vite on :3000 (frontend ONLY — see "api/ locally" below)
npm run build   # vite build → dist/ (only if you need a production bundle)
```

Claude Code launch configs exist: `marketview-dev` (repo .claude/launch.json, port 3000)
and `marketview` (parent dir .claude/launch.json, port 3210) — prefer these over raw Bash
for dev servers.

## Pitfalls (each one bit someone)

1. **Run `npm test`, never bare `npx vitest`**: the script carries
   `NODE_OPTIONS=--no-experimental-webstorage` — Node ≥22 ships a native localStorage
   that shadows jsdom's and lacks `.clear()` (vitest.setup.ts explains; symptom:
   `localStorage.clear is not a function`).
2. **`npm run dev` serves NO api/ functions** — no vite proxy or middleware exists.
   Frontend fetches to `/api/*` will 404 locally. Options: (a) test against the deployed
   endpoints, (b) `npx vercel dev` (`unverified` — not scripted or documented in this
   repo; needs `vercel link` + env pull), (c) invoke a handler directly with a fake
   req/res the way `test/test-market.js` does.
3. **api/ imports from lib/ need the `.js` extension** (`../lib/redis.js` even though the
   source is `.ts`). tsc and vite won't complain if you drop it; the deployed function
   crashes with ERR_MODULE_NOT_FOUND. Never place shared code at `api/_name.ts` —
   underscore files are excluded from Vercel bundles.
4. **tsconfig is Vite-tuned** (`moduleResolution: "bundler"`, `allowImportingTsExtensions`,
   `noEmit`); api/ rides Vercel's own TS handling. Don't "fix" tsconfig to make editor
   squiggles on `.js` imports go away.
5. **`vite.config.ts:11` injects `process.env.GEMINI_API_KEY` into the CLIENT bundle**
   (AI Studio scaffold leftover; nothing in src/ reads it). If `GEMINI_API_KEY` is set
   in the build environment, the server key ships in public JS. Preventive: don't set it
   at build time, or remove the define (small PR, test /present afterwards).
6. **`test/` scripts hit real services** (`import 'dotenv/config'`, real Redis/Yahoo/
   Gemini) — they are manual probes, not CI; expect them to mutate real cache keys.

## Environment variables (complete, from code — .env.example is incomplete/stale)

| Var | Read by | Notes |
|---|---|---|
| `KV_REST_API_URL`/`KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_URL`/`_TOKEN` | lib/redis.ts | URL must start `https://` or redis stays null |
| `GEMINI_API_KEY`, `GEMINI_API_KEY_FALLBACK` | api/explain-jargon.ts only (verify-key.ts validates a request-body key; its only env read is NODE_ENV) | each may hold comma-separated multiple keys |
| `NVIDIA_NIM_API_KEY`, `NVIDIA_NIM_API_KEY_FALLBACK` | lib/nim.ts | comma-separable; NOT in .env.example |
| `FRED_API_KEY` | api/macro-data.ts | macro CPI/PPI/GDP |
| `CRON_SECRET` | api/market-data.ts (and in-flight api/cron/) | Bearer auth for cron-triggered refresh; NOT in .env.example |
| `PRESENT_API_KEY` / `VITE_PRESENT_API_KEY` | api/present-*.ts / src/slideApi.ts | must be the SAME value; VITE_ one is baked at build → rotation requires redeploy |
| `CLOUDFLARE_R2_ENDPOINT`, `_ACCESS_KEY_ID`, `_SECRET_ACCESS_KEY`, `_BUCKET_NAME` | api/present-pdf.ts, present-slide.ts, pdf-proxy.ts | R2 via S3 API |
| `ALPHA_VANTAGE_API_KEY` | **nothing** — dead, remove from .env.example when touched | stale scaffold |
| `APP_URL` | nothing found in src/api/lib (`unverified` whether Vercel platform uses it) | AI Studio scaffold |

Secrets live in `.env.local` (git-ignored) locally and in Vercel project env vars in
prod. Never write values into code, comments, or these skills.

## Fresh-clone acceptance check

`npm install && npm test && npm run lint` must pass with NO `.env.local` — the suite is
hermetic (nim.test.ts sets/restores its own env). If a new test needs a real credential,
it's in the wrong layer: make it a `test/` probe script instead.

Re-verify: `cd "/Users/yauch/Documents/market index/marketview-index" && npm test 2>&1 | tail -4 && npm run lint && node --version`
