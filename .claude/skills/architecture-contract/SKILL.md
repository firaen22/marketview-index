---
name: marketview-architecture-contract
description: Load before changing anything in marketview-index api/, lib/, or the /present pipeline — especially when tempted to rename Redis keys, "simplify" the auth compare, remove an export that looks unused, reorder a model list, drop a .js import extension, add a keydown listener, change the jargon cache key, or relax the PDF key regex. These invariants each have a paid-for incident behind them.
---

# MarketView — Architecture Contract

All file:line refs verified 2026-07-13 at commit 6feeff2. Line numbers drift; anchors
(quoted identifiers) are the stable part.

## Invariant 1 — PDF key pattern is the R2 security boundary

- **Tempting change:** "this regex looks fussy, let me loosen it" / "support arbitrary keys in pdf-proxy".
- **Invariant:** every key `sanitizeFilename` (api/present-pdf.ts) can emit MUST match
  `PDF_KEY_PATTERN` (lib/pdfKey.ts:1: `/^(?!.*\.\.)\d{13}-[a-f0-9]{12}-[a-zA-Z0-9._-]{1,128}$/`),
  and the pattern MUST reject `..` traversal and the `slide-state/` prefix.
  `api/pdf-proxy.ts` is the only public read path into R2; this regex is the gate.
- **Done-check:** `npm test` — `api/pdf-key-invariant.test.ts` enforces the cross-module contract.
- **Incident:** R2-key allowlists added in bug sweeps #1/#2 (commits 3be82c8, 048e199).
- **Don't simplify back to:** proxying whatever `?key=` arrives.
- ❌ Real rationalization shape: "the exports of `sanitizeFilename` and the re-export of
  `PDF_KEY_PATTERN` in pdf-proxy.ts look unused — clean them up." They exist solely so
  the invariant test can import both sides. Removing them kills the guard silently.

## Invariant 2 — Write auth: timing-safe x-api-key, fail closed

- **Tempting change:** "just compare strings" / "skip auth in dev".
- **Invariant:** every authenticated write endpoint compares sha256(`x-api-key`) with
  `crypto.timingSafeEqual` against `PRESENT_API_KEY`; when the env var is set, requests
  without it fail. Each endpoint owns its own `authorize()` — currently
  present-pdf.ts:36, present-slide.ts:35, present-command.ts:68 (the projector-report
  write path, added in PR #46 / f147144) and glossary-session.ts:59 (gates the presenter
  POST at :201). **This list is open, not an allowlist** — enumerate it with
  `grep -rn timingSafeEqual api/`, and expect it to grow. Slide GET is deliberately unauthenticated (the
  projector reads without a key). `VITE_PRESENT_API_KEY` is baked into the client bundle
  — it is a soft gate against drive-by writes, not a secret.
- **Done-check (verified 2026-07-19 at commit a7ca3dd, clean tree):** assert per file, not
  by glob count — each of these must be exactly 1:
  `grep -c timingSafeEqual api/present-slide.ts` → 1;
  `grep -c timingSafeEqual api/present-pdf.ts` → 1;
  `grep -c timingSafeEqual api/present-command.ts` → 1;
  `grep -c timingSafeEqual api/glossary-session.ts` → 1.
- ⚠️ **A higher total across `api/present-*.ts` is NORMAL and must never be "fixed."** The
  count grows every time a new authenticated endpoint is added (2 → 3 when
  present-command.ts gained its own `authorize()`). Deleting a compare to make a stale
  number match is the failure this invariant exists to prevent: drop the one in
  present-slide.ts and POST/DELETE on `/api/present-slide` becomes unauthenticated. If a
  file shows 0, that endpoint's auth is gone — restore it, don't edit this number. Note
  that no count can detect a *rewritten* `authorize()` body (e.g. swapped for `===`), so
  read the compare in any file your diff touches rather than trusting the tally.
- **Incident:** fail-closed + constant-time compare added in sweep #1 (3be82c8).

## Invariant 3 — Jargon server cache: slide-identity key, non-empty-only writes, override-on-read

- **Tempting change:** "key the cache on content hash" / "cache empty results too, they're results" / "bake glossary overrides into the cache".
- **Invariant (3 parts, api/explain-jargon.ts):**
  1. Cache key is `jargon:slide:{lang}:{sha256(slideId)}` where `slideId = ${slide.updatedAt}#${page}`
     (client: src/hooks/useJargon.ts; server: explain-jargon.ts `jargonCacheKey`). Content
     hashing was rejected because text-vs-image extraction differs per device, fragmenting
     the cache across the projector/laptop/iPad viewing the same slide (PR #20, 647ebc5).
     `updatedAt` changes on re-save → self-invalidating.
  2. Only non-empty term lists are written (explain-jargon.ts:319) — vision flakiness can
     return empty on a slide that HAS jargon; caching it locks in a bad result for 30 days.
  3. `applyGlossaryOverride` runs at response time, on both cache hits and fresh results
     (explain-jargon.ts:259,327) — the cache stores raw model output so glossary edits
     take effect without a flush. Override replaces explanation wording only, never term
     detection (PR: 0dd81d5).
- **Done-check:** `grep -n "terms.length > 0" api/explain-jargon.ts` and `grep -c applyGlossaryOverride api/explain-jargon.ts` → 3 (1 import + 2 call sites).
- ❌ Real rationalization: "an empty list is still a valid answer — cache it to save calls."
  That exact trade was measured and rejected in #20's design notes.

## Invariant 4 — Model chains: order is load-bearing, asymmetric by endpoint

- **Tempting change:** "alphabetize the model arrays" / "use NIM everywhere for consistency" / "set reasoning_effort low globally".
- **Invariant (as of 2026-07-13 — volatile, model IDs rot):**
  - Jargon: Gemini primary (`gemini-3.5-flash-lite` → `gemini-2.5-flash-lite`,
    explain-jargon.ts:19), NIM only if Gemini yields nothing. User Bearer key, when
    present, is used exclusively (explain-jargon.ts:270).
  - NIM vision list order = hedge order: FIRST entry fires alone, backups join after
    `HEDGE_DELAY_MS` 10s or primary failure (lib/nim.ts:17, explain-jargon.ts:219).
  - `reasoning_effort:'low'` applies ONLY to `openai/gpt-oss*` — Mistral returns HTTP 400
    on it (lib/nim.ts:69).
  - `/api/market-news` is NIM-only by decision, not oversight (3c20d04: Gemini restored
    "for jargon only").
- **Done-check:** `grep -n "GEMINI_MODEL_CHAIN\|NIM_VISION_MODELS\|NIM_TEXT_MODELS" api/explain-jargon.ts lib/nim.ts`.
- **Incident chain:** see failure-archaeology (Gemini→NIM→Gemini; race→hedge).
- **Retired-model trap:** Gemini model IDs silently die (gemini-1.5/2.0-flash retirement
  left dead fallback legs, PRs #7/#8). Any edit to a model chain requires a live probe of
  each ID — see validation-and-qa.

## Invariant 5 — One keyboard owner in /present

- **Tempting change:** "add a keydown listener in my new component".
- **Invariant:** `useKeyboardShortcuts` in PresentationPage is the single owner
  (E/F/S/I/P/Q/J/?/Esc/arrows/PageUp/Down). PdfViewer's internal handler is disabled in
  /present (`pdfKeyboardEnabled={false}`, PresentationPage.tsx:497) — page flips go
  through the imperative `pdfRef` handle. PageUp/Down always flip PDF pages (presentation
  clickers emit them) even when the quote spotlight owns ←/→. Iframe keydowns are
  re-dispatched to the parent (same-origin only).
- **Done-check:** `cd "/Users/yauch/Documents/market index/marketview-index" && grep -rn "addEventListener('keydown'" src/ --include="*.tsx" --include="*.ts"` — baseline is 7 hits (verified 2026-07-19 at commit a7ca3dd, clean tree): useKeyboardShortcuts.ts:41, two blocks in PresentationPage.tsx (kiosk presenter handler :564 + iframe re-dispatch :641), Modal.tsx:33, IndexChartModal.tsx:81, PdfViewer.tsx:202, GlossarySessionPanel.tsx:77 — all owned/coordinated (modals and the glossary panel own their own Esc; PdfViewer's is the handler that /present disables). Any hit your diff ADDS needs justification against the single-owner rule; do NOT remove the baseline hits.
- **Incident:** "single keyboard owner" was the fix for fighting listeners in sweep #1 (3be82c8).

## Invariant 6 — Slide state contract

- **Invariant:** single global slide JSON at R2 key `slide-state/marketflow_present_slide_v1.json`
  (present-slide.ts:4); server stamps `updatedAt = Date.now()` (jargon cache identity
  depends on this); `ALLOWED_MODES = ['markdown','html','url','pdf']` (present-slide.ts:6)
  must stay in sync with `PresentSlideMode` (src/settings.ts:12) — nothing enforces it;
  content cap 256 KB (src/slideApi.ts:10). html mode renders in `sandbox="allow-scripts"`
  — never add `allow-same-origin` (iframe sandbox escape fixed in #19, ae379d1).
- **Done-check:** compare the two mode lists by hand; `grep -n allow-same-origin src/components/SlideRenderer.tsx` → 0 hits.

## Invariant 7 — Market data degradation ladder ends in a banner, never fabrication

- **Invariant:** live fetch fails → serve Redis stale payload with `source:'server_stale_cache'`
  (market-data.ts:161) → client shows the frozen banner (useDashboardData.ts:84) → server
  unreachable → device localStorage fallback. Chart history that can't be fetched returns
  `[]` + `estimated` flag — the "realistic random walk" fabricated-history approach was
  shipped once (7cd5855) and reversed (3be82c8).
- **Don't simplify back to:** mock/synthesized data on failure.
- ❌ Real rationalization: "an empty chart looks broken — generate plausible history so
  the UI stays pretty." That is fabricating financial data on a projector in front of a
  live audience.

## Known doc-defects (authority order)

Code > README.md (Alpha Vantage/KV/cron-times claims are stale; in-flight fix as of
2026-07-13). Code > ENHANCEMENT_REPORT.md (2026-03-10 audit, several items since fixed).
Comments in api/explain-jargon.ts / lib/nim.ts carry dated measurements — they are the
authoritative record of WHY; trust them over intuition, re-measure before contradicting.

Re-verify: `cd "/Users/yauch/Documents/market index/marketview-index" && npm test -- --run api/pdf-key-invariant.test.ts && grep -n timingSafeEqual api/present-*.ts`
