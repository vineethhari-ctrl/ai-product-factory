import { 
  BusinessUnderstanding, 
  ProductDefinition, 
  UploadedMaterial, 
  ChangeImpactAnalysis, 
  EngineeringPackage,
  ConfidenceStatus,
  ClarificationItem 
} from "../src/types";
import { callLLMJSON } from "./llmRouter";
import { FIELD_INFERENCE_RULES, constraintOpenQuestion, normalizeDefinitionConstraints, validationRulesMarkdown } from "./constraints";
import { entityToSQL } from "../src/services/validationEngine";
import {
  BENCHMARK_TAG,
  UI_SPEC_RULES,
  analysisBenchmarkDirective,
  assessMaterialThinness,
  assessUnderstandingThinness,
  benchmarkInfo,
  benchmarkOpenQuestion,
  definitionBenchmarkDirective,
  normalizeUISpec,
  tagInferredEvidence,
  tagInferredReferences,
} from "./benchmark";
import { BusinessUnderstandingSchema, ProductDefinitionSchema, ChangeImpactSchema, PrototypeUISchema } from "./aiSchemas";
import { ensureScreenUI } from "./blueprint";
import { blueprintToUnderstanding, buildBlueprint } from "./processBlueprint";

/**
 * Enterprise Intelligent Synthesis Engine (Fallback / Modular baseline)
 * Guarantees strict evidence referencing and confidence status categorization.
 */
export async function analyzeBusinessMaterial(
  materials: UploadedMaterial[],
  productName: string,
  businessUnit: string,
  description: string = ""
): Promise<BusinessUnderstanding> {
  const materialsSummary = materials.map((m, idx) => 
    `[Source ${idx + 1}: ${m.filename} (${m.fileType})] \n${m.contentSnippet || 'Uploaded file content'}`
  ).join("\n\n---\n\n") || "(No materials were supplied. Only the product name, business unit and notes above are known; predict the rest from industry benchmarks.)";

  const thinness = assessMaterialThinness(materials, description);
  const benchmarkBlock = thinness.thin ? analysisBenchmarkDirective(thinness.reason) : "";

  const prompt = `COGNITIVE ROLE & LINGUISTIC NORMALIZATION DIRECTIVE:
1. COGNITIVE ROLE & NORMALIZATION ENGINE: You act as an Autonomous Principal Systems Architect and Enterprise Business Strategist. Treat all incoming user inputs, notes, logs, and uploaded materials strictly as unstructured semantic signals, not final prose. Recognize that incoming signals are inherently noisy, draft-quality, and contain shorthand, typographical errors, phonetic mistakes, keyboard slips, and grammatical flaws.
2. AUTONOMOUS INTENT DECODING & ERROR RECTIFICATION: For ANY input, first reconstruct the underlying intended meaning using global technical, engineering, and enterprise domain context (inferring intended acronyms, hardware protocols, software frameworks, operational workflows, and domain terminology from semantic context). Automatically rectify all typographical, spelling, structural, and grammatical errors during ingestion before generating output.
3. OUTPUT STANDARDIZATION & ZERO-PASSTHROUGH: Every string produced in the resulting JSON—without exception (including summaries, objectives, personas, modules, screens, user journeys, rules, data entities, integrations, UI observations, conflicts, gaps, and array items)—must be generated in formal, executive-grade, grammatically flawless enterprise English. Raw passthrough, unedited transcriptions, or verbatim echoing of noisy source text in any schema property is strictly forbidden.

System Goal: Synthesize unorganized materials (screenshots, PPTs, meeting notes, transcripts, slack dumps, data dictionaries) into an executive-grade Business Understanding for product "${productName}" in business unit "${businessUnit}".
User Context / Notes: ${description}

${benchmarkBlock}
EVIDENCE & CONFIDENCE CATEGORIZATION RULES:
1. Categorize item confidence accurately:
   - CONFIRMED (directly supported by evidence in source materials)
   - INFERRED (logical deduction/expansion by AI strategy)
   - AMBIGUOUS (conflicting statements between sources)
   - MISSING (critical gaps essential for system architecture)
2. Every item MUST cite source evidence (e.g., "Evidence: Q3_Fleet_Mobility_Modernization.pptx Slide 9" or "Transcript_Sync.txt").
3. DEVELOPMENT PREREQUISITES & ARCHITECTURAL GAPS:
   - In 'missingInformation', 'conflicts', and BU clarifications, extract and formulate DEEP, INTELLIGENT PREREQUISITES REQUIRED FOR DEVELOPMENT.
   - Focus on missing technical specs, error turnaround SLAs, multi-tenant data isolation, security authentication handshakes, rate-limiting policies, and data retention windows that developers MUST resolve before writing production code.
4. Flag real contradictions and genuine missing requirements clearly.

AUTONOMOUS FIELD, VALIDATION & RULE INFERENCE (CRITICAL — DO NOT SKIP):
5. DATA ENTITIES — ALWAYS COMPREHENSIVE: For every data entity, generate 8-15 fields with correct types (string, number, boolean, timestamp, enum(...), text, json, uuid), accurate required flags, and descriptive notes. NEVER leave an entity with fewer than 6 fields. Even if the BU mentions zero fields, predict them from domain knowledge. Include: primary key (id/uuid), created_at, updated_at, created_by, status, and all domain-specific attributes a real production system would need.
6. BUSINESS RULES — ALWAYS DEEP: Generate at least 6-10 business rules covering: data validation constraints, workflow state transition guards, SLA enforcement thresholds, permission boundary rules, audit and compliance triggers, and domain-specific regulatory constraints. Use your knowledge of the industry to infer rules the BU hasn't mentioned but WILL need.
7. VALIDATIONS — ALWAYS GENERATE: Produce comprehensive input validation rules for every form field across every screen — email format, phone format, required field enforcement, min/max length, numeric range, date range, enum value constraints, unique constraints, and cross-field dependencies. Generate at least 8-12 validation rules.
8. NOTIFICATIONS — ALWAYS GENERATE: Predict event-driven notification triggers (status changes, SLA breaches, assignment events, approval workflows, escalations) with appropriate channels (Email, Push, SMS, In-App) and recipients.
9. PERMISSIONS — ALWAYS GENERATE: Generate a complete role-based access control matrix for every persona, with specific constraints per entity and screen.
10. INTEGRATIONS — ALWAYS PREDICT: Even if not mentioned, infer likely integrations (authentication/SSO, email/SMS gateway, payment gateway, analytics/BI, cloud storage, CRM, ERP) based on the product domain.

MATERIALS TO SYNTHESIZE:
${materialsSummary}

Return ONLY a valid JSON object matching this schema:
{
  "inferredIndustry": "The industry and product category this product belongs to, e.g. Automotive OEM - connected vehicle and dealer service",
  "overallSummary": "Polished, executive-level overview synthesizing the core strategic vision, value proposition, and operational scope of the product",
  "businessObjective": {
    "id": "bo-1",
    "title": "Core Business Objective Title",
    "description": "Comprehensive, value-driven explanation of the problem solved and key strategic outcomes",
    "status": "CONFIRMED" | "INFERRED",
    "evidenceReferences": ["source_filename.ext Slide X"]
  },
  "personas": [
    {
      "id": "p-1",
      "title": "Persona Name / Role Title",
      "description": "Articulate summary of key responsibilities, daily workflows, access boundaries, and operational goals",
      "status": "CONFIRMED" | "INFERRED" | "AMBIGUOUS",
      "evidenceReferences": ["source_filename.ext"]
    }
  ],
  "modules": [
    {
      "id": "m-1",
      "title": "Module Name",
      "description": "Clear domain scope description detailing capabilities and enterprise boundary",
      "status": "CONFIRMED" | "INFERRED",
      "evidenceReferences": ["source_filename.ext"]
    }
  ],
  "screens": [
    {
      "id": "s-1",
      "title": "Screen Title",
      "description": "Functional description of screen purpose, layout architecture, and key interactive components",
      "status": "CONFIRMED" | "INFERRED",
      "evidenceReferences": ["source_filename.ext"]
    }
  ],
  "userJourneys": [
    {
      "id": "uj-1",
      "title": "User Journey Title",
      "description": "Cohesive, step-by-step operational task flow detailing trigger, sequence, and outcome",
      "status": "CONFIRMED" | "INFERRED",
      "evidenceReferences": ["source_filename.ext"]
    }
  ],
  "businessRules": [
    {
      "id": "br-1",
      "title": "Rule Code / Rule Title",
      "description": "Formal, unambiguous business or compliance constraint written in enterprise governance language",
      "status": "CONFIRMED" | "INFERRED" | "AMBIGUOUS",
      "evidenceReferences": ["source_filename.ext"]
    }
  ],
  "dataEntities": [
    {
      "id": "de-1",
      "title": "Data Entity Name",
      "description": "Domain data entity definition with key attributes, lifecycle states, and structural relationships",
      "status": "CONFIRMED" | "INFERRED",
      "evidenceReferences": ["source_filename.ext"]
    }
  ],
  "integrations": [
    {
      "id": "int-1",
      "title": "System / API Integration",
      "description": "Systemic integration purpose, data exchange protocols, and synchronization mechanisms",
      "status": "CONFIRMED" | "INFERRED",
      "evidenceReferences": ["source_filename.ext"]
    }
  ],
  "uiObservations": [
    {
      "id": "uio-1",
      "title": "UI Observation Title",
      "description": "Professional UX/UI observation detailing layout patterns, component hierarchy, or visual design notes",
      "status": "CONFIRMED" | "INFERRED",
      "evidenceReferences": ["source_filename.ext"]
    }
  ],
  "conflicts": [
    {
      "id": "cf-1",
      "title": "Requirement Contradiction Title",
      "description": "Detailed strategic analysis of conflicting specifications between sources and potential resolution strategy",
      "status": "AMBIGUOUS",
      "evidenceReferences": ["Source A", "Source B"]
    }
  ],
  "missingInformation": [
    {
      "id": "mi-1",
      "title": "Architectural Gap Title",
      "description": "Explicit identification of missing operational data or unstated business rules required for build",
      "status": "MISSING",
      "evidenceReferences": ["Analysis of all sources"]
    }
  ]
}`;

  try {
    const parsed = await callLLMJSON("analyze-material", prompt, BusinessUnderstandingSchema);
    if (parsed) {
      const { inferredIndustry, ...understanding } = parsed;
      const result: BusinessUnderstanding = { ...understanding, extractedAt: new Date().toISOString() };
      if (!thinness.thin) return result;

      // Thin input: guarantee the inferred scope is tagged and put in front of the BU, whatever the model wrote.
      const industry = inferredIndustry || "the BU's industry";
      const tag = <T extends { status: string; evidenceReferences: string[] }>(items: T[]) =>
        tagInferredReferences(items, industry);
      const inferredCount = [
        result.personas, result.modules, result.screens, result.userJourneys,
        result.businessRules, result.dataEntities, result.integrations,
      ].flat().filter((i) => i.status === "INFERRED").length;
      return {
        ...result,
        personas: tag(result.personas),
        modules: tag(result.modules),
        screens: tag(result.screens),
        userJourneys: tag(result.userJourneys),
        businessRules: tag(result.businessRules),
        dataEntities: tag(result.dataEntities),
        integrations: tag(result.integrations),
        uiObservations: tag(result.uiObservations),
        missingInformation: [
          ...result.missingInformation,
          {
            id: "mi-benchmark-validation",
            title: "Benchmark-derived scope needs BU validation",
            description: `${inferredCount} item(s) were predicted from ${industry} industry patterns because the supplied material was limited (${thinness.reason}). Confirm, correct or remove each item tagged "${BENCHMARK_TAG}".`,
            status: "MISSING",
            evidenceReferences: [`${BENCHMARK_TAG}: ${industry}`],
          },
        ],
        benchmark: benchmarkInfo(industry, thinness.reason),
      };
    }
  } catch (err) {
    console.warn("[AI Engine] LLM providers unavailable, executing dynamic material synthesis fallback:", err);
  }

  return withLocalBlueprint(
    generateDeterministicUnderstanding(materials, productName, businessUnit, description),
    materials, productName, businessUnit, description
  );
}

/** Label used for benchmark banners when the local engine (no LLM) filled the gaps. */
const LOCAL_BENCHMARK_INDUSTRY = "cross-industry operational software";

/** Placeholder output of the keyword extractor: nothing real was found for that section. */
function isPlaceholderSection(items: BusinessUnderstanding["personas"]): boolean {
  if (items.length === 0 || items.every((i) => i.status === "MISSING")) return true;
  return items.length === 1 && /(Core Module|^Primary .* Workflow)$/.test(items[0].title);
}

/**
 * Thin input without an LLM: fill every section the keyword extractor could not
 * find with the product blueprint, so a product name alone still yields a
 * complete understanding. Everything filled is INFERRED and tagged.
 */
function withLocalBlueprint(
  u: BusinessUnderstanding,
  materials: UploadedMaterial[],
  productName: string,
  businessUnit: string,
  description: string
): BusinessUnderstanding {
  const thinness = assessMaterialThinness(materials, description);
  if (!thinness.thin) return u;
  // The brief is everything the BU wrote: notes plus any material text.
  const briefText = [description, ...materials.map((m) => m.contentSnippet ?? "")].filter(Boolean).join("\n");
  const blueprint = buildBlueprint(productName, businessUnit, briefText);
  const subject = blueprint.subject;
  const bp = blueprintToUnderstanding(blueprint);
  const filled = new Set<string>();
  const fill = (key: keyof typeof bp, current: BusinessUnderstanding["personas"]) => {
    if (isPlaceholderSection(current)) {
      filled.add(key);
      return bp[key];
    }
    // Keep what was found; top up screens so the prototype covers the whole journey.
    if (key === "screens" && current.length < 4) {
      filled.add(key);
      return [...current, ...bp.screens];
    }
    return current;
  };
  const sections = {
    personas: fill("personas", u.personas),
    modules: fill("modules", u.modules),
    screens: fill("screens", u.screens),
    userJourneys: fill("userJourneys", u.userJourneys),
    businessRules: fill("businessRules", u.businessRules),
    dataEntities: fill("dataEntities", u.dataEntities),
    integrations: fill("integrations", u.integrations),
  };
  const tag = <T extends { status: string; evidenceReferences: string[] }>(items: T[]) =>
    tagInferredReferences(items, LOCAL_BENCHMARK_INDUSTRY);
  const inferredCount = Object.values(sections).flat().filter((i) => i.status === "INFERRED").length;
  // The extractor's "not found" gaps are answered by the blueprint; one validation gap replaces them.
  const staleGaps = new Set([filled.has("personas") ? "mi-1" : "", filled.has("businessRules") ? "mi-2" : ""]);
  // The extractor's clarifications name its placeholders; point them at the blueprint items instead.
  const renames: Array<[string | undefined, string | undefined]> = [
    [u.modules[0]?.title, sections.modules[0]?.title],
    [u.dataEntities[0]?.title, sections.dataEntities[0]?.title],
    [u.personas[0]?.title, sections.personas[0]?.title],
  ];
  const rename = (text: string) =>
    renames.reduce((acc, [from, to]) => (from && to && from !== to ? acc.split(from).join(to) : acc), text);
  const clarifications = u.clarifications?.map((c) => ({ ...c, question: rename(c.question), impactIfIgnored: rename(c.impactIfIgnored) }));
  const { stages, parties } = blueprint.brief;
  const shape = stages.length >= 3
    ? `built around the ${stages.length}-stage ${subject.toLowerCase()} lifecycle in the brief (${stages.join(" → ")})${parties.length ? `, shared by ${parties.join(", ")}` : ""}`
    : `built around the ${subject.toLowerCase()} lifecycle: capture, triage, decide, close and oversee`;
  const overallSummary = materials.length > 0 ? u.overallSummary
    : `${description ? `${description.trim().replace(/\.?$/, ".")} ` : ""}No materials were supplied for "${productName}" (${businessUnit}), so the product scope below is predicted from the brief, ${shape}. Every predicted item is marked INFERRED for BU review; add materials to replace predictions with evidence.`;
  return {
    ...u,
    blueprintBrief: blueprint.brief,
    overallSummary,
    clarifications,
    personas: tag(sections.personas),
    modules: tag(sections.modules),
    screens: tag(sections.screens),
    userJourneys: tag(sections.userJourneys),
    businessRules: tag(sections.businessRules),
    dataEntities: tag(sections.dataEntities),
    integrations: tag(sections.integrations),
    missingInformation: [
      ...u.missingInformation.filter((m) => !staleGaps.has(m.id)),
      {
        id: "mi-benchmark-validation",
        title: "Blueprint-derived scope needs BU validation",
        description: `${inferredCount} item(s) were predicted from how comparable operational products are structured because the supplied input was limited (${thinness.reason}). Confirm, correct or remove each item tagged "${BENCHMARK_TAG}". Connect an AI provider for industry-specific benchmarks.`,
        status: "MISSING",
        evidenceReferences: [`${BENCHMARK_TAG}: ${LOCAL_BENCHMARK_INDUSTRY}`],
      },
    ],
    benchmark: benchmarkInfo(LOCAL_BENCHMARK_INDUSTRY, thinness.reason),
  };
}

/** Normalise entity constraints and add the BU review question when any were inferred. */
function finalizeConstraints(definition: ProductDefinition): ProductDefinition {
  const { definition: normalized, inferredCount } = normalizeDefinitionConstraints(definition);
  if (inferredCount === 0) return normalized;
  return { ...normalized, openQuestions: [constraintOpenQuestion(inferredCount), ...normalized.openQuestions] };
}

export async function generateProductDefinition(
  understanding: BusinessUnderstanding,
  productName: string,
  businessUnit: string,
  version: string = "v1.0"
): Promise<ProductDefinition> {
  const thinness = assessUnderstandingThinness(understanding);
  const industry = understanding.benchmark?.industry || "the BU's industry";
  const benchmarkBlock = thinness.thin ? definitionBenchmarkDirective(thinness.reason) : "";

  const prompt = `COGNITIVE ROLE & LINGUISTIC NORMALIZATION DIRECTIVE:
1. COGNITIVE ROLE & NORMALIZATION ENGINE: You act as an Autonomous Principal Systems Architect and Enterprise Business Strategist. Treat all incoming inputs as unstructured semantic signals rather than final text.
2. AUTONOMOUS INTENT DECODING & ERROR RECTIFICATION: Reconstruct intended semantic meaning using global technical, engineering, and domain context. Rectify all typos, shorthand, and grammatical flaws automatically.
3. OUTPUT STANDARDIZATION & ZERO-PASSTHROUGH: Every generated string in the output JSON must be written in formal, executive-grade, grammatically flawless enterprise English. Verbatim echoing or raw passthrough of noisy source text is strictly forbidden.

Convert this structured Business Understanding into a comprehensive, verifiable Product Definition for "${productName}" (${businessUnit}), Version ${version}.

BUSINESS UNDERSTANDING:
${JSON.stringify(understanding, null, 2)}

${benchmarkBlock}
${UI_SPEC_RULES}
${FIELD_INFERENCE_RULES}
AUTONOMOUS FIELD, VALIDATION & RULE INFERENCE (CRITICAL — NEVER LEAVE EMPTY):
- DATA ENTITIES: For EVERY entity, generate 8-15 fields with correct types (string, number, boolean, timestamp, enum(...), text, json, uuid), accurate required/optional flags, and descriptive notes. ALWAYS include: id (uuid, required), created_at (timestamp), updated_at (timestamp), created_by (string), status (enum), plus all domain-specific fields a real production database would need. NEVER leave an entity with fewer than 6 fields.
- VALIDATIONS: Generate 8-15 input validation rules covering: email format, phone format, required field enforcement, min/max length, numeric range, date range constraints, enum value constraints, unique constraints, regex patterns, and cross-field dependencies. Cover EVERY user-facing form field.
- BUSINESS RULES: Generate 6-12 business rules covering: state machine transitions, SLA enforcement, permission boundaries, audit triggers, data integrity constraints, and domain-specific regulatory rules. Do NOT wait for the BU to mention these.
- NOTIFICATIONS: Generate 4-8 event-driven notification rules (status changes, SLA breaches, assignments, approvals, escalations) with channels and recipients.
- PERMISSIONS: Generate a complete RBAC matrix for every persona with specific constraints.
- INTEGRATIONS: Predict 3-6 likely system integrations (SSO/auth, email gateway, payment, analytics, storage, CRM/ERP) based on the domain even if not mentioned.

REQUIREMENTS:
Return ONLY a valid JSON object matching this schema:
{
  "id": "prod-def-id",
  "version": "${version}",
  "productName": "${productName}",
  "businessUnit": "${businessUnit}",
  "objective": "Clear executive problem statement and goal",
  "personas": [
    {
      "id": "p-1",
      "name": "Persona Name",
      "role": "Title",
      "keyGoals": ["Goal 1", "Goal 2"],
      "permissions": ["Perm 1", "Perm 2"],
      "confidence": "CONFIRMED" | "INFERRED" | "AMBIGUOUS",
      "evidence": ["filename.ext Slide X"]
    }
  ],
  "modules": [
    {
      "id": "mod-1",
      "name": "Module Name",
      "description": "Scope",
      "screens": ["scr-1", "scr-2"],
      "confidence": "CONFIRMED" | "INFERRED",
      "evidence": ["filename.ext"]
    }
  ],
  "screens": [
    {
      "id": "scr-1",
      "name": "Screen Name",
      "module": "Module Name",
      "layoutType": "dashboard" | "table-detail" | "form-wizard" | "split-view" | "profile-360",
      "components": ["Component A", "Component B"],
      "purpose": "Screen functional goal",
      "confidence": "CONFIRMED" | "INFERRED",
      "evidence": ["filename.ext"],
      "ui": {
        "kpis": [{"label": "Open Service Requests", "value": "128", "trend": "up" | "down" | "flat", "delta": "+4.2% vs last week"}],
        "filters": ["All", "Overdue", "My Queue"],
        "table": {
          "title": "Service Requests",
          "columns": ["Request ID", "Customer", "Status"],
          "rows": [["SR-1041", "Sample Customer", "Pending"]]
        },
        "detailPanels": [{"title": "Request Details", "items": [{"label": "Priority", "value": "High"}]}],
        "primaryActions": ["Reassign", "Approve"],
        "entity": "Exact name of the data entity this screen creates or edits (required for form-wizard screens, otherwise omit)",
        "benchmarkNote": "Mirrors the queue-and-detail pattern common in comparable industry products"
      }
    }
  ],
  "navigation": [
    {
      "id": "nav-1",
      "label": "Navigation Label",
      "screenId": "scr-1",
      "icon": "LayoutDashboard" | "Users" | "BatteryCharging" | "FileText" | "Sliders" | "ShieldAlert",
      "allowedRoles": ["Role 1", "Role 2"]
    }
  ],
  "userJourneys": [
    {
      "id": "uj-1",
      "name": "Journey Name",
      "persona": "Persona Name",
      "steps": ["Step 1", "Step 2", "Step 3"],
      "outcome": "Successful business result",
      "confidence": "CONFIRMED" | "INFERRED",
      "evidence": ["filename.ext"]
    }
  ],
  "businessRules": [
    {
      "id": "br-1",
      "code": "RULE-101",
      "rule": "Specific constraint rule",
      "context": "When this applies",
      "confidence": "CONFIRMED" | "INFERRED" | "AMBIGUOUS",
      "evidence": ["filename.ext"]
    }
  ],
  "dataEntities": [
    {
      "id": "ent-1",
      "name": "Entity Name",
      "description": "Purpose",
      "fields": [
        {"name": "fieldName", "type": "string", "required": true, "notes": "Why this field exists", "format": "identifier", "minLength": 3, "maxLength": 40, "pattern": "^[A-Z0-9-]+$", "unique": true, "origin": "BU" | "INFERRED"},
        {"name": "stateField", "type": "enum", "required": true, "format": "enum", "enumValues": ["STATE_A", "STATE_B"], "origin": "INFERRED"},
        {"name": "amountField", "type": "decimal", "required": false, "format": "decimal", "min": 0, "precision": 2, "sensitivity": "financial", "origin": "INFERRED"}
      ],
      "lifecycle": {"statusField": "stateField", "states": ["STATE_A", "STATE_B"], "initial": "STATE_A", "transitions": [{"from": "STATE_A", "to": "STATE_B"}]},
      "rules": [
        {"id": "r1", "kind": "conditional", "when": {"field": "stateField", "op": "eq", "value": "STATE_B"}, "effect": "required", "target": "amountField", "message": "Enter an amount before moving to STATE_B."},
        {"id": "r2", "kind": "compare", "left": "startField", "op": "lt", "right": "endField", "message": "End must be after start."}
      ],
      "crossRecordRules": ["Sentence describing a rule that needs other records, such as uniqueness or capacity."],
      "relationships": ["Entity B (1:N)"],
      "confidence": "CONFIRMED" | "INFERRED",
      "evidence": ["filename.ext"]
    }
  ],
  "integrations": [
    {
      "id": "int-1",
      "system": "Target System Name",
      "protocol": "REST / WebSockets / Kafka",
      "purpose": "What data is exchanged",
      "confidence": "CONFIRMED" | "INFERRED",
      "evidence": ["filename.ext"]
    }
  ],
  "permissions": [
    {
      "role": "Role Name",
      "accessLevel": "Full Admin" | "Read/Write" | "Read Only" | "Restricted Segment",
      "constraints": "Conditions"
    }
  ],
  "notifications": [
    {
      "event": "Trigger event",
      "channel": "Email / Push / SMS / In-App",
      "recipient": "Target role"
    }
  ],
  "validations": [
    {
      "field": "Field name",
      "validationRule": "Rule expression",
      "errorMessage": "User friendly message"
    }
  ],
  "assumptions": [
    {
      "id": "asm-1",
      "statement": "Explicit assumption statement",
      "riskLevel": "low" | "medium" | "high",
      "status": "pending-validation"
    }
  ],
  "openQuestions": [
    {
      "id": "oq-1",
      "question": "Unanswered question that requires business sign-off",
      "urgency": "blocking" | "important" | "nice-to-have",
      "status": "open"
    }
  ],
  "evidenceMapping": {
    "Core Fleet Unification": ["Q3_Fleet_Mobility_Modernization_v4_FINAL.pptx Slide 4"],
    "Dual Vehicle Access": ["Meeting_Audio_Transcript_Operations_Sync.txt"]
  },
  "isApproved": false,
  "lastUpdated": "ISO-8601 timestamp"
}`;

  try {
    const parsed = await callLLMJSON("generate-definition", prompt, ProductDefinitionSchema, (raw) => {
      // The prompt asks for evidenceMapping as { topic: sources[] }; the schema uses [{ topic, sources }].
      const obj = raw as { evidenceMapping?: unknown };
      const em = obj?.evidenceMapping;
      if (em && typeof em === "object" && !Array.isArray(em)) {
        return { ...obj, evidenceMapping: Object.entries(em).map(([topic, sources]) => ({ topic, sources })) };
      }
      return raw;
    });
    if (parsed) {
      const { evidenceMapping, ...rest } = parsed;
      const built: ProductDefinition = {
        ...rest,
        // Table rows must match their column count or the prototype table breaks.
        screens: rest.screens.map((s) => ({ ...s, ui: normalizeUISpec(s.ui) })),
        // Identity fields are owned by the server, not the model.
        id: `prod-def-${Date.now()}`,
        version,
        productName,
        businessUnit,
        evidenceMapping: Object.fromEntries(evidenceMapping.map((e) => [e.topic, e.sources])),
        changeHistory: [],
        isApproved: false,
        lastUpdated: new Date().toISOString(),
      };
      // Sanitise inferred field constraints, guarantee the system fields, and ask the BU to confirm what was predicted.
      const definition = finalizeConstraints(built);
      if (!thinness.thin) return definition;

      // Thin input: tag what was predicted and guarantee the BU is asked to validate it.
      const tag = <T extends { confidence?: string; evidence?: string[] }>(items: T[]) => tagInferredEvidence(items, industry);
      const inferredCount = [
        definition.personas, definition.modules, definition.screens, definition.userJourneys,
        definition.businessRules, definition.dataEntities, definition.integrations,
      ].flat().filter((i) => i.confidence === "INFERRED").length;
      return {
        ...definition,
        personas: tag(definition.personas),
        modules: tag(definition.modules),
        screens: tag(definition.screens),
        userJourneys: tag(definition.userJourneys),
        businessRules: tag(definition.businessRules),
        dataEntities: tag(definition.dataEntities),
        integrations: tag(definition.integrations),
        openQuestions: [benchmarkOpenQuestion(industry, inferredCount), ...definition.openQuestions],
        benchmark: benchmarkInfo(industry, thinness.reason),
      };
    }
  } catch (err) {
    console.warn("[AI Engine] LLM providers unavailable during definition, executing dynamic definition fallback:", err);
  }

  const local = generateDeterministicDefinition(understanding, productName, businessUnit, version);
  return finalizeConstraints(withDefinitionBlueprint(local, understanding, thinness));
}

export async function analyzeChangeImpact(
  currentDefinition: ProductDefinition,
  changeRequest: string
): Promise<ChangeImpactAnalysis> {
  const prompt = `COGNITIVE ROLE & LINGUISTIC NORMALIZATION DIRECTIVE:
1. COGNITIVE ROLE & NORMALIZATION ENGINE: You act as an Autonomous Principal Systems Architect and Enterprise Business Strategist. Treat all change requests strictly as unstructured semantic signals.
2. AUTONOMOUS INTENT DECODING & ERROR RECTIFICATION: Reconstruct intended semantic scope using global technical and domain context. Correct all shorthand, typos, and phrasing flaws automatically.
3. OUTPUT STANDARDIZATION & ZERO-PASSTHROUGH: Every generated output field—including affected areas, requirement specifications, and side effects—must be formatted in formal, executive-grade enterprise English with zero verbatim passthrough of raw text.

You are the Lead Change Management and Systems Architect for "AI Product Factory".
A business user submitted this natural language change request:
"${changeRequest}"

CURRENT PRODUCT DEFINITION:
Product: ${currentDefinition.productName} (${currentDefinition.version})
Objective: ${currentDefinition.objective}
Modules: ${JSON.stringify(currentDefinition.modules.map(m => m.name))}
Screens: ${JSON.stringify(currentDefinition.screens.map(s => s.name))}
Business Rules: ${JSON.stringify(currentDefinition.businessRules.map(r => r.code))}

Analyze the requested change and return ONLY a valid JSON object matching this schema:
{
  "id": "change-id",
  "timestamp": "ISO-8601 timestamp",
  "changeRequested": "${changeRequest}",
  "affectedAreas": {
    "screens": ["Screen 1", "Screen 2"],
    "workflows": ["Workflow 1"],
    "businessRules": ["RULE-101"],
    "data": ["DataEntity"],
    "apis": ["/api/v1/resource"],
    "integrations": ["System A"],
    "permissions": ["Role A"]
  },
  "newRequirement": "Formulated new or altered functional requirement specification text",
  "potentialSideEffects": [
    "Side effect 1",
    "Side effect 2"
  ],
  "status": "pending"
}`;

  try {
    const parsed = await callLLMJSON("analyze-change", prompt, ChangeImpactSchema);
    if (parsed) {
      return {
        ...parsed,
        id: `change-${Date.now()}`,
        timestamp: new Date().toISOString(),
        changeRequested: changeRequest,
        status: "pending",
      };
    }
  } catch (err) {
    console.warn("[AI Engine] LLM providers unavailable during change analysis, executing dynamic change fallback:", err);
  }

  // Deterministic change analyzer
  return generateDeterministicChangeAnalysis(currentDefinition, changeRequest);
}

export function applyChangeToDefinition(
  current: ProductDefinition,
  change: ChangeImpactAnalysis
): ProductDefinition {
  // Major.minor as integers, matching the client-side fallback in App.tsx
  // (parseFloat would read "v1.10" as 1.1 and move the version backwards).
  const [major, minor] = current.version.replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  const newVersion = `v${major || 1}.${(minor || 0) + 1}`;

  const updated = JSON.parse(JSON.stringify(current)) as ProductDefinition;
  updated.version = newVersion;
  updated.lastUpdated = new Date().toISOString();

  // Record change in history
  const changeEntry = {
    ...change,
    status: 'applied' as const,
    versionApplied: newVersion
  };
  updated.changeHistory = [changeEntry, ...(updated.changeHistory || [])];

  const reqText = change.changeRequested || '';
  const reqLower = reqText.toLowerCase();

  // 1. Add a dedicated Business Rule for the change request
  const ruleCode = `RULE-CR-${Math.floor(Math.random() * 899 + 100)}`;
  updated.businessRules = [
    {
      id: `br-${Date.now()}`,
      code: ruleCode,
      rule: change.newRequirement || reqText,
      context: "User Requested UI & Business Change",
      confidence: "CONFIRMED",
      evidence: [`Change Request: ${reqText}`]
    },
    ...(updated.businessRules || [])
  ];

  // 2. Extract keywords to see if user requested specific domain features
  if (reqLower.includes("voice of customer") || reqLower.includes("voc") || reqLower.includes("nps")) {
    const custScreen = updated.screens.find(s => s.id.includes("customer") || s.name.toLowerCase().includes("customer"));
    if (custScreen && !custScreen.components.includes("Voice of Customer & NPS Feed")) {
      custScreen.components.push("Voice of Customer & NPS Feed", "Driver Sentiment Scoring Widget");
    }
    const custEntity = updated.dataEntities.find(e => e.name.toLowerCase().includes("account") || e.name.toLowerCase().includes("customer"));
    if (custEntity) {
      custEntity.fields.push(
        { name: "voiceOfCustomerScore", type: "number", required: false, notes: "Driver satisfaction index (0-100)" },
        { name: "recentCustomerFeedback", type: "string", required: false, notes: "Direct quote or transcribed feedback" }
      );
    }
  }

  if (reqLower.includes("pv and ev") || reqLower.includes("pv") || reqLower.includes("ev") || reqLower.includes("same user")) {
    const fleetMgr = updated.personas.find(p => p.role.toLowerCase().includes("fleet") || p.name.toLowerCase().includes("manager"));
    if (fleetMgr) {
      if (!fleetMgr.permissions.includes("Unified PV & EV Access Switcher")) {
        fleetMgr.permissions.push("Unified PV & EV Access Switcher", "Cross-Propulsion Fleet Telematics");
      }
    }
    const perm = updated.permissions.find(p => p.role.toLowerCase().includes("manager") || p.role.toLowerCase().includes("fleet"));
    if (perm) {
      perm.accessLevel = "Full Admin";
      perm.constraints = "Single sign-on grants dual access across Passenger Vehicles (PV) and Electric Commercial Vehicles (EV)";
    }
  }

  // 3. Dynamic Screen Creation for ALL natural language UI change requests
  let rawTitle = reqText
    .replace(/^(add|create|new|make|please|pls|include|show)\s+/i, '')
    .trim();
  rawTitle = rawTitle.charAt(0).toUpperCase() + rawTitle.slice(1);
  
  let screenTitle = rawTitle;
  if (!/screen|tab|view|calculator|dashboard|workbench|portal|hub/i.test(screenTitle)) {
    screenTitle = `${screenTitle} Screen`;
  }
  // Truncate screen title if too long
  if (screenTitle.length > 45) {
    screenTitle = `${screenTitle.slice(0, 42)}...`;
  }

  const existingScreenIdx = updated.screens.findIndex(s => s.name.toLowerCase() === screenTitle.toLowerCase());
  if (existingScreenIdx === -1) {
    const featureName = rawTitle.replace(/\s+(screen|tab|view|modal|calculator)/i, '').trim() || 'Custom Feature';
    updated.screens.push({
      id: `scr-cr-${Date.now()}`,
      name: screenTitle,
      module: updated.modules[0]?.name || "Custom UI Module",
      layoutType: "dashboard",
      components: [
        `${featureName} Control Panel & Header`,
        `Interactive ${featureName} Workbench Widget`,
        `${featureName} Metrics & Analytics`,
        `Governance & Configuration Parameters`
      ],
      purpose: `Requested via natural language UI customization: "${reqText}"`,
      confidence: "CONFIRMED",
      evidence: [`Change Request: ${reqText}`]
    });
  }

  // 4. Also add an interactive component to the primary screen for visibility
  if (updated.screens.length > 0) {
    const primaryScr = updated.screens[0];
    const compTitle = `UI Feature: ${rawTitle.slice(0, 30)}`;
    if (!primaryScr.components.includes(compTitle)) {
      primaryScr.components.push(compTitle);
    }
  }

  // 5. Add assumption for traceability
  if (!updated.assumptions.some(a => a.statement.includes(reqText))) {
    updated.assumptions.push({
      id: `asm-${Date.now()}`,
      statement: `Business Change Approved: ${reqText}`,
      riskLevel: "low",
      status: "accepted"
    });
  }

  return updated;
}

/**
 * Advanced Thinking Prototype Generator.
 *
 * Takes a product definition and uses the Pro model with high effort to generate
 * rich, domain-adaptive ScreenUISpec blueprints for every screen — each one
 * referencing real-world products as inspiration (e.g. "Inspired by Salesforce
 * Service Cloud queue pattern"). Returns an updated ProductDefinition with all
 * screens populated with UI specs.
 */
/** UI written by the pre-blueprint fallback; regenerated rather than reused. */
const LEGACY_UI_NOTE = /^Generic enterprise workbench pattern/;

/**
 * Definitions saved before the blueprint existed (or built from nothing) can hold a
 * single placeholder screen and legacy UI. Drop the legacy UI and, when no real
 * screen is specified, rebuild the scope from the blueprint.
 */
function upgradeStaleDefinition(definition: ProductDefinition): ProductDefinition {
  const screens = definition.screens.map((s) => (s.ui?.benchmarkNote && LEGACY_UI_NOTE.test(s.ui.benchmarkNote) ? { ...s, ui: undefined } : s));
  const placeholderOnly = screens.length === 0 || screens.every((s) => s.confidence === "MISSING");
  const cleaned = { ...definition, screens };
  if (!placeholderOnly) return cleaned;
  const reason = "no screens were specified by the BU";
  const upgraded = withDefinitionBlueprint(cleaned, definition, { thin: true, reason });
  const finalized = finalizeConstraints(upgraded);
  const seen = new Set<string>();
  return { ...finalized, openQuestions: finalized.openQuestions.filter((q) => !seen.has(q.id) && !!seen.add(q.id)) };
}

export async function generatePrototypeUI(
  input: ProductDefinition
): Promise<ProductDefinition> {
  const definition = upgradeStaleDefinition(input);
  const screenSummary = definition.screens.map((s, idx) => (
    `Screen ${idx + 1}: id="${s.id}", name="${s.name}", module="${s.module}", layoutType="${s.layoutType}", purpose="${s.purpose}", components=[${s.components.join(", ")}]`
  )).join("\n");

  const entitySummary = definition.dataEntities.map(e =>
    `Entity: "${e.name}" — fields: ${e.fields.map(f => `${f.name}(${f.type})`).join(", ")}`
  ).join("\n");

  const ruleSummary = definition.businessRules.slice(0, 8).map(r =>
    `[${r.code}] ${r.rule}`
  ).join("\n");

  const personaSummary = definition.personas.map(p =>
    `${p.name} (${p.role}): ${p.keyGoals.slice(0, 3).join("; ")}`
  ).join("\n");

  const prompt = `COGNITIVE ROLE: You are a Senior UX Product Architect who has studied and memorized the UI patterns of every major SaaS product, enterprise platform, and industry-leading application in the world. You have deep knowledge of Salesforce, ServiceNow, Workday, SAP, Jira, HubSpot, Zendesk, Uber Fleet, DoorDash Merchant, Shopify Admin, Toast POS, Epic EHR, Veeva CRM, Bloomberg Terminal, Stripe Dashboard, Linear, Notion, Figma Admin, and hundreds more.

TASK: Generate rich, visually compelling UI blueprints for a prototype of "${definition.productName}" (${definition.businessUnit}).

PRODUCT CONTEXT:
Objective: ${definition.objective}

PERSONAS:
${personaSummary}

SCREENS TO DESIGN:
${screenSummary}

DATA ENTITIES:
${entitySummary}

BUSINESS RULES:
${ruleSummary}

CRITICAL INSTRUCTIONS:
1. REAL-WORLD PRODUCT INSPIRATION: For each screen, identify the SPECIFIC real-world product whose UI pattern best fits this screen's job. Name it explicitly in "inspiredBy" (e.g. "Salesforce Service Cloud — Case Queue", "Jira Board — Sprint View", "Stripe Dashboard — Payments Overview", "Uber Fleet — Live Dispatch Map"). This is the most important field. Be specific — name the product AND the specific feature/view.

2. LAYOUT TYPE SELECTION: Choose the optimal layoutType for each screen based on its purpose:
   - "dashboard": Monitoring, KPIs, high-level overviews (like Stripe Dashboard, Datadog)
   - "table-detail": Managing records with detail panels (like Salesforce, Zendesk tickets)
   - "form-wizard": Multi-step processes (like Typeform, loan applications)
   - "split-view": Triage queues with side details (like email clients, Intercom inbox)
   - "profile-360": Complete entity view (like HubSpot contact page, patient charts)

3. DOMAIN-SPECIFIC KPIs: Generate 3-4 KPIs with realistic sample values. Use domain terminology — NOT generic "Total Records". For a healthcare product, use "Pending Lab Results" not "Pending Items". For logistics, use "On-Time Delivery Rate" not "SLA %".

4. RICH SAMPLE DATA: Generate 5-7 table rows with realistic, domain-specific sample data. Column names should use real domain terminology. Every row must have exactly as many cells as columns. Include a status-like column.

5. FILTERS: 3-5 domain-specific filter chips that a real user of this screen would actually use.

6. DETAIL PANELS: 2-3 panels showing contextual information about a selected record.

7. PRIMARY ACTIONS: 2-4 action verbs that match the domain (not generic "Edit" / "Delete").

8. BENCHMARK NOTE: One sentence explaining which real-world product pattern this layout mirrors and WHY it was chosen for this screen.

Return ONLY a valid JSON matching this schema:
{
  "screens": [
    {
      "screenId": "the screen id from the definition",
      "inspiredBy": "Product Name — Specific Feature/View (e.g. 'Zendesk — Ticket Queue & Triage View')",
      "layoutType": "dashboard" | "table-detail" | "form-wizard" | "split-view" | "profile-360",
      "ui": {
        "kpis": [{"label": "Domain KPI Name", "value": "128", "trend": "up" | "down" | "flat", "delta": "+4.2% vs last week"}],
        "filters": ["All", "Domain Filter 1", "Domain Filter 2"],
        "table": {
          "title": "Domain Table Title",
          "columns": ["Col1", "Col2", "Status", "Col4"],
          "rows": [["val1", "val2", "Active", "val4"]]
        },
        "detailPanels": [{"title": "Panel Title", "items": [{"label": "Field", "value": "Value"}]}],
        "primaryActions": ["Domain Action 1", "Domain Action 2"],
        "benchmarkNote": "Mirrors the [specific pattern] from [Product Name], chosen because [reason]"
      }
    }
  ]
}`;

  try {
    const parsed = await callLLMJSON("generate-prototype-ui", prompt, PrototypeUISchema);
    if (parsed && parsed.screens.length > 0) {
      const updated = JSON.parse(JSON.stringify(definition)) as ProductDefinition;
      for (const generated of parsed.screens) {
        const screenIdx = updated.screens.findIndex(s => s.id === generated.screenId);
        if (screenIdx !== -1) {
          updated.screens[screenIdx].layoutType = generated.layoutType;
          updated.screens[screenIdx].ui = normalizeUISpec({
            ...generated.ui,
            benchmarkNote: `✨ Inspired by ${generated.inspiredBy}. ${generated.ui.benchmarkNote}`,
          });
        }
      }
      console.log(`[AI Engine] generate-prototype-ui: enriched ${parsed.screens.length} screens with AI-generated UI blueprints.`);
      return updated;
    }
  } catch (err) {
    console.warn("[AI Engine] LLM providers unavailable during prototype generation, using deterministic fallback:", err);
  }

  // Deterministic fallback: generate basic UI specs for screens that don't have one
  return generateDeterministicPrototypeUI(definition);
}

/**
 * Local definition: swap blueprint-derived items for their full blueprint form,
 * top up thin scope so every persona's journey has a screen, and give every
 * screen a UI blueprint so the prototype never falls back to a placeholder.
 */
function withDefinitionBlueprint(
  def: ProductDefinition,
  u: Pick<BusinessUnderstanding, "benchmark" | "blueprintBrief"> | undefined,
  thinness: { thin: boolean; reason: string }
): ProductDefinition {
  const blueprint = buildBlueprint(def.productName, def.businessUnit, def.objective, u?.blueprintBrief ?? def.blueprintBrief);
  const bp = blueprint;
  const swap = <T extends { id: string }>(items: T[], full: T[]) => items.map((i) => full.find((f) => f.id === i.id) ?? i);
  const topUp = <T extends { id: string }>(items: T[], full: T[], min: number) =>
    thinness.thin && items.length < min ? [...items, ...full.filter((f) => !items.some((i) => i.id === f.id))] : items;
  // Only the engine's own generic fallbacks count as "nothing there".
  const genericEntity = def.dataEntities.length === 1 && /^(ent-1|de-1)$/.test(def.dataEntities[0].id);

  // In thin mode, "nothing found" placeholders (MISSING) give way to the blueprint.
  const real = <T extends { confidence: string }>(items: T[]) => (thinness.thin ? items.filter((i) => i.confidence !== "MISSING") : items);
  const personas = topUp(swap(real(def.personas), bp.personas), bp.personas, 3);
  const screens = topUp(swap(real(def.screens), bp.screens), bp.screens, 4);
  const modules = screens.some((s) => s.id.startsWith("scr-bp-"))
    ? [...swap(def.modules, bp.modules).filter((m) => !m.name.endsWith("Core Module") || screens.some((s) => s.module === m.name)),
       ...bp.modules.filter((m) => !def.modules.some((d) => d.id === m.id))]
    : def.modules;
  const swapped = thinness.thin && genericEntity ? bp.dataEntities : swap(def.dataEntities, bp.dataEntities);
  // Blueprint screens are built on the blueprint entities, so those must be present.
  const dataEntities = screens.some((s) => s.id.startsWith("scr-bp-")) && !swapped.some((e) => e.id === "ent-bp-1")
    ? [...bp.dataEntities, ...swapped]
    : swapped;
  const usesBlueprint = dataEntities.some((e) => e.id === "ent-bp-1");

  const iconFor: Record<string, string> = { dashboard: "LayoutDashboard", "split-view": "ShieldAlert", "table-detail": "FileText", "form-wizard": "Sliders", "profile-360": "Users" };
  const accessFor = (role: string): ProductDefinition["permissions"][number]["accessLevel"] =>
    /audit|read.?only|viewer/i.test(role) ? "Read Only" : /admin/i.test(role) ? "Full Admin" : /requester|customer|external/i.test(role) ? "Restricted Segment" : "Read/Write";

  let result: ProductDefinition = {
    ...def,
    personas,
    modules,
    screens,
    navigation: screens.map((s) => ({ id: `nav-${s.id}`, label: s.name, screenId: s.id, icon: iconFor[s.layoutType] ?? "FileText", allowedRoles: ["All"] })),
    userJourneys: thinness.thin && def.userJourneys.length <= 1 && def.userJourneys.every((j) => j.confidence !== "CONFIRMED")
      ? bp.userJourneys
      : swap(def.userJourneys, bp.userJourneys),
    businessRules: swap(def.businessRules, bp.businessRules),
    dataEntities,
    integrations: swap(def.integrations, bp.integrations),
    permissions: personas.map((p) => ({ role: p.name, accessLevel: accessFor(p.role), constraints: p.permissions.join("; ") })),
    ...(usesBlueprint ? { notifications: bp.notifications, validations: bp.validations } : {}),
    blueprintBrief: blueprint.brief,
  };
  result = ensureScreenUI(result, blueprint.subject);
  if (!thinness.thin) return result;

  const tag = <T extends { confidence?: string; evidence?: string[] }>(items: T[]) => tagInferredEvidence(items, LOCAL_BENCHMARK_INDUSTRY);
  const industry = u?.benchmark?.industry || LOCAL_BENCHMARK_INDUSTRY;
  const inferredCount = [
    result.personas, result.modules, result.screens, result.userJourneys,
    result.businessRules, result.dataEntities, result.integrations,
  ].flat().filter((i) => i.confidence === "INFERRED").length;
  return {
    ...result,
    personas: tag(result.personas),
    modules: tag(result.modules),
    screens: tag(result.screens),
    userJourneys: tag(result.userJourneys),
    businessRules: tag(result.businessRules),
    dataEntities: tag(result.dataEntities),
    integrations: tag(result.integrations),
    openQuestions: [benchmarkOpenQuestion(industry, inferredCount), ...result.openQuestions],
    benchmark: benchmarkInfo(industry, thinness.reason),
  };
}

/** Deterministic fallback: a complete, seeded UI blueprint for every screen without one. */
function generateDeterministicPrototypeUI(definition: ProductDefinition): ProductDefinition {
  return ensureScreenUI(definition);
}

export function generateEngineeringPackageData(
  productDefinition: ProductDefinition,
  changeHistory: ChangeImpactAnalysis[]
): EngineeringPackage {
  const screens = productDefinition.screens.map(s => ({
    screenId: s.id,
    name: s.name,
    route: `/${(s.module || 'app').toLowerCase().replace(/[^a-z0-9]+/g, '-')}/${s.id}`,
    components: s.components || [`${s.name} View`],
    stateManagement: "Zustand / Reactive Store with optimistic mutations"
  }));

  const components = productDefinition.screens.flatMap(s =>
    (s.components || []).map((compName, cIdx) => ({
      name: compName.replace(/[^a-zA-Z0-9]/g, ''),
      type: cIdx === 0 ? "Composite Container" : cIdx === 1 ? "Data Grid" : "Interactive View",
      description: `Component for ${s.name}: ${compName}`,
      props: ["dataRecord: any", "onUpdate: (payload: any) => void"]
    }))
  );

  const apis = productDefinition.modules.map(m => ({
    endpoint: `/api/v1/${m.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    method: "GET" as const,
    description: `Endpoint for ${m.name}: ${m.description}`,
    requestBodySample: "None (Query params: filter=active)",
    responseBodySample: JSON.stringify({
      status: "success",
      moduleId: m.id,
      moduleName: m.name,
      recordsCount: 10
    }, null, 2)
  }));

  const dataModelSQL = `-- AI Product Factory Generated DDL Schema
-- Product: ${productDefinition.productName} (${productDefinition.version})
-- Business Unit: ${productDefinition.businessUnit}
-- Generated: ${new Date().toISOString()}

${productDefinition.dataEntities.map(entityToSQL).join('\n\n')}
`;

  const functionalRequirementsMarkdown = `# Functional Requirements Specification
## Product: ${productDefinition.productName}
**Business Unit:** ${productDefinition.businessUnit}  
**Specification Version:** ${productDefinition.version}  
**Architecture Readiness:** Antigravity Target Certified  
**Generated By:** AI Product Factory

---

### 1. Executive Product Objective
${productDefinition.objective}

### 2. User Personas & Access Models
${productDefinition.personas.map(p => `
#### ${p.name} (${p.role})
- **Confidence Status:** [${p.confidence}]
- **Key Goals:** ${p.keyGoals.join(", ")}
- **Permissions:** ${p.permissions.join(", ")}
- **Evidence Sources:** ${p.evidence.join("; ")}
`).join("\n")}

### 3. Screen Inventory & Component Topology
${productDefinition.screens.map(s => `
- **${s.name}** [${s.layoutType}] (Module: ${s.module})
  - *Purpose:* ${s.purpose}
  - *UI Components:* ${s.components.join(", ")}
  - *Confidence:* ${s.confidence} | *Evidence:* ${s.evidence.join(", ")}
`).join("\n")}

### 4. Core Business Rules Engine
${productDefinition.businessRules.map(b => `
- **[${b.code}]** ${b.rule}
  - *Context:* ${b.context}
  - *Confidence:* ${b.confidence} (${b.evidence.join(", ")})
`).join("\n")}

### 5. Identified Integrations
${productDefinition.integrations.map(i => `
- **${i.system}** (${i.protocol}): ${i.purpose} [Status: ${i.confidence}]
`).join("\n")}

### 6. Approved Assumptions & Outstanding Questions
#### Assumptions:
${productDefinition.assumptions.map(a => `- ${a.statement} (Risk: ${a.riskLevel}, Status: ${a.status})`).join("\n")}

#### Open Questions:
${productDefinition.openQuestions.map(q => `- ${q.question} [Urgency: ${q.urgency}]`).join("\n")}

### 7. Change History
${changeHistory.length === 0 ? "No changes applied yet. Baseline release." : changeHistory.map(ch => `
- **Version ${ch.versionApplied || 'Applied'}:** "${ch.changeRequested}"
  - *New Requirement:* ${ch.newRequirement}
  - *Affected:* ${Object.entries(ch.affectedAreas).map(([k, v]) => `${k}: ${v.length}`).join(", ")}
`).join("\n")}

${validationRulesMarkdown(productDefinition.dataEntities)}`;

  return {
    generatedAt: new Date().toISOString(),
    version: productDefinition.version,
    productName: productDefinition.productName,
    businessUnit: productDefinition.businessUnit,
    executiveSummary: productDefinition.objective,
    functionalRequirementsMarkdown,
    screenInventory: screens,
    componentInventory: components.length > 0 ? components : [
      { name: "PrimaryDashboardView", type: "Container", description: "Main Dashboard View", props: ["dataRecord: any"] }
    ],
    apiRequirements: apis,
    dataModelSQL,
    permissionsMatrix: productDefinition.permissions.map(p => ({
      role: p.role,
      entities: productDefinition.dataEntities.reduce((acc, de) => {
        acc[de.name.toLowerCase().replace(/[^a-z0-9_]+/g, '_')] = p.accessLevel;
        return acc;
      }, {} as Record<string, string>)
    })),
    changeHistory,
    antigravityManifest: {
      schemaVersion: "antigravity.blueprint.v1",
      targetPlatform: "cloud-run-microservices",
      projectConfig: {
        name: productDefinition.productName,
        businessUnit: productDefinition.businessUnit,
        runtime: "node-22-express-react",
        database: "postgresql-16",
      },
      modules: productDefinition.modules.map(m => m.name),
      architecturalDirectives: productDefinition.businessRules.map(r => r.rule)
    }
  };
}

// ---------------- Fallback Deterministic Generator Functions ----------------
// NOTE: generateDeterministicUnderstanding is now fully content-aware.
// It reads every material's contentSnippet and filename to extract real domain
// data rather than injecting any hardcoded Fleet EV / demo dataset.

function extractCandidateTerms(text: string): string[] {
  const candidates: string[] = [];
  const quoted = text.match(/"([^"]{3,80})"/g) ?? [];
  candidates.push(...quoted.map((q) => q.replace(/"/g, '').trim()));
  const caps = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4})\b/g) ?? [];
  candidates.push(...caps);
  return [...new Set(candidates)].filter((t) => t.length > 3 && t.length < 80);
}

function isPersonaLike(term: string): boolean {
  const kws = ['manager','specialist','advisor','officer','lead','analyst','director',
    'coordinator','admin','operator','supervisor','technician','agent','representative',
    'engineer','consultant','assessor','surveyor','inspector','auditor','executive'];
  return kws.some((k) => term.toLowerCase().includes(k));
}

function isModuleLike(term: string): boolean {
  const kws = ['dashboard','portal','console','hub','center','management','tracker',
    'monitor','system','platform','workflow','registry','report','schedule','booking',
    'inventory','profile','review','approval','queue','notification','audit','log','search'];
  return kws.some((k) => term.toLowerCase().includes(k));
}

function isEntityLike(term: string): boolean {
  const kws = ['record','account','order','request','claim','job','task','vehicle',
    'customer','client','user','invoice','ticket','appointment','booking','item',
    'product','case','asset','report','document','file','entry','form'];
  return kws.some((k) => term.toLowerCase().includes(k));
}

function generateDeterministicUnderstanding(
  materials: UploadedMaterial[],
  productName: string,
  businessUnit: string,
  userDescription: string
): BusinessUnderstanding {
  const now = new Date().toISOString();

  // Build per-material text corpus
  const sourceTexts = materials.map((m) => ({
    source: m.filename,
    text: [m.contentSnippet ?? '', ...(m.tags ?? [])].join(' '),
  }));
  const allSources = materials.map((m) => m.filename);
  const fullText = sourceTexts.map((s) => s.text).join(' ');
  const candidates = extractCandidateTerms(fullText);

  // Personas
  const personaCandidates = candidates.filter(isPersonaLike).slice(0, 5);
  const transcriptSources = materials
    .filter((m) =>
      m.fileType === 'audio' || m.fileType === 'text' ||
      m.filename.toLowerCase().includes('transcript') ||
      m.filename.toLowerCase().includes('notes') ||
      m.filename.toLowerCase().includes('slack'))
    .map((m) => m.filename);

  const personas = personaCandidates.length > 0
    ? personaCandidates.map((role, i) => {
        const evidenceSrc = sourceTexts.find((s) => s.text.includes(role))?.source ?? allSources[0];
        return {
          id: `per-${i + 1}`,
          title: role,
          description: 'Identified from uploaded materials as a key stakeholder role. Confirm responsibilities and access level with the business team.',
          status: 'INFERRED' as ConfidenceStatus,
          evidenceReferences: [evidenceSrc],
          supportingDetail: `Term "${role}" appears in: ${evidenceSrc}`,
        };
      })
    : [{
        id: 'per-1',
        title: 'Primary System User',
        description: 'Exact role title not determinable from supplied materials. Provide role names in source documents for richer persona extraction.',
        status: 'MISSING' as ConfidenceStatus,
        evidenceReferences: allSources.length > 0 ? [allSources[0]] : ['No materials provided'],
        supportingDetail: 'No clear persona role titles were identified in uploaded content snippets.',
      }];

  // Modules
  const moduleCandidates = candidates.filter(isModuleLike).slice(0, 4);
  const modules = moduleCandidates.length > 0
    ? moduleCandidates.map((name, i) => {
        const evidenceSrc = sourceTexts.find((s) => s.text.includes(name))?.source ?? allSources[0];
        return { id: `mod-${i + 1}`, title: name,
          description: 'Identified as a potential product module or feature domain from uploaded materials.',
          status: 'INFERRED' as ConfidenceStatus, evidenceReferences: [evidenceSrc] };
      })
    : [{ id: 'mod-1', title: `${productName || 'Product'} Core Module`,
        description: `Main functional module for ${productName || 'the product'}. Detailed breakdown requires additional context from business stakeholders.`,
        status: 'INFERRED' as ConfidenceStatus, evidenceReferences: allSources.slice(0, 2) }];

  // Screens
  const imageSources = materials.filter((m) => m.fileType === 'image' || m.fileType === 'pptx');
  const screens = imageSources.length > 0
    ? imageSources.map((m, i) => ({
        id: `scr-${i + 1}`,
        title: m.filename.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' '),
        description: m.contentSnippet
          ? `Screen extracted from ${m.filename}: ${m.contentSnippet.substring(0, 200)}...`
          : `UI screen captured in ${m.filename}. Extract widget and field details for component specification.`,
        status: 'CONFIRMED' as ConfidenceStatus, evidenceReferences: [m.filename],
      }))
    : [{ id: 'scr-1', title: 'Primary Application Screen',
        description: 'No UI screenshots or presentation slides uploaded. Upload screen captures to enable automatic UI component extraction.',
        status: 'MISSING' as ConfidenceStatus, evidenceReferences: allSources }];

  // User Journeys
  const journeySource = transcriptSources[0] ?? allSources[0] ?? 'Uploaded materials';
  const userJourneys = [{
    id: 'uj-1',
    title: `Primary ${productName || 'Product'} Workflow`,
    description: 'Core user workflow inferred from uploaded materials. Full step-by-step journey requires stakeholder confirmation.',
    status: 'INFERRED' as ConfidenceStatus,
    evidenceReferences: transcriptSources.length > 0 ? transcriptSources : allSources.slice(0, 2),
    supportingDetail: `Derived from analysis of: ${journeySource}`,
  }];

  // Business Rules - extract must/shall sentences from content
  const ruleSentences: string[] = [];
  for (const { source, text } of sourceTexts) {
    const sentences = text.split(/[.!?]+/).filter(Boolean);
    for (const sentence of sentences) {
      const lower = sentence.toLowerCase();
      if ((lower.includes('must') || lower.includes('shall') || lower.includes('required') ||
           lower.includes('mandatory') || lower.includes('prohibited') ||
           lower.includes('not allowed') || lower.includes('cannot')) &&
          sentence.trim().length > 20 && sentence.trim().length < 300) {
        ruleSentences.push(`${sentence.trim()} [Source: ${source}]`);
        if (ruleSentences.length >= 3) break;
      }
    }
    if (ruleSentences.length >= 3) break;
  }
  const businessRules = ruleSentences.length > 0
    ? ruleSentences.map((ruleText, i) => {
        const srcMatch = ruleText.match(/\[Source: (.+?)\]$/);
        const src = srcMatch?.[1] ?? allSources[0];
        return {
          id: `br-${i + 1}`,
          title: `BR-${String(i + 1).padStart(3, '0')}: Operational Constraint`,
          description: ruleText.replace(/\s*\[Source:.+\]$/, '').trim(),
          status: 'CONFIRMED' as ConfidenceStatus, evidenceReferences: [src],
        };
      })
    : [{ id: 'br-1', title: 'Business Rules: Pending Extraction',
        description: 'No explicit business rules (must/shall/required constraints) found in uploaded content snippets. Include policy documents or compliance specifications.',
        status: 'MISSING' as ConfidenceStatus, evidenceReferences: allSources }];

  // Data Entities
  const excelSources = materials.filter((m) => m.fileType === 'excel' || m.filename.toLowerCase().endsWith('.csv'));
  const entityCandidates = candidates.filter(isEntityLike).slice(0, 4);
  const dataEntities = (entityCandidates.length > 0 || excelSources.length > 0)
    ? [
        ...excelSources.map((m, i) => ({
          id: `de-e${i + 1}`,
          title: m.filename.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' '),
          description: m.contentSnippet
            ? `Data entities extracted from ${m.filename}: ${m.contentSnippet.substring(0, 200)}...`
            : `Structured data source - extract entity and field definitions from ${m.filename}.`,
          status: 'CONFIRMED' as ConfidenceStatus, evidenceReferences: [m.filename],
        })),
        ...entityCandidates.map((entity, i) => {
          const evidenceSrc = sourceTexts.find((s) => s.text.includes(entity))?.source ?? allSources[0];
          return { id: `de-${i + 1}`, title: entity,
            description: 'Candidate data entity identified in uploaded materials. Verify field definitions with the data architecture team.',
            status: 'INFERRED' as ConfidenceStatus, evidenceReferences: [evidenceSrc] };
        }),
      ].slice(0, 4)
    : [{ id: 'de-1', title: 'Core Business Entity',
        description: 'No structured data dictionary or entity definitions found. Upload spreadsheets, ERDs, or data dictionaries to enable automatic entity extraction.',
        status: 'MISSING' as ConfidenceStatus, evidenceReferences: allSources }];

  // Integrations
  const integrationKeywords = ['api','integration','system','service','platform','gateway',
    'webhook','rest','graphql','sync','feed','import','export'];
  const integrationMatches: ReturnType<typeof generateDeterministicUnderstanding>['integrations'] = [];
  outer: for (const { source, text } of sourceTexts) {
    const lower = text.toLowerCase();
    for (const kw of integrationKeywords) {
      const idx = lower.indexOf(kw);
      if (idx !== -1) {
        const snippet = text.substring(Math.max(0, idx - 20), Math.min(text.length, idx + 80)).trim();
        integrationMatches.push({
          id: `int-${integrationMatches.length + 1}`,
          title: `Integration Reference (${source})`,
          description: `Integration or external system reference found in ${source}: "...${snippet}..."`,
          status: 'INFERRED' as ConfidenceStatus, evidenceReferences: [source],
        });
        if (integrationMatches.length >= 2) break outer;
      }
    }
  }
  const integrations = integrationMatches.length > 0
    ? integrationMatches
    : [{ id: 'int-1', title: 'External Integrations: Not Yet Identified',
        description: 'No explicit integration or API references found in uploaded content. Add technical specifications or system landscape documents to identify integrations.',
        status: 'MISSING' as ConfidenceStatus, evidenceReferences: allSources }];

  // UI Observations
  const uiObservations = imageSources.map((m, i) => ({
    id: `uio-${i + 1}`,
    title: `UI Observation from ${m.filename}`,
    description: m.contentSnippet
      ? `Layout and interaction patterns observed in ${m.filename}: ${m.contentSnippet.substring(0, 300)}...`
      : 'Upload higher-fidelity screenshots or annotated wireframes for detailed UI component extraction.',
    status: (m.contentSnippet ? 'CONFIRMED' : 'INFERRED') as ConfidenceStatus,
    evidenceReferences: [m.filename],
  }));

  // Conflicts
  const conflictKeywords = ['conflict','contradict','dispute','disagree','inconsistent',
    'vs.','versus','however','different from','mismatch'];
  const conflicts: BusinessUnderstanding['conflicts'] = [];
  outerConflict: for (const { source, text } of sourceTexts) {
    const lower = text.toLowerCase();
    for (const kw of conflictKeywords) {
      if (lower.includes(kw)) {
        const idx = lower.indexOf(kw);
        const snippet = text.substring(Math.max(0, idx - 30), Math.min(text.length, idx + 120)).trim();
        conflicts.push({
          id: `cf-${conflicts.length + 1}`,
          title: `Potential Policy Conflict in ${source}`,
          description: `Conflicting statement detected: "...${snippet}..." - requires business stakeholder resolution.`,
          status: 'AMBIGUOUS' as ConfidenceStatus,
          evidenceReferences: [source],
        });
        if (conflicts.length >= 2) break outerConflict;
      }
    }
  }

  // Missing Information
  const missingInformation: BusinessUnderstanding['missingInformation'] = [];
  if (personas.some((p) => p.status === 'MISSING')) {
    missingInformation.push({ id: 'mi-1', title: 'Persona Role Definitions',
      description: 'Explicit user role names and responsibilities are not present in the uploaded materials.',
      status: 'MISSING' as ConfidenceStatus, evidenceReferences: allSources });
  }
  if (businessRules.some((r) => r.status === 'MISSING')) {
    missingInformation.push({ id: 'mi-2', title: 'Business Rules and Policy Constraints',
      description: 'No formal business rules, SLAs, or operational constraints were found. Include policy documents or compliance specifications.',
      status: 'MISSING' as ConfidenceStatus, evidenceReferences: allSources });
  }

  const fileList = allSources.join(', ');
  const overallSummary = userDescription
    ? `${userDescription} - Synthesized from ${materials.length} uploaded material(s): ${fileList}. Structured analysis extracted core strategic objectives, target personas, functional modules, and evidence-traceable system boundaries.`
    : `Comprehensive business understanding synthesized from ${materials.length} uploaded material(s) for "${productName || 'System Product'}" (${businessUnit || 'Enterprise Division'}). Sources analyzed: ${fileList}. Reconstructed operational requirements, user roles, governance rules, and system integrations.`;

  // Dynamically generate intelligent BU Clarifications derived from actual uploaded materials & extracted scope
  const primarySource = allSources[0] || 'Uploaded Materials';
  const secondarySource = allSources[1] || primarySource;

  const clarifications: ClarificationItem[] = [
    {
      id: 'clr-dev-1',
      type: 'BLOCKER: CONTRADICTION',
      question: `Development Prerequisite - High-Availability & Fallback Protocol: What is the mandatory circuit-breaker SLA and retry policy when downstream integrations for ${modules[0]?.title || 'Core Module'} experience 5xx errors or network timeouts during peak operations?`,
      impactIfIgnored: `Evidence source ${primarySource}. Developers cannot construct backend retry middleware without explicit timeout boundaries.`,
      askedAt: now,
      status: 'OPEN'
    },
    {
      id: 'clr-dev-2',
      type: 'HIGH: MISSING LOGIC',
      question: `Development Prerequisite - Data Isolation & Multi-Tenancy: Are database queries for ${dataEntities[0]?.title || 'Core Data Asset'} strictly partitioned by tenant organization key, or is cross-account read access permitted for ${personas[0]?.title || 'System Lead'} audit logging?`,
      impactIfIgnored: `Source document ${secondarySource}. Required for database schema partitioning and row-level security (RLS) policies.`,
      askedAt: now,
      status: 'OPEN'
    },
    {
      id: 'clr-dev-3',
      type: 'HIGH: MISSING LOGIC',
      question: `Development Prerequisite - Authentication & Digital Attestation: Does the operational override workflow in ${modules[0]?.title || 'Core Module'} require federated SAML/OIDC tokens with secondary Multi-Factor Authentication (MFA) signature?`,
      impactIfIgnored: `Impacts identity gateway integration and OAuth2 scope validation for ${personas[0]?.title || 'Primary User'}.`,
      askedAt: now,
      status: 'OPEN'
    },
    {
      id: 'clr-dev-4',
      type: 'MEDIUM: PERMISSION GAP',
      question: `Development Prerequisite - Compliance Retention Window: What is the exact retention and purging schedule for immutable audit logs generated by ${productName || 'System Product'}?`,
      impactIfIgnored: `Required for automated database retention cron jobs and regulatory data governance compliance.`,
      askedAt: now,
      status: 'OPEN'
    }
  ];

  return {
    overallSummary,
    extractedAt: now,
    businessObjective: {
      id: 'bo-1',
      title: productName || 'Product Objective',
      description: userDescription ||
        `Build ${productName || 'the product'} for ${businessUnit || 'the business unit'}. Detailed objective requires stakeholder interviews or a formal brief.`,
      status: 'INFERRED' as ConfidenceStatus,
      evidenceReferences: allSources.slice(0, 3),
      supportingDetail: `Derived from product name "${productName}" and business unit "${businessUnit}" as provided in intake form.`,
    },
    personas,
    modules,
    screens,
    userJourneys,
    businessRules,
    dataEntities,
    integrations,
    uiObservations,
    conflicts,
    missingInformation,
    clarifications,
  };
}


function generateDeterministicDefinition(
  u: BusinessUnderstanding,
  productName: string,
  businessUnit: string,
  version: string
): ProductDefinition {
  const personas = (u.personas && u.personas.length > 0)
    ? u.personas.map(p => ({
        id: p.id,
        name: p.title,
        role: p.title,
        keyGoals: [
          `Execute operational workflows for ${p.title}`,
          `Maintain system data integrity and compliance`,
          `Review real-time status updates`
        ],
        permissions: p.title.toLowerCase().includes('auditor') || p.title.toLowerCase().includes('underwriter')
          ? ['Read-Only Access', 'Audit Logs']
          : ['Full Administrative Access', 'Standard Workflow Execution'],
        confidence: p.status,
        evidence: p.evidenceReferences || []
      }))
    : [{
        id: 'p-1',
        name: 'Primary System User',
        role: 'System User',
        keyGoals: ['Manage daily operational tasks'],
        permissions: ['Standard Access'],
        confidence: 'INFERRED' as const,
        evidence: ['Business Understanding']
      }];

  const modules = (u.modules && u.modules.length > 0)
    ? u.modules.map(m => ({
        id: m.id,
        name: m.title,
        description: m.description,
        screens: [`scr-${m.id}`],
        confidence: m.status,
        evidence: m.evidenceReferences || []
      }))
    : [{
        id: 'mod-1',
        name: `${productName || 'Product'} Core Module`,
        description: `Core functionality for ${productName || 'the product'}`,
        screens: ['scr-1'],
        confidence: 'INFERRED' as const,
        evidence: ['Business Understanding']
      }];

  const screens = (u.screens && u.screens.length > 0)
    ? u.screens.map((s, idx) => ({
        id: s.id || `scr-${idx + 1}`,
        name: s.title,
        module: modules[idx % modules.length]?.name || `${productName} Module`,
        layoutType: (idx === 0 ? 'dashboard' : idx === 1 ? 'table-detail' : idx === 2 ? 'profile-360' : 'form-wizard') as any,
        components: [
          `${s.title} Header & Metric Summary`,
          `Interactive Data Grid & Filters`,
          `Action Toolbar & Export Controls`
        ],
        purpose: s.description,
        confidence: s.status,
        evidence: s.evidenceReferences || []
      }))
    : modules.map((m, idx) => ({
        id: `scr-mod-${idx + 1}`,
        name: `${m.name} Screen`,
        module: m.name,
        layoutType: (idx === 0 ? 'dashboard' : 'table-detail') as any,
        components: [
          `${m.name} Status Summary`,
          `Operational Data Grid`,
          `Action Toolbar`
        ],
        purpose: m.description,
        confidence: m.confidence,
        evidence: m.evidence || []
      }));

  const navigation = screens.map((s, idx) => ({
    id: `nav-${s.id}`,
    label: s.name,
    screenId: s.id,
    icon: (idx === 0 ? 'LayoutDashboard' : idx === 1 ? 'Users' : idx === 2 ? 'FileText' : 'Sliders') as any,
    allowedRoles: ['All']
  }));

  const userJourneys = (u.userJourneys && u.userJourneys.length > 0)
    ? u.userJourneys.map(uj => ({
        id: uj.id,
        name: uj.title,
        persona: personas[0]?.name || 'Primary User',
        steps: [
          `User accesses ${screens[0]?.name || 'the system dashboard'}`,
          `Selects target item and initiates ${uj.title}`,
          `System validates business constraints and updates operational record`,
          `Confirmation notification is logged to audit history`
        ],
        outcome: uj.description || `Successfully completed ${uj.title}`,
        confidence: uj.status,
        evidence: uj.evidenceReferences || []
      }))
    : [{
        id: 'uj-1',
        name: `Primary ${productName || 'Product'} Workflow`,
        persona: personas[0]?.name || 'Primary User',
        steps: [
          `User opens ${screens[0]?.name || 'Dashboard'}`,
          `Performs core operational action`,
          `System verifies rules and saves updates`
        ],
        outcome: `Operational workflow executed successfully`,
        confidence: 'INFERRED' as const,
        evidence: ['Business Understanding']
      }];

  const businessRules = (u.businessRules && u.businessRules.length > 0)
    ? u.businessRules.map((br, idx) => ({
        id: br.id,
        code: `BR-${String(idx + 1).padStart(3, '0')}`,
        rule: br.description || br.title,
        context: `${productName || 'System'} Governance`,
        confidence: br.status,
        evidence: br.evidenceReferences || []
      }))
    : [
        {
          id: 'br-1',
          code: 'BR-001',
          rule: `All mandatory fields must be validated prior to persistence in ${productName || 'the system'}.`,
          context: 'Data Integrity',
          confidence: 'INFERRED' as const,
          evidence: ['Autonomous Domain Inference']
        },
        {
          id: 'br-2',
          code: 'BR-002',
          rule: `State machine transitions must satisfy role-based approval thresholds and log immutable audit entries.`,
          context: 'Workflow Governance',
          confidence: 'INFERRED' as const,
          evidence: ['Autonomous Domain Inference']
        },
        {
          id: 'br-3',
          code: 'BR-003',
          rule: `SLA timer triggers notification escalation if record remains in pending status beyond 24 hours.`,
          context: 'SLA & Escalation',
          confidence: 'INFERRED' as const,
          evidence: ['Autonomous Domain Inference']
        },
        {
          id: 'br-4',
          code: 'BR-004',
          rule: `PII and sensitive operational attributes must be encrypted at rest and masked for non-admin personas.`,
          context: 'Security & Compliance',
          confidence: 'INFERRED' as const,
          evidence: ['Autonomous Domain Inference']
        }
      ];

  const dataEntities = (u.dataEntities && u.dataEntities.length > 0)
    ? u.dataEntities.map(de => ({
        id: de.id,
        name: de.title,
        description: de.description,
        fields: de.fields && de.fields.length >= 5 ? de.fields : [
          { name: 'id', type: 'uuid', required: true, notes: 'Primary Identifier (UUIDv4)' },
          { name: 'record_number', type: 'string', required: true, notes: 'Human-readable record reference code' },
          { name: 'title', type: 'string', required: true, notes: 'Primary display title / subject' },
          { name: 'status', type: 'enum(DRAFT, PENDING, APPROVED, REJECTED, ARCHIVED)', required: true, notes: 'Workflow state machine value' },
          { name: 'priority', type: 'enum(LOW, MEDIUM, HIGH, CRITICAL)', required: true, notes: 'Urgency classification' },
          { name: 'assigned_to_user_id', type: 'uuid', required: false, notes: 'Assigned operator / owner ID' },
          { name: 'metadata_json', type: 'json', required: false, notes: 'Extensible key-value domain attributes' },
          { name: 'created_at', type: 'timestamp', required: true, notes: 'Creation timestamp' },
          { name: 'updated_at', type: 'timestamp', required: true, notes: 'Last modification timestamp' },
          { name: 'created_by_user_id', type: 'uuid', required: true, notes: 'Creator user identifier' }
        // Generated by the engine, not stated by the BU, even when the entity itself is confirmed.
        ].map(f => ({ ...f, origin: 'INFERRED' as const })),
        relationships: ['Parent Module (1:N)', 'Audit Log (1:N)', 'Assigned User (N:1)'],
        confidence: de.status,
        evidence: de.evidenceReferences || []
      }))
    : [{
        id: 'ent-1',
        name: `${productName || 'Core'} Entity`,
        description: `Primary operational data model for ${productName || 'the product'}`,
        fields: [
          { name: 'id', type: 'uuid', required: true, notes: 'Primary Identifier' },
          { name: 'reference_code', type: 'string', required: true, notes: 'Unique system tracking code' },
          { name: 'name', type: 'string', required: true, notes: 'Entity name / label' },
          { name: 'status', type: 'enum(ACTIVE, PENDING, SUSPENDED, CLOSED)', required: true, notes: 'Current operational state' },
          { name: 'category', type: 'string', required: true, notes: 'Domain categorization tag' },
          { name: 'priority_level', type: 'enum(LOW, MED, HIGH, URGENT)', required: true, notes: 'Execution priority' },
          { name: 'owner_email', type: 'string', required: true, notes: 'Responsible party email address' },
          { name: 'notes_text', type: 'text', required: false, notes: 'Detailed operational notes' },
          { name: 'created_at', type: 'timestamp', required: true, notes: 'ISO-8601 creation timestamp' },
          { name: 'updated_at', type: 'timestamp', required: true, notes: 'ISO-8601 update timestamp' }
        ],
        relationships: ['Audit Trail (1:N)', 'Owner Persona (N:1)'],
        confidence: 'INFERRED' as const,
        evidence: ['Autonomous Domain Inference']
      }];

  const integrations = (u.integrations && u.integrations.length > 0)
    ? u.integrations.map(int => ({
        id: int.id,
        system: int.title,
        protocol: 'REST API',
        purpose: int.description,
        confidence: int.status,
        evidence: int.evidenceReferences || []
      }))
    : [
        {
          id: 'int-1',
          system: 'Enterprise Identity Gateway (SSO / OIDC)',
          protocol: 'OAuth 2.0 / SAML 2.0',
          purpose: 'Centralized authentication and RBAC session token generation',
          confidence: 'INFERRED' as const,
          evidence: ['Autonomous Architecture Inference']
        },
        {
          id: 'int-2',
          system: 'Transactional Messaging & Email Gateway',
          protocol: 'REST / Webhook',
          purpose: 'Automated dispatch of status alerts, approvals, and user notifications',
          confidence: 'INFERRED' as const,
          evidence: ['Autonomous Architecture Inference']
        },
        {
          id: 'int-3',
          system: 'Enterprise Data Warehouse / BI Analytics',
          protocol: 'gRPC / Streaming ETL',
          purpose: 'Real-time telemetry and operational report aggregation',
          confidence: 'INFERRED' as const,
          evidence: ['Autonomous Architecture Inference']
        }
      ];

  const permissions = personas.map(p => ({
    role: p.name,
    accessLevel: (p.role.toLowerCase().includes('auditor') || p.role.toLowerCase().includes('underwriter')) ? 'Read Only' as const : 'Full Admin' as const,
    constraints: `Access restricted according to ${p.name} governance boundary`
  }));

  const assumptions = (u.missingInformation && u.missingInformation.length > 0)
    ? u.missingInformation.map((mi, idx) => ({
        id: `asm-${idx + 1}`,
        statement: `Pending confirmation: ${mi.title} - ${mi.description}`,
        riskLevel: 'medium' as const,
        status: 'pending-validation' as const
      }))
    : [{
        id: 'asm-1',
        statement: `System architecture assumed based on synthesized business understanding.`,
        riskLevel: 'low' as const,
        status: 'pending-validation' as const
      }];

  const openQuestions = (u.conflicts && u.conflicts.length > 0)
    ? u.conflicts.map((c, idx) => ({
        id: `oq-${idx + 1}`,
        question: `Requirement Discrepancy: ${c.title} - ${c.description}`,
        urgency: 'important' as const,
        status: 'open' as const
      }))
    : [];

  return {
    id: `prod-def-${Date.now()}`,
    version,
    productName: productName || u.businessObjective?.title || 'System Product',
    businessUnit: businessUnit || 'Enterprise Division',
    objective: u.businessObjective?.description || u.overallSummary,
    personas,
    modules,
    screens,
    navigation,
    userJourneys,
    businessRules,
    dataEntities,
    integrations,
    permissions,
    notifications: [
      {
        event: 'Record Creation / Ingestion',
        channel: 'In-App Notification',
        recipient: personas[0]?.name || 'System Operator'
      },
      {
        event: 'Workflow State Change / Escalation',
        channel: 'Email & Push',
        recipient: personas[0]?.name || 'System Supervisor'
      },
      {
        event: 'SLA Breach Warning',
        channel: 'In-App Alert & SMS',
        recipient: 'Module Manager'
      }
    ],
    validations: [
      {
        field: 'reference_code / ID',
        validationRule: 'Required string matching pattern ^[A-Z0-9_-]{3,20}$',
        errorMessage: 'Reference code must be 3-20 uppercase alphanumeric characters.'
      },
      {
        field: 'owner_email',
        validationRule: 'Required string matching valid RFC 5322 email regex format',
        errorMessage: 'Please enter a valid enterprise email address.'
      },
      {
        field: 'status',
        validationRule: 'Required enum value in allowed state machine values',
        errorMessage: 'Invalid status selected for current state transition.'
      },
      {
        field: 'priority_level',
        validationRule: 'Required non-null enum selection',
        errorMessage: 'Priority level selection is mandatory.'
      },
      {
        field: 'created_at',
        validationRule: 'ISO-8601 compliant UTC timestamp format',
        errorMessage: 'System timestamp format error.'
      }
    ],
    assumptions,
    openQuestions,
    evidenceMapping: {
      'Core Requirements': u.businessObjective?.evidenceReferences || []
    },
    changeHistory: [],
    isApproved: false,
    lastUpdated: new Date().toISOString()
  };
}

function generateDeterministicChangeAnalysis(
  current: ProductDefinition,
  changeRequest: string
): ChangeImpactAnalysis {
  const reqText = changeRequest || '';
  const reqLower = reqText.toLowerCase();

  const currentScreens = (current.screens || []).map(s => s.name);
  const currentWorkflows = (current.userJourneys || []).map(u => u.name);
  const currentRules = (current.businessRules || []).map(r => `${r.code}: ${r.rule}`);
  const currentData = (current.dataEntities || []).map(d => d.name);

  // Extract potential component or screen title from text
  let affectedScreens: string[] = currentScreens.length > 0 ? [currentScreens[0]] : ["Primary Operations Dashboard"];
  let newRequirement = `Incorporate requested change: "${reqText}"`;
  let sideEffects: string[] = [
    "UI component hierarchy dynamically updated for viewports.",
    "Business rule boundary re-evaluated for active session."
  ];

  if (reqLower.includes("voice of customer") || reqLower.includes("voc") || reqLower.includes("nps")) {
    affectedScreens = currentScreens.length > 0 ? [currentScreens[0], "Customer 360 Profile"] : ["Customer 360 Profile"];
    newRequirement = "Expose a dedicated Voice of Customer (VoC) and Driver NPS satisfaction stream on the Customer 360 profile screen, enabling account managers to inspect qualitative driver sentiments alongside vehicle allocation metrics.";
  } else if (reqLower.includes("pv and ev") || reqLower.includes("both") || reqLower.includes("same user")) {
    affectedScreens = currentScreens.length > 0 ? currentScreens : ["Unified Mobility Command Center"];
    newRequirement = "Eliminate separate login credentials for Passenger Vehicles (PV) and Commercial Electric Vehicles (EV). A single certified fleet operator can toggle dynamically between vehicle divisions with role-based scope enforcement.";
  } else if (reqLower.includes("screen") || reqLower.includes("tab") || reqLower.includes("view") || reqLower.includes("calculator") || reqLower.includes("modal")) {
    const titleMatch = reqText.match(/(?:add|create|new)\s+(?:a\s+)?([a-zA-Z0-9\s]+?)(?:screen|tab|view|modal|calculator|dashboard|report)/i);
    const newScrTitle = titleMatch ? `${titleMatch[1].trim()} Screen` : `Custom ${reqText.slice(0, 25)} Screen`;
    affectedScreens = [newScrTitle, ...currentScreens];
    newRequirement = `Construct new dynamic UI view: "${newScrTitle}" with interactive widgets and state controls matching specification.`;
  } else {
    newRequirement = `Dynamically integrate UI/logic request into active application layout: "${reqText}"`;
  }

  return {
    id: `chg-${Date.now()}`,
    timestamp: new Date().toISOString(),
    changeRequested: reqText,
    affectedAreas: {
      screens: affectedScreens,
      workflows: currentWorkflows.length > 0 ? currentWorkflows : ["Primary User Journey"],
      businessRules: currentRules.length > 0 ? currentRules : ["RULE-01: Standard Constraint"],
      data: currentData.length > 0 ? currentData : ["PrimaryDataEntity"],
      apis: [`/api/v1/${(current.productName || 'system').toLowerCase().replace(/[^a-z0-9]/g, '')}/action`],
      integrations: (current.integrations || []).map(i => i.system).slice(0, 2),
      permissions: (current.personas || []).map(p => p.name).slice(0, 2)
    },
    newRequirement,
    potentialSideEffects: sideEffects,
    status: "pending"
  };
}

