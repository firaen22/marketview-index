# Present remote latency fix — implementation plan (v2.4)

Status: **Dual PLAN_PROCEED** — Sol 6.1 (v2.4 gate); Grok 4.7 (v2.4.1 ack budget). Ready to **implement P0+P1**.

---

## Prior finding resolution (audit trail)

| ID | Issue | v2.3 resolution |
|----|-------|-----------------|
| v1 F1 | Idle-only rate math | In-talk table ~80/min |
| v1 F2 | 750×10 ack window too short | **Rejected:** 750 ms, **10 attempts**, first `tick()` immediate → **(10−1)×750 ms = 6.75 s** waits (below today's 10.5 s). **Not shipped.** |
| v1 F3 | Missing tests | T1–T13 + limiter 90/91 |
| v1 F4 | Hook comment stale | **P0 deliverable:** update `usePresentCommand.ts` header comment (lid + 50 ms flush + rate note) in same PR |
| v2 F1 | 429 gate / overlap | **Minute A worksheet** + **2** serial commands; merge blocked on 429 |
| v2 F2 | Backoff vs FAST conflict | **Scheduling table** only |
| v2 F5/F6 | null flush / extra tests | **T13** + bare/stateful rules |
| v2.1 Grok F1 | 3/min + 8 acks > 90 | **2 commands/min** staging contract |
| v2.2 Sol F2 | Minute B not reproducible | **Removed**; optional manual stress doc only |
| v2.2 Sol F3 | P2 body thin | **P2 options A/B** spelled out below |

---

## Problem / goal

Control ack **2.1–3.6 s** (README dry-run): slot runs on poll N; server `lid` on poll N+1 after **FAST_POLL_MS** (in-talk) or **POLL_MS** (idle). P0: one **50 ms** stateful follow-up when `getState()` was non-null at latch time.

---

## GET budget and merge gate

- **90 GET/min/IP** on GET `/api/present-command` (`presentcmd_rl`).
- Sustained: **~60** projector FAST + **~15** assist + **~5** display = **~80/min** before P0.

**P0 addition:** +**1** GET per successful slot execute (**one coalesced 50 ms timer**).

**CopilotBar (unchanged in P0/P1):** up to **8** GETs per non-page send if never confirmed; staging avoids this by waiting for **confirmed** between sends.

### Minute A — required staging (blocks P0+P1 merge)

On production/staging host, projector + control open, same NAT.

1. Send **command 1** (slot phrase).
2. Wait for Copilot **confirmed**. **Abort Minute A** if not confirmed within **4** ack GETs (~6 s of `pollAck` spacing at 1500 ms, plus the immediate first tick). **Abort** if not confirmed within **60 s**.
3. Wait **≥20 s**, send **command 2**; repeat step 2 for command 2.
4. Log GET `/api/present-command` for the 60 s window. **Zero 429.**

**Budget worksheet (worst case that still passes step 2):**

| Term | Count |
|------|-------|
| Baseline in-talk | 80 |
| P0 flushes | 2 |
| Ack GETs (2 commands × ≤4 each) | ≤ 8 |
| **Total** | **≤ 90** |

If either command needs a **5th** ack GET to confirm, **abort** Minute A (do not send the next command). Any **429** → do not merge P0/P1.

**Optional manual stress (not merge-blocking):** With projector in active window, issue two control-side `fetchProjectorState` GETs 1.5 s apart while a send is unconfirmed — informational only.

**Supported load after ship:** ≤ **2 slot commands/min** with ack settle between sends, unless a future staging run proves headroom.

---

## P0 — Lid flush

**File:** `src/hooks/usePresentCommand.ts` (+ **header comment** per v1 F4)

### Arm 50 ms (one coalesced timer)

Arm only when: **stateful** poll (`getState()` non-null for this request); **new** slot latched; not page-only-only.

**Bare poll** latched slot: **no** 50 ms; next **stateful** poll sends `lid` via existing `{ ...state, lid }` merge.

### When 50 ms timer fires

- If `getState()` **non-null:** stateful GET with **`lid`** + page **`ack`** params.
- If `getState()` **null:** **no GET this tick**; **reschedule same flush in 50 ms** (still one pending timer). Do not bare-fetch for flush. After **20** consecutive null-state flush ticks without a fetch, cancel flush reschedule and use **normal FAST/idle** timer (next stateful poll sends `lid`).

### Scheduling table (after a completed poll)

| Outcome | Next timer |
|---------|------------|
| `ok: false` | **`presentCommandBackoffMs` only** |
| `ok: true`, no new slot latch | FAST if active else `POLL_MS` (1800) |
| `ok: true`, new slot on **stateful** poll | Coalesced **50 ms** |
| `ok: true`, new slot on **bare** poll | FAST/idle only |

Clear prior timeout before arming. No recursive `run()` while `inFlight`.

### Tests (`usePresentCommand.hook.test.ts`)

| ID | Case | Expect |
|----|------|--------|
| T1 | Stateful slot success | 50 ms once → FAST/idle |
| T2 | Flush poll same id | No re-execute |
| T3 | `onCommand` false | No flush; no id latch; if `delivered`, next **1000 ms** not 50 ms |
| T4 | Page-only | No flush; FAST if active |
| T5 | Stateful flush URL | `lid` + `ack` when pending |
| T6 | Flush `ok: false` | Backoff; later ok poll sends same `lid`/acks |
| T7 | Bare poll latches slot | No 50 ms; next stateful URL has `lid` |
| T8 | Two slots before flush | One coalesced 50 ms, latest id |
| T9 | Stateful flush response executes new slot | One replaced 50 ms |
| T10 | Unmount before 50 ms | No fetch after teardown |
| T11 | `inFlight` | No overlapping polls |
| T12 | `online` / visibility wake | Clears timer; one `pollNow` poll |
| T13 | 50 ms fires, `getState()` null | No GET; 50 ms reschedule; state returns → stateful `lid`; 20 null ticks → FAST/idle |

Plus **90th/91st** GET limiter test in `api/present-command.test.ts`.

---

## P1 — Same PR

`POLL_MS` **1800**; `FAST_POLL_MS` **1000**; README presenter-remote + hook comment.

---

## P2 — Separate PR (not P0/P1)

| Option | interval | attempts | Wait budget | Ship |
|--------|----------|----------|-------------|------|
| **A (default)** | **1500 ms** | **8** | **7 × 1500 = 10.5 s** | No P2 PR required |
| **B (optional)** | **750 ms** | **15** | **14 × 750 = 10.5 s** | Only after Minute A pass **with B enabled** + zero 429 |

Confirm on **`applied.id` OR `projector.lid`**. **`kind === 'page'`** skips `pollAck`.

---

## Verification

```bash
cd marketview-index && npm test -- --run src/hooks/usePresentCommand.hook.test.ts api/present-command.test.ts
npm run lint
```

+ Minute A staging.

---

## Pre-commit (code)

Sol + Grok **PROCEED** on diff vs this plan.

## History

| Ver | Gate |
|-----|------|
| v2.2 | PLAN_FIX |
| **v2.3** | PLAN_FIX |
| **v2.4** | Sol PLAN_PROCEED; Grok PLAN_FIX (late ack GETs) |
| **v2.4.1** | Ack ≤4 GETs per command in Minute A |
