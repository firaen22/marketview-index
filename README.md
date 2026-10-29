# MarketView Index

A bilingual (繁體中文 / English) market dashboard built for **live client briefings** — it runs on a projector, not just a desktop. Alongside the usual quotes and charts, it drives a presenter-controlled projector view (with **viewport telemetry** on the control screen), keeps the index embed readable at **720p** via container-based columns, explains financial jargon on screen with AI, and hands the audience a QR-code glossary they can follow on their phones.

**Live:** [marketindex.pmd-hk.com](https://marketindex.pmd-hk.com)

---

## What it does

Most of this repo exists to serve one scenario: someone standing in front of a room, presenting markets to clients who don't share their vocabulary.

- **Dashboard** — indices, FX, commodities, crypto and funds, with sparklines, a treemap heatmap, and AI-summarised market news.
- **Projector mode** — a separate presenter-controlled view (`/present`) driven from a phone or second screen (`/present-control`). Slide navigation, chart focus, highlighting, and range switching are all remote commands. Control can see the projector’s reported outer window, embed iframe size, and glossary session status (not the control laptop’s screen size).
- **Jargon explainer** — press a key and the on-screen term gets a plain-language card. Backed by a model chain with vision, so it works on decks that are pure images.
- **Audience glossary** — a QR code puts a live, per-session glossary on the audience's own phones (`/session/:code`); terms appear as the presenter covers them.
- **PDF decks** — upload a deck and present it inside the same view, so slides and live market data share one screen.
- **4K aware** — `/` and `/present` scale typography with display resolution, so the same build reads correctly on a 1080p laptop and a 4K projector.

## Routes

| Route | Purpose |
|---|---|
| `/` | Main dashboard — quotes, macro cards, heatmap, AI news |
| `/funds` | Fund performance, grouped by sub-category |
| `/heatmap` | Full-screen treemap (`?embed=1` for iframe embedding) |
| `/present` | Projector view — the screen the audience sees |
| `/present-control` | Presenter remote — slides, commands, macros |
| `/session/:code` | Audience-facing session glossary (QR target) |

## Stack

React 19 · Vite 6 · Tailwind 4 · React Router 7 · Recharts 3 · pdfjs-dist · Vercel serverless functions · Upstash Redis (Vercel KV) · Cloudflare R2 · Google Gemini (`@google/genai`)

## Getting started

**Requires:** Node.js 20+

```bash
npm install
```

Copy `.env.example` to `.env.local` and fill in the keys you need — see [Environment](#environment) below. At minimum you need the Redis (KV) pair for caching and a `GEMINI_API_KEY` for anything AI-driven.

```bash
npm run dev
```

> **Note:** `vite dev` serves the frontend only — it does **not** execute the `/api` routes, so the dashboard will have no market data. To develop against real data, either run the Vercel CLI, or temporarily proxy `/api` to a deployed instance by adding to `vite.config.ts`:
>
> ```ts
> server: {
>   proxy: { '/api': { target: 'https://marketindex.pmd-hk.com', changeOrigin: true } },
> }
> ```

## Environment

| Variable | Needed for |
|---|---|
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Redis cache (Vercel → Storage → KV). Most things degrade badly without this. |
| `GEMINI_API_KEY` | Jargon explanations, news summaries, presenter copilot |
| `FRED_API_KEY` | Macro cards (CPI, Core CPI, PPI, Core PPI) — [get one here](https://fredaccount.stlouisfed.org/apikey) |
| `CRON_SECRET` | Authenticates the daily cache pre-warm endpoint |
| `PRESENT_API_KEY` + `VITE_PRESENT_API_KEY` | Write access to the presenter endpoints. Both must be the same value; the `VITE_` one is baked in at build time. Unset = unauthenticated writes (dev only). |
| `CLOUDFLARE_R2_*` | PDF deck storage |

`.env*` is gitignored; only `.env.example` is tracked.

## Data and caching

Quotes come from Yahoo Finance (`yahoo-finance2`); macro series come from FRED. Everything is cached in Redis to keep request volume down and avoid getting IP-banned.

- **Cache:** one key per range (`1W`, `1M`, `3M`, `6M`, `YTD`, `1Y`, `5Y`), 1 hour TTL.
- **Pre-warm cron:** daily at 09:30 HKT (`30 1 * * *` UTC) via `/api/cron/update-market-data`.
- **On demand:** a cache miss, or `?refresh=true`, triggers a live fetch and write-back, behind a 60-second throttle lock.
- **Degradation:** if the upstream fetch fails, the frontend falls back to the last good cached payload and flags it as stale — it never invents mock data.

## Deployment

**Deploys happen through the Vercel Git integration: pushing to `main` deploys to production.** There is no staging environment and no test gate in front of it — run `npm test` and `npm run lint` yourself before merging.

> ⚠️ The `Deploy to Vercel` GitHub Action in `.github/workflows/deploy.yml` is **not the deploy path** and currently fails on every run (it has no `VERCEL_TOKEN` secret). A red ✗ from that workflow does not mean your deploy failed — check the Vercel dashboard instead.

Because the app is code-split, verifying that a change reached production by grepping `index.html` won't work — lazily-loaded routes live in their own chunks. Load the page and check the DOM.

## Presenter viewport telemetry

Phased plan, TypeSafe-style finding table, and architecture reviews (**gpt-6.1-sol** + **Grok 4.7**, 2026-10-24): `docs/present-viewport-plan.md`. **Remote helper last-known / applied ack** (PR #87 gap, follow-up spec): `docs/present-remote-helper-plan.md` (same review stack + TypeSafe **jev-1.14.0** ratings). Summary of what shipped (no `/api/present-status`, no extra POST on the poll cadence):

**Three layout boxes** (do not conflate them):

| Box | Where | What we measure |
|-----|--------|-----------------|
| Outer projector window | `/present` | `display.iw` / `display.ih` (`innerWidth` / `innerHeight`) |
| Index embed iframe | `/?embed=1` inside `/present` | `display.fw` / `display.fh` (`clientWidth` / `clientHeight` on the iframe document) — card grid and `100vmin` scaling apply here, not the outer window |
| Control device | `/present-control` | Separate Redis key `present:pcontrol:v1` via `st=1&role=control` |

- **Projector heartbeat** — authenticated `st=1` **GET** (`usePresentCommand`) adds optional `display` (`iw`, `ih`, `fw`, `fh`, `dpr`, optional `screenW`/`screenH`, `lang`, `fs` as `0`/`1` for fullscreen element). Stored in `present:pstate:v1` (15 s TTL). Invalid `display` fields are dropped individually; mode/page/`v`/`at`/`lid` still save. **Do not** add viewport on a separate POST — that bypasses the 90/min GET limiter and doubles traffic ([Sol/Grok PR #85 review](https://github.com/firaen22/marketview-index/pull/85)).
- **World-readable GET** — unauthenticated `GET /api/present-command` always returns `projector` (live heartbeat or `null`), `projectorLast` (last snapshot + `stale` + `ageMs`), `applied` (last command ack from `lid` + cmdmeta), and `command` (executable slot). Treat **live** `projector.mode` / `projector.display.fs` as on-screen truth; use `projectorLast` when the heartbeat expired. Bots: after each POST, poll until `applied.id === command.id` (bounded wait); do not infer index on screen from `command` alone.
- **Control UI** — telemetry strip reads `usePresentAssist`’s 4s poll (no second interval). Glossary audience status uses separate `/api/glossary-session` polls. Launch popup sizing uses `screen.availWidth` / `availHeight` on the **control** device only (hint for window chrome, not projector layout).
- **Server time** — clients never send `at`; the API stamps it on write.
- **Embed density** — container queries on the embed grid (~4 columns from ~960px iframe width) so 720p and Windows display scaling keep more cards visible without changing OS resolution.
- **Rate budget** — same NAT may run projector fast poll (~60/min), assist poll (~15/min), and control display report (~5/min) ≈ **80/min** under the **90/min** GET cap on `/api/present-command`.

## Tests

```bash
npm test        # vitest — 623 tests across 70 files
npm run lint    # tsc --noEmit
```

## Presenter remote (agents)

`/present` is the projector. `/present-control` is a preview and editor on another screen — commands that “did nothing” were often applied on the projector while the control preview stayed on the PDF. The projector is a client that polls `GET /api/present-command` (and the slide GET); a newly opened or backgrounded tab is blank until JavaScript loads and can lag a command until the next poll. `highlight` emphasizes one market card on the index view. It is not a date band on a chart.

**Poll contract (bots):** World-readable `GET /api/present-command` returns `projector` (live ≤15 s), `projectorLast` (last mode + `stale`/`ageMs`), `applied` (ack for the last executed command id), and `command` (slot). After each POST, poll until `applied.id === command.id` (or the control UI’s `projector.lid` matches) before chaining another command. Do not treat a non-null `command` alone as proof the projector is on index. Use **live** `projector.display.fs` for fullscreen (`0`/`1`); `applied` for `fullscreen enter` can be true while `fs` stays `0` if the browser denied activation — retry or read live telemetry only. `projectorLast.display.fs` is not trustworthy after the heartbeat expires. Remote control cannot resize the OS window or move monitors — use `layout` / embed density and fullscreen enter/exit only.

**Structured POST (index):** `{"action":"view","view":"index"}` · `{"action":"layout","density":"compact"|"comfortable"|"auto"}` · `{"action":"range","range":"YTD"}` (etc.) · `{"action":"highlight","symbol":"^HSI"}` · `{"action":"fullscreen","mode":"enter"|"exit"}` (no `toggle`).

Writes send `x-api-key: $PRESENT_API_KEY`. Do not put the key in the repo.

**Compare (native Index chart, preferred for quotes).** One POST sets symbols, period, and an optional date band. `action: "send"` with text `Hang Seng vs Nasdaq YTD` also parses as compare + `YTD` (that utterance used to return 422, so the workaround was a `range` POST and then a `compare` POST — the range must not be the later command).

```bash
curl -s -X POST "$ORIGIN/api/present-command" \
  -H "content-type: application/json" \
  -H "x-api-key: $PRESENT_API_KEY" \
  -d '{"action":"compare","symbols":["0P00000EBQ","^IXIC"],"range":"YTD","highlightFrom":"2026-05-01","highlightTo":"2026-08-31"}'
```

`symbols` are quote symbols, not spoken nicknames. `0P00000EBQ` is 駿利亨德森遠見基金 - 環球科技領先基金 (voice “H01”, including the misheard 俊利亨德森). `QQQ` is Invesco QQQ (voice “QQ”). `^IXIC` is Nasdaq Composite — use it only when you mean the composite, not the ETF. Spoken `H01` / `QQ` resolve on `action: "send"` when those rows are in the catalog the control page already sends. Pass `catalog` on `action: "compare"` to reject a symbol that is not on that list. The date band is a `ReferenceArea` on the open compare modal. The 2026-10-23 dry-run after PR #83 applied compare bands on production (the projector ack matched the command id); a later compare POST changes the window without another deploy. `highlightFrom` / `highlightTo` are inclusive `YYYY-MM-DD`. On `action: "send"`, the same window is a trailing suffix `highlight YYYY-MM-DD YYYY-MM-DD` (no word “to”). If the selected period (1W…5Y chips still work) does not overlap the window, the chart says so and draws no band.

**Overlay (image or SVG on the PDF, without leaving PDF mode).** This is the replacement for the HTML-slide workaround. Do not nest a PDF iframe in an HTML slide: that iframe does not paint inside the sandboxed `srcdoc` frame and the projector goes gray. Clearing the overlay does not change the saved slide.

```bash
curl -s -X POST "$ORIGIN/api/present-command" \
  -H "content-type: application/json" \
  -H "x-api-key: $PRESENT_API_KEY" \
  -d '{"action":"overlay","src":"https://cdn.example/chart.png","caption":"optional"}'

# remove only the image; the deck stays
curl -s -X POST "$ORIGIN/api/present-command" \
  -H "content-type: application/json" \
  -H "x-api-key: $PRESENT_API_KEY" \
  -d '{"action":"overlay","clear":true}'
```

`src` is `https://…` or a `data:image/(png|jpeg|webp|svg+xml);base64,…` URL, capped so the command stays under the API body limit. The image is centered at about 65% of the viewport. `{"action":"clear"}` also removes it, and closes the compare modal and other overlays, and returns the projector to the slide view. It does not upload a new deck.

**Speed (measured 2026-10-23, after PR #83).** External bot box, Asia/Hong_Kong, against `https://marketindex.pmd-hk.com`.

- `GET /api/market-data` ≈ 346 ms.
- `GET /api/present-command` poll ≈ 260–360 ms (average ≈ 321 ms over 5).
- `POST` structured compare or overlay clear ≈ 160–190 ms, HTTP 200.
- `POST` send with a highlight date suffix ≈ 368 ms, HTTP 200.
- Projector ack (wall time until `projector.lid` equals `command.id`): one-shot compare+YTD ≈ 2.8 s, structured compare with a May–Aug band ≈ 3.6 s, send+highlight ≈ 2.1 s, overlay clear ≈ 2.2 s (about 2.1–3.6 s).

Parse time is the POST. After P0, a successful stateful slot execute triggers one **`LID_FLUSH_MS` (50 ms)** follow-up poll so the server receives `lid` without waiting a full **`FAST_POLL_MS` (1000 ms)** tick. Idle **`POLL_MS` is 1800 ms** (~33/min). In-talk projector FAST stays **1000 ms** (~60/min for 60 s after delivery). **`RATE_LIMIT_MAX` is 90/min** per IP — budget ~80/min baseline (FAST + assist + control display) before flushes and CopilotBar ack GETs; see `docs/present-latency-fix-plan.md`. CopilotBar ack remains **1500 ms × 8 attempts** until a separate P2 change.

Same session, these checks passed: QQQ is in market-data; H01 and QQ aliases resolve; one-shot compare+YTD works; the highlight window works via the text suffix and via `action:"compare"`; an overlay action stays in PDF mode. A bare send with no catalog returns `invalid_catalog`.

`GET` or `POST /api/present-slide` returns `{ "success": true, "slide": { "mode", "content", "updatedAt" } }` — the slide is nested under `slide`. PDF object keys must be passed through exactly as issued (`/api/pdf-proxy?key=` plus the literal key). Underscores in that key are part of the string; rewriting or “normalizing” it fails the allowlist.

## Repo layout

```
api/            Vercel serverless functions (market data, AI, presenter endpoints)
src/            React app — routes at the top level, shared parts in components/ and hooks/
lib/            Code shared between api/ and src/
.claude/skills/ In-repo skill library: architecture invariants, debugging playbooks,
                caching rules, and a record of approaches already tried and abandoned
```

If you're picking this codebase up cold, start at `.claude/skills/START-HERE/`. It documents the invariants that are easy to break and the dead ends that are not worth rediscovering.
