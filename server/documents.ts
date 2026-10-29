import type {
  BlueprintBrief,
  ProductDefinition,
  ScreenDefinition,
  DataEntityDefinition,
  DataFieldDefinition,
  DocumentAction,
  DocumentField,
  DocumentFieldKind,
  DocumentLines,
  TransactionDocument,
} from "../src/types";
import { resolveFieldConstraints } from "../src/services/validationEngine";
import { documentSample } from "../src/services/documentSamples";
import { withProofChain } from "./proofChain";
import { humanizeDocumentStates } from "../src/services/documentMath";
import { codePrefix, deriveSubject, entityForScreen, humanize, stateLabel } from "./blueprint";

/**
 * Business documents for 'transaction' screens: the documents users create and move through their workflow
 * (whatever the BU calls them). `cleanDocument` makes an AI-written document safe to render; `documentFromEntity`
 * builds one offline from a record's own fields and lifecycle. Domain-neutral: every label, option and status
 * comes from the AI's answer or the BU's definition, never from this file.
 */

const FIELD_KINDS: DocumentFieldKind[] = ["text", "long-text", "number", "money", "percent", "date", "select", "lookup", "email", "phone", "checkbox"];
const KIND_SYNONYMS: Record<string, DocumentFieldKind> = {
  textarea: "long-text", "free-text": "long-text", longtext: "long-text", multiline: "long-text", string: "text",
  integer: "number", decimal: "number", quantity: "number", amount: "money", currency: "money", price: "money",
  percentage: "percent", datetime: "date", dropdown: "select", enum: "select", choice: "select",
  reference: "lookup", search: "lookup", boolean: "checkbox", bool: "checkbox", yesno: "checkbox",
};
const LINE_KINDS = new Set(["text", "number", "money", "percent", "select"]);

const clip = (s: unknown, max: number) => (typeof s === "string" ? s.trim().slice(0, max) : "");
/** Without duplicates (ignoring case), keeping each item's first spelling. */
const uniq = (items: string[]) => {
  const seen = new Map<string, string>();
  for (const i of items) if (i && !seen.has(i.toLowerCase())) seen.set(i.toLowerCase(), i);
  return [...seen.values()];
};

function kindOf(raw: unknown): DocumentFieldKind {
  const k = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if ((FIELD_KINDS as string[]).includes(k)) return k as DocumentFieldKind;
  return KIND_SYNONYMS[k.replace(/[\s_]/g, "")] ?? "text";
}

function cleanField(f: Partial<DocumentField> | undefined): DocumentField | null {
  const label = clip(f?.label, 60);
  if (!label) return null;
  let kind = kindOf(f?.kind);
  const options = uniq((f?.options ?? []).map((o) => clip(o, 60))).slice(0, 20);
  if (kind === "select" && options.length < 2) kind = options.length ? "lookup" : "text";
  return {
    label,
    kind,
    ...(f?.required ? { required: true } : {}),
    ...(options.length && (kind === "select" || kind === "lookup") ? { options } : {}),
    ...(clip(f?.sample, 120) ? { sample: clip(f?.sample, 120) } : {}),
    ...(f?.readOnly ? { readOnly: true } : {}),
  };
}

function findLabel(labels: string[], wanted: unknown): string | undefined {
  const w = clip(wanted, 60).toLowerCase();
  return w ? labels.find((l) => l.toLowerCase() === w) : undefined;
}

function cleanLines(l: Partial<DocumentLines> | undefined): DocumentLines | undefined {
  if (!l) return undefined;
  const columns = (l.columns ?? [])
    .map((c) => {
      const label = clip(c?.label, 40);
      const kind = LINE_KINDS.has(String(c?.kind)) ? (c!.kind as DocumentLines["columns"][number]["kind"]) : kindOf(c?.kind) === "money" ? "money" : kindOf(c?.kind) === "number" ? "number" : "text";
      const options = uniq((c?.options ?? []).map((o) => clip(o, 60))).slice(0, 20);
      return label ? { label, kind: kind === "select" && options.length < 2 ? ("text" as const) : kind, ...(options.length >= 2 && kind === "select" ? { options } : {}) } : null;
    })
    .filter((c): c is NonNullable<typeof c> => !!c)
    .filter((c, i, all) => all.findIndex((x) => x.label.toLowerCase() === c.label.toLowerCase()) === i)
    .slice(0, 8);
  if (columns.length < 2) return undefined;
  const labels = columns.map((c) => c.label);
  const quantityColumn = findLabel(labels, l.quantityColumn);
  const priceColumn = findLabel(labels, l.priceColumn);
  const discountColumn = findLabel(labels, l.discountColumn);
  let amountColumn = findLabel(labels, l.amountColumn);
  // Quantity and price but nowhere to show the result: add the amount column.
  if (!amountColumn && priceColumn && columns.length < 8) {
    columns.push({ label: "Amount", kind: "money" });
    amountColumn = "Amount";
  }
  const width = columns.length;
  const rows = (l.rows ?? []).slice(0, 8).map((r) => {
    const cells = (Array.isArray(r) ? r : []).map((c) => clip(String(c ?? ""), 80)).slice(0, width);
    while (cells.length < width) cells.push("");
    return cells;
  }).filter((r) => r.some(Boolean));
  return {
    title: clip(l.title, 60) || "Lines",
    columns,
    rows,
    ...(quantityColumn ? { quantityColumn } : {}),
    ...(priceColumn ? { priceColumn } : {}),
    ...(discountColumn ? { discountColumn } : {}),
    ...(amountColumn ? { amountColumn } : {}),
  };
}

/** A prefix such as "AB-" from the document name when the model gave none or an odd one. */
function prefixFor(name: string, raw: unknown): string {
  const given = clip(raw, 8).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return `${given || codePrefix(name)}-`;
}

/**
 * Make an AI-written document safe to render: valid kinds, options where needed, lines with one cell per column,
 * statuses without duplicates and actions that go from and to real statuses. Undefined when there is nothing to
 * render (no named document or no header field).
 */
export function cleanDocument(rawIn: Partial<TransactionDocument> | undefined, fallbackStates: string[] = [], entity?: DataEntityDefinition, entities: DataEntityDefinition[] = []): TransactionDocument | undefined {
  if (!rawIn) return undefined;
  // Statuses as a person reads them (a model copies the record's UPPER_CASE values).
  const raw = humanizeDocumentStates(rawIn);
  fallbackStates = fallbackStates.map((x) => humanizeDocumentStates({ states: [x] }).states![0]);
  const name = clip(raw.name, 40);
  if (!name) return undefined;
  const seen = new Set<string>();
  const sections = (raw.sections ?? []).slice(0, 6).map((s) => ({
    title: clip(s?.title, 60) || "Details",
    fields: (s?.fields ?? []).map(cleanField).filter((f): f is DocumentField => {
      if (!f || seen.has(f.label.toLowerCase())) return false;
      seen.add(f.label.toLowerCase());
      return true;
    }).slice(0, 14),
  })).filter((s) => s.fields.length > 0);
  if (sections.length === 0) return undefined;

  let states = uniq((raw.states ?? []).map((s) => clip(s, 40))).slice(0, 10);
  if (states.length < 2) states = uniq(fallbackStates.map((s) => clip(s, 40))).slice(0, 10);
  if (states.length < 2) states = ["Draft", "Submitted", "Approved"];
  const canon = (s: unknown) => states.find((x) => x.toLowerCase() === clip(s, 40).toLowerCase());

  let actions: DocumentAction[] = (raw.actions ?? []).map((a) => {
    const label = clip(a?.label, 50);
    const to = canon(a?.to);
    if (!label || !to) return null;
    const from = uniq((a?.from ?? []).map(canon).filter((x): x is string => !!x));
    return {
      label,
      from,
      to,
      ...(clip(a?.role, 60) ? { role: clip(a?.role, 60) } : {}),
      ...(a?.needsReason ? { needsReason: true } : {}),
      ...(clip(a?.creates, 40) ? { creates: clip(a?.creates, 40) } : {}),
    };
  }).filter((a): a is DocumentAction => !!a).slice(0, 10);
  // Every status but the last needs a way forward; otherwise the document would be stuck.
  if (actions.length === 0) actions = stepActions(states);

  const totals = raw.totals
    ? {
        currency: /^[A-Za-z]{3}$/.test(clip(raw.totals.currency, 3)) ? clip(raw.totals.currency, 3).toUpperCase() : "",
        ...(pct(raw.totals.discountPercent) ? { discountPercent: pct(raw.totals.discountPercent) } : {}),
        ...(pct(raw.totals.taxPercent) ? { taxPercent: pct(raw.totals.taxPercent), taxLabel: clip(raw.totals.taxLabel, 30) || "Tax" } : {}),
      }
    : undefined;
  const lines = cleanLines(raw.lines);
  const next = uniq((raw.related?.next ?? []).map((n) => clip(n, 40))).slice(0, 4);
  const from = clip(raw.related?.from, 40);

  return completeDocument({
    name,
    numberPrefix: prefixFor(name, raw.numberPrefix),
    sections,
    ...(lines ? { lines } : {}),
    ...(totals && lines ? { totals } : {}),
    states,
    actions,
    ...(from || next.length ? { related: { ...(from ? { from } : {}), ...(next.length ? { next } : {}) } } : {}),
  }, entity, entities);
}

const pct = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n > 0 && n <= 100 ? Math.round(n * 100) / 100 : 0);

/** One action per step: "Move to <next status>" from each status to the next. */
function stepActions(states: string[]): DocumentAction[] {
  return states.slice(0, -1).map((s, i) => ({ label: `Move to ${states[i + 1]}`, from: [s], to: states[i + 1] }));
}

// ─── Samples: an opened document is never blank ───────────────────────────────

const flat = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Every field of a document gets a sample, whoever wrote the document (a model leaves them out, or the offline engine
 * builds none). A field that points at another record becomes a lookup of that record's own references; a
 * reference to something that is not a record of the product (an organisation or tenant the signed-in user belongs to)
 * is filled in by the system, read-only.
 */
export function completeDocument(doc: TransactionDocument, entity?: DataEntityDefinition, entities: DataEntityDefinition[] = []): TransactionDocument {
  return {
    ...doc,
    sections: doc.sections.map((sec) => ({
      ...sec,
      fields: sec.fields.map((f): DocumentField => {
        const ef = entity?.fields.find((x) => flat(humanize(x.name)) === flat(f.label));
        const isRef = !!ef && resolveFieldConstraints(ef).format === "uuid" && !/^id$/i.test(ef.name);
        if (isRef && ef) {
          const target = flat(ef.name.replace(/_?id$/i, ""));
          const other = entities.find((e) => e.name !== entity?.name && target && (flat(e.name) === target || flat(e.name).endsWith(target) || target.endsWith(flat(e.name))));
          if (other) {
            const options = [0, 1, 2].map((k) => `${codePrefix(other.name)}-${1040 + k * 7}`);
            return { ...f, kind: "lookup", options, sample: f.sample ?? options[0] };
          }
          const { required: _drop, ...rest } = f;
          return { ...rest, readOnly: true, sample: f.sample ?? documentSample("text", f.label, undefined, 0, ef) };
        }
        return f.sample ? f : { ...f, sample: documentSample(f.kind, f.label, f.options, 0, ef) };
      }),
    })),
  };
}

// ─── Offline: a document from a record's own fields ───────────────────────────

function fieldKind(f: DataFieldDefinition): DocumentFieldKind {
  const c = resolveFieldConstraints(f);
  if (c.enumValues?.length) return "select";
  switch (c.format) {
    case "free-text": return "long-text";
    case "email": return "email";
    case "phone": return "phone";
    case "date": case "datetime": return "date";
    case "integer": return "number";
    case "decimal": return /(amount|value|cost|price|total|fee|budget)/i.test(f.name) ? "money" : "number";
    case "percentage": return "percent";
    case "boolean": return "checkbox";
  }
  return /(note|description|comment|reason|detail)/i.test(f.name) ? "long-text" : "text";
}

/**
 * The document a record's own screen works with, built without AI: header fields from the record's business fields
 * (system fields left out), line items from the child records named in the brief, and the workflow from the
 * record's lifecycle.
 */
export function documentFromEntity(entity: DataEntityDefinition, subject: string, brief?: BlueprintBrief): TransactionDocument {
  const statusField = entity.lifecycle?.statusField;
  const business = entity.fields.filter((f) => f.source !== "system" && f.name !== statusField && !/^id$/i.test(f.name));
  const key = business.find((f) => resolveFieldConstraints(f).unique || resolveFieldConstraints(f).format === "identifier");
  const toField = (f: DataFieldDefinition): DocumentField => {
    const c = resolveFieldConstraints(f);
    const kind = f === key ? "text" : fieldKind(f);
    return {
      label: humanize(f.name),
      kind,
      ...(f.required && f !== key ? { required: true } : {}),
      ...(kind === "select" && c.enumValues?.length ? { options: c.enumValues.map((v) => (/[a-z]/.test(v) ? v : stateLabel(v))) } : {}),
      ...(f === key ? { readOnly: true } : {}),
    };
  };
  const fields = business.map(toField);
  const first = fields.slice(0, 6);
  const rest = fields.slice(6, 14);
  const sections = [
    { title: `${entity.name} details`, fields: first.length ? first : [{ label: "Title", kind: "text" as const, required: true }] },
    ...(rest.length ? [{ title: "More details", fields: rest }] : []),
  ];

  const parts = brief?.parts;
  const lines: DocumentLines | undefined = parts && parts.types.length
    ? {
        title: humanize(parts.name),
        columns: [
          { label: humanize(parts.name), kind: "select", options: parts.types.slice(0, 20) },
          { label: "Reference", kind: "text" },
          { label: "Quantity", kind: "number" },
        ],
        rows: parts.types.slice(0, 2).map((t, i) => [t, `${codePrefix(t)}-${1040 + i * 7}`, "1"]),
        quantityColumn: "Quantity",
      }
    : undefined;

  const lc = entity.lifecycle;
  const readable = (s: string) => (/[a-z]/.test(s) ? s : stateLabel(s));
  const states = lc?.states.length ? lc.states.map(readable) : ["Draft", "Submitted", "Approved", "Rejected"];
  const actions: DocumentAction[] = lc?.transitions.length
    ? lc.transitions.slice(0, 12).map((t) => ({ label: `Move to ${readable(t.to)}`, from: [readable(t.from)], to: readable(t.to) }))
    : stepActions(states);

  return { name: subject, numberPrefix: `${codePrefix(subject)}-`, sections, ...(lines ? { lines } : {}), states, actions };
}

/** "New <document>" first; other actions kept, without repeating it. */
function withNewAction(actions: string[], docName: string): string[] {
  const first = `New ${docName}`;
  return [first, ...actions.filter((a) => a.toLowerCase() !== first.toLowerCase() && !/^new\b/i.test(a))].slice(0, 4);
}

function documentForScreen(def: ProductDefinition, screen: ScreenDefinition): TransactionDocument | undefined {
  const entity = entityForScreen(screen, def.dataEntities);
  if (!entity) return undefined;
  return completeDocument(documentFromEntity(entity, entity.name || deriveSubject(def.productName, def.businessUnit), def.blueprintBrief), entity, def.dataEntities);
}

/**
 * Every 'transaction' screen gets a document (from its record when the design gave none), and every prototype has at
 * least one: when no screen creates documents, the first record-register screen becomes one. A prototype in which
 * users cannot create and work their documents is not a prototype of a business application.
 */
export function withDocuments(def: ProductDefinition): ProductDefinition {
  const screens = def.screens.map((s) => {
    if (s.layoutType !== "transaction" || !s.ui || s.ui.document) return s;
    const document = documentForScreen(def, s);
    return document ? { ...s, ui: { ...s.ui, document, primaryActions: withNewAction(s.ui.primaryActions, document.name) } } : { ...s, layoutType: "table-detail" as const };
  });
  if (!screens.some((s) => s.layoutType === "transaction" && s.ui?.document)) {
    const i = screens.findIndex((s) => s.layoutType === "table-detail" && s.ui);
    if (i >= 0) {
      const s = screens[i];
      const document = documentForScreen(def, s);
      if (document && s.ui) {
        // The register's summary tiles counted rows the document list no longer shows, so they go.
        screens[i] = { ...s, layoutType: "transaction", ui: { ...s.ui, kpis: [], document, primaryActions: withNewAction(s.ui.primaryActions, document.name) } };
      }
    }
  }
  return withProofChain({ ...def, screens });
}
