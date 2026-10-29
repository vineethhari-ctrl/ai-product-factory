# AI Product Factory

Express + Vite + React app. The browser calls `/api/*`; the Express server (`server.ts`)
routes LLM work through `server/llmRouter.ts`. No provider is called from the browser and no
provider key is exposed to it.

## Commands
- `npm run dev` – start Express + Vite (port 3000)
- `npm run lint` – `tsc --noEmit`
- `npm run build` – Vite build + server bundle
- `npm install` works plainly: `.npmrc` sets `legacy-peer-deps=true` (existing esbuild/vite peer conflict)

## Environment (server-side only, never `VITE_`-prefixed)
- **Gemini service** (`geminiBackend` / `geminiAuth`, routing.ts): the regular Gemini API with `GEMINI_API_KEY`, or
  **Vertex AI** when `GOOGLE_GENAI_USE_VERTEXAI=true` (Google's own variable, also read from the PC environment):
  `GOOGLE_API_KEY` (a Vertex key) is used, else `GOOGLE_CLOUD_PROJECT` + `GOOGLE_CLOUD_LOCATION` (default `global`)
  with the machine's Google sign-in. `AI_GEMINI_BACKEND=api|vertex` overrides the switch. `geminiClientOptions`
  always passes `vertexai` explicitly, because the SDK would otherwise follow a PC-wide Google variable and send a
  regular Gemini key to Vertex. Default Gemini model for the heavy steps is **gemini-4-argon** (released Oct 2026;
  intro price $2/$10 per million tokens, estimated in `usage.ts`); a key without access to it fails over to Pro.
- `GEMINI_API_KEY` – Gemini provider. If unset, Gemini is skipped.
- `ANTHROPIC_API_KEY` – Claude provider. If unset, Claude is skipped.
- With neither key, every endpoint serves the deterministic local engine.

## Model Routing Architecture Matrix

Source of truth: `server/routing.ts` (`ROUTING_MATRIX`, `TASK_ROUTE`, `TASK_PROVIDER_ORDER`). The clients read
`geminiRoute(task)` / `claudeRoute(task)` from it; edit only that file (or override in `.env`).

- Each task has its own provider order: the provider suited to the task first, the other as failover, then the
  local deterministic engine. A provider without a key is skipped, so one key alone runs every task on it.
- Per-task overrides in `.env`, no code change: `AI_ORDER_<TASK>=claude,gemini`, `AI_CLAUDE_MODEL_<TASK>=…`,
  `AI_GEMINI_MODEL_<TASK>=…`, `AI_GEMINI_FALLBACK_<TASK>=…|none` (`<TASK>` = task name upper-cased, `-` -> `_`). `claudeRoute` sets parameters by model
  family (Haiku: temperature, no effort, max 64k output; Sonnet/Opus 5.5: effort, no temperature), so a swap never
  sends a rejected parameter.
- The server logs the resolved chain per task at start-up (`[AI Routing] …`). `npm run check:routing` covers it.

| Task (button) | Endpoint | First | Failover | Why | Max tokens (applied) |
|---|---|---|---|---|---|
| `analyze-material` (Understand Business) | `/api/analyze-material` | gemini-4-argon (temp 0.2) | claude-sonnet-5-5 (effort medium) | Gemini reads large mixed material well | 24,576 Gemini / 16,384 Claude |
| `generate-definition` (Generate BRD) | `/api/generate-definition` | claude-sonnet-5-5 (effort high) | gemini-4-argon (temp 0.4) | Most quality-critical; long structured reasoning | 65,536 Gemini / 32,768 Claude |
| `generate-prototype-ui` (Build Prototype) | `/api/generate-prototype` | claude-sonnet-5-5 (effort high) | gemini-4-argon (temp 0.4) | Schema-enforced output: fewer unusable, still-billed answers | 65,536 Gemini / 32,768 Claude |
| `analyze-change` (Change Impact) | `/api/analyze-change` | claude-haiku-4-5 (temp 0.5) | gemini-3.6-flash (temp 0.5) | Small and frequent: cheapest model with guaranteed valid output | 2,048 |
| `research-prototype` (first half of Build Prototype) | `/api/generate-prototype` | gemini-4-argon + Google Search (temp 0.4) | claude-sonnet-5-5 + web search (effort medium) | Web research on comparable apps; Gemini searches natively | 16,384 / 16,000 |
| `generate-test-suite` (Use Cases & QA, opens once per BRD, or Generate with AI) | `/api/generate-tests` | gemini-4-argon (temp 0.3) | claude-sonnet-5-5 (effort high) | Long structured document from a finished BRD; Gemini first so one Vertex setup runs everything | 65,536 / 32,768 |
| `generate-engineering` (Engineering Package) | `/api/generate-engineering` | gemini-4-argon (temp 0.3) | claude-sonnet-5-5 (effort high) | Same | 65,536 / 32,768 |
| `generate-approach-note` (Approach Note tab, opens once per BRD, or Write with AI) | `/api/generate-approach` | gemini-4-argon (temp 0.3) | claude-sonnet-5-5 (effort high) | The leadership note from a finished BRD: reasoning (problems, options, phases, risks, proposed answers), not a template | 65,536 / 32,768 |

`/api/apply-change`, `/api/export-package` and `/api/export-engineering` make no model call (`export-package` is the rules-based package).

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

Gemini ceilings were re-set from the first live check with Argon (BRD 31k of 32k used, once cut off; analysis 10-11k; prototype 9-15k; research 2-3k; the same BRD took 15-17k on Pro). Other max-token changes are estimates, not measurements (the Gemini key was quota-limited when this
was written). Logs print `output N of ceiling` per call and warn when a response hits the ceiling, so
the numbers can be tightened toward the spec once real usage is visible.

### Failure handling
- Gemini: 429/503 retried 3x with backoff per model. Then, or on a 404, a cut-off (`MAX_TOKENS`), empty or
  schema-invalid response, the **second Gemini model** is tried (`geminiModels`: Argon -> Pro, Pro -> Flash, Flash -> Pro, also when `AI_GEMINI_MODEL_<TASK>` is set;
  `AI_GEMINI_FALLBACK_<TASK>` overrides, `none` turns it off), then the task's next provider. A rejected key
  skips the second model.
- Claude: SDK retries 429/5xx/529 (3x); refusal, `max_tokens` truncation or schema-invalid output ends
  the attempt and passes to the next provider.
- **Repair, don't reject** (`server/answerRepair.ts`, both clients): an answer that fails the schema is first repaired
  from the validation errors (closest allowed label, type conversion, leave out an optional value or use a neutral
  default, trim, drop only the one list item that cannot be fixed) and used if that makes it valid. Every fix is logged
  (`answer used after N small fix(es)`) and kept on the AI status (`repairs`; the header carries only `repairCount`).
  Gemini only: if the answer is still unusable (or not JSON), the same model is shown its errors once
  (`askForCorrection`, a 3-turn request) and the corrected answer is repaired and used (`corrected: true`); then the
  second model / next provider as before. `npm run check:repair` covers it.
- **Connection probe** (`npm run check:gemini`, `scripts/gemini.probe.ts`): one tiny request per way of connecting to Gemini (Vertex
  with key / key + project / project sign-in, regular API) and model (`gemini-4-argon`, Flash); prints what Google answered,
  never a key. Use it when Gemini refuses a key or a model.
- **Live check** (`npm run check:live [-- N | -- "Product name"]`, `scripts/live.check.ts`): runs name-only sample
  products through Understand Business, BRD and Build Prototype with the real keys from `.env` (limits off, separate
  usage log) and writes `live-check-report.md` (gitignored): per step the outcome, model, time, fixes, failures and
  simple output checks. Use it to find all real-model problems in one pass. The BRD is still one request; split it
  only if the report shows cut-offs or repeated unrepairable answers (splitting triples the AI calls per click).
- **Streaming** (`generate` in geminiClient.ts): Gemini answers are read as a stream. A long answer from a thinking model
  (minutes) otherwise exceeds the HTTP client's 5-minute wait for the first byte and fails with `fetch failed`. A dropped
  connection (`fetch failed`, reset, socket) is retried like a busy model; a missing Google sign-in is not. The live check
  saves a partial `live-check-report.md` after each product and on Ctrl+C.
- **The AI drives; offline only without a key.** When keys are set and every provider fails, `callLLMJSON` throws
  `AIUnavailableError`; the endpoint answers 503 `{error, aiUnavailable}`, the browser keeps the previous result and
  the banner offers Retry. The local engine answers only when no key is set (or a usage limit applies).
  `AI_OFFLINE_ON_FAILURE=true` restores the old fall-back-to-offline behaviour.
- A missing key skips that provider. A key still set to the `.env.example` placeholder (`MY_GEMINI_API_KEY`) counts
  as missing (`providerKey`, routing.ts).
- **AI status** (`setAIStatus`, usage.ts): every AI call records who answered (`ai` + model, `cache`,
  `offline-no-key`, `offline-limit`, `failed` (nothing produced) or `offline-failed` (opt-in) + each model's failure in plain words: busy, quota, model
  not available, key rejected, cut off, bad answer, refused, network). Sent as the `X-AI-Status` header; the
  browser shows `AIStatusBanner` under the header with the reasons, advice and **Retry with AI** (re-runs
  Understand Business, the BRD or Build Prototype).

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
  give the parties; a `<things> such as a, b, c` list gives a child entity with a type list. Without an arrow
  chain, 3+ "who does what" clauses (`clerks register books, volunteers shelve returns, members approve fees`) give
  the stages in order, each with its owner (`stageOwners`), and the first object is the subject. A name written as a
  request ("Build an app for X") takes its subject from X; a relative clause ("where ...") never becomes a role. With 3+ stages the
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

## The BU's own words reach the BRD on every path (`server/briefParser.ts`, `src/components/BrdDocument.tsx`)

`parseBrief` also reads labelled paragraphs (`Goal:`, `Journey:`, `Who does what:`, `Stakeholders / parties:`, `Pain points:`,
`Rules:`, `KPIs:`, `Integrations:`) into `goal`, `painPoints`, `rules` (split on `;`, one item each), `kpis`, `integrations`,
`parties`, per-party `partyDuties` and `stageOwners`. These are the BU's words, so rules and integrations are CONFIRMED.
- Offline: a structured brief replaces the keyword extractor's guesses in every section (`withLocalBlueprint`).
- AI path: the parsed brief is attached to the understanding and the definition (`blueprintBrief`), so stage owners reach the
  prototype prompt; `problemStatement` / `successMetrics` are asked of the model and filled from the brief when it omits them
  (`briefFacts`). `npm run check:brief` covers it with a model stand-in.
- The BRD tab renders the whole document (`BrdBody`): problem statement and KPIs, process and lifecycle with owners, personas,
  journeys, requirements per screen, rules, data dictionary with field validation, validations, notifications, integrations,
  standard non-functional requirements, assumptions and open questions per team.

## Test suite and engineering plan (AI-written, with a rules-based baseline)

Use Cases & QA and the Engineering Package are no longer fixed templates. Each is written by a model from the finished BRD
when one is configured (Gemini first, Claude as backup, same router, cache, limits and Retry banner as the other steps) and
derived from the BRD by rules otherwise. The screen says which (`origin`: "Written by the AI" / "Derived by rules").
- **Digest** (`server/definitionDigest.ts`): one compact reading of the BRD (roles and access, rules with codes, journeys, records
  with field constraints and lifecycle, screens, integrations, validations, open questions) shared by both prompts.
- **Test suite** (`server/testPrompt.ts`, `server/testSuiteService.ts`, `src/services/testSuite.ts`): use cases, a scenario matrix,
  executable test cases with payloads in the product's real field names, and a Gherkin feature. `ensureCoverage` guarantees every
  business rule has a scenario and a test case: a rule the model left out gets one added by the server, and the suite lists them
  (`addedForCoverage`); an invented rule code is not evidence (`GENERAL`); a payload that is not JSON is repaired. The rules-based
  suite (`buildTestSuite`) derives scenarios from each rule (holds / is violated), each lifecycle (valid path, skipped status), field
  limits, roles, integrations and the audit trail; a rule test tells the tester to arrange the rule-breaking condition (the engine
  cannot know how to break a business rule). The suite is stored on `definition.testSuite` with `basedOn` (fingerprint of the BRD);
  a changed BRD makes it stale and it is rewritten when the QA stage is opened. The BRD's "Use Cases & Tests" tab shows the same suite.
- **Engineering plan** (`server/engineeringPrompt.ts`, `server/engineeringPlan.ts`): architecture, services, per-record API contracts
  (list, create, read, change, status change that rejects a forbidden change, one endpoint per integration; roles and 403/404/409/422
  cases), events, quality targets with numbers and how each is verified, security controls, integration contracts, backlog with
  acceptance lines, deployment, risks, test strategy. `buildApiContracts` always gives the package real contracts (the package no longer
  lists one placeholder endpoint per module). Sections a model leaves empty are filled from `buildEngineeringPlan`; too few contracts are
  replaced. Shown by `EngineeringPlanPanel`.
- **BRD**: the definition prompt also asks for `nonFunctionalRequirements` and `risks` written for the product; the BRD tab shows
  them instead of the standard list when present.
- `npm run check:docs` covers it with model stand-ins (omitted rules, invented codes, bad JSON, empty answers, all providers failed).
  `npm run check:live` now also runs both steps and checks coverage, payload field names, contracts per record and quality targets.
  Nothing here has been run against a real model yet: run `npm run check:live` and read the report.

## Solution Approach Note (AI-written, with a rules-based baseline)

The Approach Note tab is written by a model from the finished BRD (Gemini first, Claude as backup; same router, cache, limits and
Retry banner), and derived by rules when no model answers. The tab says which (`origin`).
- **Prompt** (`server/approachPrompt.ts`, reads `definitionDigest`): executive summary, problems (stated first, inferred ones start with
  "Inferred:"), unconfirmed assumptions, solution per module, 2-4 real design options with a proposed pick, three phases covering every
  module with exit criteria, specific risks, and a proposed answer for every open question (`recommendations`, by Q-number).
- **Service** (`server/approachNoteService.ts`): the server sets the owning team and date of each decision (`decisionsFor`, from the
  question's audience and urgency), adds any module the model left out of the roadmap (`addedForCoverage`), ignores unknown question refs,
  and falls back to the rules-based note when the model wrote no phases and no solution.
- **Rules-based note** (`src/services/approachNote.ts`, `buildApproachNote`): problems from the BRD's problem statement, every module in
  the roadmap, the BRD's own AI-written risks first, then risks implied by the definition's state. No fixed boilerplate wording.
- Stored on `definition.approachNote` with `basedOn` (BRD fingerprint); a changed BRD makes it stale and it is rewritten when the tab is
  opened. `npm run check:approach` covers it with model stand-ins.

## Hash-chained ledger (generic; `server/proofChain.ts`, `src/services/proofChain.ts`, `src/components/ProofChain.tsx`)

When the BRD says records are hash-chained, tamper-evident, Merkle-anchored or an append-only ledger, the prototype gets ONE ledger
screen the user can try: blocks linked by a real SHA-256 (`src/services/sha256.ts`, computed in the browser), **Verify chain**,
**Edit this record** (tamper), **Recompute all hashes (hide it)** and **Add record**. Editing a block breaks it and every block after
it (hashes are recomputed forward from the genesis); recomputing every hash looks consistent but the published anchor (head hash of the
records sealed first) no longer matches; a record appended later is a valid extension.
- **Trigger** (`needsChain`): a record with a previous-hash field and its own hash field (`chainEntity`), or BRD text (objective, modules,
  rules, screens, record descriptions, integrations) matching hash chain / tamper-evident / cryptographically chained / Merkle /
  blockchain / an append-only ledger. A plain "append-only audit log" is boilerplate and does NOT trigger; the engine's own generic
  blueprint wording (`br-bp-<n>`, `scr-bp-*`, `ent-bp*`, `mod-bp*`) is ignored.
- **Who builds it**: the design prompt (`LEDGER_RULES`, only when `needsChain`) asks the AI to mark one screen `ui.chain` with its table
  as the records in sealed order and never to write hashes; `withProofChain` (end of `withDocuments`, so after the BRD, after the design
  and offline) guarantees it: an AI-marked screen is kept, a screen bound to the chain record gets the marker, otherwise one dedicated
  `scr-chain-1` screen is added (columns from the chain record's business fields, or one row per lifecycle step). Idempotent; a later design that
  drops the marker gets it back on the same screen.
- **Who did what is always shown.** `ui.chain.by` is 'AI' (the design marked its own ledger screen) or 'FACTORY' (`withProofChain` attached it),
  and `ui.addedBy = 'FACTORY'` marks a whole screen the factory added. The panel prints one of three labels (`PROVENANCE_TEXT`): screen designed by
  the AI (hashing is the factory's), added by the factory (not designed by the AI), or ledger added by the factory to an AI screen. A factory screen
  is never counted as the AI's (`designedScreenCount`, `factoryScreenCount`, `isPrototypeDesigned` in `src/services/prototypeState.ts`); the design bar
  and the toast say "+ N added by the factory". If the AI marks its own ledger, the factory's earlier ledger screen is removed.
- `ui.chain = { title, note?, ledgerOnly?, by? }` (`ledgerOnly` hides the plain table). `npm run check:chain` (SHA-256 vs Node, chain logic, trigger,
  screen, prompt, the real panel in jsdom, domain neutrality; needs jsdom like `check:ui`).

## AI usage control (`server/usage.ts`)

Who spent what, per BA and project, with limits, a monthly budget and a response cache. Settings in `.env.example`.
- **Identity**: the browser asks the BA's name once (`IdentityPrompt`) and creates a project id on New Initiative
  (`src/services/aiSession.ts`); every `/api` call carries `X-User` and `X-Project-Id`. Self-declared: team
  accountability, not security.
- **Router order** (`llmRouter.ts`): no key for the task's providers -> local engine (not metered); cache hit (same
  task + prompt) -> saved result, free and not counted; over a limit -> local engine with a notice; else the task's
  providers in order.
- **Click** = one AI button press that reached a provider. Tokens come from the provider responses
  (`recordTokens` in both clients, including unusable answers and Gemini thinking tokens). Calls with no tokens
  (network failure) are not counted.
- **Limits** (rolling 24 h): per project per button (3), per BA per button (3), BA daily tokens (300k); team monthly
  budget in USD ($50). Over a limit the request is answered offline, never refused.
- **Notices**: `X-AI-Notice` response header (tokens used and cost, cache reuse, limit reached) -> toast.
  `GET /api/usage` -> the BA's tokens and per-button counts, the project's counts, and the team's month by BA/day,
  shown by `UsagePanel` in the header.
- Prompts must not embed timestamps or random ids, or the cache never hits (the server sets identity fields).
- Storage: `DATA_DIR/ai-usage.json` and `DATA_DIR/ai-cache/` (gitignored). Costs are estimates from list prices
  (`AI_PRICE_<MODEL>` overrides). `npm run check:usage` covers limits, budget, cache, metering and the router.

## Reading uploaded files (`src/services/materialExtractor.ts`)

Files are read in the browser at upload; the text becomes `contentSnippet`, which the AI prompts, the offline
engine and the brief parser already use.
- Word (.docx: paragraphs, tables as `a | b | c` rows), PowerPoint (.pptx: slide text in order plus speaker
  notes), Excel (.xlsx/.xlsm: every sheet by name, rows as `a | b`, up to 500 rows a sheet) via JSZip; PDF via
  pdf.js (`pdfjsBrowser.ts`, loaded only when a PDF is uploaded; its worker is a separate build asset); text, CSV,
  Markdown, JSON as written.
- Not read, with a plain-language note to the BA: images and audio (asks for a description or transcript), old
  .doc/.ppt/.xls (asks to Save As the new format), scanned PDFs (almost no text per page), damaged or
  password-protected files. Unread files still tell the AI they exist.
- Each file is capped at 40,000 characters (about 10k tokens); a cut is stated in the text and the note.
- `UploadedMaterial.extraction` holds the result (`read` / `partial` / `not-read` / `error`), shown as a badge per
  file; the eye icon shows exactly the text the AI will read. Understand Business waits until every file is read.
- `npm run check:materials` reads real Word, PowerPoint, Excel, PDF and text fixtures (`scripts/fixtures/materials`)
  plus the unreadable cases.

## Questions for two audiences (`src/services/questionAudience.ts`)

Every clarification, gap, conflict and open question carries `audience`: `BU` (BU Team) or `TECH` (BA & Tech Team).
- **BU Team**: business flows, rules, user journeys, KPIs, in plain language. **BA & Tech Team**: data design,
  interfaces, architecture, security, system limits.
- The AI is told the rule (`QUESTION_AUDIENCE_RULES`, `server/questions.ts`) and must label each question. The server
  then checks: a question with technical vocabulary (`technicalTerms`) goes to TECH whatever the model said; a BU
  question whose "impact" text has jargon gets a plain impact line. Words that are also business language in some
  industries (server, tenant, protocol, container, queue, polling) count only inside a technical phrase.
- When a team has no questions, standard ones are added: 6 plain BU questions built from the BU's own nouns
  (approval, timings, KPIs, skipping steps, who sees what, today's problems) and 5 tech ones.
- Screens show "1. BU Team" and "2. BA & Tech Team" as separate sections, each with its own count and its own
  copy-for-email; the engineering package lists open questions per team. Old saved projects are sorted on the fly
  (`forAudience`, `labelOpenQuestion`).
- `npm run check:questions` covers the classifier, the standard questions, the offline pipeline, the LLM path
  (a jargon BU question is moved) and domain neutrality.

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
- **Checks**: `npm run check:transactions` (business documents), `npm run check:repair` (repairing AI answers, corrective retry), `npm run check:live` (real AI, needs a key; not part of the offline set), `npm run check:prototype` (AI-designed prototype, reference screen), `npm run check:materials` (reading uploaded files), `npm run check:questions` (BU / BA & Tech question split), `npm run check:thin` (name-only pipeline), `npm run check:usage` (AI usage control), `npm run check:routing` (per-task model routing), `npm run check:validation` (engine, three unlike domains, route, SQL, pipeline) and
  `npm run check:ui` (drives the real form in jsdom; needs `npm install --no-save jsdom --legacy-peer-deps`).

## Prototype UI

**Build Prototype = research, then design.** Without a reference screen, `research-prototype` runs first
(`buildResearchPrompt`, web search: Gemini Google Search grounding / Claude `web_search_20260209`; JSON in text, validated
by `DesignResearchSchema`, pages read become `sources`): the AI finds 3-4 real, well-regarded apps doing the same kind of
work, what to borrow from each, the visual direction and a pattern per screen. The brief goes into the design prompt and
is kept as `definition.designResearch`, shown under the app as "How the AI designed this prototype". If research fails
the design still runs from the definition alone. With a reference screen there is no research: the screenshot wins.
Research may name real comparable products it found (owner's decision, 17 Oct 2026); the prompt code itself names
none, and only layout and interaction patterns are borrowed, never names, logos, wording or data.

The design returns `theme` (`uiTheme`: primary/accent hex, sidebar dark/light/brand, density) and per screen `device`
(`phone` for a screen an outside party uses on their own phone), optional `chart` (bar/line/donut), `board` (cards in
stage/status columns) and `timeline` (record history), cleaned by `cleanTheme` / `cleanUIBlocks`. The offline engine
fills the same blocks (trend and per-stage charts, status board, record history, phone screen for a stage owned by an
outside-party role word) and a colour picked from the product name (`themeFor`).

**The app frame** (`AppShell.tsx`): the prototype is shown as the finished application: left menu (screens grouped by
module), top bar (search, bell, signed-in sample user for the selected role), page header with the main action, in the
product's theme (CSS variables `--brand`, `--brand-accent`). Factory controls live in one slim bar above it ("Design
tools" opens the reference-screen bar and the instant customizer); notes, rules and the research sit below it.
Blocks are in `UIBlocks.tsx` (status chips, chart, board, timeline, phone frame).

**Build Prototype is AI-designed** (`server/prototypePrompt.ts`): the AI gets the BU's process (stages in order and
who does each, from `blueprintBrief`), users, journeys, records with status values (system fields hidden), rules and
every screen's job, and designs each screen for that job in the BU's own words. Optional **reference screen**
(`PrototypeDesignBar`: upload, shrunk to 1400 px JPEG in the browser, `referenceImage` on `/api/generate-prototype`,
checked by `server/referenceImage.ts`, max 4 MB, part of the cache key): the AI copies its layout, never its words or
data. The prompt names no company, product or industry; `inspiredBy` is a generic pattern name.
- `ui.origin = 'AI'` marks AI designs (definition and prototype). Build Prototype reuses a prototype only when every
  screen is AI-designed, so offline designs (from an AI outage or no key) always go back to the AI. "Design / Redesign
  with AI" forces a new design. Screens the AI skips keep an offline design. `npm run check:prototype` covers it.

Each screen carries a `ui` blueprint (`ScreenUISpec`: kpis, filters, sample table, detailPanels,
primaryActions, benchmarkNote) generated on every run, not only in benchmark mode. `ScreenCanvas.tsx`
renders it per `layoutType` (dashboard, table-detail, split-view, form-wizard, profile-360, transaction) with row
selection, filters, search, read-only role locking and a badge on benchmark-derived screens. Sample
values are illustrative. Screens without `ui` (older definitions, the demo pack) fall back to the
hand-built canvases in `PrototypeScreen.tsx`. Table rows are forced to the column count on the server.

### Business documents (transaction screens)

The core of every prototype: the documents users create and move through the process (whatever the BU calls them).
- **Model** (`src/types.ts`): `ui.document: TransactionDocument` on a `transaction` screen: `name`, `numberPrefix`,
  header `sections` of typed `fields` (text, long-text, number, money, percent, date, select, lookup, email, phone,
  checkbox; `required`, `readOnly`, `sample`), optional `lines` (columns + quantity/price/discount/amount column
  names), `totals` (currency, header discount %, tax label/%), `states`, `actions` (`from`, `to`, `role`,
  `needsReason`, `creates` = convert to the next document) and `related` (`from`, `next`).
- **Maths and workflow** (`src/services/documentMath.ts`, browser and server): line amount = qty x price less
  discount %, totals, money format, `actionsFor`, `missingRequired`.
- **AI**: `DOCUMENT_RULES` (`server/prototypePrompt.ts`) and the BRD's "BUSINESS DOCUMENTS FIRST" rule: list the
  documents per process, one transaction screen each; the AI may add up to 4 `scr-doc-…` screens (name, module,
  purpose), added with nav and module by `addDocumentScreen`. `cleanDocument` (`server/documents.ts`) repairs the
  document (kind synonyms, a select needs 2+ options, unique labels, rows fitted to columns, amount column added,
  real states only, step actions when none).
- **Offline / guarantee**: `withDocuments` (called by `ensureScreenUI` and after the AI BRD) builds a document from the
  screen's record (`documentFromEntity`: business fields only, never system/status/id fields; lines from the brief's
  parts; states and actions from the lifecycle) and turns the first register screen into a transaction screen when
  there is none (its KPI tiles are dropped). The first action is "New <document>".
- **UI** (`TransactionScreen.tsx`): document list with status chips and search -> New / open -> header fields, line
  grid with Add line and live totals, workflow buttons (reason when needed; required fields checked before leaving
  the first status; fields lock after it), status stepper, document chain, history. Transaction screens come first.
- `npm run check:transactions` (maths, cleaning, offline pipeline, AI stub, neutrality, the real screen in jsdom);
  `check:live` reports each product's business documents.

## Conventions
- Output shapes are zod schemas in `server/aiSchemas.ts`: enforced by Claude structured outputs
  and validated after parsing for Gemini. Keep them in sync with `src/types.ts`.
- Gemini follows the JSON shape written in the prompt, Claude follows the schema. Where they differ
  (`evidenceMapping`), pass a `coerce` function to `callLLMJSON`.
- Identity fields (`id`, `version`, `timestamp`, `status`, `isApproved`) are set by the server after
  parsing, never trusted from a model.
- Do not send `temperature`/`top_p`/`budget_tokens` or `thinking: disabled` to Claude Sonnet 5.5 / Opus 5.5 (400); do not send `effort` to Haiku 4.5.
