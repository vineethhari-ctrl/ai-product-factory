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
  conflicts: z.array(EvidenceItemSchema),
  missingInformation: z.array(EvidenceItemSchema),
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

/** Schema for AI-generated prototype screen UI blueprints with real-world product inspiration. */
export const PrototypeUISchema = z.object({
  screens: z.array(
    z.object({
      screenId: z.string(),
      inspiredBy: z.string(),
      layoutType: z.enum(["dashboard", "table-detail", "form-wizard", "split-view", "profile-360"]),
      ui: ScreenUISchema.extend({
        benchmarkNote: z.string(),
      }),
    })
  ),
});
