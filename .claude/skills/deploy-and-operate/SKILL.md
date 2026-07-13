---
name: marketview-deploy-and-operate
description: Load before merging or pushing anything to main in marketview-index, when a deploy fails or behaves differently than local, when rotating PRESENT_API_KEY or any credential, when operating the /present projector for a live session, or when Vercel cron/function behavior is in question.
---

# MarketView — Deploy & Operate

Verified 2026-07-13. Production: marketindex.pmd-hk.com, Vercel, 720p projector as the
primary display surface.

## R1 — Push to main IS a production deploy; you are the CI

Trigger: about to merge a PR or push to main.
Facts: `.github/workflows/deploy.yml` runs on push-to-main and does checkout → Node 20 →
`vercel pull/build/deploy --prod`. It runs **zero tests, zero lint**. There is no
staging environment.
Steps (all before pushing):
1. `npm test` → all pass, zero skips.
2. `npm run lint` → clean.
3. If the change touches /present or the jargon pipeline: load the deployed preview or
   local dev of `/present` and eyeball one full playlist cycle (slide → index → heatmap).
4. If the change touches api/: remember it never ran locally — plan a post-deploy probe
   (step R3) BEFORE pushing, since the first real execution is in production.
Done: all four green, then push.
✅ Good: "tests+lint pass; probed /api/market-data after deploy, source=live_api_cached."
❌ Real rationalization (this repo's history is full of single-line hotfix commits):
"it's a one-line change to a prompt string, no need to run the suite." PR #21's review
pass caught two regressions that self-review had missed.

## R2 — Deploy mechanics & secrets

GitHub secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`. Runtime env vars
live in Vercel project settings (see build-and-env for the full table). Two traps:
- `VITE_PRESENT_API_KEY` is baked at BUILD time — rotating `PRESENT_API_KEY` server-side
  without a rebuild bricks slide saves (401s) until the next deploy.
- CI builds on Node 20; local is 25.x. No incident recorded from the gap
  (`unverified` risk) — but don't use Node-25-only APIs in api/.

## R3 — Post-deploy verification probes (api/ code never ran before prod)

Run after any api/-touching deploy. Domain marketindex.pmd-hk.com is from project
memory, not derivable from the repo — confirm before hardcoding it anywhere new.
```bash
curl -s https://marketindex.pmd-hk.com/api/market-data | head -c 300   # expect success:true + source field
curl -s https://marketindex.pmd-hk.com/api/market-news | head -c 300
# NOTE: the POST below is NOT read-only — it consumes Gemini/NIM quota and, on
# success, writes a 30-day prod cache entry under jargon:content:{lang}:{sha}
# (content-keyed, cannot collide with real slides). Acceptable as a one-shot
# post-deploy smoke; don't loop it.
curl -s -X POST https://marketindex.pmd-hk.com/api/explain-jargon -H 'Content-Type: application/json' -d '{"text":"The fund duration is 4.2 years with 50 basis points spread over benchmark EBITDA margin.","lang":"en"}' | head -c 400
```
The GETs are normal operation (may trigger an on-miss fetch + cache write — that's the
design). (`unverified`: exact response bytes — endpoints require live services; shapes
per architecture-contract Invariant 7 / ai-jargon-pipeline R2.) Watch Vercel function
logs for the first minutes (see debugging-playbook "Reading Vercel logs"); "NIM call
failed" on vision 200s is benign (debugging-playbook S2).

## R4 — Cron

`vercel.json` schedules `30 1 * * *` UTC (= 09:30 HKT) → `/api/cron/update-market-data`.
State 2026-07-13: that handler is an UNCOMMITTED in-flight fix (untracked api/cron/ +
edits making `fetchAllIndices`/`CACHE_KEY` exported); until it deploys, the cron 404s
daily and market data refreshes purely on-demand (which works — TTL+throttle). If you
touch this area, coordinate with the in-flight work; don't parallel-fix. Cron requests
authenticate via `Authorization: Bearer $CRON_SECRET`.

## R5 — Operating the projector (/present)

- Kiosk: fullscreen (F) + 5s idle hides chrome and cursor. Playlist (P) cycles
  slide/index/heatmap views at the configured dwell (default 45s). J toggles jargon
  cards. PageUp/PageDown are reserved for presentation clickers → PDF page flips.
- 720p rules: UI sizing in this repo deliberately uses `em`/`vmin`/`clamp()` so cards
  hold physical size across resolutions (PR #24). New /present UI must follow suit —
  fixed-px sizing regressed twice (#21 heatmap height, #24 jargon fonts).
- The controller surface is `/present-control` (separate tab/device); slide state syncs
  through R2 via `useSlideSync` (remote wins if `updatedAt` newer, 800ms save debounce).
- Live-session incident posture: prefer toggling the failing feature off (J for jargon,
  S for strip, P to stop cycling) over live-debugging in front of an audience.

Re-verify: `cd "/Users/yauch/Documents/market index/marketview-index" && cat .github/workflows/deploy.yml | grep -c "npm test" ; grep -n schedule vercel.json`
(expect: 0 test lines in workflow; one cron entry)
