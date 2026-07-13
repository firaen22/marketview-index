---
name: marketview-start-here
description: Load FIRST in any session touching /Users/yauch/Documents/market index/marketview-index — before reading source, before editing, before diagnosing a bug. Also load when you catch yourself trusting README.md, when the worktree is unexpectedly dirty, or when you don't know which other marketview skill applies.
---

# MarketView — Start Here (router)

**What this repo is:** a React 19 + Vite financial dashboard ("MarketView"/"MarketFlow")
deployed on Vercel at marketindex.pmd-hk.com, driving a live 720p projector
presentation (`/present`) for a Hong Kong financial-markets audience. It protects two
things above all: (1) the projector must never show a broken/blank/stale-without-banner
screen during a live presentation, and (2) push-to-main deploys straight to production
with zero CI gates — local verification is the only gate.

## Boundary map

| Path | Role | Caveat |
|---|---|---|
| `src/` | React SPA (Dashboard `/`, `/funds`, `/heatmap`, `/present`, `/present-control`) | vitest covers pure `.ts` only; zero component tests |
| `api/` | Vercel Node serverless functions (`export default handler(req,res)`, untyped) | no local runtime; only runs deployed or via `npx vercel dev` (unverified) |
| `lib/` | Shared server helpers (redis, nim, pdfKey, jargonGlossary) | import from api/ with `.js` extension — dropping it breaks the Vercel build |
| `test/` | Ad-hoc manual probe scripts hitting REAL services | NOT part of `npm test`; needs real creds in `.env.local` |
| `.github/workflows/deploy.yml` | Deploy only — **no tests, no lint, no gates** | push to main = production |
| `README.md` | **Stale in places.** | Trust code over README (it described Alpha Vantage; code uses Yahoo Finance) |
| `ENHANCEMENT_REPORT.md` | Bug audit dated 2026-03-10, partially fixed since | Historical; do not re-fix from it without checking current code |

## Worktree state at handoff (2026-07-13)

Dirty and IN-FLIGHT — not yours, not breakage: modified `README.md` +
`api/market-data.ts` and untracked `api/cron/update-market-data.ts` are the user's
active fix for the dead cron endpoint (vercel.json scheduled `/api/cron/update-market-data`
which didn't exist). Do not revert, "clean up", or commit these without the user.
If `git status` is clean when you read this, that fix landed — this note is stale.

## Top disciplines (the ones history proves matter here)

1. **No CI safety net**: run `npm test` && `npm run lint` yourself before any merge
   to main. Both verified green 2026-07-13 (113/113 tests, ~2s; tsc clean).
2. **Latency claims need measurements**: every performance decision in the jargon
   pipeline (PRs #11–#18) was settled by measuring real payloads, not reasoning.
   Match that standard — see marketview-validation-and-qa.
3. **Code comments here are load-bearing incident records** (measured latencies,
   revert rationales, dated probes). Never strip a comment you didn't write;
   `api/explain-jargon.ts` and `lib/nim.ts` are the densest examples.
4. **Every fetch hook needs a stale-response guard** — the #1 recurring bug class.
   See marketview-frontend-recurring-bugs before writing any hook.
5. **Never cache a failure or an empty AI result** — poisoned caches recur here.
   See marketview-caching-and-data-freshness.

## Reading order

1. This file. 2. `architecture-contract` (invariants). 3. The skill matching your
task: bug → `debugging-playbook`; jargon/AI work → `ai-jargon-pipeline`; cache/data →
`caching-and-data-freshness`; setup → `build-and-env`; deploy/ops → `deploy-and-operate`;
about to redesign something → `failure-archaeology` FIRST (it may already be a dead end);
writing tests/claiming done → `validation-and-qa`; touching src/ hooks/components →
`frontend-recurring-bugs`.

Re-verify: `cd "/Users/yauch/Documents/market index/marketview-index" && git status --short && git log -1 --oneline`
