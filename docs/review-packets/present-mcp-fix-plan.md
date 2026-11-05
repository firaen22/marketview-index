# Fix plan — Present MCP precommit (post Sol FIX)

## Goal
Clear gate blockers F1–F3 from gpt-6.1-sol review; address consensus F2/F3 from Codex/OpenCode.

## Batch 1 (ship blockers)

| ID | Change | Proof |
|----|--------|-------|
| F1 | Replace `present_action` flat `inputSchema` with JSON Schema **`oneOf`** branches per action; each branch lists required fields + enums (`category`, `view`, `range`, …) and optional `wait_for_ack`. | MCP `TOOL_DEFINITIONS` matches `presentActionSchema` in code |
| F2 | Add `category?: PresentIndexCategoryFilter` to `PresentAppliedState`; parse in `parsePresentApplied` via `parsePresentIndexCategory`; test in `presentCommandApi` or existing applied test | Mock GET with `applied.category` preserved |
| F3 | `mcp/README.md`: `wait_for_ack: false` = **no ack polling only**; still performs authenticated POST | Readme text |

## Batch 2 (should-fix, same PR)

| ID | Change | Proof |
|----|--------|-------|
| F2b | MCP `tools.ts`: import `PRESENT_INDEX_CATEGORIES` from shared `lib/presentIndexCategory.ts` (via re-export in mcp or duplicate-free import path) — use same list for zod enum | Single source |
| F3b | `mcp/README.md`: document `category`, `overlay_clear` in tools table | README |
| F4 | `mcp/vitest.config.ts`: `exclude: ['dist/**']` | vitest only runs `src/**/*.test.ts` |
| Docs | `minute-a-prod-findings` step 1: allow cmd2 **`show NDX`** or **`show nasdaq`** with one-line canonical preference | No contradiction |

## Out of scope (review notes only)
- Grok re-gate (402 until credits)
- Prod `/present` heartbeat smoke
- `npm audit fix` unless trivial

## Status (2026-11-05)
Batch 1–2 implemented. Oracle: mcp lint/test/build + app tests green.

## Operator decisions (2026-11-05 — proceed)
- **B1:** Keep MCP `categoryLabels.ts` + **`presentIndexCategory.parity.test.ts`** (MCP `rootDir` cannot import `lib/` cleanly).
- **B2:** NDX → QQQ shipped; no `^NDX` index row unless product asks later.
- **B3:** Prod `/present` heartbeat smoke = operator checklist before live use; not in CI this PR.
- **Gate bar:** Sol 6.1 + Luna 5.6 **PROCEED** + green oracle; Grok optional (402).
- **Scope:** MCP + presenter API/category/NDX only; no control-page category chips this PR.

## Oracle (post-fix)
```bash
cd marketview-index/mcp && npm test && npm run lint
cd .. && npm test -- --run api/present-command.test.ts src/presentCommand.overlay.test.ts src/PresentationPage.command.test.ts src/embedBridge.test.ts
```
