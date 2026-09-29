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
- Not covered: the deterministic local engine does not benchmark (no LLM available).

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
