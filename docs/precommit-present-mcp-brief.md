Pre-commit gate: MarketView Present MCP (`marketview-index/mcp/`).

Review git diff vs main for:
- `mcp/package.json`, `mcp/tsconfig.json`, `mcp/src/**`, `mcp/README.md`
- `docs/precommit-present-mcp-brief.md` (this file)
- README MCP pointer (if present)

Cross-check against production contract:
- GET `/api/present-command` shape (`projector`, `projectorLast`, `applied`, `command`) — no extra POST for status
- POST writes require `x-api-key: PRESENT_API_KEY`; never log or embed key in repo
- Ack: `applied.id === command.id` OR `projector.lid === command.id`; **page** skips ack (CopilotBar parity)
- Ack poll budget: 8 × 1500 ms; warn on rate limit (90 GET/min/IP)
- Catalog: 1–120 items, `group` market|macro, built from `/api/market-data` + `/api/macro-data` (not invented symbols)
- Structured POST includes **`category`** (`invalid_category` on bad labels); maps to embed `mv-category`
- **`show NDX`** / **`NDX`** → **`QQQ`** (not `^IXIC`); runbook updated in plan v1.8+ / findings doc
- `overlay_clear` maps to `{ action: overlay, clear: true }`; fullscreen uses `enter|exit` not `toggle`

Oracle (must pass before PROCEED):
```bash
cd marketview-index/mcp && npm install && npm test && npm run lint
```

Optional smoke (operator machine, key in env, projector tab open on `/present`):
- `present_status` → read telemetry
- `present_action` `{ "action": "view", "view": "index" }` → ack true within poll cap

Reviewers: codex, agy, grok, opencode, nim (parse path untouched), TypeSafe AI findings table, **plan gate sol gpt-6.1-sol + grok**.

First line exactly: PROCEED or FIX (F1...)

Max 350 words.
