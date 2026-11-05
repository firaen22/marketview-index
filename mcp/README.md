# MarketView Present MCP

Stdio MCP server that drives the **MarketView Index** projector via the same HTTP contract as `/present-control` and README “Presenter remote (agents)”.

## Tools

| Tool | Auth | Purpose |
|------|------|---------|
| `present_status` | None | `GET /api/present-command` — projector heartbeat, `projectorLast`, `applied`, command slot |
| `present_send` | `PRESENT_API_KEY` | Natural language (`action: send`) with catalog from market + macro APIs |
| `present_action` | `PRESENT_API_KEY` | Structured actions: `view`, `range`, **`category`**, `layout`, `fullscreen`, `highlight`, `compare`, `overlay`, **`overlay_clear`**, `clear`, `page` (see `oneOf` tool schema) |

Ack polling defaults to **8 attempts × 1.5 s** (matches CopilotBar). **Page** commands never wait for ack (projector `lid` is not set).

## Environment

| Variable | Required | Default |
|----------|----------|---------|
| `PRESENT_API_KEY` | Writes | — |
| `MARKETVIEW_ORIGIN` | No | `https://marketindex.pmd-hk.com` |

Do not commit keys. Register only in Cursor/Claude MCP config env.

Category labels in `src/categoryLabels.ts` must match `../lib/presentIndexCategory.ts`; the main app runs `src/presentIndexCategory.parity.test.ts` to catch drift (MCP package cannot import `lib/` under its TypeScript `rootDir`).

## Cursor registration

```json
{
  "mcpServers": {
    "marketview-present": {
      "command": "node",
      "args": ["/ABS/PATH/marketview-index/mcp/dist/server.js"],
      "env": {
        "PRESENT_API_KEY": "your-key-matching-Vercel-PRESENT_API_KEY"
      }
    }
  }
}
```

## Develop

```bash
cd mcp
npm install
npm test
npm run build
npm run mcp
```

## Rate limit

Each ack poll is a GET on `/api/present-command` (90/min/IP). Set `wait_for_ack: false` to **skip ack polling only** — the command is still POSTed. Chain writes only after `applied.id` matches when ack matters.

Example structured POST (also via MCP `present_action`):

- `{"action":"category","category":"US"}` — index embed region filter (same labels as embed chips)
