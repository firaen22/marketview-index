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

## Repo layout

```
api/            Vercel serverless functions (market data, AI, presenter endpoints)
src/            React app — routes at the top level, shared parts in components/ and hooks/
lib/            Code shared between api/ and src/
.claude/skills/ In-repo skill library: architecture invariants, debugging playbooks,
                caching rules, and a record of approaches already tried and abandoned
```

If you're picking this codebase up cold, start at `.claude/skills/START-HERE/`. It documents the invariants that are easy to break and the dead ends that are not worth rediscovering.
