# Manifest — marketview skill library

One line per skill: what it is → the evidence backing it. Compiled 2026-07-13 at repo
commit 6feeff2 by the retiring architect session. Re-verify commands live at the end of
each skill. Evidence classes: [code] read directly, [git] commit/PR bodies, [run]
command executed this session, [relay] subagent-verified with file:line citations.

| Skill | What it is | Evidence |
|---|---|---|
| START-HERE/SKILL.md | Router: repo identity, boundary map, dirty-worktree triage, discipline list, reading order | [run] git status/log, npm test/lint 2026-07-13; [code] deploy.yml, README vs api/ sources |
| architecture-contract/SKILL.md | 7 invariants with tempting-change triggers + executable done-checks (PDF key regex, timing-safe auth, jargon cache semantics, model-chain order, keyboard ownership, slide contract, degradation ladder) | [code] lib/pdfKey.ts, api/present-*.ts, api/explain-jargon.ts, lib/nim.ts read in full; [git] 3be82c8, 048e199, ae379d1, 647ebc5, 0dd81d5, 7cd5855→3be82c8 reversal; [run] anchor greps |
| ai-jargon-pipeline/SKILL.md | The July-2026 hot zone: pipeline map, latency budget with measured constants, 5 rules (one-vision-call, frozen prompt contract, live-probe model edits, glossary=wording-only, paired validation constants), debug beacon | [code] explain-jargon.ts + nim.ts + jargon.ts + useJargon.ts read in full (in-code dated measurements); [git] PR #6–#24 series incl. #15 revert (0d43105→523c30b), #18 hedge (b60f307) |
| caching-and-data-freshness/SKILL.md | Complete Redis key/TTL table + 5 rules (nullable redis, never-cache-failures, path-scoped keys, freshness ladder, version-bump migrations) | [relay] key table with file:line, spot-checked by [run] greps (CACHE_KEY, throttle, jargon:, verify_key_rl); [git] poisoned-cache incidents #10, #19, 5346fb9 |
| debugging-playbook/SKILL.md | 7 verbatim-symptom entries with triage branches ending at named observables + recurrence signatures (jargon card missing, NIM log noise, ERR_MODULE_NOT_FOUND, frozen banner, iOS Safari, 401s, localStorage test failure) | [git] incident commits 9870015, b60f307, 26a29e3, bdc031e; [code] jargonDebug beacon, source-field handling; [run] npm test reproduces the guarded-against S7 setup |
| failure-archaeology/SKILL.md | Dead ends with disposition tags, mechanisms, standing rules, residue, tripwires (serial vision chain, full race, backend flip-flop, Alpha Vantage, storage zigzags, api/_ trap, fabricated history, abandoned /factors) + deliberately-not-done list | [git] full 198-commit archaeology: 0d43105/523c30b, b60f307, 6200774/3c20d04, 40f7d40/6665d4d, 66fa3cd/9da9edc/ff8b94c, 63591a3/312c362/9bddc19, 26a29e3, 7cd5855/3be82c8, 37a9927/38095be |
| build-and-env/SKILL.md | Rebuild-from-zero (verified command sequence), 6 pitfalls, complete env-var table from code (supersedes stale .env.example), fresh-clone acceptance check | [run] npm test (113/113) + npm run lint + node --version 2026-07-13; [code] every env read grepped to its file; [git] bundling incidents |
| deploy-and-operate/SKILL.md | Push-to-main=prod discipline (you are the CI), secrets/rotation traps, post-deploy probes, cron state, projector operation + 720p sizing rules | [code] deploy.yml (zero gates), vercel.json; [run] worktree inspection of in-flight cron fix; [git] #21/#24 projector regressions; prod domain from project memory (see UNCERTAINTY) |
| validation-and-qa/SKILL.md | Evidence standards: measured-latency claims, reproduce-before-fix, coverage placement (vitest vs test/ probes), known holes, fresh-context review, NaN/empty default cases | [git] measured-numbers convention in #11–#18 commit bodies + in-code comments; sweep catch record (33+8+2 bugs); [run] suite is hermetic and fast (verified) |
| frontend-recurring-bugs/SKILL.md | The 6 bug classes fixed 2+ times each (stale-async guards, response.ok, i18n dictionary, em/vmin projector sizing, referentially-stable options, NaN guards) with house patterns | [git] same class recurring across #1, #2, #19, #21 in different files; [code] useJargon guard pattern, JargonSpotlight sizing, useMarketData:7 comment; ENHANCEMENT_REPORT items 1–5 |
| UNCERTAINTY.md | Register of unsettled items, bucketed, each with a safe default | this session's discovery limits, dated |

Falsifiability: every [git] claim is checkable via `git show <id>`; every [code] claim
via the re-verify command at the foot of its skill; [run] claims were executed 2026-07-13
and will drift — rerun before trusting.

Review record (2026-07-13): three fresh-context review passes ran over this library —
factual (re-verified every hash, constant, regex, command; ran all 10 re-verify
commands), doctrine (contradictions, overstated claims, gate-routing), usability
(five zero-context scenario walkthroughs). Results: 0 BLOCKING; 8 IMPORTANT + most
MINOR findings fixed in place (wrong env-var reader, keyboard-grep baseline, probe
side-effect flags, Vercel-log access block, image-probe schema, 5xx router trigger,
commit-ID typo, stale counts); residual unsettled items live in UNCERTAINTY.md.
