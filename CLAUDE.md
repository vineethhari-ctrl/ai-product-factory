# AI Product Factory

Express + Vite + React app. The browser calls `/api/*`; the Express server (`server.ts`)
routes LLM work through `server/llmRouter.ts`. No provider is called from the browser and no
provider key is exposed to it.

## Commands
- `npm run dev` – start Express + Vite (port 3000)
- `npm run lint` – `tsc --noEmit`
- `npm run build` – Vite build + server bundle
- `npm install` needs `--legacy-peer-deps` (existing esbuild/vite peer conflict)

## Environment (server-side only, never `VITE_`-prefixed)
- `GEMINI_API_KEY` – primary provider. If unset, Gemini is skipped.
- `ANTHROPIC_API_KEY` – failover provider. If unset, Claude is skipped.
- With neither key, every endpoint serves the deterministic local engine.

## Model Routing Architecture Matrix

Source of truth: `server/routing.ts` (`ROUTING_MATRIX`, `TASK_ROUTE`). `GEMINI_MODELS` (in
`geminiClient.ts`) and `MODEL_ROUTES` (in `claudeClient.ts`) are derived from it; edit only that file.

- Primary provider: Google Gemini (`GEMINI_API_KEY`)
- Failover provider: Anthropic Claude (`ANTHROPIC_API_KEY`)
- Fallback engine: local deterministic engine
- Order per task: **Gemini -> Claude -> local**. One model per provider per task.

| Matrix rule | Backend task (endpoint) | Gemini primary | Claude failover | Temp | Max tokens (applied) |
|---|---|---|---|---|---|
| 1. OEM benchmark inference & KPI analytics | `analyze-material` (`/api/analyze-material`) | gemini-3.1-pro-preview | claude-sonnet-5-5 (effort medium) | 0.2 (Gemini only) | 16,384 |
| 2. Interactive UI prototyping & code generation | `generate-definition` (`/api/generate-definition`) | gemini-3.1-pro-preview | claude-sonnet-5-5 (effort high) | 0.4 (Gemini only) | 32,768 |
| 3. Fast general text & standard route intent | `analyze-change` (`/api/analyze-change`) | gemini-3.6-flash | claude-haiku-4-5 | 0.5 | 2,048 |

`/api/apply-change`, `/api/export-package` and `/api/export-engineering` make no model call.

### Deviations from the matrix as written (and why)
| Spec | Applied | Reason |
|---|---|---|
| `gemini-1.5-pro` | `gemini-3.1-pro-preview` | 1.5 and 2.5 models return 404 for this key |
| `gemini-1.5-flash` | `gemini-3.6-flash` | same |
| `claude-3-5-sonnet` | `claude-sonnet-5-5` | retired 2025-10-28; not callable |
| `claude-3-haiku` | `claude-haiku-4-5` | retired 2026-04-19; not callable |
| Temperature 0.2 / 0.4 on Claude | not sent | Claude Sonnet 5.5 rejects any temperature (HTTP 400); Gemini and Haiku honor it |
| Max tokens 4,096 (rule 1) | 16,384 | Estimated too small for the analysis JSON; would be cut off |
| Max tokens 8,192 (rule 2) | 32,768 | Estimated too small for a definition with per-screen UI blueprints |

The max-token changes are estimates, not measurements (the Gemini key was quota-limited when this
was written). Logs print `output N of ceiling` per call and warn when a response hits the ceiling, so
the numbers can be tightened toward the spec once real usage is visible.

### Failure handling
- Gemini: 429/503 retried 3x with backoff; a cut-off (`MAX_TOKENS`), empty or schema-invalid response
  ends the attempt and fails over to Claude.
- Claude: SDK retries 429/5xx/529 (3x); refusal, `max_tokens` truncation or schema-invalid output ends
  the attempt. Then the local engine serves the request.
- A missing key skips that provider.

## Industry-benchmark inference (thin BU input)

When the BU does not specify enough, the system predicts requirements from how comparable
organisations/OEMs build such products, and builds the prototype from that. Logic: `server/benchmark.ts`.
- **Thin** = fewer than 2 materials or under 2,500 characters of content (analysis), or under 30%
  CONFIRMED items (definition). Rich input is left alone.
- A benchmark directive is added to the analyze/generate prompts; the industry is inferred from the BU.
- Everything predicted is `INFERRED` with a first evidence entry `Industry benchmark: <pattern>`. The
  server adds the tag if the model forgets, and always adds a validation gap (analysis) and a blocking
  open question (definition), so nothing inferred passes as confirmed.
- `benchmark: { applied, industry, reason }` on `BusinessUnderstanding` / `ProductDefinition` drives the
  banners. Never claim facts about a named company; patterns stay generic.
- Materials are optional: a product name alone is accepted (`/api/analyze-material` returns 400 only when both
  are missing) and is treated as thin input.
- Without an LLM, the local engine applies the **product blueprint** (`server/blueprint.ts`): the product's
  subject is derived from the head of its name, before any preposition ("Service Requests Portal" -> "Service
  Request", "Bay planning for Job Controller in ..." -> "Bay Plan"); a "for <role>" qualifier ending in a generic
  job-role word becomes the operator persona ("Job Controller"). The subject is wrapped in the common
  operational shape: 5 roles (incl. a read-only auditor), 3 modules, 6 screens covering all five layouts, a
  lifecycle entity with rules plus an activity entity, 4 journeys, 7 rules and 4 integrations. It fills only
  sections the keyword extractor found nothing for, and it tops screens up to at least 4. Everything is
  INFERRED and tagged, with the same validation gap and blocking question as the LLM path; the banner industry
  is "cross-industry operational software". The blueprint has no domain knowledge: every noun comes from the
  BU input.
- **Brief-driven blueprint** (`server/briefParser.ts`, `server/processBlueprint.ts`): before falling back to the
  generic shape, the local engine reads the BU's own words (notes plus material text) for writing patterns, not
  domain words: an arrow chain `A → B → C` gives the lifecycle stages; `X 360` (or the noun shared by the stages)
  gives the subject; acronyms defined as groups (`ABCs (… Partners)`), lowercase role plurals and slash groups
  give the parties; a `<things> such as a, b, c` list gives a child entity with a type list. With 3+ stages the
  product is built around the process: lifecycle states = stages + On Hold/Cancelled (in-order transitions), an
  intake form for the first stage, one work screen per stage group (max 8), a 360 view with the stage timeline
  and parts by serial, per-stage performance, a stage-record (proof of record) entity, one module per phase
  and parties as personas. The parsed brief is stored as `blueprintBrief` on the understanding and definition
  so later steps rebuild the same blueprint. `buildBlueprint` picks process or generic.
- Saved sessions from before the blueprint are upgraded on Build Prototype: the client does not reuse UI whose
  note starts "Generic enterprise workbench pattern" or placeholder (MISSING) screens, and
  `generatePrototypeUI` drops that legacy UI and rebuilds a placeholder-only definition from the blueprint.
- `ensureScreenUI` gives every screen without a `ui` a full blueprint from its entity. Sample data comes from
  a seeded PRNG (stable across renders), filter chips are taken from the sample rows so they really filter,
  and status is always the last column.
- `npm run check:thin` runs a name-only pipeline for three unlike products and a brief with a process chain, and
  checks parsing, screens, UI, lifecycle order, form validation, tagging, determinism and domain neutrality.

## Field constraints & validation (domain-neutral)

The factory infers each entity's compulsory fields and validation rules for ANY domain; the code has
no domain knowledge. Nothing in the engine, the prompt rules or the form may name a business domain.
- **Model** (`src/types.ts`): `DataFieldDefinition` gains optional `constraints` (format, length, pattern,
  range/step/precision, enumValues, unique, immutable, sensitivity), `origin` (BU / INFERRED / SYSTEM) and
  `source` (user / system / derived). `DataEntityDefinition` gains `lifecycle`, `rules` and
  `crossRecordRules`. All optional, so old sessions still load. Legacy `type` strings such as
  `string(17)` or `enum(A, B)` are parsed into constraints.
- **Engine** (`src/services/validationEngine.ts`): pure TypeScript, imported by both the browser and
  Express. `validateRecord`, `evaluateRules`, `canTransition`, `withSystemFields`, `entityToSQL`.
  Rule vocabulary: conditional, compare, requiredTogether, mutuallyExclusive. Edit rules here once, both
  sides change.
- **System fields**: `id` (unless a business key exists), `createdAt/By`, `updatedAt/By`, `rowVersion`, plus
  the lifecycle status field. Injected by the server for every entity; clients may not send them.
  Existing fields with alias names (`created_at`) keep their name but take the system constraints.
- **Untrusted patterns**: model- and client-supplied regexes go through `isSafePattern` (length cap, no
  backreferences, no quantified group with an unbounded quantifier or alternation). Unsafe ones are dropped
  with a warning in `definition.constraintWarnings`.
- **Inference**: `FIELD_INFERENCE_RULES` (server/constraints.ts) is added to the definition prompt.
  `normalizeDefinitionConstraints` sanitises the result, drops rules that reference unknown fields, marks
  provenance, and `finalizeConstraints` adds the BU review question `oq-constraint-validation`. Fields the
  local engine invents are marked INFERRED even when the entity is confirmed.
- **API**: `POST /api/validate-record` `{ entity, record, mode, existing? }` -> 200 `{valid:true}`,
  422 `{valid:false, issues[{path,code,message}]}`, 400 malformed, 413 over 1 MB. Stateless: nothing is
  stored. Rules that need storage (uniqueness, capacity, references) are NOT checked; they are listed as
  `crossRecordRules` and written into the engineering package for the real backend.
- **Engineering package**: SQL now has NOT NULL / UNIQUE / CHECK / enum constraints and section 8 of the
  requirements document lists fields, lifecycle and rules.
- **UI**: a `form-wizard` screen renders `EntityForm` (real inputs, blur validation, conditional
  fields, stable steps, no double submit, server verdict) for `ui.entity`, else an entity whose name
  appears in the screen text. The Data Entities tab shows constraints and provenance; the BU can Confirm
  an inferred field or toggle Required in edit mode. Editing the other constraints is not built yet.
- **Checks**: `npm run check:thin` (name-only pipeline), `npm run check:validation` (engine, three unlike domains, route, SQL, pipeline) and
  `npm run check:ui` (drives the real form in jsdom; needs `npm install --no-save jsdom --legacy-peer-deps`).

## Prototype UI

Each screen carries a `ui` blueprint (`ScreenUISpec`: kpis, filters, sample table, detailPanels,
primaryActions, benchmarkNote) generated on every run, not only in benchmark mode. `ScreenCanvas.tsx`
renders it per `layoutType` (dashboard, table-detail, split-view, form-wizard, profile-360) with row
selection, filters, search, read-only role locking and a badge on benchmark-derived screens. Sample
values are illustrative. Screens without `ui` (older definitions, the demo pack) fall back to the
hand-built canvases in `PrototypeScreen.tsx`. Table rows are forced to the column count on the server.

## Conventions
- Output shapes are zod schemas in `server/aiSchemas.ts`: enforced by Claude structured outputs
  and validated after parsing for Gemini. Keep them in sync with `src/types.ts`.
- Gemini follows the JSON shape written in the prompt, Claude follows the schema. Where they differ
  (`evidenceMapping`), pass a `coerce` function to `callLLMJSON`.
- Identity fields (`id`, `version`, `timestamp`, `status`, `isApproved`) are set by the server after
  parsing, never trusted from a model.
- Do not send `temperature`/`top_p`/`budget_tokens` or `thinking: disabled` to Claude Sonnet 5.5 / Opus 5.5 (400); do not send `effort` to Haiku 4.5.
