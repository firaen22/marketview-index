# Minute A prod findings — 2026-10-30

Host: **`https://marketindex.pmd-hk.com`**. Plan: `docs/present-minute-a-p2-plan.md`. Code on main after [PR #90](https://github.com/firaen22/marketview-index/pull/90) / [PR #91](https://github.com/firaen22/marketview-index/pull/91).

**Verdict:** **FAIL** (no canonical **PASS**). **Prod-validated** not set.

---

## Summary

| Finding | Detail |
|---------|--------|
| Rate limit | Run 2: **zero GET 429** in `[T_first, T_first + 60 s]` on projector + control (fetch hooks). Cmd1 path healthy. |
| Cmd1 | HSI chip → **✓** at **T_first + 8.1 s** (within schedule). |
| Cmd2 | Example phrase **`show NDX`** did not achieve **✓**; input still showed text at end. **Not a parser-tested alias** in repo (`show hsi`, `nasdaq` → `^IXIC` are). |
| Setup | Cursor browser automation used **two tabs**, not two visible windows → **not plan-canonical** (P2). |
| P2-B | **Not justified** — Grok 4.7 + Sol 6.1 advisory (2026-10-30): fix runbook/cmd2 wording before retry; no CopilotBar timing change. |

---

## Run 1 (discarded)

- **Invalid:** React controlled Send without updating state (DOM `.value` only) → no reliable POST.
- Do not score.

---

## Run 2 (after ≥62 s quiet, reload P + C)

**T_first:** first projector poll GET on **P** after reload.

| Milestone | Target | Observed |
|-----------|--------|----------|
| POST cmd1 (HSI chip) | ≤ T_first + 12 s | **+4.6 s** |
| ✓ cmd1 | ≤ T_first + 35 s | **+8.1 s** |
| POST cmd2 (`show NDX`) | ≥ POST1 + 20 s, ≤ T_first + 48 s | **+24.6 s** |
| ✓ cmd2 | ≤ T_first + 58 s | **No ✓** |
| 429 in bucket window | 0 | **0** (hooked fetch on P + C) |

Automation caveats: tab focus, non-canonical P2, cmd2 via React setter + Send (not chip / typed UI).

---

## External review (same day)

Brief: prod Minute A partial success + cmd2/`show NDX` + P2 policy. Dispatched **Grok 4.7** + **gpt-6.1-sol** (medium).

| Lens | Verdict line | Agreement |
|------|--------------|-----------|
| Grok 4.7 | `ADVISE_PROCEED` (manual PASS likely after runbook fix) | Replace cmd2 example; no P2-B; no `NDX` → `^IXIC` |
| Sol 6.1 | `ADVISE_FIX` (plan/runbook before retry) | Same substance |

Artifacts (operator machine, not in repo): `/tmp/minute-a-advice-xVGWko/`.

---

## Grok Bot / presentation control (context)

- **Market Update Helper** not present in Oct 26 `grokbot-mirror-backup` bot list; remote control design is **HTTP** `GET/POST /api/present-command` with **`PRESENT_API_KEY`** (see `docs/present-remote-helper-plan.md`, README bot section), not CopilotBar browser automation.
- Live talk: prefer **`/present-control` on a second device** or API bot on egress box; Grok CLI / Computer Use is too slow for in-talk switches.

---

## Next steps

1. **Canonical manual Minute A:** two visible windows, **≥60 s** quiet, cmd1 **HSI chip**, cmd2 **`show nasdaq`** (or other parser-valid slot command), Preserve log, record vs **T_first**.
2. On **PASS**, set **prod-validated** in plan history; stay on **P2-A**.
3. Optional: add **NDX** alias only if product wants Nasdaq-100 wording (do not map to `^IXIC` Composite without product sign-off).
