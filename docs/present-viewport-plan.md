# Present viewport, control telemetry, and embed density

Operator problem (2026-10-24): venue output resolution is not always adjustable; the index view shows fewer cards than expected; `/present-control` cannot see the projector browser box.

Reviews: gpt-6.1-sol and Grok 4.7 on PR #85 (README gap note) and architecture advice. This plan is the corrected spec after those reviews.

## Principles

1. **Fail soft** — bad or missing `display` must not break the command poll or blank `/present`.
2. **One projector write path** — extend the existing authenticated `st=1` **GET** query (`x-api-key`). Do not add a per-tick POST; the 90/min limiter is GET-only (`api/present-command.ts`).
3. **Three layout boxes** — outer `/present` window; `/?embed=1` / `/heatmap?embed=1` iframe documents (card grid + `100vmin`); `/present-control` document.
4. **Layout is local** — column count follows live container width, not Redis (15 s TTL).
5. **Glossary off the hot path** — separate polls on control; never merge audience terms into `present:pstate:v1`.

## Findings for external rating (TypeSafe / review)

| ID | Sev | Claim | Action |
|----|-----|--------|--------|
| T1 | blocker | Second POST per poll bypasses rate limit | Extend `st=1` GET only |
| T2 | blocker | Iframe box ≠ outer `window` for cards/clamp | Report `fw`/`fh`; container queries in Phase 2 |
| T3 | warn | One Redis key lets control overwrite projector | Separate key or role for control |
| T4 | warn | `display` on GET is world-readable | Document in README |
| T5 | warn | Launch uses `screen.avail*` for popup | Document in README |
| T6 | nit | Client omits `at`; server stamps it | Doc + types |
| T7 | nit | Redundant present-slide bullet in gap note | Removed in README fix |
| T8 | nit | Add `dpr` for PDF vs layout px | Optional in `display` |
| T9 | warn | Metadata alone does not add cards | Phase 2 |
| T10 | warn | Defer `/api/present-status` | No aggregator in v1 |
| T11 | warn | Glossary via resolve + code poll | Phase 3 |

## Phases

### Phase 0 — README (PR #85)

Correct gap note and Ask per T1–T8. No runtime change.

**Done when:** README matches code; `npm test` unchanged.

### Phase 1 — Display telemetry

- **Schema (optional `display` on stored projector state):** `schema: 1`, `iw`, `ih`, `fw?`, `fh?`, `dpr`, `screenW?`, `screenH?`, `lang?` — bounded integers; strip invalid object, keep core state.
- **Server:** `projectorStateFromQuery`, `validateProjectorState` in `api/present-command.ts`; client `usePresentCommand.ts`, `presentCommandApi.ts`.
- **Client:** `/present` samples on existing poll; iframe sizes when index mounted.
- **UI:** Control strip (projector dims, age, mode/page); optional in-page line on `/present`.
- **Control reporter (1b) ✅:** `present:pcontrol:v1` via `st=1&role=control`; `useControlDisplayReport` on `/present-control`.

**Done when:** Control shows fresh projector `display` within TTL; tests green; `npm run lint`.

### Phase 2 — Embed card density

- `@container` (or equivalent) on embed grid in `Dashboard.tsx` for `embed=1` / presentation paths.
- Keep existing short-height chart media queries.

**Done when:** 720p embed target met without illegible text; 1080p+ unchanged.

### Phase 3 — Glossary on control ✅

- `fetchCurrentGlossaryPointer` + `fetchPublicGlossarySession` in `glossaryApi.ts`.
- `GlossaryAudienceStrip` on `/present-control` (8s poll, 15s after misses).
- Shows status, code, page, term count, joins — not the term list.

### Phase 4 — Later (partial ✅)

- Preflight embed-width warning when `projector.display.fw` is reported (`classifyProjectorEmbed`).
- Still open: operator compact density; `/api/present-status` aggregator.

## Non-goals

AI resolution or layout; changing OS display mode from the app; glossary terms on `present:pstate`; faster poll; using control `screen` as projector truth.

## PR sequence

```text
PR #85 (README + this plan) → display telemetry → container grid → glossary control card
```

## Verification

No CI on `main`. Each code PR: `npm test` && `npm run lint`; manual `/present` index view at 720p and 1080p.
