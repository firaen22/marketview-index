# Precommit — category embed ack fix + MCP wiring audit

**Branch:** `feat/present-mcp-remote` (ahead of `origin/main`)  
**Gate:** **gpt-6.1-sol** + **Grok 4.7** (first line `PROCEED` or `FIX (F#…)`).  
**Panel:** codex, agy, grok, opencode, nim, TypeSafe-style findings table.

## Scope (this diff vs `origin/main`)

- `src/PresentationPage.tsx` — `mv-present-ping` handshake, `useLayoutEffect` listener, `registerPollNow`, category parse guard
- `src/Dashboard.tsx` — respond to `mv-present-ping` with `mv-present-ready`
- `src/hooks/usePresentCommand.ts` — `registerPollNow` hook
- `api/present-command.test.ts` — `show NDX` → `QQQ` send test
- `src/PresentationPage.command.test.ts` — invalid category rejected
- `docs/minute-a-prod-findings-2026-10-30.md` — PR #92 retest note
- `docs/review-packets/present-mcp-wiring-audit.md` — MCP coverage matrix (no app behavior change)

**Unchanged in diff:** `mcp/**` (already on main via #96). Wiring audit documents **assist / slide / pdf** still **not** in MCP.

## Oracle (executed 2026-11-05)

```bash
cd mcp && npm test && npm run lint          # 8 passed, lint OK
cd .. && npm test -- --run api/present-command.test.ts \
  src/presentCommand.overlay.test.ts src/presentIndexCategory.parity.test.ts \
  src/PresentationPage.command.test.ts src/embedBridge.test.ts \
  src/presentCommandApi.test.ts             # 95 passed
```

## Cross-check

- PR #92 live gap: category slot write without ack → embed bridge race
- MCP `present_action` category unchanged; fix is `/present` client
- No secrets in diff; no rate-limit / poll constant changes

## TypeSafe-style findings template (reviewers)

| ID | Severity | Claim | Evidence | Fix |
|----|----------|-------|----------|-----|
| | blocking / should-fix / nit | | file:line or test | |

Max 8 rows. MCP unwired: assist, present-slide, present-pdf, status `control`/`pageCommands` — see wiring audit.

## Review brief (paste to gate)

See `docs/precommit-present-mcp-brief.md` plus wiring audit. First line exactly PROCEED or FIX. Max 350 words.
