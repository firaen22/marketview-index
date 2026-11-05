# MarketView Present MCP

Stdio MCP server that drives the **MarketView Index** projector via the same HTTP contract as `/present-control` and README “Presenter remote (agents)”. Package `marketview-present-mcp` was 0.2.0 on 2026-11-05 (`mcp/package.json`).

## Standing rule — no custom graphics (2026-11-05)

Live lesson from Angus, client presentation, 2026-11-05. Cantonese, intent: remember this; never build any custom graphics yourself; use the features already inside the app, including compare. A Present assistant floated a custom overlay of JGB yield numbers on the PDF projector. He rejected it. Custom overlays and self-built graphics on the projector cause errors.

**Trigger:** You are about to change what `/present` shows, including when the current PDF page does not already draw the figure you want (a yield, a quote, a comparison).

**Do not:**

- Send or build a custom overlay, image, SVG, float graphic, `data:image/…` URL, or ad-hoc HTML/CSS graphic onto `/present`.
- Call `present_action` with `{ "action": "overlay", "src": "…" }`. That `oneOf` arm remains in the schema (do not call it with `src`). Clearing an image already on screen is `overlay_clear` or `clear` — not the overlay+src arm.
- Save a custom HTML or image deck with `present_slide` to draw that graphic. `present_slide` save replaces the live deck for every device.

**Do:** Drive the projector only with built-in Present commands this server already supports.

1. One catalog symbol. Japan 10Y JGB Yield is market symbol `JP10Y` (no spoken alias). `present_send` text `show JP10Y` resolves to the app’s built-in **chart**. A macro catalog row resolves to the built-in **quote**. There is no `present_action` kind named `quote` or `chart`.
2. Two or more market symbols: `present_action` `compare` (optional `range`, `highlightFrom`, `highlightTo`). Example: `{ "action": "compare", "symbols": ["JP10Y", "^TNX"], "range": "YTD" }` (both are market-data rows).
3. Also built-in on `present_action`: `view`, `category`, `highlight`, `range`, `layout`, `fullscreen`, `page` (`next` or `prev` only), `clear`. A numbered page jump is `present_send` (for example `page 3`), which is `goto`. It is not a `present_action` kind.
4. If an image is already on the PDF, remove it with `overlay_clear` or `clear`, then show the built-in chart or compare. Do not fall back to a new graphic.

**Done:** `/present` is showing a built-in surface (chart, quote, compare, category, highlight, range, view, or a PDF page). Nothing you composed is on the screen.

✅ `present_send` `{ "text": "show JP10Y" }` for the Japan 10Y yield.

❌ `{ "action": "overlay", "src": "data:image/svg+xml;base64,…" }` or a PNG of yield numbers floated on the PDF. “The API accepts overlay, so a one-off chart is fine” is the path rejected on 2026-11-05.

**On failure:** If `show JP10Y` or `compare` does not put the figure on the projector, say so and stop. Do not fall back to an overlay, an uploaded image, or a custom HTML slide.

## Tools

| Tool | Auth | Purpose |
|------|------|---------|
| `present_status` | None | `GET /api/present-command` — projector heartbeat, `projectorLast`, `applied`, command slot |
| `present_send` | `PRESENT_API_KEY` | Natural language (`action: send`) with catalog from market + macro APIs |
| `present_action` | `PRESENT_API_KEY` | Built-in structured actions: `view`, `range`, **`category`**, `layout`, `fullscreen`, `highlight`, `compare`, `clear`, `page`, and **`overlay_clear`** (remove an image already on screen). `overlay` remains in the `oneOf` schema and must not be called with `src` — standing rule above. |
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
