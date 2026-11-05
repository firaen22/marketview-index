# Precommit — Present MCP 0.2.0 (wiring + responsiveness)

**Scope:** `mcp/**` only (+ `present-mcp-wiring-audit.md` update). App-side category-ack diff on this branch is separate (`precommit-category-ack-r1.md`).

## Gate result — sol PROCEED on final tree (R7); grok PROCEED on R4 tree

| Lens | Served model | R1 | R2 | R3 | R4 | R5 (confirm) | R6 (confirm) | R7 (final) |
|------|--------------|----|----|----|----|----|----|----|
| codex | `gpt-6.1-sol` medium (stderr `model:` line) | FIX (F1–F3) | FIX (F1–F2) | **PROCEED** (+N1 nit, fixed) | — | FIX (F1) on commit 905601c | FIX (F1) on 905601c + r4 fix | **PROCEED** (no findings) on final tree |
| grok CLI | — | 402 "Grok Build usage balance exhausted" at pong — no verdict | — | — | — | — | — | — |
| grok via cursor-agent | requested `grok-4.7-medium`, `--mode ask`; served identity **unknown** (cursor prints no served-model field; request_id `230697bc-403b-4da6-b39d-1a68c54d6db6`) | — | — | — | **PROCEED** (+S1 should-fix, fixed) | — | — | — |

Two routed families (OpenAI, xAI), both outside the Claude author family, both PROCEED. Sol's PROCEED (R7) covers the final tree; grok's (R4) covers the tree before S1, R5c-F1 and R6c-F1 — those three later fixes have one lens (sol) plus red-first tests. Owner approved one round past the 2–3 cap ("Fix it, final sol round"). Attested-family credit not claimed: grok's served identity rests on the requested slug only.

Identity probe (2026-11-05, same slug, `--output-format stream-json`): init event `model: "Grok 4.7 256K Medium"` (client-side, emitted before the API call — display name of the requested slug); self-report `Grok 4.7 | SpaceXAI` (model naming itself — untrusted); gate run usage `reasoningTokens 41128` (accounting anchor, but not keyed to a served model). All consistent with grok-4.7-medium; none is server-confirmed served identity → still **unattested**.

## Findings — reproduced, fixed, TypeSafe-rated

Jev `jev-1.14.0` Score 0–2 (0 nit · 1 should-fix · 2 blocking) + Noul P(reproduction confirms). Priority signal only, never a finding source.

| ID | Reviewer severity | Claim | Repro (red before fix) | Jev sev (conf) | P(supported) | Disposition |
|----|-----|-------|------|------|------|------|
| R1-F1 | blocking | Timeout covered headers only; stalled 200 body → `{}` → `projectorLive:true` / `slide:null` | stalled-stream tests (status, slide get) | **1.99** (0.98) | 0.95 | fixed: `requestJson` reads body under same timeout; 2xx non-JSON → 502 |
| R1-F2 | blocking | Assist length checked on trimmed, not whitespace-collapsed, text | 42-char spaced input fetched; 6300-raw rejected | **1.96** (0.94) | 0.92 | fixed: zod normalizes like `normalizeAssistText` |
| R1-F3 | blocking | JSON Schema looser than zod (image pattern, slide size) | schema assertions | 1.15 (0.74) | 0.93 | fixed (Jev: should-fix — handler already rejects pre-network) |
| R2-F1 | blocking | Image schema missing %4 length | 101-char accepted | 1.47 (0.28) | 0.97 | fixed: grouped base64 pattern |
| R2-F2 | blocking | `minLength` counts code points, server UTF-16 | schema had minLength 40 | 1.26 (0.61) | 0.29 | fixed: raw minLength removed |
| R3-N1 | nit | "wins CAS" overpromises | n/a (wording) | — | — | fixed wording |
| R4-S1 | should-fix (grok) | Stale catalog was one global slot; a `zh-TW` fetch evicted `en`'s fallback, so a later failed `en` refresh threw | test: cache en, zh-TW, +6 min, fail → rejected `catalog_market_http_500` | 1.05 (0.92) | 0.93 | fixed: `Map` keyed by `origin\|lang` |
| R5c-F1 (sol R5) | blocking | `deckKey` maxLength counted code points vs UTF-16 (sibling of R2-F2, missed in R2 sweep) | ajv: 1025 emoji accepted by schema, rejected by zod pre-fetch | 1.32 (0.49) | 0.94 | fixed (uncommitted): maxLength removed, description states ≤2048 UTF-16; test red on old schema |
| R6c-F1 (sol R6) | blocking | Raw 100k cap runs before whitespace collapse; production checks only normalized length | 40 `x` + 100k spaces → invalid_arguments, 0 fetches | 1.12 (0.79) | 0.85 | fixed (uncommitted): raw cap removed — only normalized text (≤6000) is sent; test red first |

## Oracle

```bash
cd mcp && npx tsc --noEmit && npx vitest run && npm run build   # 35 passed
```
Mutations shown red: ack-error rethrow, timeout removed, t=0 first poll, malformed-JSON swallowed.
Stdio smoke `dist/server.js` vs prod (read-only): 5 tools; `present_status` 0.4–0.8 s; `present_slide get` 0.6 s; writes refused without key. **No live write tested** (projector was live).
