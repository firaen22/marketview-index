Polish pass — `marketview-present-mcp` (branch `polish/mcp-0.2.1`, base `bd400b9`).

Oracle (run before commit, 2026-11-06):
```bash
cd marketview-index/mcp && npm run lint && npm test && npm run build
```
Latest: lint (tsc) exit 0; 6 files / 69 tests pass (baseline 37); build exit 0.

## Pipeline
- Hunt: codex gpt-6.1-sol (astra pack v2), agy, grok (via cursor-agent; xAI CLI returned 402). Every finding reproduced with a temporary failing test before it was adopted.
- Implement: codex gpt-5.6-luna (client layer: `presentClient.ts`, `catalog.ts`, `config.ts`, `polish.client.test.ts`); cursor composer-2.5 (tool layer: `tools.ts`, `actionSchema.ts`, `README.md`, `polish.tools.test.ts`). Sequential, disjoint files.
- New tests checked against the original source: every fix test fails there; the 6 that pass are valid-input controls.
- Review: grok (cursor-agent `grok-4.7-medium`, served model unconfirmed) + codex gpt-6.1-sol, 2 rounds.
- Precommit gate: codex gpt-6.1-sol + Claude Fable 5.1 (cursor-agent, code-only packet, secret-scanned).

## Fixes
| ID | Defect | Fix |
|---|---|---|
| A | `present_action` overlay+`src` (custom graphic) was POSTed | Refused locally: `custom_overlay_forbidden`, no config/fetch/POST (owner decision) |
| B | Compare highlight: one-sided bound dropped; impossible/reversed dates POSTed | Both-or-neither, real calendar day, from ≤ to → else `invalid_arguments` |
| C | POST reply `command` without id reported acknowledged | `malformed_command`; `isCommandAcked` false for empty id |
| D | Status 200 `{}` read as live projector | `status_malformed_json` |
| E | Catalog envelope without `data` → silent empty; rows over server bounds / null rows crash or 400 whole request | `<label>_malformed` (stale cache applies); bad rows skipped; `nameEn:null` kept |
| F | Send text not trimmed before length check | Trim, then 1–200 UTF-16 units; trimmed text sent |
| G | Unknown keys on `present_action` silently stripped | Every branch `.strict()` |
| I | Slide body without content/mode/updatedAt crashed caller; `{}` read as "no deck" | `malformed_slide`; explicit `slide:null` = no deck |
| J | Blank origin → `""`; whitespace key sent | Default origin; trimmed key, blank → missing-key error |
| M/N | Ack schedule text "8×1.5s" wrong; notes implied page turns get acked | Text derived from `ACK_POLL_SCHEDULE_MS`; page result `note` (queued, 15 s expiry, no ack) |

## Rejected / deferred
- One-symbol compare → chart: server design. Local symbol precheck: server returns 422 `invalid_symbols`. Dropped catalog HTTP error strings (K): deferred nit.
- Deeper projector-object validation (sol R1 / grok F3): server returns only validated state (`api/present-command.ts:305-324`).
- Slide `mode`/`updatedAt>0` strictness (sol R2 / grok F4): GET returns stored deck verbatim; would block reading legacy decks.
- Trailing `\n` passing date regex (grok F2): false positive — JS `$` without `m` matches only at end of input.
- Fable N1 (owner decision: keep strict): `page` + `wait_for_ack` stays `invalid_arguments`; removed the misleading "Page always skips." from the shared `wait_for_ack` description (composer).
- Fable N2 (fixed, composer): ack description now derives from `ACK_MAX_ATTEMPTS` with the loop's delay rule; rendered `present_send` text byte-identical with current constants.

## Verdicts
| Stage | Reviewer | Verdict |
|---|---|---|
| Review r1 | gpt-6.1-sol | FIX R1,R2,R3 → R3 adopted, R1/R2 rejected |
| Review r1 | grok | FIX F1–F4 → F1, F5 adopted; F2–F4 rejected |
| Review r2 | gpt-6.1-sol | PROCEED |
| Review r2 | grok | PROCEED |
| Gate r1 | gpt-6.1-sol | FIX R1 (slide mode/updatedAt untested) — reproduced by mutation; tests added, mutant now red |
| Gate r1 | Fable 5.1 | PROCEED (nits N1, N2 deferred) |
| Gate r2 | gpt-6.1-sol | PROCEED |
| Gate r3 (N1/N2 fixes) | gpt-6.1-sol | PROCEED |
