import type {
  ConstraintOrigin,
  DataEntityDefinition,
  DataFieldDefinition,
  EntityRule,
  FieldConstraints,
  OpenQuestionItem,
  ProductDefinition,
} from "../src/types";
import { constraintSummary, sanitizeConstraints, sanitizeLifecycle, withSystemFields } from "../src/services/validationEngine";

/**
 * Field-constraint inference for ANY domain.
 *
 * The model proposes constraints per entity; this module makes them safe and
 * complete before they reach the browser or the engineering package. Nothing
 * here (or in the prompt text) may assume a particular business domain.
 */

export const FIELD_INFERENCE_RULES = `FIELD, VALIDATION AND LIFECYCLE INFERENCE RULES (apply to every data entity, whatever the domain):
- List every field the workflow needs to run end to end, including compulsory fields the BU never mentioned. For each entity ask: what identifies it, who owns it, what state is it in, what must be known to complete each step, and what would a downstream system reject if it were missing?
- Do NOT add generic audit fields (id, created and updated timestamps or users, row version); the system adds those. DO add the entity's lifecycle state as a field when it has one.
- For each field set "format" from the closed list, and add only constraints the domain justifies: minLength and maxLength, pattern (a simple anchored regular expression, never nested quantifiers or alternation under * or +), min, max, step and precision for numbers, enumValues for closed sets, unique for business keys, immutable for values that must never change, sensitivity for personal, financial or credential data.
- Take real formats from the BU's own identifiers and examples when they exist; otherwise use widely accepted standards for that kind of value. If you cannot justify a pattern, leave it out.
- "origin" is "BU" only when the material states the field or rule; otherwise "INFERRED".
- "lifecycle": when an entity moves through states, give statusField, states, initial and only the transitions that really are allowed.
- "rules": conditional (when field A meets a condition, field B is required or forbidden), compare (a field must be before, after or not above another), requiredTogether, mutuallyExclusive. Reference fields by their exact names, and write "message" as an instruction a user can act on.
- "crossRecordRules": rules that must look at other records (uniqueness across records, capacity limits, duplicate prevention, references to other entities) as plain sentences.\n`;

const CONSTRAINT_KEYS = [
  "format", "minLength", "maxLength", "pattern", "min", "max", "step", "precision",
  "enumValues", "unique", "immutable", "sensitivity",
] as const;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Fold the flat constraint properties a model returns into `constraints`. */
function foldFlatConstraints(raw: DataFieldDefinition & Record<string, unknown>): { field: DataFieldDefinition; constraints: FieldConstraints } {
  const constraints: Record<string, unknown> = { ...(raw.constraints ?? {}) };
  const field: Record<string, unknown> = { ...raw };
  for (const key of CONSTRAINT_KEYS) {
    if (key in field) {
      if (field[key] !== undefined && field[key] !== null) constraints[key] = field[key];
      delete field[key];
    }
  }
  return { field: field as unknown as DataFieldDefinition, constraints: constraints as FieldConstraints };
}

export interface NormalizedConstraints {
  definition: ProductDefinition;
  warnings: string[];
  /** Fields and rules that were predicted rather than stated by the BU. */
  inferredCount: number;
}

/** Sanitise inferred constraints, drop rules that point at unknown fields, and guarantee the system fields. */
export function normalizeDefinitionConstraints(definition: ProductDefinition): NormalizedConstraints {
  const warnings: string[] = [];
  const warn = (m: string) => warnings.push(m);
  let inferredCount = 0;

  const dataEntities: DataEntityDefinition[] = (definition.dataEntities ?? []).map((entity) => {
    const fields: DataFieldDefinition[] = (entity.fields ?? []).map((raw) => {
      const { field, constraints } = foldFlatConstraints(raw as DataFieldDefinition & Record<string, unknown>);
      const clean = sanitizeConstraints(constraints, warn, `${entity.name}.${field.name}`);
      const origin: ConstraintOrigin = field.origin ?? (entity.confidence === "CONFIRMED" ? "BU" : "INFERRED");
      const hasConstraints = Object.keys(clean).length > 0;
      return { ...field, ...(hasConstraints ? { constraints: clean } : {}), origin };
    });

    const lifecycle = sanitizeLifecycle(entity.lifecycle, warn, entity.name);

    const staged = withSystemFields({ ...entity, fields, lifecycle });
    const known = new Set(staged.fields.map((f) => norm(f.name)));
    const rules: EntityRule[] = [];
    for (const rule of entity.rules ?? []) {
      const refs = [rule.when?.field, rule.target, rule.left, rule.right, ...(rule.fields ?? [])].filter((n): n is string => !!n);
      const missing = refs.filter((n) => !known.has(norm(n)));
      if (missing.length > 0) {
        warn(`${entity.name}: rule "${rule.id}" dropped because it references unknown field(s): ${missing.join(", ")}.`);
        continue;
      }
      rules.push({ ...rule, origin: rule.origin ?? "INFERRED" });
    }
    const crossRecordRules = (entity.crossRecordRules ?? [])
      .map((r) => String(r).trim().slice(0, 300))
      .filter(Boolean)
      .slice(0, 20);

    inferredCount += staged.fields.filter((f) => f.origin === "INFERRED").length + rules.filter((r) => r.origin === "INFERRED").length;
    return { ...staged, rules, crossRecordRules };
  });

  return {
    definition: {
      ...definition,
      dataEntities,
      ...(warnings.length > 0 ? { constraintWarnings: warnings } : {}),
    },
    warnings,
    inferredCount,
  };
}

/** Always added when constraints were predicted, so the BU is asked to confirm them. */
export function constraintOpenQuestion(inferredCount: number): OpenQuestionItem {
  return {
    id: "oq-constraint-validation",
    question: `${inferredCount} data field(s) and validation rule(s) were inferred rather than stated by the BU. Please review the Data Entities tab, where each is marked INFERRED, and confirm, correct or remove them before sign-off.`,
    urgency: "important",
    status: "open",
  };
}

/** Markdown section listing every entity's fields, constraints, lifecycle and rules, for the engineering package. */
export function validationRulesMarkdown(entities: DataEntityDefinition[]): string {
  if (!entities || entities.length === 0) return "";
  const blocks = entities.map((raw) => {
    const e = withSystemFields(raw);
    const rows = e.fields.map((f) => {
      const chips = constraintSummary(f);
      return `| ${f.name} | ${f.type} | ${f.required ? "yes" : "no"} | ${chips.join(", ") || "-"} | ${f.origin ?? "-"} |`;
    });
    const lines = [
      `#### ${e.name}`,
      "| Field | Type | Required | Constraints | Origin |",
      "|---|---|---|---|---|",
      ...rows,
    ];
    if (e.lifecycle) {
      lines.push("", `**Lifecycle** (\`${e.lifecycle.statusField}\`, starts as \`${e.lifecycle.initial}\`):`);
      lines.push(...e.lifecycle.transitions.map((t) => `- ${t.from} -> ${t.to}`));
    }
    if (e.rules && e.rules.length > 0) {
      lines.push("", "**Field rules** (enforced on client and server):");
      lines.push(...e.rules.map((r) => `- ${r.message} _(${r.kind}, ${r.origin ?? "INFERRED"})_`));
    }
    if (e.crossRecordRules && e.crossRecordRules.length > 0) {
      lines.push("", "**Service-layer rules** (need storage; the backend must enforce these):");
      lines.push(...e.crossRecordRules.map((r) => `- ${r}`));
    }
    return lines.join("\n");
  });
  return `### 8. Data Validation Rules\nFields and rules marked INFERRED were predicted, not stated by the BU, and need BU confirmation.\n\n${blocks.join("\n\n")}\n`;
}
