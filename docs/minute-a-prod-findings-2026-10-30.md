# Minute A prod findings — 2026-10-30

Host: **`https://marketindex.pmd-hk.com`**. Plan: `docs/present-minute-a-p2-plan.md`. Code on main after [PR #90](https://github.com/firaen22/marketview-index/pull/90) / [PR #91](https://github.com/firaen22/marketview-index/pull/91).

**Verdict:** **FAIL** (no canonical **PASS**). **Prod-validated** not set.

**Scope:** This document and plan **v1.8** are **runbook/findings only** — they do **not** change application code, poll intervals, rate limits, or bot/API latency. Speed/responsiveness on prod remain as after [#90](https://github.com/firaen22/marketview-index/pull/90) plus operator setup (`/present` heartbeat, HTTP or phone control).

## Summary

| Finding | Detail |
|---------|--------|
| Rate limit | Run 2: **zero GET 429** on hooked fetch in the automation window (anchor caveat below). |
| Cmd1 | HSI chip → **UI ✓** at **+8.1 s** vs **automation anchor** (first `st=1` poll on P only); **ack GET 1–4 not logged** — not schedule-complete for canonical Minute A. |
| Cmd2 | **`show NDX`** send attempt **+24.6 s**; **no UI ✓**; text left in box ⇒ **not proof of slot POST**. Not a parser-tested alias (`show hsi`, `nasdaq` → `^IXIC` are). |
| Setup | **Precondition P2 failed:** two **tabs**, not two visible windows. Run is **non-canonical**. |
| P2-B (CopilotBar) | **Not justified** — external advisory (2026-10-30): fix runbook/cmd2 before retry; no timing PR. |

---

## Run 1 (discarded)

- **Invalid:** React controlled Send without updating state (DOM `.value` only) → no reliable POST.
- Do not score.

---

## Run 2 (after ≥62 s quiet, reload P + C)

**Bucket anchor (automation):** offsets below use the first **`st=1` projector poll GET on P** after reload. The **canonical plan** defines **T_first** as the **first** `GET /api/present-command` in **either** P or C (Redis `INCR` on first GET). This run did **not** Preserve-log both windows to prove C did not precede P — **treat schedule offsets as indicative, not canonical.**

| Milestone | Target (canonical T_first) | Observed (automation anchor) |
|-----------|----------------------------|------------------------------|
| POST cmd1 (HSI chip) | ≤ T_first + 12 s | **+4.6 s** (chip click) |
| ✓ cmd1 (ack GET **1–4**) | ≤ T_first + 35 s | **UI ✓ +8.1 s** only |
| Cmd2 send (`show NDX`) | ≥ POST1 + 20 s, ≤ T_first + 48 s | **+24.6 s** (attempt; POST unverified) |
| ✓ cmd2 | ≤ T_first + 58 s | **No UI ✓** |
| 429 (hooked fetch window) | 0 in canonical bucket | **0** in automation window |

Automation caveats: tab focus, non-canonical P2, cmd2 via React setter + Send (not chip / typed UI).

---

## External review (same day)

Brief: prod Minute A partial success + cmd2/`show NDX` + P2 policy. Dispatched **Grok 4.7** + **gpt-6.1-sol** (medium).

| Lens | Verdict line | Agreement |
|------|--------------|-----------|
| Grok 4.7 | `ADVISE_PROCEED` (manual PASS likely after runbook fix) | Replace cmd2 example; no P2-B; no `NDX` → `^IXIC` |
| Sol 6.1 | `ADVISE_FIX` (plan/runbook before retry) | Same substance |

Artifacts (operator machine, not in repo): `/tmp/minute-a-advice-xVGWko/`.

**PR #92 pre-commit (2026-10-30):** Round 1 — Grok **FIX F1–F3**; Sol **FIX F1–F2** (addressed). Round 2 — Sol **PROCEED**; Grok **FIX F1** (summary “automation anchor” wording — addressed).

---

## Grok Bot / presentation control (context)

- Remote control path (on **`main`**, unchanged by this docs PR): **HTTP** `GET`/`POST /api/present-command` with **`PRESENT_API_KEY`** on writes — not CopilotBar browser automation. See `docs/present-remote-helper-plan.md` and README bot section.
- **Blocking for API bots:** a **live foreground** tab at **`/present`** must keep authenticated **`st=1`** projector polls. Without that heartbeat, live **`projector`** expires (~15 s); **`projectorLast`** / a queued **`command`** do not prove what is on screen. P0+P1 on [#90](https://github.com/firaen22/marketview-index/pull/90) shorten ack once heartbeat is up; this findings PR is **not** a speed or control unlock.
- Live talk: prefer **`/present-control` on a second device** or an API bot on the egress box; Grok CLI / Computer Use is too slow for in-talk switches.
- **Market Update Helper** bot definition was not in Oct 26 `grokbot-mirror-backup`; operator PR [#92](https://github.com/firaen22/marketview-index/pull/92) comment aligns with the heartbeat + HTTP notes above.

---

## Next steps

1. **Canonical manual Minute A:** two **visible** windows, **≥60 s** quiet, Preserve log on **both**, **T_first** = earliest GET in either log, cmd1 **HSI chip**, cmd2 **`show nasdaq`**, record **✓** and ack GET **1–4** per command.
2. On **PASS**, set **prod-validated** in plan history; stay on **P2-A**.
3. Optional: add **NDX** alias only if product wants Nasdaq-100 wording (do not map to `^IXIC` Composite without product sign-off).
