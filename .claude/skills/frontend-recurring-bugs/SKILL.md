---
name: marketview-frontend-recurring-bugs
description: Load before writing or editing any src/ hook, fetch call, user-visible string, or /present UI in marketview-index — especially when adding a data-fetching hook, handling a fetch response, adding text that renders on screen, sizing UI for the projector, or passing options objects into hooks. These are the bug classes that recurred across sweeps #1, #2, #19, #21.
---

# MarketView — Frontend Recurring Bug Classes

Each rule below is a class that was fixed 2+ times in separate files. The pattern: it
gets reintroduced with every new hook/component unless checked at write time.

## R1 — Every fetch hook needs a stale-response guard (the #1 recurring class)

Trigger: writing/editing any hook or effect that `fetch`es and `setState`s.
Incidents: sequence guards retrofitted one at a time into useMarketData (#2),
useNewsData (#21), useJargon page-flip invalidation, abortable fetches (#1),
debounced-save-after-reject in useSlideSync (#21). Same bug, five files.
Steps: before setState from an async result, verify the result still corresponds to the
CURRENT request (sequence counter, AbortController, or key comparison — see
`activeRequestKeyRef` in src/hooks/useJargon.ts for the house pattern). Rapid
page-flips/lang-switches/range-changes are the reproduction.
Done: name the guard line in your diff; manually flip inputs fast and confirm no
out-of-order overwrite.
✅ Good: `if (activeRequestKeyRef.current !== key) return;` after await.
❌ Bad rationalization: "responses come back in order in practice, the guard is
overhead." Five separate files earned this rule; yours is not the exception.

## R2 — Check `response.ok` before parsing

Trigger: any `await fetch(...)` followed by `.json()`.
Incidents: fixed separately in useDashboardData (#2), then AGAIN in useNewsData and
useMacroData (#21) — an HTML error page parsed as JSON throws and skips error handling.
Done: every fetch in the diff checks `res.ok` (or explicitly handles non-2xx) before parse.

## R3 — User-visible strings go through the i18n dictionary

Trigger: adding any string that renders on screen.
Incidents: ENHANCEMENT_REPORT items 1–5 (hardcoded "Day Range", "Awaiting data...",
heatmap names ignoring `nameEn`, inline ternaries bypassing DICTIONARY); PR #21
localized projector strings again.
Steps: en + zh-TW entries in src/locales/, rendered via the dictionary; data items use
`name`/`nameEn` pairs selected by language. Inline `language === 'en' ? ... : ...`
ternaries are the anti-pattern (they hide from audits).
Done: `cd "/Users/yauch/Documents/market index/marketview-index" && grep -rn "language === 'en' ?" src/` count did not grow with your diff.

## R4 — /present UI sizes in em/vmin/clamp, never fixed px

Trigger: adding/sizing anything rendered inside /present or embed views.
Incidents: fixed-px sizing shrank on the 720p projector (#24 jargon card → em off a
`clamp(13px, 2vmin, 44px)` base, src/components/JargonSpotlight.tsx); `h-[400px]`
heatmap too short in embed (#21); WCAG contrast (#24).
Done: new sizes are relative (em/vmin/clamp); verified visually at 1280×720 (resize dev
tools or `resize_window`), not just your desktop resolution.

## R5 — Options objects into hooks must be referentially stable
(convention, no incident recorded — backed by the in-code warning at
src/hooks/useMarketData.ts:7 for its `filter` option, not by a paid-for bug)

Trigger: passing an object/array/function prop or option into a hook with a dependency
array.
Failure mode: fresh object every render → effect refires → fetch loop.
Done: option is memoized/hoisted, or the hook keys on primitive fields.

## R6 — Guard NaN/non-finite/zero on anything derived from market numbers

Trigger: arithmetic on price/change/percent data before render.
Incidents: div-by-zero YTD, non-finite treemap values, formatPrice em-dash fallback
(#1, #2, #19).
Done: non-finite inputs render a placeholder (—), never NaN%; divisor-zero handled;
a test with NaN/0 inputs exists (validation-and-qa R6).

Re-verify: `cd "/Users/yauch/Documents/market index/marketview-index" && grep -c "activeRequestKeyRef" src/hooks/useJargon.ts && grep -rn "language === 'en' ?" src/ | wc -l`
(baseline 2026-07-13: useJargon guard present; ternary count is the number your diff must not grow)
