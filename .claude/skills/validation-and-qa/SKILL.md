---
name: marketview-validation-and-qa
description: Load before claiming any marketview-index change is done/fixed/faster, when writing tests for it, when reviewing someone else's change, or when a performance/latency claim is about to be made without a measurement. Also load when deciding whether new coverage belongs in vitest or in a test/ probe script.
---

# MarketView — Validation & QA Standards

The bar was set by this repo's own history: 33 bugs (#1), then 8 (#19), then 2 more
(#21) were found by review passes AFTER "working" code shipped. "It looks right" has a
measured false-positive record here.

## R1 — Latency/performance claims require live measurements on real payloads

Trigger: any sentence like "this will be faster", "the timeout is too long", "we can
skip the fallback" about the AI pipeline or data fetching.
Steps: measure the deployed (or live-probed) path with a REAL slide/payload, at least a
few runs (NIM vision swings 16–60s+ on identical input — one run proves nothing);
record numbers + date in the code comment beside the constant you're changing (existing
convention: explain-jargon.ts, lib/nim.ts).
Done: the diff contains dated measured numbers, not adjectives.
✅ Good: "healthy vision runs land ~5–9s (measured 2026-07-11) so 10s lets a healthy
primary win alone" (explain-jargon.ts:216 comment).
❌ Bad (the pattern PR #16 reverted): shipping a latency-relevant redesign justified by
reasoning alone; measured reality was 41–100s and the feature died on stage.

## R2 — Reproduce before fixing; expected-before-actual

Trigger: any bug fix.
Steps: (1) reproduce the symptom (write down the command/URL and what you observe);
(2) write down the expected post-fix observable BEFORE checking; (3) fix; (4) re-run the
same reproduction. The #6-follow-up commit body is the precedent: "each reproduced
before fixing".
Done: the PR/commit body names the reproduction and the observable that flipped.

## R3 — Where coverage goes

- Pure logic (parsers, validators, key schemas, market-hours math, image dims) →
  vitest, co-located `src/*.test.ts` / `api/*.test.ts` (jsdom env, hermetic, no creds;
  suite currently 113 tests / ~2s — keep it that fast).
- Cross-module invariants → the `api/pdf-key-invariant.test.ts` pattern: export the two
  sides (even if "unused"), assert producer output ⊆ consumer pattern, include
  attack-shaped cases (traversal, prefix collisions).
- Anything needing real services (Yahoo, Redis, Gemini/NIM, R2) → a `test/*.js` manual
  probe script with `import 'dotenv/config'`, invoked by hand — NEVER a vitest test
  (would break the hermetic fresh-clone guarantee, build-and-env).
- Mock pattern for fetch/env in vitest: see src/nim.test.ts (stub `globalThis.fetch`,
  save/restore `process.env` in afterEach).

## R4 — Known coverage holes (don't mistake green tests for safety)

As of 2026-07-13: zero automated coverage on api/ handlers' request/response flow
(except the pdf-key invariant), lib/redis.ts, all React components/hooks (no .tsx
tests), and anything Vercel-runtime-specific (bundling, ESM resolution — S3 class in
debugging-playbook). A green suite + clean tsc does NOT validate: deployed module
resolution, auth flows, cache behavior, or /present rendering. Cover those with
post-deploy probes (deploy-and-operate R3) and an eyeball pass of /present.

## R5 — Fresh-context review before merge for non-trivial changes

Trigger: a diff that touches >1 file, any api/ file, or anything in the jargon pipeline.
This repo's July PRs institutionalized independent review sweeps before merge (#16
"SHIP with zero findings", #21 "two regressions from that pass caught and corrected
during review") — the practice has a measured catch record (43+ bugs across sweeps).
Steps: hand the diff to a FRESH-context reviewer (subagent or CLI) with the reporting
contract: location + mechanism + fix, severity-ranked; verify claimed findings by
reproducing (R2) before acting on them.
Done: review ran, findings dispositioned (fixed / rejected-with-reason), stated in the
PR body.

## R6 — Empty/zero/NaN edges are the default test cases here

Trigger: writing tests for anything touching market data or AI responses.
History: NaN/non-finite prices, div-by-zero YTD, empty AI responses, corrupt cache JSON
each caused production bugs (#1, #2, #19). A test file for such code without
empty/NaN/malformed cases is incomplete.

Re-verify: `cd "/Users/yauch/Documents/market index/marketview-index" && npm test 2>&1 | tail -4 && ls test/ | head -5`
