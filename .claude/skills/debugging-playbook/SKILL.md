---
name: marketview-debugging-playbook
description: Load when marketview-index misbehaves and you have a concrete symptom — any 5xx/500 or unexpected error from a deployed /api/* endpoint, jargon card never appears, "NIM call failed" in Vercel logs, ERR_MODULE_NOT_FOUND on a deployed function, dashboard shows frozen/stale banner, PDF won't render or page-flip on the projector, iOS Safari behaves differently from desktop, a 401 from present-slide/present-pdf, or tests fail with "localStorage.clear is not a function".
---

# MarketView — Debugging Playbook

Rule zero: capture evidence before editing anything. The api/ layer runs only on Vercel —
your evidence sources are Vercel function logs, the `?jargonDebug=1` beacon, the
`source` field on API responses, and the manual probe scripts in `test/`.
Layer-bisect first: client (src/) vs serverless (api/) vs external (Yahoo/FRED/Gemini/NIM/R2/Redis).

**Reading Vercel logs** (as of 2026-07-13): the `vercel` CLI is installed on the dev
machine (v51.2.1) but the repo is NOT linked (no `.vercel/` dir). Options: (a) Vercel
dashboard → the project → Logs (needs the user's account; project name/org
`user-must-provide`); (b) `vercel link` once, then `vercel logs <deployment-url>`
(`unverified` on this account — CLI auth state unknown). If neither is reachable,
say so and ask the user for a log excerpt rather than guessing at server behavior.

## S1 — Jargon card never appears on a slide

Triage in this order; each branch ends at a named observable:
1. Is the feature on? `J` toggles it; `jargonEnabled` default true. Card also requires
   `mainView==='slide' && slide.mode==='pdf'` (PresentationPage.tsx:71). Observable: other
   slides show cards.
2. Open `/present?jargonDebug=1` — the beacon (src/jargonDebug.ts → api/jargon-debug.ts →
   Vercel logs) logs `pipeline` events with `{page, textLen, hasImage, path}`.
   - `path: null` → slide text < 40 chars AND no usable image capture → extraction problem
     (see S5 for iOS) or genuinely jargon-free slide.
   - `path: 'text'|'image'` but no card → server side; check Vercel logs for
     `/api/explain-jargon`.
3. Server log shows Gemini warnings then NIM attempts, request takes 40s+ → known
   limitation, not a regression: NIM vision latency swings 16–60s+ on identical payloads
   (measured 2026-07-11). If the user navigated away before ~50s, the card raced the
   45s auto-advance and lost. Do NOT fix by shortening timeouts (a 25s abort killed a
   measured 42.6s success — explain-jargon.ts:205 comment).
4. Empty terms on a slide that HAS jargon → check whether an empty result got a cache
   entry (it must not — Invariant 3, architecture-contract). Observable:
   `source:'cache'` in the response with `terms:[]` would indicate that guard broke.
Done: named the branch + observable; fix-version reference: PRs #13–#18.

## S2 — "NIM call failed (model …): HTTP …" or timeout warnings in Vercel logs

Fork known-limitation from regression BEFORE fixing:
- On the vision path with a 200 response delivered: these are **benign race-losers** of
  the hedged race (hedge = `callNimHedged` in lib/nim.ts: primary model fires alone,
  backups join after 10s or on failure — see ai-jargon-pipeline) — the hedge fired
  backups and a winner answered (b60f307 commit body says exactly this). Do NOT "fix"
  the noise by removing the hedge.
- HTTP 400 mentioning reasoning/effort on a Mistral model → someone applied
  `reasoning_effort` beyond `openai/gpt-oss*` (lib/nim.ts:69 guard broke).
- HTTP 404 on a model → the model ID was retired/unavailable on this account (it
  happened with gemma-3-12b; Gemini side: gemini-1.5/2.0-flash). Probe the ID live,
  then update the chain (see ai-jargon-pipeline R3).
- ALL models failing on a request that used to work → check NIM key validity
  (`NVIDIA_NIM_API_KEY[_FALLBACK]`, comma-separable) before touching code.
Done: classified as benign / config / retired-model / outage with the log line quoted.

## S3 — Deployed function 500s with `ERR_MODULE_NOT_FOUND`

Known trap with two past incidents:
- Import from lib/ missing the `.js` extension (`import { redis } from '../lib/redis.js'`
  — extension REQUIRED even though sources are .ts; bdc031e).
- Shared helper placed at `api/_name.ts` — Vercel excludes underscore-prefixed files
  from the function bundle (26a29e3). Shared code lives in `lib/`, imported with `.js`
  (canonical rule + full details: build-and-env pitfall 3).
Observable: the missing specifier named in the Vercel log. Done: deploy succeeds and the
function returns 200. Note: `npm run lint` (tsc) does NOT catch either of these.

## S4 — Dashboard shows frozen/stale banner

That banner is the degradation ladder WORKING (caching-and-data-freshness R4). Triage:
GET `/api/market-data` and read `source`: `server_stale_cache` → live Yahoo fetch failing
server-side (check Vercel logs; probe locally with `cd "/Users/yauch/Documents/market index/marketview-index" && node test/test-market.js` — needs
real Redis creds in `.env.local`); `server_cache`/`live_api_cached` fresh but client still
frozen → client-side staleness (hourly poll in useDashboardData; check response.ok
handling). Known-limitation fork: a range other than the polled one refreshes lazily on
first miss — brief staleness after deploy is expected, not a bug.

## S5 — Works on desktop, broken on iOS Safari (projector often drives via iPad)

Two paid-for lessons:
- pdfjs `getTextContent()` THROWS on iOS Safari for some PDFs → the image-OCR fallback
  path exists precisely for this (#14, 9870015; PdfViewer.tsx catch block). If jargon
  quality differs on iOS, it's likely on the image path — confirm via
  `?jargonDebug=1` (`path:'image'`).
- You cannot attach an inspector on the projector iPad — that's WHY the debug beacon
  exists. Extend the beacon, don't add device-local logging.

## S6 — 401 from /api/present-slide POST or /api/present-pdf

Checklist: `PRESENT_API_KEY` set server-side AND the SAME value baked at build as
`VITE_PRESENT_API_KEY` (client bundle: src/slideApi.ts:3)? Mismatch after rotating the
key without redeploying the frontend is the classic cause — the key is baked at BUILD
time, so rotation requires a redeploy. Local `vercel dev`/direct probes must send
`x-api-key` explicitly. Slide GET needs no key by design.

## S7 — `npm test` fails with `localStorage.clear is not a function`

Node ≥22's native localStorage shadows jsdom's. Guards: `NODE_OPTIONS=--no-experimental-webstorage`
in the test script (package.json:9) + MemoryStorage shim (vitest.setup.ts). If this
error appears, someone ran vitest directly (bypassing the npm script) or edited those
guards. Run `npm test`, not bare `npx vitest`.

## Recurrence signatures

- S1 empty-terms-cached returns → the non-empty write guard (explain-jargon.ts:319) regressed.
- S3 returns after a refactor that "organized imports" → tooling stripped .js extensions.
- S2 noise spikes with 3 NIM calls on EVERY request → hedge degraded to full race
  (check `callNimHedged` still gates backups on delay/failure).

Re-verify: `cd "/Users/yauch/Documents/market index/marketview-index" && npm test 2>&1 | tail -3 && grep -rn "jargonDebug" src/jargonDebug.ts api/jargon-debug.ts | head -3`
