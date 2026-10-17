import { z } from "zod";
import { FIELD_FORMATS } from "../src/services/validationEngine";
import type { FieldFormat } from "../src/types";

/**
 * Zod schemas for the JSON the model must return. They are passed to the
 * Anthropic API as `output_config.format`, so the response is constrained to
 * this shape. They mirror the interfaces in src/types.ts.
 *
 * Structured outputs cannot express objects with arbitrary keys, so
 * `evidenceMapping` is an array of { topic, sources } here and is converted to
 * a Record<string, string[]> by the service after parsing.
 */

const Confidence = z.enum(["CONFIRMED", "INFERRED", "AMBIGUOUS", "MISSING"]);

const EvidenceItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  status: Confidence,
  evidenceReferences: z.array(z.string()),
});

const Audience = z.enum(["BU", "TECH"]);

/** Gaps and conflicts also say which team must resolve them (optional: the server labels unlabelled ones). */
const GapItemSchema = EvidenceItemSchema.extend({ audience: Audience.optional() });

const ClarificationSchema = z.object({
  audience: Audience,
  type: z.enum(["BLOCKER: CONTRADICTION", "HIGH: MISSING LOGIC", "MEDIUM: PERMISSION GAP"]),
  question: z.string(),
  impactIfIgnored: z.string(),
});

export const BusinessUnderstandingSchema = z.object({
  inferredIndustry: z.string(),
  overallSummary: z.string(),
  businessObjective: EvidenceItemSchema,
  personas: z.array(EvidenceItemSchema),
  modules: z.array(EvidenceItemSchema),
  screens: z.array(EvidenceItemSchema),
  userJourneys: z.array(EvidenceItemSchema),
  businessRules: z.array(EvidenceItemSchema),
  dataEntities: z.array(EvidenceItemSchema),
  integrations: z.array(EvidenceItemSchema),
  uiObservations: z.array(EvidenceItemSchema),
  conflicts: z.array(GapItemSchema),
  missingInformation: z.array(GapItemSchema),
  /** Optional so a model that omits it is not rejected; the server then adds the standard questions. */
  clarifications: z.array(ClarificationSchema).optional(),
});

/** Field constraints are flat here (easier for a model to produce); the server folds them into DataFieldDefinition.constraints. */
const FieldSchema = z.object({
  name: z.string(),
  type: z.string(),
  required: z.boolean(),
  notes: z.string().optional(),
  format: z.enum(FIELD_FORMATS as [FieldFormat, ...FieldFormat[]]).optional(),
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
  pattern: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  precision: z.number().optional(),
  enumValues: z.array(z.string()).optional(),
  unique: z.boolean().optional(),
  immutable: z.boolean().optional(),
  sensitivity: z.enum(["none", "pii", "financial", "credential"]).optional(),
  origin: z.enum(["BU", "INFERRED"]).optional(),
});

const EntityRuleSchema = z.object({
  id: z.string(),
  kind: z.enum(["conditional", "compare", "requiredTogether", "mutuallyExclusive"]),
  message: z.string(),
  when: z
    .object({
      field: z.string(),
      op: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "in", "notIn", "present", "absent"]),
      value: z.string().optional(),
    })
    .optional(),
  effect: z.enum(["required", "forbidden"]).optional(),
  target: z.string().optional(),
  left: z.string().optional(),
  op: z.enum(["lt", "lte", "gt", "gte", "eq", "neq"]).optional(),
  right: z.string().optional(),
  fields: z.array(z.string()).optional(),
});

const LifecycleSchema = z.object({
  statusField: z.string(),
  states: z.array(z.string()),
  initial: z.string(),
  transitions: z.array(z.object({ from: z.string(), to: z.string() })),
});

/** UI blueprint rendered by the prototype canvas. Values are illustrative sample data. */
const ScreenUISchema = z.object({
  kpis: z.array(
    z.object({
      label: z.string(),
      value: z.string(),
      trend: z.enum(["up", "down", "flat"]),
      delta: z.string(),
    })
  ),
  filters: z.array(z.string()),
  table: z.object({
    title: z.string(),
    columns: z.array(z.string()),
    rows: z.array(z.array(z.string())),
  }),
  detailPanels: z.array(
    z.object({
      title: z.string(),
      items: z.array(z.object({ label: z.string(), value: z.string() })),
    })
  ),
  primaryActions: z.array(z.string()),
  benchmarkNote: z.string().optional(),
  entity: z.string().optional(),
});

export const ProductDefinitionSchema = z.object({
  objective: z.string(),
  personas: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      role: z.string(),
      keyGoals: z.array(z.string()),
      permissions: z.array(z.string()),
      confidence: Confidence,
      evidence: z.array(z.string()),
    })
  ),
  modules: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      screens: z.array(z.string()),
      confidence: Confidence,
      evidence: z.array(z.string()),
    })
  ),
  screens: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      module: z.string(),
      layoutType: z.enum(["dashboard", "table-detail", "form-wizard", "split-view", "profile-360"]),
      components: z.array(z.string()),
      purpose: z.string(),
      confidence: Confidence,
      evidence: z.array(z.string()),
      ui: ScreenUISchema,
    })
  ),
  navigation: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      screenId: z.string(),
      icon: z.string(),
      allowedRoles: z.array(z.string()),
    })
  ),
  userJourneys: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      persona: z.string(),
      steps: z.array(z.string()),
      outcome: z.string(),
      confidence: Confidence,
      evidence: z.array(z.string()),
    })
  ),
  businessRules: z.array(
    z.object({
      id: z.string(),
      code: z.string(),
      rule: z.string(),
      context: z.string(),
      confidence: Confidence,
      evidence: z.array(z.string()),
    })
  ),
  dataEntities: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      fields: z.array(FieldSchema),
      lifecycle: LifecycleSchema.optional(),
      rules: z.array(EntityRuleSchema).optional(),
      crossRecordRules: z.array(z.string()).optional(),
      relationships: z.array(z.string()),
      confidence: Confidence,
      evidence: z.array(z.string()),
    })
  ),
  integrations: z.array(
    z.object({
      id: z.string(),
      system: z.string(),
      protocol: z.string(),
      purpose: z.string(),
      confidence: Confidence,
      evidence: z.array(z.string()),
    })
  ),
  permissions: z.array(
    z.object({
      role: z.string(),
      accessLevel: z.enum(["Full Admin", "Read/Write", "Read Only", "Restricted Segment"]),
      constraints: z.string(),
    })
  ),
  notifications: z.array(
    z.object({
      event: z.string(),
      channel: z.string(),
      recipient: z.string(),
    })
  ),
  validations: z.array(
    z.object({
      field: z.string(),
      validationRule: z.string(),
      errorMessage: z.string(),
    })
  ),
  assumptions: z.array(
    z.object({
      id: z.string(),
      statement: z.string(),
      riskLevel: z.enum(["low", "medium", "high"]),
      status: z.enum(["pending-validation", "accepted", "challenged"]),
    })
  ),
  openQuestions: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      urgency: z.enum(["blocking", "important", "nice-to-have"]),
      status: z.enum(["open", "answered"]),
      audience: Audience.optional(),
    })
  ),
  evidenceMapping: z.array(
    z.object({
      topic: z.string(),
      sources: z.array(z.string()),
    })
  ),
});

export const ChangeImpactSchema = z.object({
  affectedAreas: z.object({
    screens: z.array(z.string()),
    workflows: z.array(z.string()),
    businessRules: z.array(z.string()),
    data: z.array(z.string()),
    apis: z.array(z.string()),
    integrations: z.array(z.string()),
    permissions: z.array(z.string()),
  }),
  newRequirement: z.string(),
  potentialSideEffects: z.array(z.string()),
});

const ChartSchema = z.object({
  title: z.string(),
  kind: z.enum(["bar", "line", "donut"]),
  labels: z.array(z.string()),
  values: z.array(z.number()),
});

const BoardSchema = z.object({
  columns: z.array(
    z.object({
      title: z.string(),
      cards: z.array(z.object({ title: z.string(), subtitle: z.string(), tag: z.string() })),
    })
  ),
});

const TimelineSchema = z.array(z.object({ when: z.string(), who: z.string(), what: z.string() }));

export const UIThemeSchema = z.object({
  primaryColor: z.string(),
  accentColor: z.string(),
  sidebarStyle: z.enum(["dark", "light", "brand"]),
  density: z.enum(["comfortable", "compact"]),
});

/** Schema for AI-generated prototype screen UI blueprints with real-world product inspiration. */
export const PrototypeUISchema = z.object({
  /** The application's look: colours chosen to suit this product and its users. */
  theme: UIThemeSchema,
  screens: z.array(
    z.object({
      screenId: z.string(),
      inspiredBy: z.string(),
      layoutType: z.enum(["dashboard", "table-detail", "form-wizard", "split-view", "profile-360"]),
      ui: ScreenUISchema.extend({
        benchmarkNote: z.string(),
        /** Record a form-wizard screen creates or completes; "" for other layouts. */
        entity: z.string(),
        device: z.enum(["desktop", "phone"]),
        chart: ChartSchema.optional(),
        board: BoardSchema.optional(),
        timeline: TimelineSchema.optional(),
      }),
    })
  ),
});

/**
 * Research done before designing the prototype: comparable, well-built applications for the same kind of
 * work, what to borrow from each, and the visual direction. Answered as JSON in text (web search tools
 * cannot be combined with enforced output formats), then validated here.
 */
export const DesignResearchSchema = z.object({
  comparableApps: z.array(z.object({ name: z.string(), category: z.string(), whatToBorrow: z.array(z.string()) })),
  designDirection: z.string(),
  screenPatterns: z.array(z.object({ screenId: z.string(), pattern: z.string(), why: z.string() })),
  sources: z.array(z.object({ title: z.string(), url: z.string() })).optional(),
});
