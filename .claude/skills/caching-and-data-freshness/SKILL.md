---
name: marketview-caching-and-data-freshness
description: Load when touching any Redis get/set in marketview-index api/ or lib/redis.ts, any localStorage cache in src/, any TTL value, or when the observed symptom is stale dashboard numbers, a frozen-data banner, data that "won't update", a cache that keeps serving a bad/empty result, or a proposal to add caching to a new endpoint.
---

# MarketView — Caching & Data Freshness

Verified 2026-07-13 at 6feeff2 (key table compiled by a discovery agent with file:line
citations, then spot-checked by grep and independently re-verified line-by-line in
review). TTLs and key names are volatile — re-verify before quoting.

## Redis key table (complete as of 2026-07-13)

| Key | TTL | Writer / Reader |
|---|---|---|
| `global_market_cache_yfinance_v1_{1M\|3M\|YTD\|1Y}` | 1h | api/market-data.ts |
| `refresh_throttle_global_market_cache_yfinance_v1_{range}` | 60s | api/market-data.ts |
| `global_macro_data_v3` | 24h | api/macro-data.ts |
| `refresh_throttle_global_macro_data_v3` | 60s | api/macro-data.ts |
| `global_market_news_v1` / `..._zh-TW` | 15min; **60s if AI summary failed** | api/market-news.ts |
| `refresh_throttle_global_market_news_v1[_zh-TW]` | 60s | api/market-news.ts |
| `jargon:slide:{lang}:{sha256(slideId)}` | 30d | api/explain-jargon.ts |
| `jargon:content:{lang}:{sha256(t:text\|i:b64)}` | 30d | api/explain-jargon.ts (no-slideId fallback) |
| `verify_key_rl_{ip}` | 60s | api/verify-key.ts (rate limit 5/min) |

Client localStorage (not Redis): `marketflow_settings` (single settings object, legacy-key
migration in src/settings.ts), `marketflow_cache_{range}_{lang}` (last good market payload).

## Rules

### R1 — `redis` is nullable; every caller handles null
Trigger: importing `redis` from lib/redis.ts in a new or edited handler.
lib/redis.ts exports `null` when env is missing/invalid (requires https URL). Every
handler that imports redis guards it (5 of 9 handlers import it, as of 2026-07-13).
Cache READ failures must fall through to a fresh fetch,
never fail the request (pattern: explain-jargon.ts:250–265, try/catch + warn).
Done: your code path works with `redis === null` (grep your diff for unguarded `redis.`).

### R2 — Never cache a failure, an empty AI result, or an unvalidated payload
Trigger: writing any `redis.set` / localStorage write on a code path that can carry an
error, an empty model output, or a partial fetch.
History (3 separate incidents): useJargon cached fetch failures as empty → permanent
blank cards (#19); a failed AI news summary cached 15min → cut to 60s (#10, market-news.ts:187);
corrupt Redis JSON threw on every read until TTL expiry (#19 — wrap parse, treat as miss).
Steps: cache only validated, non-empty successes; on parse failure treat as miss and
overwrite; failures get either no cache entry or a short (≤60s) negative TTL, chosen
explicitly.
Done: point to the guard line in your diff for each write.
✅ Good: `if (cacheKey && terms.length > 0) redis.set(...)` (explain-jargon.ts:319).
❌ Bad rationalization (observed in this repo's history, fixed in #19): "cache whatever
came back — empty is a valid result and saves an API call." On a 30-day TTL that locks a
transient vision flake into a permanent wrong answer.

### R3 — Scope cache keys so one path's failure can't poison another
Trigger: two code paths (text/image, en/zh, ranges) sharing one cache key.
History: jargon client cache keys carry the path (`#text`/`#image`) so an image-path
failure can't suppress a text-path success (5346fb9); market/news/macro keys carry
range/lang variants.
Done: enumerate the dimensions of your data; each dimension that can fail independently
is in the key.

### R4 — Freshness ladder for market-facing data (don't invent a new one)
The established ladder: fresh Redis hit → on-miss/refresh live fetch (60s throttle key
prevents stampede/API hammering) → live fetch fails: serve stale Redis with
`source:'server_stale_cache'` → client shows frozen banner (useDashboardData.ts:84) →
server unreachable: device localStorage fallback → nothing: error UI. Never mock data.
Trigger for the banner path: user reports "dashboard frozen/old numbers" — that is the
ladder WORKING; diagnose the upstream fetch (Yahoo/FRED), not the banner.
Done for changes: every rung still reachable; `source` field values preserved (client
special-cases `server_stale_cache` and `success:false`).

### R5 — Bump the version suffix instead of migrating shapes in place
(convention, no incident recorded — inferred from the existing `_v1`/`_v3` suffixes)
Trigger: changing the SHAPE of a cached payload.
Existing precedent: `_v1`, `_v3` suffixes; readers `JSON.parse` blindly, so an old-shape
payload under the same key throws or renders wrong until TTL.
Steps: rename key with version bump; old keys age out via TTL.
Done: no reader can receive the old shape under the new key name.

Re-verify: `cd "/Users/yauch/Documents/market index/marketview-index" && grep -rn "CACHE_KEY\s*=\|refresh_throttle\|jargon:slide\|jargon:content\|verify_key_rl" api/ lib/ | grep -v test`
