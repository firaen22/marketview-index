Implement `docs/review-packets/present-mcp-fix-plan.md` on this working tree.

Rules:
- Match operator decisions in that file (parity test for categories; no control UI).
- Do NOT git commit.
- If every batch item is already present, make no edits and say "ALREADY_COMPLETE".
- If you edit, run the Oracle commands in the fix plan and paste exit codes.
- Do not add npm audit fix unless trivial zero-risk.

Allowed paths: `mcp/**`, `lib/presentIndexCategory.ts`, `src/presentCommandApi.ts`, `src/presentCommandApi.test.ts`, `src/presentIndexCategory.parity.test.ts`, `api/present-command.ts`, `api/present-command.test.ts`, `lib/presentCommand.ts`, `lib/presentRemoteRedis.ts`, `src/PresentationPage.tsx`, `src/PresentationPage.command.test.ts`, `src/embedBridge.ts`, `src/constants.ts`, `docs/minute-a-prod-findings-2026-10-30.md`, `docs/present-minute-a-p2-plan.md`, `README.md`, `docs/precommit-present-mcp-brief.md`, `docs/review-packets/**`

First line of response: ALREADY_COMPLETE or EDITS_MADE
