# Present remote helpers: last-known projector, applied ack, index control

Operator problem (2026-10-24, PR #87): Grok Bot polls world-readable `GET /api/present-command` to see whether index cards are on screen. When `/present` stops authenticated `st=1` polls, `present:pstate:v1` expires in 15 s → `projector: null`. `lid` and mode disappear; the `command` slot (120 s TTL, not cleared on apply) is not proof of index on screen.

**Revision 3.2 (2026-10-24):** Phase 1 server path implemented in-tree (`lib/presentRemoteRedis.ts`, `api/present-command.ts` GET canonical read + Lua `commitProjectorReport`; `storeCommandIfFresh` writes cmdmeta). `npm test` 1070 green. Re-review Round 4 pending.

Context: viewport telemetry per `docs/present-viewport-plan.md`. No extra POST on the projector poll loop.

## Principles

1. **Live vs last-known** — `projector` = heartbeat (15 s TTL). `projectorLast` = last snapshot with `stale` + `ageMs`; never overload live `projector` with `stale`.
2. **One projector write path** — Last-known, applied, and live state only on authenticated valid `nextProjector` (same gate as today’s `present:pstate:v1` write).
3. **Stable GET keys** — Always return `projectorLast` and `applied` (`null` when absent).
4. **Command slot** — Single slot, 120 s TTL, not cleared on apply. Bots use `applied`, not queue alone.
5. **Bot sequencing** — One absolute command in the slot at a time. After each POST, poll until `applied.id === command.id` (Phase 1) before the next POST; **bounded wait** (e.g. 30–60 s) then surface failure / superseded command (Sol R3F4). Required for `view index` → `layout` → `fullscreen enter`.
6. **Fail soft** — Bad auxiliary JSON ignored; bad optional `display.fs` drops only `fs`, not whole `display`.

## GET shape (additive)

```json
{
  "success": true,
  "serverTime": 1730000002000,
  "projector": {
    "mode": "index",
    "page": 1,
    "v": 42,
    "at": 1730000000000,
    "display": { "schema": 1, "iw": 1280, "ih": 720, "dpr": 2, "fw": 631, "fh": 400, "fs": 0 }
  },
  "projectorLast": { "...": "same shape as stored last key; fs only trustworthy while heartbeat live" },
  "applied": {
    "id": "cmd-uuid",
    "kind": "layout",
    "density": "compact",
    "at": 1729999975000
  },
  "command": null,
  "control": null,
  "pageCommands": []
}
```

**`display.fs` contract (P4F6):** Integer `0` or `1` in JSON (query `fs=0` / `fs=1`, not scaled like `dpr`). Invalid `fs` → omit field only. Omit on old clients. Bots use **live** `projector.display.fs` only (P4F3).

**`projectorLast` presentation:** `stale` and `ageMs` are **computed at GET** (`ageMs = max(0, serverTime - at)`; `stale = live key absent`), not stored in Redis (Grok R3F7).

## Redis

| Key | TTL | Writer | Purpose |
|-----|-----|--------|---------|
| `present:pstate:v1` | 15 s | authed valid `nextProjector` | live heartbeat |
| `present:pstate:last:v1` | 24 h | **atomic with live** | last-known snapshot |
| `present:cmdmeta:v1:{id}` | ≥ 300 s | **before or with** command visibility | allowlisted meta (below) |
| `present:applied:v1` | 24 h | authed `nextProjector` + matching `lid` | idempotent applied ack |
| `present:pcontrol:v1` | 15 s | control surface | `{ at, display }` only |

### Live + last write (P4F1 / R4)

Use one **Lua** script (or Redis `MULTI`/`WATCH` with `at` compare) so live and last update together and only when `incoming.at >= stored.at`:

```text
-- Pseudocode (Rev 3.1):
stored_at = max(live.at if live else 0, last.at if last else 0)
IF incoming.at >= stored_at THEN SET live EX 15 AND SET last EX 86400 (same JSON, no stale/ageMs in Redis)
ELSE no-op
-- Bootstrap: if last key missing, treat stored_at as 0 (first write always wins).
-- GET must return the **accepted Redis snapshot**, not the losing poll’s in-memory nextProjector (Sol/Grok R3F1).
```

Test: overlapping polls A/B, failed mid-write, unauth `st=1` writes nothing.

### cmdmeta + applied (P4F2 / R1)

**cmdmeta** (allowlisted, world-readable once on `applied`):

| kind | Fields stored |
|------|----------------|
| `view` | `view` |
| `layout` | `density` |
| `fullscreen` | `fsMode` (`enter` \| `exit` only) |
| `highlight` | `symbols[0]` as `symbol` |
| `range` | `range` |
| others | existing chart/compare fields as today |

Write **cmdmeta inside** the same `storeCommandIfFresh` EVAL **after** `issuedAt` wins — never before supersede check (Grok R3F6).

**applied:** Update only inside the **same compare-and-set** as the winning projector write when `lid` matches cmdmeta. **Same `id`:** keep first `at`, do not refresh TTL (R2). **Different `id`:** only if `incoming.at >= applied.at` (or tied to winning snapshot `at`) so delayed polls cannot regress B→A (Sol/Grok R3F2). Gate: only when `nextProjector` valid (R5).

## Bot index control (Phase 4 + structured POST)

Structured POST actions (auth key): `view`, `layout`, `range`, `highlight`, `fullscreen` — same slot as `send` / `compare`.

| Action | Body | Projector effect |
|--------|------|----------------|
| `view` | `{ "view": "index" }` | `setMainView('index')` |
| `layout` | `{ "density": "auto" \| "comfortable" \| "compact" }` | `postMessage` `{ type: 'mv-density', density }` to `/?embed=1` |
| `range` | `{ "range": "YTD" }` | index time range |
| `highlight` | `{ "symbol": "^HSI", "catalog"? }` | card emphasis |
| `fullscreen` | `{ "mode": "enter" \| "exit" }` | **no `toggle` on API** (P4F4/P4F5) |

**Layout (P4F7):** Executor returns `false` until index iframe loaded (retry next poll). Resolve `auto` on projector before `postMessage`; send **`comfortable` or `compact` only** to embed (Grok R3F5). Density tiers only affect embed/presentation paths in `Dashboard`.

**Fullscreen (P4F3/P4F4):** Executor calls `requestFullscreen` only when `mode === 'enter'` and no `fullscreenElement`; `exitFullscreen` only when `mode === 'exit'`. Return **`true` (ack) when already in target state** (enter while fullscreen, exit while windowed) so the slot does not retry until TTL (Grok R3F4). Local **F** keeps `toggleFullscreen`. Denial otherwise observed via live `display.fs`.

**Chaining example:**

```text
POST view index → poll until applied.id matches
POST layout compact → poll until applied.id matches
POST fullscreen enter → poll; check projector.display.fs (may stay 0 if activation denied)
```

## Phases

### Phase 0 — README (PR #87)

Gap note + proposed contract.

### Phase 1 — Server last-known + applied

Lua paired live/last; cmdmeta; GET `projectorLast` / `applied`; tests: overlap, unauth `st=1&lid`, idempotent applied.

### Phase 2 — Control UI mirror (optional)

Strip uses `projectorLast` when live null; mode echo read-only from last key.

### Phase 3 — Docs (ship with Phase 4 code)

README table: live `projector.mode`, `projectorLast`, `applied`, `command`; bot sequencing; `fs` live-only; no OS resize.

### Phase 4 — Index layout + remote fullscreen

- Commands: `layout`, `fullscreen` (`enter`/`exit`).
- Embed bridge: `mv-density`.
- Telemetry: `display.fs` 0/1 on projector poll.
- Tests: parse/validate; API POST; executor retry before iframe; fullscreen enter/exit guards; denied-fs manual note.

**In-tree (Rev 3):** Structured POST + `mv-density` + remote enter/exit (toggle removed from API).

## Non-goals

- OS window resize / monitor move; remote `fullscreen` `toggle`; `/api/present-status`; clearing command on apply.

## PR sequence

```text
PR #87 README → Phase 1 server → Phase 2 UI → Phase 4 index/fullscreen + Phase 3 docs in same PR as Phase 4
```

## Review history

| Round | Sol | Grok | TypeSafe |
|-------|-----|------|----------|
| 1 Phases 1–3 | FIX F1–F5 | FIX F1 | jev-1.14 on H/R rows |
| 2 Phase 4 draft | FIX F1–F9 | FIX F1–F8 | P4F1–P4F8 |
| 3 Rev 3 → 3.1 | FIX F1,F2 (+ warns) | FIX F1,F2 (+ warns) | adequacy scores below |
| 4 Rev 3.2 + Phase 1 code | **PROCEED** (sol-r4e) | **PROCEED** (grok-r4b) | re-rate optional |
| 5 Pre-commit ship (full plan) | **PROCEED** (sol-ship6) | **PROCEED** (grok-ship4) | see below |

### Round 3 reviewer notes (folded into 3.1)

| ID | Sol/Grok | Topic |
|----|----------|--------|
| R3F1 | both blockers | GET returns canonical Redis; applied ordering across ids |
| R3F2 | Grok | Empty `last` bootstrap; applied inside winning CAS |
| R3F3–F7 | Grok warns/nit | `fs` wire, fullscreen no-op ack, resolved density on wire, cmdmeta after supersede, GET-time stale/ageMs |

### TypeSafe fix adequacy (Rev 3 plan text, jev-1.14.0)

P(adequate to code from) per original finding — run after 3.1 text:

| ID | adequate_p | Note |
|----|------------|------|
| P4F1 | 0.48 → **re-rate R4** | Lua + `commitProjectorReport` in `presentRemoteRedis.ts`; GET reads Redis after write |
| P4F2 | 0.38 → **re-rate R4** | cmdmeta on POST; applied inside commit script when `lid` + meta present |
| P4F3 | 0.39 | Documented |
| P4F4 | 0.38 | Code: enter/exit + no-op ack |
| P4F5 | 0.39 | Bot doc + bounded wait in plan |
| P4F6 | 0.47 | Spec only; `fs` not wired |
| P4F7 | 0.41 | Code: `mv-density` + resolved tier |
| P4F8 | 0.36 | Partial tests |
| R3F1 | 0.35 → **re-rate R4** | Code: post-commit `readProjectorState` / `readProjectorLastState`; losing poll not echoed as live |
| R3F2 | 0.40 → **re-rate R4** | Bootstrap `stored_at=0`; applied branch in same Lua as live/last |

**Round 4 (2026-10-24):** Dual **PROCEED** after ack-at race fix (`buildAppliedFromMeta(..., nextProjector.at)`), Lua `pcall` on decode, GET `responseTime` + clock-skew live window, cmdmeta fail-soft, test EVAL argv fix. Artifacts: `/tmp/present-remote-rev32-review-1792826325/`.

## Verification

`npm test` && `npm run lint` per PR. Phase 1 + Phase 4 checklists in sections above.
