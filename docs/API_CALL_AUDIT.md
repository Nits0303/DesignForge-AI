# API Call Audit (Gemini Free Tier)

This document audits where LLM API calls are made, how many calls can happen per user action, and where duplicate/unexpected usage can happen.

## Key Finding

The app is **not making only 2 API calls** in most generation flows.
One click on `Generate` can trigger **multiple Gemini calls** depending on platform/format, with retries increasing this further.

If Gemini is primary (`GEMINI_API_KEY` set and `ANTHROPIC_API_KEY` unset), many `callAnthropicWithRetry(...)` callsites still route to Gemini via adapter logic.

## Provider Routing Behavior

- `callAnthropicWithRetry(...)` routes to Gemini when `isGeminiPrimaryLlm()` is true.
- File: `src/lib/ai/anthropicClient.ts`
- This means callsites that look "Anthropic-only" can still consume Gemini quota.

## Direct Gemini Call Sites

### 1) Stream generation path (main generate)
- `streamGeminiGeneration(...)`
- File: `src/lib/ai/generationOrchestrator.ts`
- Used in:
  - initial generation stream
  - streamed revise flow

### 2) Non-stream Gemini wrapper via Anthropic adapter
- `callGeminiWithRetry(...)` (via `callAnthropicWithRetry`)
- File: `src/lib/ai/geminiClient.ts`
- Called indirectly from many modules (router, section planner, reference analyzer, repair/retry paths, etc.)

## All LLM Call Locations (that can hit Gemini)

### A) Generate flow orchestration
- `smartRouteIntent(...)` -> 1 call for intent parsing
  - `src/lib/ai/smartRouter.ts`
- `streamGenerateDesign(...)`:
  - standard stream path -> 1 streaming call per attempt
  - retries at orchestrator level can re-run stream up to 3 attempts
  - `src/lib/ai/generationOrchestrator.ts`
- `postProcessWithEmptyFallback(...)` fallback/repair calls:
  - malformed HTML repair call
  - full regeneration fallback call when quality gates fail
  - `src/lib/ai/generationOrchestrator.ts`

### B) Multi-section website/dashboard generation
- `generateMultiSectionHtml(...)`
  - per section: one generation call
  - second-chance call on section failure
  - optional extra "fast pass" + "quality pass" when strategy is fast
  - `src/lib/ai/multiSectionGenerator.ts`

### C) Mobile flow generation
- `haikuScreenPlan(...)` -> 1 planning call (if no existing screenPlan)
  - `src/lib/ai/mobileFlowGenerator.ts`
- `generateOneMobileScreenHtml(...)` -> 1 call per screen
  - `src/lib/ai/mobileSingleScreenGenerator.ts`

### D) Revision flows
- stream revise path -> 1 streaming call per attempt (up to 3 attempts)
  - `src/lib/ai/generationOrchestrator.ts`
- targeted section revision -> 1 call
  - `src/lib/ai/sectionTargetedRevisor.ts`
- non-stream revise helper -> 1 call
  - `src/lib/ai/generationOrchestrator.ts` (`reviseDesign`)

### E) Reference analysis
- `analyzeReferenceImage(...)` performs AI analysis call, and retries once if JSON parse fails
  - `src/lib/ai/referenceAnalyzer.ts`
- Happens when references are uploaded/activated and analysis is missing/stale.

## Why Quota Can Be Hit Quickly

## 1) One "Generate" may already be multiple API calls

Typical social/basic generation:
- smart router: 1
- main stream generation: 1
- possible retries: +up to 2 more stream attempts
- possible repair/regenerate fallback: +1 to +2

So a single action can be **2-6+ calls**.

Website/dashboard multi-section can be much higher:
- smart router: 1
- section plan length often 6-8 sections
- each section = 1 call, plus failure second-chance
- fast strategy can do two passes (fast + quality)

This can easily become **10-20+ calls** for one generate action.

## 2) Retry multiplication at two levels

### Adapter-level retries
- `callGeminiWithRetry(...)` retries with delays `[1s, 3s, 9s, 20s]`
- up to **4 attempts per callsite**
- file: `src/lib/ai/geminiClient.ts`

### Orchestrator-level retries
- stream generate/revise loops retry up to **3 attempts**
- file: `src/lib/ai/generationOrchestrator.ts`

Combined effect: many callsites can multiply total requests under transient errors/quota pressure.

## 3) Reference analysis calls can happen before generation

In prompt panel:
- `ensureAppliedReferencesAnalyzed()` calls analysis for pending references before starting generate.
- If user has 1-3 active refs without cached analysis, this adds 1-3 AI calls first.

File: `src/components/workspace/WorkspacePromptPanel.tsx`

## 4) Free-tier mismatch

App-side request limiter in `/api/design/generate` allows up to 30/min (non-dev), while free Gemini tier limit noted is 15/min.
- file: `src/app/api/design/generate/route.ts`
- limits constant: `src/constants/limits.ts`

Even without bugs, this app-level throttle is above your provider allowance.

## "Duplicate Calls" Audit (bug-risk assessment)

### Confirmed high-impact behavior (expected by code, but surprising in practice)
- Multi-call generation architecture (router + generation + fallback/repair + section/screen fan-out)
- Aggressive retries in multiple layers
- Reference analysis pre-calls

These are likely the main reason for free-tier exhaustion.

### Not seeing an obvious front-end double-submit bug
- Generate button disables while generating.
- `startGeneration()` aborts previous request before starting next.
- No clear duplicate trigger from a single click in audited components.

### Risky/inefficient areas to fix

1. **Retry pressure during quota errors**
   - On 429/resource exhausted, repeated retries can worsen quota churn and latency.

2. **No global per-user AI call budget aligned to provider**
   - Current limiter controls request rate, not total underlying provider calls.

3. **Section/screen fan-out unbounded for free tier**
   - Heavy flows should be downgraded when Gemini free tier is active.

4. **Reference analysis done eagerly**
   - Can consume calls before core generation.

## Recommended Fixes (priority)

1. Add provider-aware budget guard
   - Track AI calls per user per minute and cap at ~12-15 when Gemini free tier is active.
   - Block/queue expensive flows early.

2. Reduce retries for quota errors
   - For explicit quota/rate errors (`AI_RATE_LIMIT_EXCEEDED`), fail fast (or single short retry), not full retry ladders.

3. Add "free-tier mode" fan-out caps
   - Limit section count, disable dual-pass generation, lower screen count, skip second-chance section retries.

4. Defer reference analysis
   - Optionally run analysis lazily/asynchronously after main generation starts or cache aggressively.

5. Add structured per-generation audit logs
   - Record total provider calls and call breakdown by stage:
     - router
     - stream generation attempts
     - repair/fallback
     - per section/screen
     - reference analysis

## Practical Call Count Examples

### Example A: simple social post (best case)
- router (1) + stream generation (1) = 2 calls

### Example B: simple social post (quota pressure)
- router (1) + stream retries (up to 3) + fallback (1) = 3-5 calls

### Example C: website multi-section (6 sections, quality pass)
- router (1) + sections (6) = 7 baseline
- plus section failures/retries -> often 8-12

### Example D: mobile flow (5 screens)
- router (1) + screen plan (1) + per-screen (5) = 7 baseline

These numbers are enough to exceed 15/min quickly in active usage.

## Conclusion

The quota issue is explainable by architecture and retry/fan-out behavior, not necessarily by a single "duplicate button click" bug.
Your assumption of only 2 calls applies only to the best-case simplest path; most real flows trigger many more API calls.
