# Precommit review packet — R2 (post fix plan)

**Fix plan:** `docs/review-packets/present-mcp-fix-plan.md` (Batch 1–2 marked done)

## Changes since R1

- MCP `present_action`: JSON Schema **`oneOf`** per action (`mcp/src/actionSchema.ts`); category branch lists required `category` enum
- MCP category enum: `categoryLabels.ts` + parity test vs `lib/presentIndexCategory.ts`
- Client: `PresentAppliedState.category` + `parsePresentApplied` + tests
- README: no “dry runs”; `wait_for_ack: false` = skip polling only
- vitest: exclude `dist/**`, include only `src/**/*.test.ts`
- Findings doc: cmd2 wording aligned

## Oracle (verified R2)

```
cd mcp && npm run lint && npm test && npm run build  → exit 0 (8 tests incl ListToolsResultSchema)
npm test -- --run (6 files, present API/MCP parity) → 94 passed
```

## Operator decisions (locked)
- Category list: parity test (see mcp/README.md); not shared import into MCP package.
- Grok optional for merge.

## Gate format

First line exactly: `PROCEED` or `FIX (F1...)`
Max 350 words.

Re-check R1 findings F1–F4 explicitly — confirm fixed or re-open.
