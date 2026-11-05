# Present MCP — wiring audit (2026-11-05)

Scope: agent-facing **presenter remote** on production (`/api/present-command`, related slide/PDF/assist). Not glossary-session, cron, or read-only market APIs unless agents need them for control.

## MCP tools today (3)

| MCP tool | HTTP | Notes |
|----------|------|--------|
| `present_status` | `GET /api/present-command` | Returns projector, projectorLast, applied, commandSlot, serverTime. **Does not** surface GET `control` or `pageCommands`. |
| `present_send` | `POST` `action: send` | Auto-builds catalog from `market-data` + `macro-data`. Covers NLU intents (see below). |
| `present_action` | `POST` structured | oneOf: view, range, category, layout, fullscreen, highlight, compare, overlay, overlay_clear, clear, page. |

## `POST /api/present-command` — coverage

| API `action` / path | MCP | How |
|---------------------|-----|-----|
| `send` (NLU) | **Yes** | `present_send` |
| `view`, `range`, `category`, `layout`, `fullscreen`, `highlight`, `compare`, `overlay`, `clear`, `page` | **Yes** | `present_action` |
| `overlay` + `clear: true` | **Yes** | `present_action` `overlay_clear` |
| **`assist`** (text / vision NIM) | **No** | No MCP tool; use HTTP POST or `/present-control` |
| GET **`control`** telemetry | **No** | Not in `present_status` payload shaping |
| GET **`pageCommands`** queue | **No** | Page **writes** via `present_action`; queue drain not exposed |

## NLU intents reachable via `present_send` (not separate MCP tools)

Deterministic / NIM parse → same as Copilot: `chart`, `compare`, `quote`, `view`, `clear`, `page`, `goto`, `jargon`, `cycle`, `range`, `explain`, `highlight`. No separate MCP per kind (by design).

## Adjacent presenter APIs — not wired

| API | MCP | Typical agent need |
|-----|-----|-------------------|
| `GET/POST /api/present-slide` | **No** | Deck edit / mode sync |
| `POST /api/present-pdf` (R2 presign) | **No** | PDF upload pipeline |
| `GET /api/market-data`, `macro-data` | **Indirect** | Catalog fetch inside `present_send` / highlight / compare only |

## Gaps (should-fix if “all functions” means full presenter surface)

1. **`present_assist`** — POST `action: assist` (40–6000 char text; optional vision: `imageBase64`, `slideId`, `deckKey`).
2. **`present_slide_get` / `present_slide_save`** (or one `present_slide` with `get|save`).
3. **`present_status` enrichment** — pass through `control`, `pageCommands`; extend `PresentAppliedState` types for `category`, `view`, etc. (client already parses these).
4. **Optional** `present_catalog` — expose catalog for debugging or custom send.
5. **Out of scope** unless product asks: `glossary-session`, `present-pdf` multi-step upload.

## Runtime note (PR #92 retest)

Category **API + MCP** can succeed while **ack fails** if `/present` misses embed `mv-present-ready` (fixed in app branch: `mv-present-ping` + poll bump — not an MCP gap).

## Oracle (MCP package on main)

```bash
cd mcp && npm test && npm run lint && npm run build
```

## Update 2026-11-05 (mcp 0.2.0)

Gaps 1–3 closed: `present_assist` (text + vision), `present_slide` (`get|save`), `present_status.control`; `PresentAppliedState` extended (view/density/fsMode/symbol/range/category).
**Correction:** `pageCommands` is only returned to keyed projector reports (`api/present-command.ts` `nextProjector ? readPageCommands() : []`), so it is intentionally not surfaced — an MCP GET always sees `[]`.
Still out of scope: `present-pdf` upload, `glossary-session`, `present_catalog`.
Responsiveness: per-request timeouts, ack schedule 700/700/1000/1500×5, non-fatal ack errors, catalog prewarm + stale fallback. Proof: `mcp/src/wiring.e2e.test.ts` (21 tests; 3 mutations shown red).
