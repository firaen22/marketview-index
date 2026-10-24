# MarketView Index

A bilingual (繁體中文 / English) market dashboard built for **live client briefings** — it runs on a projector, not just a desktop. Alongside the usual quotes and charts, it drives a presenter-controlled projector view, explains financial jargon on screen with AI, and hands the audience a QR-code glossary they can follow on their phones.

**Live:** [marketindex.pmd-hk.com](https://marketindex.pmd-hk.com)

---

## What it does

Most of this repo exists to serve one scenario: someone standing in front of a room, presenting markets to clients who don't share their vocabulary.

- **Dashboard** — indices, FX, commodities, crypto and funds, with sparklines, a treemap heatmap, and AI-summarised market news.
- **Projector mode** — a separate presenter-controlled view (`/present`) driven from a phone or second screen (`/present-control`). Slide navigation, chart focus, highlighting, and range switching are all remote commands.
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

## Tests

```bash
npm test        # vitest — 623 tests across 70 files
npm run lint    # tsc --noEmit
```

## Presenter remote (agents)

`/present` is the projector. `/present-control` is a preview and editor on another screen — commands that “did nothing” were often applied on the projector while the control preview stayed on the PDF. The projector is a client that polls `GET /api/present-command` (and the slide GET); a newly opened or backgrounded tab is blank until JavaScript loads and can lag a command until the next poll. `highlight` emphasizes one market card on the index view. It is not a date band on a chart.

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

Parse time is the POST. The ack wait is the projector poll in `src/hooks/usePresentCommand.ts`. Idle `POLL_MS` is 2500 (about 24/min). The poll that runs the command does not yet send the new id; `lid` goes out on the next poll, which is `FAST_POLL_MS` 1000 for 60 s after that delivery. Each of those polls is one ~300 ms GET. That wait is the 2.1–3.6 s operators feel.

Leave both intervals. `RATE_LIMIT_MAX` is 90/min per IP (`api/present-command.ts`), budgeted as this projector poll plus the control page’s ~15/min assist poll (`usePresentAssist`, 4000 ms) on one office NAT. The ack check in `CopilotBar` adds a separate 1500 ms loop (at most 8 tries) only while it waits for `lid`. A shorter idle poll is a product call: the number lives only in the client, and the ~24/min figure is 60/2.5.

Same session, these checks passed: QQQ is in market-data; H01 and QQ aliases resolve; one-shot compare+YTD works; the highlight window works via the text suffix and via `action:"compare"`; an overlay action stays in PDF mode. A bare send with no catalog returns `invalid_catalog`.

`GET` or `POST /api/present-slide` returns `{ "success": true, "slide": { "mode", "content", "updatedAt" } }` — the slide is nested under `slide`. PDF object keys must be passed through exactly as issued (`/api/pdf-proxy?key=` plus the literal key). Underscores in that key are part of the string; rewriting or “normalizing” it fails the allowlist.

**Viewport (observed 2026-10-24).** Live unauthenticated `GET`s on `https://marketindex.pmd-hk.com`, checked against the poll code. The browser viewport is not on the present API. This note records the gap. It does not add the fields.

- Scaling stays in the browser. `/present` and `/` mount `useViewportScale` (`PresentationPage`, `Dashboard`). `src/index.css` then sets `font-size: clamp(16px, calc(100vmin / 67.5), 32px)` on `html.mv-viewport-scale`. `100vmin` is the shorter side of the layout viewport, the same box as `window.innerWidth` and `window.innerHeight`. `GlossarySessionPanel` reads those two `window` fields for the QR. `screen.width` and `screen.height` are not read. None of this is sent.
- The projector poll (`presentCommandPollUrl` in `src/hooks/usePresentCommand.ts`) sets `st`, `mode`, `page`, `v`, optional `lid`, and `ack`. `ProjectorState` is `mode`, `page`, `v`, `at`, and optional `lid`. The authenticated `st=1` report writes that object. It does not include a width or a height.
- A plain `GET /api/present-command` returned `success`, `command`, `serverTime`, `pageCommands`, and `projector: { mode, page, v, at }` (optional `lid`; this sample had none). No `innerWidth`, `innerHeight`, viewport, or screen fields.
- `GET /api/present-slide` returned `success` and `slide: { mode, content, updatedAt }`.
- No other `api/present-*.ts` route returns a resolution. `/present-control` reads projector state (`usePresentAssist` → `fetchProjectorState`) and does not report its own viewport. It does not mount `useViewportScale`.

**Ask.** On the poll cadence, have `/present` and ideally `/present-control` POST `window.innerWidth` and `window.innerHeight`, and ideally `screen.width` and `screen.height`, to the present API. Persist them with projector state (or an adjacent key) and include them on the unauthenticated `GET /api/present-command` `projector` object, so a remote reader can see the browser viewport. Keep that POST behind `x-api-key`, the same header as today’s present writes. Do not put the key in the repo. Those two pages are different boxes: if both report, keep the numbers distinct so a control-page poll does not replace the projector viewport. Stay inside the 90/min NAT budget in the speed note: use the existing cadence, not a tighter loop.

## Repo layout

```
api/            Vercel serverless functions (market data, AI, presenter endpoints)
src/            React app — routes at the top level, shared parts in components/ and hooks/
lib/            Code shared between api/ and src/
.claude/skills/ In-repo skill library: architecture invariants, debugging playbooks,
                caching rules, and a record of approaches already tried and abandoned
```

If you're picking this codebase up cold, start at `.claude/skills/START-HERE/`. It documents the invariants that are easy to break and the dead ends that are not worth rediscovering.
