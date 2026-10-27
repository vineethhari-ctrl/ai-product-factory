import type { ProductDefinition } from "../src/types";
import { constraintSummary, withSystemFields } from "../src/services/validationEngine";

/**
 * A compact, complete reading of a finished BRD for the documents derived from it (test suite, engineering plan).
 * Domain-neutral: nothing here names an industry; every noun is the definition's own. No timestamps or random ids,
 * so the same BRD always gives the same prompt (and the response cache can hit).
 */

const list = (items: string[], max = items.length) => items.slice(0, max).join("; ");

export function definitionDigest(def: ProductDefinition): string {
  const brief = def.blueprintBrief;
  const parts: string[] = [];
  parts.push(`PRODUCT: "${def.productName}" for ${def.businessUnit} (${def.version})`);
  parts.push(`OBJECTIVE: ${def.objective}`);
  if (def.problemStatement?.length) parts.push(`PROBLEMS TODAY:\n${def.problemStatement.map((p) => `- ${p}`).join("\n")}`);
  if (def.successMetrics?.length) parts.push(`SUCCESS MEASURES: ${list(def.successMetrics)}`);
  if (brief && brief.stages.length >= 2) {
    parts.push(`PROCESS (stages in order, with who does each):\n${brief.stages.map((s, i) => `${i + 1}. ${s}${brief.stageOwners?.[i] ? ` (${brief.stageOwners[i]})` : ""}`).join("\n")}`);
  }
  parts.push(`ROLES AND ACCESS:\n${def.personas.map((p) => {
    const access = def.permissions.find((x) => x.role === p.name)?.accessLevel;
    return `- ${p.name} (${p.role}${access ? `, ${access}` : ""}): goals ${list(p.keyGoals, 3)}; permissions ${list(p.permissions, 4)}`;
  }).join("\n")}`);
  parts.push(`BUSINESS RULES (code, rule, where it applies, whether the business stated it):\n${def.businessRules.map((r) => `- ${r.code}: ${r.rule} [applies to: ${r.context}] [${r.confidence}]`).join("\n")}`);
  parts.push(`JOURNEYS:\n${def.userJourneys.map((j) => `- ${j.id} "${j.name}" by ${j.persona}: ${j.steps.join(" > ")} => ${j.outcome}`).join("\n")}`);
  parts.push(`RECORDS (business fields only; system fields such as ids, timestamps and row versions are added automatically):\n${def.dataEntities.map((e) => {
    const fields = withSystemFields(e).fields.filter((f) => f.source !== "system").slice(0, 24).map((f) => {
      const chips = constraintSummary(f).join(", ");
      return `${f.name}${f.required ? "*" : ""}${chips ? ` (${chips})` : ""}`;
    });
    const lc = e.lifecycle ? `\n    status field "${e.lifecycle.statusField}": ${e.lifecycle.states.join(" -> ")}; allowed changes: ${e.lifecycle.transitions.slice(0, 24).map((t) => `${t.from}>${t.to}`).join(", ")}` : "";
    const rules = e.rules?.length ? `\n    field rules: ${list(e.rules.map((r) => r.message), 6)}` : "";
    const cross = e.crossRecordRules?.length ? `\n    rules that need storage: ${list(e.crossRecordRules, 6)}` : "";
    return `- ${e.name}: ${e.description}\n    fields: ${fields.join(", ")} (* = required)${lc}${rules}${cross}`;
  }).join("\n")}`);
  parts.push(`SCREENS:\n${def.screens.map((s) => `- ${s.name} [${s.module}, ${s.layoutType}]: ${s.purpose}${s.ui?.primaryActions?.length ? ` Actions: ${list(s.ui.primaryActions, 5)}.` : ""}`).join("\n")}`);
  parts.push(`INTEGRATIONS:\n${def.integrations.map((i) => `- ${i.system} (${i.protocol}): ${i.purpose} [${i.confidence}]`).join("\n") || "- none named"}`);
  if (def.validations.length) parts.push(`VALIDATIONS:\n${def.validations.slice(0, 20).map((v) => `- ${v.field}: ${v.validationRule} -> "${v.errorMessage}"`).join("\n")}`);
  if (def.notifications.length) parts.push(`NOTIFICATIONS:\n${def.notifications.slice(0, 12).map((n) => `- ${n.event} -> ${n.recipient} by ${n.channel}`).join("\n")}`);
  if (def.assumptions.length) parts.push(`ASSUMPTIONS:\n${def.assumptions.slice(0, 10).map((a) => `- ${a.statement} (risk ${a.riskLevel})`).join("\n")}`);
  const open = def.openQuestions.filter((q) => q.status === "open").slice(0, 10);
  if (open.length) parts.push(`OPEN QUESTIONS (not yet answered):\n${open.map((q) => `- [${q.urgency}] ${q.question}`).join("\n")}`);
  return parts.join("\n\n");
}
