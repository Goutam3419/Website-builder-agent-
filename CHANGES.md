# Changes on top of the original sitegenie app

Everything below is additive — no existing feature was removed. Original
app behavior (chat UI, GitHub/Vercel/Firebase integrations, multi-user
roles, RAG memory) is untouched. Two gaps from the PDF spec have been
closed:

## 1. Risk Gate (destructive-action approval)

**New file:** `lib/agent/riskGate.ts`
- Deterministic, pattern-based risk scorer (0.00–1.00), NOT LLM-judged —
  same reasoning as the original engineering review: an LLM can be
  talked around ("it's just a preview, totally safe"); a fixed pattern
  match can't.
- `assessRisk(prompt)` → HIGH tier (≥0.70) for things like bulk deletion,
  `DROP TABLE`, production-affecting deletes, force-push, repo deletion.
- `isConfirmationMessage(text)` → narrow confirmation detector ("confirm",
  "haan karo", "proceed") so a vague "ok" doesn't accidentally green-light
  something destructive.

**Wired into:** `app/api/agent/route.ts`
- Runs right after intent classification confirms it's a real build
  request, BEFORE `runOrchestratorAgent` (i.e. before any Gemini
  generation, GitHub push, or Vercel deploy happens).
- HIGH risk → nothing executes. A pending-approval marker is saved (reusing
  the existing `task_plans` table with a new `pending_approval` status —
  no schema migration needed, it's a plain TEXT column) and a chat message
  asks the user to reply "confirm".
- Next message: if it's a confirmation AND there's a pending-approval
  plan for the project, the ORIGINAL prompt is re-run (not the
  confirmation text), and the marker is closed out.

**Changed:** `lib/db.ts` — widened `TaskPlan.overall_status` and
`updateTaskPlan`'s status param to include `'pending_approval'`.

## 2. Diagnostic & Self-Healing (build-failure auto-patch)

**New file:** `lib/agent/selfHeal.ts`
- `diagnoseAndPatch(logs, currentFiles, retryAttemptCount)` — Gemini reads
  raw Vercel build logs, proposes a targeted patch (only the files that
  need to change, adapted to this app's whole-files-map model instead of
  the PDF's single-file-patch schema).
- Retry boundary (`DIAGNOSTIC_MAX_RETRIES`, default 3) is enforced in code
  before the model is even called for attempt 4 — not left to the model's
  self-reported count.

**New functions in:** `lib/integrations/vercel.ts`
- `pollDeploymentStatus()` — bounded poll (~25s default), since this runs
  inline in a request handler, not a background worker.
- `fetchDeploymentLogs()` — raw build log text for the Diagnostic Agent.

**Wired into:** `lib/agent/engine.ts` (the Vercel deploy block)
- Deploy → poll → if it failed fast, diagnose → patch → redeploy, up to
  the max retry boundary → then stop and leave the live site on its
  previous URL (rollback = "don't touch what was working").
- The outcome (healed after N retries / rolled back / still building) is
  appended to the same `responseSummary` string that already gets saved
  as the assistant's chat message — so it just shows up in the existing
  UI, no `page.tsx` changes needed.

## 3. Empty-files silent-fallback bug (the actual reported bug)

**Symptom:** Chat showed a detailed, confident "Architectural Execution
Summary" (BMI calculator, pricing toggle, etc.) with "✅ All Checks
Passed" — but the live site / Code tab showed a one-line placeholder
page titled after the project name. This was pre-existing, not
something introduced by changes #1 or #2 above.

**Root cause, found in `lib/agent/engine.ts`:** the Gemini response
schema's `files` field is an unconstrained `OBJECT` (it has to be — file
paths are dynamic, so it can't be given fixed `properties`). With no
structural hint, the model would sometimes write a rich `plan` and
`reasoning` but return an effectively empty `files` object. The old code
silently caught that with a hardcoded one-file placeholder stub and then
reported success anyway — so a generation failure looked identical to a
successful build in the chat.

**Fix:**
- If `files` comes back empty, retry once with an explicit "you returned
  zero files, that's a failure" instruction before giving up.
- If it's still empty after the retry, the chat message now says so
  plainly (`### ⚠️ Generation Did Not Complete As Described`) instead of
  showing the success template — including the plan/reasoning it wrote,
  labeled as "not reflected in the real output," plus a suggestion to
  retry with a smaller/more specific prompt.
- GitHub push / Vercel deploy / Firebase sync are now skipped entirely
  when the fallback stub is what's actually being held — no more
  auto-committing or auto-deploying a known-broken placeholder.

This does not eliminate the underlying model behavior (an LLM can still
write a plan without content) — it makes the failure visible instead of
disguised, and gives it one automatic retry before surfacing it.


- The poll window (~25s) only catches fast build failures. A slow
  framework build that fails after 2 minutes won't be caught by this —
  it'll just show "still building" and stop. Worth revisiting if the
  target projects are more than static HTML/CSS/JS.
- Self-heal patches are committed to the live deploy automatically once
  triggered (no separate human approval per retry) — the risk gate
  covers the destructive-intent side, this covers the broken-build side;
  they're deliberately different safety mechanisms for different
  failure modes.
- The pending-approval marker doesn't expire. If a user never confirms
  and instead sends unrelated prompts, it just sits there (harmless —
  it only matters if the *next* confirming message arrives while it's
  still the most recent plan for that project). A TTL/cleanup job would
  be a reasonable follow-up.

## 4. THE ACTUAL ROOT CAUSE — empty-files bug, found in 5 places

Change #3 above was a band-aid (retry + honest failure message). This is
the real fix, found by tracing why the retry was *also* failing.

**Root cause:** every place in the app that asks Gemini to return a
filepath→content map used `{ type: Type.OBJECT }` with **no `properties`
defined** — because file paths are dynamic, they can't be listed as
fixed schema properties. But Gemini's structured output (a constrained
subset of OpenAPI 3.0) needs `properties` to know what shape to fill.
An object schema with none gives the model no defined shape — so it
very often just emitted `{}` for `files` while writing a perfectly
detailed `plan`/`reasoning` right next to it in the same response. This
exact pattern existed in **5 separate call sites**:

1. `lib/agent/engine.ts` — main generation call
2. `lib/agent/engine.ts` — self-correction/validation-fix loop (which
   ALSO never included the actual current file content in its prompt —
   fixed too, it was asking the model to "fix errors" in files it
   couldn't see)
3. `lib/agent/engine.ts` — click-to-edit targeted element function
4. `lib/agent/orchestrator.ts` — per-task generation in the multi-step
   complex-request flow (which had its own silent-success variant: an
   empty task result left `currentFiles` unchanged, and validating
   *unchanged, already-valid* files passed validation — silently
   marking a no-op task "completed")
5. `lib/agent/selfHeal.ts` — the diagnostic patch call added in change
   #2 (also never included actual file content, same fix applied)

**Fix, in one shared module (`lib/agent/parseFilesField.ts`):** ask for
`files` as a `Type.STRING` containing `JSON.stringify`'d content instead
of a raw `Type.OBJECT`. A STRING field has a concrete shape ("text"),
so structured output fills it the same reliable way it fills
`reasoning` or `explanation`. `parseFilesField()` parses it back into a
real object, with a defensive fallback for the (now unlikely) case a
raw object still comes through.

All 5 call sites now use this shared parser and the shared
`FILES_FIELD_DESCRIPTION` schema text, so this can't drift out of sync
across files again the way it apparently did before.

## 5. Casual-chat misclassification (compounding cause)

**Symptom in the reported session:** every plain "Hey", "Kya hua",
"Hindi me bolo" etc. triggered a full, expensive multi-feature portfolio
rebuild instead of a friendly reply — burning through Gemini calls
before the actual requested build (a gym landing page) even ran, which
is very likely why THAT request then hit empty output.

**Root cause, `app/api/agent/route.ts`:** `classifyIntent()` calls
Gemini to decide build-vs-casual. Its catch-all error branch used to
default to `isBuildRequest: true` on ANY non-quota failure — so if that
one classification call was flaky for any reason, every message silently
became a full rebuild with no visible error.

**Fix:**
- Added a deterministic, zero-API-cost pre-filter (`isObviouslyCasual`)
  for short, unambiguous greetings/small-talk — these never reach
  Gemini at all now, so they can't be misclassified by a failing call.
- Flipped the generic-error fallback from "default to build" to
  "default to conversational" — a false negative here costs the user
  one re-send; the old false positive burned a full expensive
  generation on what might have been "Hey".

## 6. "Which website do you mean?" — classifier had zero context

**Symptom:** Build a site, then in the SAME project chat say something
like "ab is website mein ek page banake connect karo" (now add a page
to this website and connect it) — the agent asks "which website should
I build", ignoring everything already built.

**Root cause:** `classifyIntent()` in `app/api/agent/route.ts` (the
build-vs-casual check) was called with ONLY the raw message text — no
project name, no info that a site already exists, no recent
conversation. A message using a relative reference ("is website",
"isme", "connect karo") has no clear referent in isolation, so the
classifier would often decide it was too vague to be an actionable
build instruction and fall back to its generic "what would you like
built?" reply — discarding all prior context in the process.

Note: this was a classification-stage bug only — the actual generation
call (`engine.ts`) already received existing file contents correctly.
The problem was upstream: many messages never reached generation at all
because the classifier bounced them first.

**Fix:** `classifyIntent()` now receives the project name, whether the
project already has a built site, and the last 6 chat turns. Its system
instruction explicitly says: if a site already exists, treat any
message that could plausibly extend/modify/connect to it as a build
request, and never ask "which website" — there's only one in this
project's context.

## 7. Automatic model fallback on quota exhaustion

**Symptom:** Free-tier Gemini quota (20 requests/day observed for
`gemini-3.6-flash`) gets exhausted during normal testing, and the raw
`429 RESOURCE_EXHAUSTED` JSON error surfaces to the user as a browser
`alert()` — the entire app is down until the daily quota resets.

**Root cause:** 13 separate call sites across 7 files each created their
own `GoogleGenAI` client and hardcoded `model: 'gemini-3.6-flash'`
directly. No shared model-selection logic existed, so there was nowhere
to add a fallback without editing every call site individually — which
is exactly what this change does.

**Fix:** New shared module, `lib/agent/geminiClient.ts`:
- One shared `GoogleGenAI` instance instead of 7 separate ones.
- `generateWithFallback()` — same call shape as the raw SDK
  (`contents`, `config`), but on a quota-exhaustion error for the
  current model, automatically retries the SAME request against the
  next model in `GEMINI_MODEL_CHAIN` (env-configurable, defaults to
  `gemini-3.6-flash,gemini-2.5-flash,gemini-2.0-flash`). Non-quota
  errors (bad request, network failure) are NOT retried across models —
  a malformed request won't be fixed by switching models, so those
  still fail immediately rather than silently trying 3 models in a row.
- All 13 call sites (`engine.ts` ×4, `orchestrator.ts` ×4, `selfHeal.ts`
  ×1, `app/api/agent/route.ts` ×1, `app/api/spec/route.ts` ×1) now use
  this shared function. `lib/agent/rag.ts` was left untouched — it uses
  the separate `embedContent` (embeddings) API, a different quota pool
  from `generateContent`.

**Not touched:** `lib/agent/model-router.ts`'s `callAgentModel` (a
Gemini/Claude switcher) was already dead code — imported in `engine.ts`
but never actually called anywhere in the codebase. Left as-is; it's a
separate, larger feature (lets a user plug in their own Anthropic key)
that's out of scope for a quota-fallback fix, but worth knowing it
exists half-wired if you want to finish it later.

## 8. Project deletion "didn't work" — actually an auto-recreate side effect

**Symptom:** Delete a project, and it (or an identically-named replacement)
seems to come back.

**Investigation note:** the DELETE API endpoint and its `deleteProject()`
db function were already fully implemented and correct — this wasn't a
missing-feature bug. The actual cause: `GET /api/projects` auto-created
a starter "My First SaaS Web App" project any time the list was empty —
with no way to distinguish "brand new user, never had a project" from
"returning user who just deleted their only project." Both look
identical as `projects.length === 0`, so deleting your last project
triggered a fresh auto-generated one on the very next load.

**Fix:**
- New `checkUserExists()` in `lib/db.ts` — checks the user row alone,
  BEFORE `getOrCreateUser()` would otherwise always report "existing."
- `GET /api/projects` now only auto-creates the starter project when
  `!wasExistingUser` — i.e. truly the first time this uid has ever been
  seen. A returning user who deletes their last project now correctly
  sees zero projects, not a phantom replacement.
- Added a proper "No Projects Yet" empty-state screen in `app/page.tsx`
  (previously, zero projects had no dedicated UI — the quick-prompt
  buttons would render but silently do nothing without an active
  project to attach to).

## 9. Settings — connect GitHub/Vercel/Firebase independently

**Symptom requested:** a way to connect just one integration (e.g. only
GitHub) without needing to fill in the other two.

**Finding:** the backend already supported this correctly — partial
settings updates only ever touch the fields present in the request
body. The actual gap was entirely in the UI: one combined "Save & Test
Connections" button for all three services, and `testResults`/
`testingConnection` state that existed but was **never rendered
anywhere** (a half-wired leftover — declared, occasionally set, never
read).

**Fix, `app/page.tsx`:** each of the three integration cards
(GitHub / Vercel / Firebase) now has its own:
- **Connect** button — sends ONLY that service's fields
  (`SERVICE_FIELDS` map scopes exactly which keys go out per service),
  tests the connection, and shows a live ✓/✗ status badge + message
  inline in that card.
- **Disconnect** button (shown once a token is present) — clears just
  that service's credentials, in both the DB and local UI state,
  leaving the other two untouched.

The bottom "Save" button now only covers the AI Model preference
section (Gemini/Claude selector) — the three integrations are fully
self-contained above it.

## 10. Misleading "No credentials provided" error + repo URL pasting

**Symptom:** Clicking "Connect GitHub" with a token filled in still showed
"No credentials provided to test." — wrong message, since credentials
clearly were provided.

**Root cause:** `handleConnectService` only checked `data.status?.[service]`
to build its message. If the POST request failed server-side for ANY
reason (`data.success: false` — a real backend error), the code fell
through to the same generic "no credentials" placeholder instead of
surfacing the actual error, hiding what really went wrong.

**Fix:** check `data.success` first — on a real failure, show `data.error`
(the actual server error) instead of the generic placeholder. The "no
credentials" message is now only shown when the fields genuinely are
empty.

**Also fixed:** the Repository Name field showed a full URL
(`https://github.com/owner/repo`) pasted in by mistake instead of just
the repo name. Added `cleanGithubField()` — if a pasted value contains
`github.com/owner/repo`, it now automatically extracts just the owner
into the Owner field and just the repo name into the Repository Name
field (also strips a trailing `.git`).

## Verification done

- `tsc --noEmit` against the full project: zero new type errors in any
  touched or created file (existing missing-module errors are just
  `node_modules` not being installed in this review sandbox — unrelated
  to these changes).
- NOT run against live Gemini/GitHub/Vercel APIs — no network access in
  this environment. Test the risk-gate confirmation flow and one real
  self-heal case (e.g. intentionally break an HTML file) after deploying.
