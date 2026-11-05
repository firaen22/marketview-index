Precommit gate — Present MCP + PR #92 (final tree). See `docs/review-packets/present-mcp-fix-plan.md`.

Oracle (run before PROCEED):
```bash
cd marketview-index/mcp && npm run lint && npm test && npm run build
cd .. && npm test -- --run src/presentCommandApi.test.ts src/presentIndexCategory.parity.test.ts src/presentCommand.overlay.test.ts src/PresentationPage.command.test.ts src/embedBridge.test.ts api/present-command.test.ts
```
Latest: mcp 8 tests lint OK; app 94 tests pass.

Cross-check: present_action oneOf + type object + ListToolsResultSchema test; applied.category; category API; NDX→QQQ; parity test; no secrets in repo.

Gate reviewers: first line exactly PROCEED or FIX (F1...). Max 350 words.

Findings reviewers: markdown table | ID | Severity | Claim | Evidence | Fix | — rate blocking/should-fix/nit. Max 8 rows.
