# Uncertainty Register — marketview skill library

Everything deliberately NOT settled, quarantined from the confident content.
Each item ends in a safe default. Buckets per skill-authoring convention.
Compiled 2026-07-13.

## env-dependent / user-must-provide

- **`npx vercel dev` as a local api/ runtime** — never scripted, documented, or observed
  working in this repo; needs `vercel link` + env pull. Safe default: treat api/ as
  deploy-only; probe handlers via `test/*.js`-style direct invocation.
- **Post-deploy probe responses (deploy-and-operate R3)** — commands are shaped from
  code-verified contracts but were not executed against production in this session
  (author chose not to touch prod). Safe default: the GET probes are normal operation
  (may trigger an on-miss fetch + cache write — that's the design); the jargon POST
  consumes quota and writes a 30-day content-keyed cache entry — one-shot only. Treat
  unexpected response shapes as a real incident.
- **Production domain marketindex.pmd-hk.com** — from project memory (2026-07),
  not derivable from the repo (Vercel config lives server-side). Safe default: confirm
  with `vercel project` or the user before hardcoding it anywhere new.
- **`APP_URL` env var** — declared in .env.example as AI-Studio-injected; no reader
  found in src/api/lib. Whether the Vercel platform or a dependency consumes it is
  unverified. Safe default: leave it set; don't build on it.

## will-go-stale — re-verify before relying (all dated 2026-07-13 unless noted)

- **Model IDs and orderings** (`gemini-3.5-flash-lite`/`2.5-flash-lite`; NIM text/vision
  lists) — Gemini retirements already killed chain legs twice (#7/#8). Safe default:
  live-probe every ID before editing a chain (ai-jargon-pipeline R3).
- **Measured latencies** (vision 16–60s swings, healthy 5–9s, hedge 10s, timeout 50s)
  — measured 2026-07-11 on then-current NIM. Safe default: re-measure before retuning
  any constant; never retune from the old numbers alone.
- **Worktree in-flight state** (untracked api/cron/, modified README.md +
  api/market-data.ts) — snapshot of 2026-07-13 17:10 local. Safe default: `git status`
  first; if clean, the START-HERE triage note and deploy-and-operate R4 state are stale.
- **Test count 113 / suite timing / line numbers cited in skills** — drift with every
  commit. Anchors (identifiers, key names) are the stable part.

## confirmed-contradiction — awaiting owner decision

- **CI gates nothing vs. the repo's own review discipline** — deploy.yml tests nothing
  while the PR history institutionalizes pre-merge review sweeps. Adding a test job to
  deploy.yml is a 10-line change but alters the user's solo push flow. Safe default:
  follow deploy-and-operate R1 (local gates); PROPOSE the CI job, don't ship it unasked.
- **`vite.config.ts` injecting `GEMINI_API_KEY` into the client bundle** — scaffold
  leftover vs. latent key-leak if that var is ever set at build time. Safe default:
  never set `GEMINI_API_KEY` in the build env; removing the define is a small,
  user-approvable PR.
- **README staleness** — partially fixed by the in-flight worktree edits. Safe default:
  trust code; don't independently rewrite README while the user's edit is uncommitted.

## not-yours-to-decide

- **Whether market-news should also get Gemini-primary treatment** — asymmetry is a
  recorded decision (3c20d04). Safe default: keep NIM-only for news.
- **Resuming the Podcast Factor Monitor** (`origin/claude/eager-meitner-zsy119`) —
  abandoned residue. Safe default: don't resume without explicit direction.

## locally-unverifiable

- **Vercel bundling behavior** (underscore-file exclusion, ESM resolution) — only
  observable via deploy. Documented from incident commits 26a29e3/bdc031e. Safe
  default: obey the lib/+`.js` rule; expect tsc/vitest to be blind here.
- **Node 20 (CI build) vs Node 25 (local) divergence** — no recorded incident. Safe
  default: avoid Node >20-only APIs in api/ code.
