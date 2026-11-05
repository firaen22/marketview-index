# Precommit review packet — MarketView Present MCP + PR #92 follow-ups

**Repo:** firaen22/marketview-index (local uncommitted tree)
**Author family:** Composer/Cursor (implementation session)
**Oracle (ran 2026-11-05):**
- `cd mcp && npm test && npm run lint` → exit 0 (14 tests)
- `npm test -- --run api/present-command.test.ts src/presentCommand.overlay.test.ts src/PresentationPage.command.test.ts src/embedBridge.test.ts` → 82 passed

## Scope

New **`mcp/`** stdio MCP (`present_status`, `present_send`, `present_action`) calling production `GET/POST /api/present-command`.

App changes (PR #92 product follow-ups):
- **`NDX`/`ndx` alias → `QQQ`** (not `^IXIC`)
- **`POST action:category`** + executor `mv-category` postMessage (remote embed region filter)
- Docs/README updates; `lib/presentIndexCategory.ts` shared category list

## Rubric (must cross-check)

1. GET status only — no extra POST for telemetry
2. POST writes require `x-api-key`; no secrets in repo
3. Ack: `applied.id` or `projector.lid`; **page** skips ack; MCP 8×1500ms poll
4. Rate limit 90 GET/min — MCP ack loops documented
5. Catalog 1–120 from market-data + macro-data
6. Category labels match embed (`All`, `US`, …)
7. NDX → QQQ product correctness (Nasdaq-100 ETF vs Composite)
8. `isExecutablePresentCommand` / Redis cmdmeta / applied parsing for new `category` kind
9. MCP `loadConfig()` throws on missing key for writes; status tool works without key

## Key MCP behaviors

- `presentClient.waitForCommandAck`: first GET immediate, then sleep 1500ms, max 8 attempts (matches CopilotBar)
- `shouldWaitForAck`: false for `page`
- `fetchCommandCatalog`: 5min cache; requires 1–120 items
- `present_action` discriminated union includes `category`, `overlay_clear` → `{action:overlay,clear:true}`

## Known gaps / questions for reviewers

- `presentCommandApi.ts` / client `parsePresentApplied` may omit `category` field on applied state (server parses it)
- Findings doc step 1 still says cmd2 **`show nasdaq`** while step 3 allows **`show NDX`** — intentional?
- MCP `package-lock.json` present; `npm audit` reported 1 high (not fixed)
- No prod smoke with live `/present` heartbeat in this packet

## Gate output format (Sol + Grok ONLY)

First line exactly: `PROCEED` or `FIX (F1...)`
Max 350 words total.
Reference findings as F1, F2…

## Findings table format (agy, codex, grok, opencode, nim)

Return markdown table: | ID | Severity | Claim | Evidence | Fix |

Rate each finding: blocking / should-fix / nit
