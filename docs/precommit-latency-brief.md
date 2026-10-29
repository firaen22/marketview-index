Pre-commit gate vs docs/present-latency-fix-plan.md (v2.4 dual PLAN_PROCEED).

Review the working tree diff (P0 lid flush + P1 POLL_MS 1800 + tests + README).

First line exactly: PROCEED or FIX (F1...)

Max 400 words. Match plan: LID_FLUSH_MS, scheduling table, no P2 CopilotBar change, tests.

Files touched:
- src/hooks/usePresentCommand.ts
- src/hooks/usePresentCommand.hook.test.ts
- api/present-command.test.ts
- README.md

Oracle: npm test --run (61 passed) + npm run lint exit 0.
