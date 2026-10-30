# Present remote — Minute A validation + P2 CopilotBar plan (v1.7)

Status: **Dual PLAN_PROCEED** — Sol 6.1 + Grok 4.7 (v1.7).

**Context:** P0+P1 on `main` ([PR #90](https://github.com/firaen22/marketview-index/pull/90)). Parent: `docs/present-latency-fix-plan.md` (v2.4.1).

---

## Goals

| Track | Goal |
|-------|------|
| **Minute A (option A ack)** | One `presentcmd_rl_<IP>` bucket: **zero 429** from **T_first** through **T_first + 60 s**; two **slot** POSTs **≥20 s** apart; each **✓** on ack chain GET **1–4**; all ack GETs for **both** commands finish **before** that bucket expires. |
| **P2** | **A:** no PR. **B:** separate PR only after prod Minute A **PASS** on **A**, product go, and **B** preview Minute A **PASS** using **§ Ack option B** below. |

---

## Preconditions (**FAIL** if any fail)

| # | Rule |
|---|------|
| P1 | **Same public IP** for projector and control (one laptop or verified same egress). Split NAT ⇒ **FAIL**. |
| P2 | **Two browser windows** (not one window with tab switching): window **P** = `/present`, window **C** = `/present-control`. Both stay **visible** for the whole run (no minimizing P during POST on C — `visibilitychange` on `/present` runs `pollNow` and adds GETs). |
| P3 | Exactly one P tab and one C tab; no other `/api/present-command` clients on this IP. |

---

## Setup

1. Close all clients on this IP; wait **≥60 s** (Redis key expires).
2. Open blank tabs in **P** and **C**; DevTools → Network → filter `present-command` → **Preserve log** on **both**.
3. Navigate P → `/present`, C → `/present-control`.
4. **T_first** = timestamp of the **first** `GET /api/present-command` in either log (server TTL starts on first `INCR`; POSTs do not increment the limiter).

**Worksheet (informational, FAST in-talk):** ~**80** + **2** lid flushes + **≤8** ack GETs ⇒ **≤90**. The **80** includes ~60 FAST + ~15 assist (~**4 s**) + ~5 display (~**12 s**).

**429:** Any `GET` **429** from **T_first** through **T_first + 60 s** on **either** window ⇒ **FAIL**.

**Headroom note:** Idle **~1800 ms** projector polls **before** command 1 executes is **expected**. **INCONCLUSIVE** (budget math only, not a substitute for PASS) if **after command 1 ✓** stateful projector polls stay **~1800 ms** (FAST never engaged). **429** still **FAIL**.

---

## Same-bucket schedule (option A — **FAIL** if violated)

All times relative to **T_first**. Adjust only if server access logs prove a different bucket anchor.

| Milestone | Target |
|-----------|--------|
| POST command 1 | **≤ T_first + 12 s** |
| **✓** command 1 (ack GET **1–4**) | **≤ T_first + 35 s** |
| POST command 2 | **≥ POST1 + 20 s** and **≤ T_first + 48 s** |
| **✓** command 2 (ack GET **1–4**) | **≤ T_first + 58 s** |
| Observation end | Log through **T_first + 60 s** on **both** windows |

If command 2’s ack chain would complete after **T_first + 58 s** ⇒ **FAIL** (ack traffic in a later bucket). Ambiguous logs ⇒ **INCONCLUSIVE**, retry.

---

## Ack option A (`CopilotBar` on main — **1500 ms**)

**Implementation:** `pollAck` — **8 attempts** max: **immediate** first `fetchProjectorState`, then **7 × 1500 ms** waits **after each fetch returns** (10.5 s scheduled + RTT). Confirm when `applied.id === command.id` or `projector.lid === command.id`. **`kind === 'page'`** skips `pollAck`.

**UI:** **PASS** only when hint shows **✓** (`confirmed: true`). **· not confirmed** / Resend ⇒ **FAIL**. **✓** auto-clears after **~3 s** — **record ack index and time when ✓ appears**; an idle hint during the **≥20 s** gap is **not** failure.

**Counting ack GETs (no Initiator name required):** On window **C**, after a slot POST, count bare `GET /api/present-command` (no projector `st=` params) that form one **chain**: first GET immediate, each subsequent GET **~1.5 s after the previous response** (±600 ms). The assist loop’s **~4 s** bare GETs are **not** part of this chain (they still consume the **90/min** cap). **PASS:** **✓** on chain GET **1–4**. **FAIL:** chain GET **5** sent, no **✓** by **60 s** wall clock from POST, or hung fetch with no **✓** by 60 s. **Do not POST command 2** after command 1 ack **FAIL**.

**Extra GETs:** Any projector GET clearly tied to **visibilitychange** / wake during **T_first … T_first + 60 s** ⇒ **FAIL** (setup violation).

---

## Ack option B (preview only — **750 ms**)

Same as option A except chain spacing **~750 ms** (±400 ms) after each response; **8 attempts** max in code becomes **15** with **14 × 750 ms** scheduled waits (10.5 s budget). **PASS** still requires **✓** on chain GET **1–4** only. **FAIL** when chain GET **5** would start (~**3.0 s + RTTs** after POST). Attempts **5–15** are **not** part of a passing run (parent ≤4 ack abort). Minute A on **B** uses **this section**, not § Ack option A.

**Rate limit:** A passing B run never sends more than **4** ack GETs per command; the **80 + 2 + ≤8** worksheet still applies. Do **not** interpret “15 attempts” as a load test.

---

## Steps (prod, option A ack)

1. P1–P3 preconditions.
2. Setup → note **T_first**.
3. POST slot command 1 (e.g. `show HSI`) on **C**; achieve **✓** per § Ack option A and schedule table.
4. Wait **≥20 s** from POST1; POST slot command 2 (e.g. `show NDX`); **✓** per § Ack option A and schedule table.
5. Keep **both** windows logging until **T_first + 60 s**; **zero 429**.

**Record:** host, deployment id / `git rev`, IP note, POST/✓ times vs **T_first**, ack index (1–4) per command, visibility-wake Y/N, **PASS / FAIL / INCONCLUSIVE**.

**Prod-validated:** set only when host is **`https://marketindex.pmd-hk.com`** and verdict **PASS**.

**On FAIL:** Close **C** to stop `pollAck`; do not send further commands; retry after **≥60 s** quiet IP.

---

## P2 — ship rules

| Option | Change | Ship |
|--------|--------|------|
| **A** | **1500 ms × 8** (current main) | **No PR** |
| **B** | **750 ms × 15** in `CopilotBar.tsx` | PR + preview deploy → Minute A **PASS** with **§ Ack option B** + product go → merge **only after** preview **PASS** |

No B merge from timing complaints alone; product decision required.

---

## Plan review gate

First line: **`PLAN_PROCEED`** or **`PLAN_FIX (F1, …)`**. Max 400 words.

---

## History

| Ver | Gate |
|-----|------|
| v1.6 | Sol **PLAN_FIX** F1; Grok **PLAN_FIX** F1–F3 |
| **v1.7** | Sol **PLAN_PROCEED**; Grok **PLAN_PROCEED**; docs pre-commit Sol+Grok **PROCEED** (2026-10-30) |

### TypeSafe jev-1.14.0 — reviewer-fix effectiveness (v1.7 plan text)

Scores 0–3 (higher = better). **Not findings** — advisory only; **low confidence** on stored run.

| Question | Score | conf | Lean (from probabilities) |
|----------|-------|------|---------------------------|
| Fix adequacy (overall) | **1.73** | 0.22 | Partial → Adequate (P2+P3 ≈ 61%) |
| Sol PLAN_PROCEED warranted | **1.57** | 0.05 | Weak (P0+P1 ≈ 52%) |
| Grok PLAN_PROCEED warranted | **1.52** | 0.05 | Weak (P0+P1 ≈ 53%) |
| Minute A executable (option A) | **1.44** | 0.16 | Partial (P1 ≈ 33%) |

Raw: `docs/scores/jev-minute-a-v17-effectiveness.json` (single API run; re-run script in repo notes if re-rating).

Plan gate trio (docs PR): `docs/scores/jev-plan-gate-trio-v17.json`
