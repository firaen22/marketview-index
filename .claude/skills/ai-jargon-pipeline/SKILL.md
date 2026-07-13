---
name: marketview-ai-jargon-pipeline
description: Load when working anywhere in the jargon subsystem of marketview-index — api/explain-jargon.ts, lib/nim.ts, lib/jargonGlossary.ts, src/jargon.ts, src/hooks/useJargon.ts, src/components/JargonSpotlight.tsx or PdfViewer.tsx — or when the observed symptom is: jargon card missing/slow/wrong terms, "NIM call failed" in logs, vision model returning table codes as terms, or a proposal to change AI models, prompts, timeouts, or the hedge.
---

# MarketView — AI/Jargon Pipeline

The July-2026 hot zone: 13 commits in ~2 days on api/explain-jargon.ts alone. Every
constant in this pipeline was measured, not guessed. Facts dated 2026-07-11/13; model
IDs and latencies are volatile.

## The pipeline (end to end)

PDF page renders (PdfViewer) → `getTextContent()` → text ≥ 40 chars (`JARGON_MIN_TEXT_LEN`,
src/jargon.ts:6)? → TEXT path; else (or extraction throws — iOS Safari does) render page
to ≤1280px JPEG (quality 0.7, retry 0.5) → IMAGE path. `useJargon` debounces 600ms,
checks per-session client cache (`${pdfUrl}#${page}#${lang}#${path}`), POSTs
`/api/explain-jargon` with `slideId=${slide.updatedAt}#${page}`. Server: Redis 30-day
cache → Gemini (user Bearer key exclusively if present, else server keys × model chain)
→ NIM fallback (text: sequential chain; vision: hedged race) → sanitize (≤4 terms,
term ≤80 chars, explanation ≤240) → glossary override → respond. Client re-caps
explanation at 200 chars (src/jargon.ts:61 — known asymmetry). JargonSpotlight rotates
terms every 8s; `J` toggles the whole feature (settings.jargonEnabled, default true).

## The latency budget (why every number is what it is)

- **45s**: /present playlist auto-advance dwell (settings.ts). Everything must land inside it.
- **50s `VISION_TIMEOUT_MS`** (explain-jargon.ts:212): a 25s abort killed a measured
  42.6s slow-but-successful vision run. Don't "tidy" it back down.
- **10s `HEDGE_DELAY_MS`** (explain-jargon.ts:219): healthy primary answers ~5–9s and
  wins alone (≈3× fewer NIM calls); slow spells (27–60s) escalate to the full race and
  still fit 45s.
- **NIM vision latency swings 16–60s+ on the SAME payload** (measured 2026-07-11). Any
  design assuming stable vision latency is wrong here.
- `reasoning_effort:'low'` on gpt-oss text models: ~2× faster (1.7s vs 2–3.8s);
  Mistral 400s on the parameter (lib/nim.ts:49,69).

## Rules

### R1 — One vision call per slide, ever
Trigger: any proposal with two serial vision-model steps (transcribe-then-extract,
describe-then-classify, OCR-then-explain).
Steps: reject; put quality pressure in the prompt instead (see the WHERE-TO-LOOK block
in `buildJargonPrompt`, explain-jargon.ts:117 — measured: without it llama returned 4
junk table codes; with it 3–4 correct terms).
Done: your change adds zero serial vision round-trips.
✅ Good: improve extraction by tightening prompt guidance and testing on the real slide.
❌ Bad (verbatim dead end, PR #15 → reverted in #16): "transcribe the slide first, then
extract from the transcript — two focused calls beat one overloaded call." Measured
result: 41–100s total, card never appeared.

### R2 — Prompt output contract is frozen
Trigger: editing `buildJargonPrompt` or any model config.
The contract: `{ "terms": [ { "term": "...", "explanation": "..." } ] }`, JSON only.
Both backends, both paths, and the client parser depend on it (PR #22 explicitly
preserved it). Sanitizers cap at 4 terms — prompts asking for more waste tokens.
Done: `npm test` (src/jargon.test.ts, jargonGlossary.test.ts pass) AND a live probe of
one text + one image request against the deployed endpoint returns parseable terms
(post-deploy check — the only deploy path is push-to-main = production, see
deploy-and-operate R1/R3; the probe consumes model quota and on success writes a
30-day content-keyed prod cache entry — one-shot only, don't loop it).

Live probe commands (payload-builder verified locally 2026-07-13; the live POST itself
is `unverified` — needs the deployed endpoint):
```bash
# text path:
curl -s -X POST https://marketindex.pmd-hk.com/api/explain-jargon -H 'Content-Type: application/json' \
  -d '{"text":"The fund duration is 4.2 years with 50 basis points spread over benchmark EBITDA margin.","lang":"en"}'
# image path — build the payload from a real slide JPEG (schema: {imageBase64, lang, slideId?};
# base64 of a JPEG file, no data: prefix, 100..3,000,000 chars):
node -e 'const fs=require("fs");const b=fs.readFileSync(process.argv[1]).toString("base64");fs.writeFileSync("/tmp/jargon-probe.json",JSON.stringify({imageBase64:b,lang:"en"}));console.log("b64 chars:",b.length)' /path/to/slide.jpg
curl -s -X POST https://marketindex.pmd-hk.com/api/explain-jargon -H 'Content-Type: application/json' -d @/tmp/jargon-probe.json
```
Omit `slideId` in probes — a content-keyed cache entry can't collide with real slides;
a fabricated slideId could.

### R3 — Model list edits require live probes, per ID
Trigger: adding/removing/reordering anything in `GEMINI_MODEL_CHAIN`, `NIM_TEXT_MODELS`,
`NIM_VISION_MODELS`.
Why: retired Gemini IDs sit as silent dead code (bit twice, PRs #7/#8); on NIM,
gemma-3-12b 404'd on this account and deepseek-v4-flash is text-only — both were
excluded only after live probes (lib/nim.ts comments).
Steps: probe each ID with a real request (vision IDs with a real slide JPEG) using keys
from `.env.local`; record measured latency in the code comment beside the list, dated.
Done: every ID in the final list has a dated, successful live probe; order reflects
measured latency/reliability, and the comment says so.

### R4 — Glossary (`lib/jargonGlossary.ts`) is wording-only
Trigger: a jargon explanation is wrong/awkward and you want to fix it permanently.
Steps: add/edit the glossary entry (bilingual, alias-normalized); do NOT touch term
detection; do NOT flush the Redis cache — overrides apply at response time.
Done: `npm test` (jargonGlossary tests) + the deployed slide shows the new wording on
next view without any cache flush.

### R5 — Client eligibility/validation constants move in pairs
Trigger: changing `JARGON_MIN_TEXT_LEN`, `JARGON_IMAGE_MAX_DIM`, image base64 caps, or
server-side `IMAGE_BASE64_MIN/MAX_LEN`.
Why: client validates (src/jargon.ts) and server re-validates (explain-jargon.ts:68–69,
92–99) — drift makes the client send payloads the server rejects, which surfaces as
"card never appears" with no error.
Done: both sides updated together; `npm test` green (src/jargon.image.test.ts covers dims/validation).

## Debug tooling

`?jargonDebug=1` on /present enables the client debug beacon (src/jargonDebug.ts) which
POSTs pipeline events to `api/jargon-debug.ts` (a log sink readable in Vercel function
logs). Built (PR #13) because iOS-Safari-only failures can't be inspected on-device.
Use it before adding any new logging.

Re-verify: `cd "/Users/yauch/Documents/market index/marketview-index" && grep -n "VISION_TIMEOUT_MS\|HEDGE_DELAY_MS\|GEMINI_MODEL_CHAIN" api/explain-jargon.ts && grep -n "NIM_TEXT_MODELS\|NIM_VISION_MODELS" lib/nim.ts`
