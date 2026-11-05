# MarketView Present MCP

Stdio MCP server that drives the **MarketView Index** projector via the same HTTP contract as `/present-control` and README “Presenter remote (agents)”.

## Tools

| Tool | Auth | Purpose |
|------|------|---------|
| `present_status` | None | `GET /api/present-command` — projector heartbeat, `projectorLast`, `applied`, command slot |
| `present_send` | `PRESENT_API_KEY` | Natural language (`action: send`) with catalog from market + macro APIs |
| `present_action` | `PRESENT_API_KEY` | Structured actions: `view`, `range`, **`category`**, `layout`, `fullscreen`, `highlight`, `compare`, `overlay`, **`overlay_clear`**, `clear`, `page` (see `oneOf` tool schema) |
| `present_assist` | `PRESENT_API_KEY` | `POST action: assist` — talking points from slide text (40–6000 chars) or a slide image (`imageBase64` + `slideId` + `deckKey`). Does not touch the projector. |
| `present_slide` | get: none · save: `PRESENT_API_KEY` | `GET/POST /api/present-slide`. **save replaces the live deck** (`updatedAt` defaults to now; a newer stored timestamp → 409 stale). Content ≤ 256 KiB (client parity). PDF upload not supported. |

`present_status` also returns `control` (last `/present-control` surface report). `pageCommands` is not surfaced: the API only returns it to keyed projector reports, so an MCP GET always sees `[]`.

### Responsiveness

- Every HTTP call has a hard timeout: status 5 s, command POST 20 s, assist 60 s (server vision budget 50 s), slide 15 s, catalog 8 s. Timeout → tool error `<label>_timeout`, never a hang.
- Ack polling: **8 GETs max** (CopilotBar rate parity), first GET after 700 ms (the projector polls every 1–1.8 s, so a t=0 check can't succeed), schedule `700, 700, 1000, 1500×5` ms ≈ 9.9 s wall. Result includes `ackMs`.
- Ack-poll failure (429 / timeout) **after** a successful POST returns `acknowledged: false` + `ackError`, not a tool error — the command is already in the slot; check `present_status` before resending.
- Catalog (market + macro) is prewarmed at startup, cached 5 min, deduped across concurrent calls, and a stale copy (≤ 1 h) is served if a refresh fails.

**Page** commands never wait for ack (projector `lid` is not set).

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
npm test        # includes wiring.e2e.test.ts: real MCP Client ↔ Server over InMemoryTransport
npm run build
npm run mcp
```

## Rate limit

Each ack poll is a GET on `/api/present-command` (90/min/IP). Set `wait_for_ack: false` to **skip ack polling only** — the command is still POSTed. Chain writes only after `applied.id` matches when ack matters.

Example structured POST (also via MCP `present_action`):

- `{"action":"category","category":"US"}` — index embed region filter (same labels as embed chips)
