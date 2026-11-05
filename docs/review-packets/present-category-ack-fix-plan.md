# Fix plan — PR #92 category ack + precommit gate (2026-11-05)

## Goal

Remote `present_action` / POST `category` must **ack on `/present`** ( `applied.id` or `projector.lid` ) when the index embed is mounted, including when the embed sent `mv-present-ready` before the parent listener attached.

## Root cause (consensus)

- `postToIndexIframe` requires `indexIframeLoadedRef` **and** `indexEmbedBridgeReadyRef`.
- Ready is set only on `mv-present-ready`. Race: cached embed can post ready before `PresentationPage` `useEffect` listener runs → bridge stays false → category/highlight/range fail until a full reload.
- MCP and API were already correct; failure was **client-only** (PR #92 retest 04:07 UTC).

## Batch A — ship now (this PR)

| ID | Change | Proof |
|----|--------|--------|
| A1 | **Already in tree:** `mv-present-ping` / embed re-`mv-present-ready`; parent `useLayoutEffect` listener; `registerPollNow` + bump on ready and iframe `onLoad`; `parsePresentIndexCategory` on execute | Manual: category ack with `/present` open |
| A2 | **Sol F1:** Unit tests for handshake + poll bump | See test plan below |
| A3 | **Already in tree:** `show NDX` → `QQQ` API test; invalid category rejected in `PresentationPage.command.test.ts` | `api/present-command.test.ts`, `PresentationPage.command.test.ts` |
| A4 | Docs: findings note + wiring audit + precommit packet | No behavior change |

### A2 test plan (Sol F1 + Grok — mandatory, not optional)

**Required files (all in Batch A oracle):**

1. **`src/hooks/usePresentCommand.hook.test.ts`**
   - `registerPollNow while idle fetches again after the in-flight poll settles` — resolve first mocked `fetch`, invoke stored `pollNow`, assert second fetch.
   - `retries unconsumed category on registered wake and reports lid once` — first `onCommand` returns false (no `lid`); after wake, execution succeeds; next poll URL includes command `lid`; same id not re-executed. Cover wake after unmount (no throw / no extra fetch).

2. **`src/embedHandshake.test.ts`** (new) **or** extend `PresentationPage.command.test.ts` — pick one path; oracle must list the file used.
   - `missed mv-present-ready recovers on ping, bumps poll, then category posts` (Grok) / `recovers category delivery when initial ready precedes parent listener` (Sol):
     - Simulate ready **before** parent subscribes → bridge false.
     - Parent posts `{ type: 'mv-present-ping' }`; embed answers `{ type: 'mv-present-ready' }` (test Dashboard handler or pure helper mirroring `Dashboard.tsx` lines 115–116).
     - Bridge true + bump; category command posts `{ type: 'mv-category', category: 'US' }` and returns true.
   - **`embedBridge.test.ts` alone is insufficient** (category parse only).

3. **Red requirement:** new tests must **fail** on pre-handshake-fix behavior (revert A1 in test harness or commented baseline) then pass with A1.

**Drop:** optional wording on A2.3; message-shape-only tests without listener/ping path.

## Batch B — follow-up PR (MCP completeness, optional)

| ID | Change | When |
|----|--------|------|
| B1 | `present_assist` → POST `action: assist` | Product wants bot assist |
| B2 | `present_slide_get` / `present_slide_save` | Deck automation |
| B3 | Enrich `present_status` (`control`, `pageCommands`; applied fields) | Bot debugging |
| B4 | `present_catalog` optional | Low priority |

Do **not** block Batch A on Batch B.

## Oracle (Batch A)

```bash
cd mcp && npm test && npm run lint
cd .. && npm test -- --run \
  src/hooks/usePresentCommand.hook.test.ts \
  src/embedHandshake.test.ts \
  src/PresentationPage.command.test.ts \
  api/present-command.test.ts \
  src/presentCommandApi.test.ts \
  src/embedBridge.test.ts
```

(Omit `src/embedHandshake.test.ts` from the command only if handshake tests live entirely in `PresentationPage.command.test.ts` — document which in the plan header.)

## Risks / edges

- `pollNow` no-ops when `inFlight` (Grok nit): ready during await still OK because bridge ref set before next invoke.
- `mv-present-ready` not scoped to index iframe window (only embed sends it today).
- Stale `/present` tab without hard refresh after deploy can still run old JS — operator runbook note only.

## Gate after Batch A

Re-run **gpt-6.1-sol** + **Grok 4.7** precommit on full diff vs `origin/main`; both must `PROCEED` or documented waiver.
