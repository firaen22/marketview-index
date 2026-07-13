---
name: marketview-failure-archaeology
description: Load BEFORE proposing any redesign in marketview-index — specifically when the proposal sounds like: "call the vision model twice for quality", "race all models in parallel", "switch the AI backend for consistency", "add client-side quota management", "move PDFs/slides to a different store", "put shared helpers under api/_", "generate placeholder chart data", or "resurrect the Patreon/factor-monitor idea". Each of these was tried or rejected here, with evidence.
---

# MarketView — Failure Archaeology

Dead ends and reversals, from git history (198 commits, 2026-02-28 → 2026-07-13).
Commit IDs are checkable with `git show <id>`.

## dead — Two-step transcribe-then-extract vision jargon (PR #15 → reverted PR #16)
- **Tried:** 0d43105 — vision call 1 transcribes the slide, call 2 extracts jargon from
  the transcript. Motivation was real: single vision call under-extracted (1 term vs 4).
- **Why it died:** NIM vision latency swings 16–60s+ per call; two SERIAL vision calls
  measured 41–100s total — the card never appeared inside the 45s slide window (523c30b
  commit body; also baked into explain-jargon.ts:205 comment).
- **Standing rule:** **one vision call per slide; quality pressure goes in the prompt**
  (the WHERE-TO-LOOK guidance measurably fixed extraction: 4 junk codes → 3–4 real terms).
- **Residue:** none in-tree (fully reverted); the prompt guidance is the survivor.
- **Tripwire:** any "split the vision task into two focused calls" proposal.

## dead — Full N-way parallel model race (PRs #16–#17 → replaced PR #18)
- **Tried:** `Promise.any` over 2 then 3 vision models on every request (523c30b, 0dd4157).
- **Why it died:** 3 calls fired even when the primary would have answered in 5–9s —
  wasted NIM quota/load and flooded logs with misleading "NIM call failed (timeout)"
  entries that were just race-losers on successful requests (b60f307).
- **Standing rule:** **hedged race** — primary alone, backups join at 10s or on failure
  (`callNimHedged`, lib/nim.ts:108). "Failed" logs on 200 responses are benign.
- **Tripwire:** "just fire all models in parallel, latency = fastest" — true but pays
  3× cost on the 90% path; the hedge gets the same tail latency for 1× common-path cost.

## mooted — Full switch to NVIDIA NIM as the only AI backend (PR #10 → partially reversed 3c20d04)
- **Tried:** 6200774 switched everything Gemini → NIM because "User's Gemini free-tier
  keys hit quota intermittently, killing news summaries and jargon explanations".
- **What happened:** NIM latency crisis followed (jargon ~1s → 5–40s, PR #11 mitigations).
  When the Gemini quota pressure ended, 3c20d04 (2026-07-12) restored **Gemini primary
  for jargon only**, NIM demoted to fallback; **market-news deliberately stays NIM-only**.
- **Standing rule:** the asymmetry is intentional; "unify the backends" undoes a
  quota-and-latency lesson. External conditions (quotas) drove both flips — re-measure
  before re-deciding, don't reason from consistency.
- **Tripwire:** "why do jargon and news use different backends? Let me align them."

## dead — Alpha Vantage + client-side quota management (Feb–Mar 2026)
- **Tried:** Alpha Vantage free tier (25 calls/day) with client-side quota tracking
  (6665d4d) — dead within a day; 40f7d40 (2026-03-01) switched to Yahoo Finance
  (`yahoo-finance2`) and deleted the quota machinery.
- **Standing rule:** market data = Yahoo Finance + Redis TTL + 60s refresh throttle.
  README's Alpha Vantage section is the stale residue (fix in flight 2026-07-13).
- **Tripwire:** any reintroduction of per-client API-quota bookkeeping.

## dead — Caching/storage zigzags (Mar–Apr 2026)
- **Tried:** market cache: Vercel KV (66fa3cd) → client localStorage + direct calls
  (9da9edc) → **Upstash Redis server-side** (ff8b94c, same day — settled). PDF/slide
  storage: Redis (04199e4) → Vercel Blob (63591a3) → **Cloudflare R2** for PDFs (312c362)
  and then slide state too (9bddc19 — settled).
- **Standing rule:** Redis (Upstash REST) = small hot JSON + throttles; R2 = blobs and
  slide state. Client PUTs PDFs **directly to R2 via presigned URL** because Vercel
  caps request bodies at 4.5 MB (src/slideApi.ts:56) — routing uploads through an api/
  function re-breaks >4.5 MB decks.
- **Tripwire:** "simplify by storing PDFs in Redis/Vercel Blob" or "proxy the upload
  through our own endpoint".

## recurring-trap — Vercel bundling of shared server code
- **Incidents:** `api/_redis.ts` excluded from bundles (underscore prefix) →
  ERR_MODULE_NOT_FOUND in prod (26a29e3); missing `.js` extension on lib imports broke
  Node ESM resolution (bdc031e); before both, Redis init was copy-pasted inline into
  every function (10eaabd).
- **Standing rule:** shared server code lives in `lib/`, imported from api/ with an
  explicit `.js` extension (canonical wording: build-and-env pitfall 3, which wins on
  disagreement). tsc will not catch violations; only a deploy does.

## dead — Fabricated "realistic" chart history (7cd5855 → reversed 3be82c8)
- **Why it died:** synthesized random-walk history is fabricated financial data shown to
  a live audience.
- **Standing rule:** unfetchable history → `[]` + `estimated` flag + honest UI.
- **Tripwire:** "the empty chart looks broken, generate plausible data".

## rejected/abandoned — Podcast Factor Monitor (`/factors`)
- Patreon API + Gemini factor extraction; added and self-reverted on unmerged branch
  `origin/claude/eager-meitner-zsy119` (37a9927/38095be). Never reached main.
- **Residue, not in-progress work:** that branch. Don't resume without user direction.

## Deliberately-not-done

- **No CI test gate in deploy.yml** — deliberate-or-tolerated gap; compensating control
  is the local test+lint discipline (deploy-and-operate R1). ❌ "I'll helpfully add a
  test job to the workflow" — plausible improvement, but it changes deploy behavior for
  the user's solo flow; propose it, don't ship it unasked.
- **No component/E2E tests** — coverage is deliberately pure-function unit tests
  (fast, hermetic). ❌ "Add Playwright for confidence" — unasked scope.
- **No auth on slide GET** — the projector must read without credentials.
- **`/api/market-news` ignores the client's Bearer Gemini key** (useNewsData still sends
  it) — known stale client contract, harmless; cleaning it is cosmetic, not urgent.

## Rejected options (lost on evidence) vs never-tried

- Lost on evidence: serial vision chain (41–100s), full 3-race (3× cost), 25s vision
  timeout (killed 42.6s successes), fabricated history, Alpha Vantage, `api/_` helpers.
- Never earned entry (untested ≠ beaten): `vercel dev` local api/ workflow, Playwright,
  edge runtime for api/ functions. Trying one is a fresh decision, not a re-walk.

Re-verify: `cd "/Users/yauch/Documents/market index/marketview-index" && git log --oneline | head -30 && git show --stat b60f307 | head -8`
