import type { DataEntityDefinition, DataFieldDefinition, DocumentFieldKind, ProductDefinition, ScreenDefinition } from "../src/types";
import { resolveFieldConstraints } from "../src/services/validationEngine";
import { documentSample } from "../src/services/documentSamples";
import { readableState } from "../src/services/documentMath";
import { codePrefix, entityForScreen, humanize } from "./blueprint";

/**
 * The hash-chained ledger of a prototype. When the BRD says records are hash-chained, append-only or tamper-evident,
 * one screen shows them as a ledger the user can verify and try to tamper with (src/components/ProofChain.tsx).
 * Domain-neutral: nothing here knows what the records are; the words and values come from the definition.
 */

const CHAIN_WORDS = /hash[- ]?(chain|linked)|tamper[- ](evident|proof|resistant)|cryptographically (hashed|chained|linked)|merkle|blockchain|immutable ledger|append[- ]?only[^.\n]{0,40}(ledger|chain|hash)|(ledger|chain)[^.\n]{0,40}append[- ]?only|sha-?256[^.\n]{0,40}ledger/i;
const PREV_HASH = /(prev|previous|parent)[a-z_]*hash|hash[a-z_]*(prev|previous|parent)/i;

/** A record with a previous-hash field and its own hash field is a chain of records. */
export function chainEntity(def: ProductDefinition): DataEntityDefinition | undefined {
  return def.dataEntities.find((e) => {
    const names = e.fields.map((f) => f.name);
    return names.some((n) => PREV_HASH.test(n)) && names.some((n) => /hash/i.test(n) && !PREV_HASH.test(n) && !/payload|raw|content|file/i.test(n));
  });
}

/**
 * Does the BRD describe records that must be hash-chained or tamper-evident? A plain "append-only audit log" is common
 * boilerplate and does not count; hash chains, tamper evidence, a ledger that is append-only, Merkle roots and the like do.
 */
export function needsChain(def: ProductDefinition): boolean {
  if (chainEntity(def)) return true;
  const text = [
    def.objective,
    ...def.modules.filter((m) => !m.id.startsWith("mod-bp") && !m.id.startsWith("mod-scr-chain")).map((m) => `${m.name} ${m.description}`),
    // The engine's generic inferred rules (br-bp-<n>) are boilerplate; rules the BU wrote (br-bp-bu-<n>) and the model's count.
    ...def.businessRules.filter((r) => !/^br-bp-\d+$/.test(r.id)).map((r) => `${r.rule} ${r.context}`),
    // The offline engine's own generic wording (blueprint ids) is not something the BU asked for.
    ...def.screens.filter((s) => !s.id.startsWith("scr-bp-") && !s.id.startsWith("scr-chain")).map((s) => `${s.name} ${s.purpose}`),
    ...def.dataEntities.filter((e) => !e.id.startsWith("ent-bp")).map((e) => e.description),
    ...def.integrations.map((i) => i.purpose),
  ].join("\n");
  return CHAIN_WORDS.test(text);
}

function kindOf(f: DataFieldDefinition): DocumentFieldKind {
  switch (resolveFieldConstraints(f).format) {
    case "email": return "email";
    case "phone": return "phone";
    case "date": case "datetime": return "date";
    case "integer": case "decimal": return "number";
    case "percentage": return "percent";
    case "boolean": return "checkbox";
    default: return "text";
  }
}

const ROWS = 7;

/** The ledger's table: a chain record's own business fields, else one row per step a record goes through. */
function ledgerTable(def: ProductDefinition, chain: DataEntityDefinition | undefined, main: DataEntityDefinition | undefined) {
  if (chain) {
    const statusField = chain.lifecycle?.statusField;
    const fields = chain.fields.filter((f) => f.source !== "system" && f.name !== statusField && !/^id$/i.test(f.name) && !/hash|signature/i.test(f.name) && !/(_id|tenant)$/i.test(f.name));
    const key = fields.find((f) => /sequence|seq|index|number/i.test(f.name));
    const shown = [...(key ? [key] : []), ...fields.filter((f) => f !== key)].slice(0, 5);
    return {
      columns: ["Seq", ...shown.filter((f) => f !== key).map((f) => humanize(f.name))],
      rows: Array.from({ length: ROWS }, (_, i) => ["" + (i + 1), ...shown.filter((f) => f !== key).map((f) => documentSample(kindOf(f), humanize(f.name), resolveFieldConstraints(f).enumValues?.map(readableState), i, f))]),
    };
  }
  const steps = main?.lifecycle?.states.length ? main.lifecycle.states.map(readableState) : ["Created", "Updated", "Reviewed", "Approved", "Closed"];
  const name = spaced(main?.name ?? "Record");
  const people = def.personas.length ? def.personas.map((p) => p.name) : ["System"];
  return {
    columns: ["Seq", "Event", "Record", "Recorded at", "By"],
    rows: Array.from({ length: ROWS }, (_, i) => [
      "" + (i + 1),
      `${name} ${steps[i % steps.length]}`,
      `${codePrefix(main?.name ?? name)}-${1040 + (Math.floor(i / steps.length) + (i % 3)) * 7}`,
      documentSample("date", "Recorded at", undefined, i),
      people[i % people.length],
    ]),
  };
}

const spaced = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim();
const TITLE = (name: string) => `${spaced(name)} ledger`;
const NOTE = "Records are sealed in order and never edited: a correction is a new block.";

/** Give the prototype its ledger screen when the BRD asks for hash-chained records. Idempotent. */
export function withProofChain(def: ProductDefinition): ProductDefinition {
  // The AI marked its own ledger screen, or an earlier pass added one: keep exactly one.
  const marked = def.screens.find((s) => s.ui?.chain);
  if (marked) return def;
  const added = def.screens.find((s) => s.id.startsWith("scr-chain"));
  if (!needsChain(def) && !added) return def;

  const chain = chainEntity(def);
  const usable = (s: ScreenDefinition) => !!s.ui && (s.ui.table?.rows.length ?? 0) >= 3 && (s.ui.table?.columns.length ?? 0) >= 2;

  // An earlier pass added a ledger screen and a later design replaced its layout: put the ledger back on it.
  if (added && usable(added)) {
    return { ...def, screens: def.screens.map((s) => (s === added ? { ...s, ui: { ...s.ui!, chain: { title: s.name, note: NOTE, ledgerOnly: true } } } : s)) };
  }

  // The chain record already has a screen with a table of its records: that screen shows the ledger.
  if (chain) {
    const bound = def.screens.find((s) => usable(s) && s.layoutType !== "transaction" && entityForScreen(s, def.dataEntities)?.name === chain.name && (s.ui?.entity === chain.name || `${s.name} ${s.purpose}`.toLowerCase().includes(chain.name.toLowerCase())));
    if (bound) {
      return { ...def, screens: def.screens.map((s) => (s === bound ? { ...s, ui: { ...s.ui!, chain: { title: TITLE(chain.name), note: NOTE } } } : s)) };
    }
  }

  // Otherwise add one dedicated ledger screen.
  const main = chain ?? def.dataEntities.find((e) => e.lifecycle) ?? def.dataEntities[0];
  const table = ledgerTable(def, chain, main);
  const name = TITLE(main?.name ?? "Record");
  let id = "scr-chain-1";
  while (def.screens.some((s) => s.id === id)) id += "x";
  const moduleName = (main && def.screens.find((s) => entityForScreen(s, def.dataEntities)?.name === main.name)?.module) || def.screens[0]?.module || "Ledger";
  const allDesigned = def.screens.length > 0 && def.screens.every((s) => s.ui?.designed === true);
  const screen: ScreenDefinition = {
    id,
    name,
    module: moduleName,
    layoutType: "table-detail",
    components: [],
    purpose: `Shows the ${(main?.name ?? "record").toLowerCase()} records as a hash-chained ledger: verify the chain and see what tampering with a past record does.`,
    confidence: "INFERRED",
    evidence: ["Added because the BRD requires hash-chained, tamper-evident records"],
    ui: {
      kpis: [],
      filters: ["All"],
      table: { title: name, columns: table.columns, rows: table.rows },
      detailPanels: [],
      primaryActions: [],
      benchmarkNote: "Hash-chained record ledger: blocks linked by SHA-256, verifiable in the prototype.",
      chain: { title: name, note: NOTE, ledgerOnly: true },
      ...(allDesigned ? { origin: "AI" as const, designed: true } : {}),
    },
  };
  const mod = def.modules.find((m) => m.name === moduleName);
  return {
    ...def,
    screens: [...def.screens, screen],
    navigation: [...(def.navigation ?? []), { id: `nav-${id}`, label: name.slice(0, 80), screenId: id, icon: "Link2", allowedRoles: ["All"] }],
    modules: mod ? def.modules.map((m) => (m === mod ? { ...m, screens: [...m.screens, id] } : m)) : [...def.modules, { id: `mod-${id}`, name: moduleName, description: "Hash-chained ledger", screens: [id], confidence: "INFERRED", evidence: ["Added with the ledger screen"] }],
  };
}
