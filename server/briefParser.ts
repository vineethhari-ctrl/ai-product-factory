import type { BlueprintBrief } from "../src/types";

/**
 * Reads structure out of the BU's own words, without an LLM.
 *
 * Domain-neutral: it looks for writing patterns, never for domain vocabulary.
 * - stages:  an arrow chain such as "A → B → C" (also ->, =>, ⇒)
 * - subject: "X 360", else the most frequent noun shared by the stages and the text
 * - parties: acronyms defined as a group of people or organisations ("ABCs (Alpha Beta Carriers)"),
 *            lowercase plural role nouns ("installers", "technicians"), and the other members of a
 *            slash group that contains one of them ("partner/customer")
 * - parts:   "<things> such as a, b, c" lists, which become the child records of the subject
 */

const ARROW = /\s*(?:→|->|=>|⇒|➝|➜|⟶)\s*/;
/** Words that end a phrase at a sentence or clause boundary. */
const BREAK_WORDS = new Set(["the", "this", "that", "these", "those", "we", "it", "our", "they", "there", "a", "an", "and", "is", "are", "in", "to", "of", "with", "which", "who"]);
/** Words that only introduce a list, never belong to an item. */
const LEAD_WORDS = new Set(["including", "include", "includes", "from", "through", "via", "then", "and", "the", "to", "e.g.", "i.e.", "such", "as", "like"]);
const STOP = new Set([
  ...BREAK_WORDS, "for", "on", "at", "by", "or", "as", "be", "not", "its", "their", "has", "have", "from", "into", "across", "every",
  "other", "all", "also", "only", "will", "should", "needs", "need", "current", "latest", "complete", "major", "key", "first", "final",
]);
/** Plural nouns with a role ending that are not roles. */
const NOT_ROLES = new Set([
  "numbers", "others", "orders", "letters", "filters", "parameters", "layers", "papers", "centers", "centres", "matters", "markers",
  "errors", "factors", "sectors", "colors", "colours", "vectors", "headers", "folders", "chapters", "barriers", "monitors", "sensors",
  "motors", "meters", "members", "covers", "registers", "transfers", "offers", "answers", "powers", "towers", "corners", "borders",
  "variants", "constants", "elements", "requirements", "lists", "artists", "materials", "details", "levels", "controllers", "plants",
]);

const MAX_STAGES = 14;

function cleanWord(w: string): string {
  return w.replace(/^[^A-Za-z0-9&/]+|[^A-Za-z0-9&/)]+$/g, "");
}

/** Title-case a phrase, keeping acronyms and slash/ampersand joins. */
function titlePhrase(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) =>
      w.split("/").map((p) => (p.length > 1 && p === p.toUpperCase() && /[A-Z]/.test(p) ? p : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())).join("/")
    )
    .join(" ");
}

function singular(w: string): string {
  if (w.length <= 3) return w;
  if (/[A-Z]{2,}s$/.test(w)) return w.slice(0, -1); // ABCs -> ABC
  if (/ies$/i.test(w)) return w.slice(0, -3) + "y";
  if (/(ss|us|is)$/i.test(w)) return w;
  if (/(sh|ch|x)es$/i.test(w)) return w.slice(0, -2);
  if (/s$/i.test(w)) return w.slice(0, -1);
  return w;
}

/** Singular of the last word: "Regional Sales Managers" -> "Regional Sales Manager". */
function singularPhrase(p: string): string {
  const words = p.split(/\s+/);
  words[words.length - 1] = singular(words[words.length - 1]);
  return words.join(" ");
}

/** First item of a long fragment: words up to the first sentence or clause break. */
function headItem(fragment: string): string {
  const words = fragment.trim().split(/\s+/).map(cleanWord).filter(Boolean);
  const out: string[] = [];
  for (const w of words) {
    if (out.length > 0 && (BREAK_WORDS.has(w.toLowerCase()) || /^[A-Z]/.test(w) && !/^[A-Z0-9&/]+$/.test(w))) break;
    out.push(w);
    if (out.length === 4) break;
  }
  return out.join(" ");
}

/** Last item of a long fragment: the words after the last clause separator. */
function tailItem(fragment: string): string {
  const afterSep = fragment.split(/[:;.!?—–(]\s*/).pop() ?? "";
  let words = afterSep.trim().split(/\s+/).map(cleanWord).filter(Boolean);
  while (words.length && LEAD_WORDS.has(words[0].toLowerCase())) words = words.slice(1);
  return words.length > 0 && words.length <= 4 ? words.join(" ") : "";
}

/** Every "A → B → C" chain in the text, merged in order of appearance without duplicates. */
export function extractStages(text: string): string[] {
  if (!ARROW.test(text)) return [];
  const parts = text.split(ARROW);
  const stages: string[] = [];
  const add = (raw: string) => {
    const item = raw.replace(/\s+/g, " ").trim();
    if (!item || item.length > 48) return;
    const label = titlePhrase(item);
    if (!stages.some((s) => s.toLowerCase() === label.toLowerCase())) stages.push(label);
  };
  parts.forEach((part, i) => {
    const words = part.trim().split(/\s+/).filter(Boolean);
    const short = words.length <= 4 && !/[.:;]/.test(part.trim().slice(0, -1));
    if (i === 0) return add(tailItem(part));
    if (i === parts.length - 1) return add(short ? words.map(cleanWord).join(" ") : headItem(part));
    if (short) return add(words.map(cleanWord).join(" "));
    // A long fragment ends one chain and may start the next.
    add(headItem(part));
    add(tailItem(part));
  });
  return stages.length >= 3 ? stages.slice(0, MAX_STAGES) : [];
}

function wordCounts(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const raw of text.split(/[^A-Za-z0-9]+/)) {
    if (raw.length < 3 || STOP.has(raw.toLowerCase())) continue;
    const key = singular(raw).toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** The record the brief is about: "X 360", else the most frequent noun that also names stages. */
export function extractSubject(text: string, stages: string[], productName: string): string | undefined {
  const named = `${productName} ${text}`.match(/\b([A-Z][A-Za-z0-9-]{2,})\s+360\b/);
  if (named) return titlePhrase(singular(named[1]));
  if (stages.length < 3) return undefined;
  const counts = wordCounts(`${productName} ${text}`);
  const stageWords = new Map<string, number>();
  for (const s of stages) {
    for (const w of s.split(/[\s/&]+/)) {
      const key = singular(w).toLowerCase();
      if (key.length >= 3 && !STOP.has(key)) stageWords.set(key, (stageWords.get(key) ?? 0) + 1);
    }
  }
  // A word that recurs across stage names and the text is what moves through the stages.
  const best = [...stageWords.entries()]
    .filter(([, inStages]) => inStages >= 2)
    .sort((a, b) => (counts.get(b[0]) ?? 0) - (counts.get(a[0]) ?? 0))[0];
  return best && (counts.get(best[0]) ?? 0) >= 3 ? titlePhrase(best[0]) : undefined;
}

const ROLE_PLURAL = /^[a-z][a-z-]{3,}(ers|ors|ians|ists|ants)$/;

/** People and organisations the brief names, in order of first mention. */
export function extractParties(text: string): string[] {
  const found: Array<{ name: string; at: number }> = [];
  const add = (name: string, at: number) => {
    const label = titlePhrase(name);
    if (!found.some((f) => f.name.toLowerCase() === label.toLowerCase())) found.push({ name: label, at });
  };
  // "ABCs (Alpha Beta Carriers)": an acronym defined as a group of people or organisations.
  for (const m of text.matchAll(/\b([A-Z]{2,8})s?\s*\(([A-Z][^)]{3,80})\)/g)) {
    const last = m[2].trim().split(/\s+/).pop()!.toLowerCase();
    if (ROLE_PLURAL.test(last) && !NOT_ROLES.has(last)) add(m[1], m.index ?? 0);
  }
  // Lowercase plural role nouns ("installers", "technicians"); capitalised ones are proper nouns.
  for (const m of text.matchAll(/\b([a-z][a-z-]+)\b/g)) {
    const w = m[1];
    if (ROLE_PLURAL.test(w) && !NOT_ROLES.has(w)) add(singular(w), m.index ?? 0);
  }
  // A slash group that contains a party is a group of parties: "partner/customer/installer".
  for (const m of text.matchAll(/\b([A-Za-z]+(?:\/[A-Za-z]+)+)\b/g)) {
    const tokens = m[1].split("/");
    const known = tokens.some((t) => found.some((f) => f.name.toLowerCase() === singular(t).toLowerCase()));
    if (known) tokens.forEach((t) => add(singular(t), m.index ?? 0));
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.name).slice(0, 6);
}

/** "<things> such as a, b and c" -> child records of the subject with a type list. */
export function extractParts(text: string): BlueprintBrief["parts"] {
  for (const m of text.matchAll(/\b((?:[A-Za-z]{3,}\s+)?[A-Za-z]{4,})\s+(?:such as|e\.g\.|like)\s+([^.;:()]+)/gi)) {
    const noun = m[1].split(/\s+/).filter((w, i, a) => i === a.length - 1 || !STOP.has(w.toLowerCase())).join(" ");
    const items = m[2]
      .split(/,|\band\b|\bor\b|\//)
      .map((s) => s.trim().replace(/\betc\.?$/i, "").trim())
      .filter((s) => s && s.split(/\s+/).length <= 3 && !/^etc\.?$/i.test(s));
    if (items.length >= 3) return { name: singularPhrase(titlePhrase(noun)), types: [...new Set(items.map(titlePhrase))].slice(0, 10) };
  }
  return undefined;
}

export interface BriefAction { party: string; verb: string; object: string }

/** Words that end an action's object: "approve extra costs | on their phone". */
const OBJECT_END = /\s+(?:on|in|at|for|with|via|by|to|from|into|using|through|before|after|within|when|while|so|if|once|until|during)\s+/i;
const OBJECT_LEAD = /^(?:(?:the|a|an|their|its|his|her|our|each|every|any|all|new|incoming)\s+)+/i;
const MODALS = /^(?:can|must|will|should|may|then|also|first|later)$/i;
const PARTICLES = /^(?:in|out|up|off|over|back|down)$/i;
/** General words for people that the role-ending test misses ("clerks", "members"). */
const PEOPLE_WORDS = new Set(["clerks", "members", "users", "guests", "clients", "leads", "partners", "parents", "residents", "citizens", "employees", "staff", "teams", "heads", "chiefs", "buyers", "sellers"]);

/**
 * Who does what to which record: "clerks log requests, leads assign desks".
 * A clause that starts with a plural role noun, then a verb (with an optional particle), then its object.
 */
export function extractActions(text: string): BriefAction[] {
  const actions: BriefAction[] = [];
  for (const sentence of text.split(/[.;!?\n]+/)) {
    for (const raw of sentence.split(/,|\band\b|\bwhere\b|\bwhile\b|\bwhen\b|\bwhereas\b/i)) {
      const words = raw.trim().replace(/^(?:the|our|their)\s+/i, "").split(/\s+/).map(cleanWord).filter(Boolean);
      if (words.length < 3) continue;
      const role = words[0].toLowerCase();
      if (!PEOPLE_WORDS.has(role) && (!ROLE_PLURAL.test(role) || NOT_ROLES.has(role))) continue;
      let i = 1;
      while (i < words.length && MODALS.test(words[i])) i++;
      const verb = words[i]?.toLowerCase();
      if (!verb || !/^[a-z]{3,}$/.test(verb) || STOP.has(verb) || /(?:ing|ed)$/.test(verb)) continue;
      i++;
      const particle = words[i] && PARTICLES.test(words[i]) && words.length > i + 1 ? ` ${words[i++].toLowerCase()}` : "";
      const object = ` ${words.slice(i).join(" ")} `.split(OBJECT_END)[0].trim().replace(OBJECT_LEAD, "").split(/\s+/).slice(0, 4).join(" ");
      if (!object || !/^[A-Za-z][A-Za-z -]*$/.test(object)) continue;
      const objWords = object.split(" ");
      objWords[objWords.length - 1] = singular(objWords[objWords.length - 1]);
      actions.push({ party: titlePhrase(singular(role)), verb: titlePhrase(verb + particle), object: titlePhrase(objWords.join(" ")) });
    }
  }
  return actions.slice(0, MAX_STAGES);
}

const SECTION_KEYS: Array<[keyof Sections, RegExp]> = [
  ["who", /\bwho does what\b|\bresponsibilit/],
  ["parties", /\b(?:stakeholders?|parties|actors|personas)\b/],
  ["pain", /\b(?:pain points?|problems?|challenges?)\b/],
  ["rules", /\brules?\b|\bpolicies\b|\bconstraints?\b/],
  ["kpis", /\b(?:kpis?|metrics?)\b/],
  ["integrations", /\b(?:integrations?|interfaces)\b/],
  ["goal", /\b(?:goal|objective|purpose|vision)\b/],
];
interface Sections { goal?: string; who?: string; parties?: string; pain?: string; rules?: string; kpis?: string; integrations?: string }

/** "Label: text" paragraphs, the way a BU lists goal, pain points, rules, KPIs, integrations. A blank line ends one. */
function extractSections(text: string): Sections {
  const out: Sections = {};
  let current: keyof Sections | undefined;
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z][A-Za-z /&'-]{2,40}?)\s*:\s*(.*)$/);
    const key = m ? SECTION_KEYS.find(([, re]) => re.test(m[1].toLowerCase()))?.[0] : undefined;
    if (m && key) { current = key; out[key] = `${out[key] ?? ""} ${m[2]}`.trim(); continue; }
    if (!line.trim()) { current = undefined; continue; }
    if (current && !m) out[current] = `${out[current]} ${line.trim()}`.trim();
    else current = undefined;
  }
  return out;
}

/** Split on a separator that is not inside brackets. */
function splitTop(s: string, sep: RegExp): string[] {
  const out: string[] = [];
  let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (depth === 0 && sep.test(ch)) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.replace(/\s+/g, " ").trim().replace(/[.]+$/, "")).filter(Boolean);
}

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const ROLE_WORD = /(?:ers|ors|ians|ists|ants|ents|ives)$/;
const PREPOSITIONS = new Set(["to", "for", "from", "in", "on", "at", "with", "by", "of", "above", "below", "before", "after", "within", "into", "via"]);

/** The role at the start of a clause: words up to the first plural role noun, before any preposition. */
function leadingRole(words: string[]): { role: string; rest: string[] } | undefined {
  for (let i = 0; i < Math.min(4, words.length - 1); i++) {
    const w = words[i].toLowerCase();
    if (PREPOSITIONS.has(w)) return undefined;
    if ((ROLE_WORD.test(w) || PEOPLE_WORDS.has(w)) && !NOT_ROLES.has(w)) {
      return { role: singularPhrase(titlePhrase(words.slice(0, i + 1).join(" "))), rest: words.slice(i + 1) };
    }
  }
  return undefined;
}

/** Which stage a duty belongs to: the stage name's stem or initials appearing in the duty's words. */
function stageFor(duty: string, stages: string[], taken: Set<number>): number {
  const words = duty.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const initials = words.map((w) => w[0]).join("");
  let best = -1, bestScore = 0;
  stages.forEach((st, i) => {
    if (taken.has(i)) return;
    const name = st.toLowerCase().replace(/[^a-z0-9 ]/g, "");
    const stem = name.split(" ")[0].slice(0, 5);
    let score = words.some((w) => w.startsWith(stem)) ? 1 : 0;
    if (!name.includes(" ") && name.length >= 2 && name.length <= 5 && initials.includes(name)) score += 3;
    if (score > bestScore) { best = i; bestScore = score; }
  });
  return best;
}

/** "clerks log requests and file notes, leads assign desks": duties per party, and the owner of each stage. */
function extractDuties(text: string, stages: string[]): { duties: Record<string, string[]>; owners: string[] } {
  const duties: Record<string, string[]> = {};
  const owners: string[] = stages.map(() => "");
  const taken = new Set<number>();
  for (const segment of splitTop(text, /,/)) {
    let role: string | undefined;
    splitTop(segment.replace(/\band\b/gi, ","), /,/).forEach((clause, idx) => {
      let words = clause.split(/\s+/).filter(Boolean);
      const lead = leadingRole(words);
      if (lead) { role = lead.role; words = lead.rest; }
      if (!role || words.length === 0) return;
      const duty = sentence(words.join(" "));
      (duties[role] ??= []).push(duty);
      const at = stages.length ? stageFor(words.join(" "), stages, taken) : -1;
      if (at >= 0) { owners[at] = role; taken.add(at); }
    });
  }
  return { duties, owners };
}

/** Everything the BU wrote under labels, without any domain vocabulary. */
function extractDetails(text: string, stages: string[]): Partial<BlueprintBrief> & { owners?: string[] } {
  const sec = extractSections(text);
  const out: Partial<BlueprintBrief> & { owners?: string[] } = {};
  if (sec.goal) out.goal = sentence(sec.goal.replace(/\s+/g, " ").trim());
  const list = (s: string | undefined, sep: RegExp) => (s ? splitTop(s, sep).map(sentence) : []);
  const pain = list(sec.pain, /;/), rules = list(sec.rules, /;/);
  const kpis = list(sec.kpis, /,/), integrations = list(sec.integrations, /,/);
  if (pain.length) out.painPoints = pain.slice(0, 10);
  if (rules.length) out.rules = rules.slice(0, 20);
  if (kpis.length) out.kpis = kpis.slice(0, 10);
  if (integrations.length) out.integrations = integrations.slice(0, 12);
  if (sec.parties) {
    out.parties = splitTop(sec.parties, /,/).map((p) => singularPhrase(titlePhrase(p.replace(/\([^)]*\)/g, "").trim()))).filter((p) => p && p.split(" ").length <= 4);
  }
  if (sec.who) {
    const { duties, owners } = extractDuties(sec.who, stages);
    if (Object.keys(duties).length) out.partyDuties = duties;
    if (owners.filter(Boolean).length >= Math.ceil(stages.length / 2)) out.owners = owners;
  }
  return out;
}

export function parseBrief(text: string, productName = ""): BlueprintBrief {
  let stages = extractStages(text);
  let subject = extractSubject(text, stages, productName);
  let stageOwners: string[] | undefined;
  // Without an arrow chain, three or more "who does what" clauses describe the process.
  const actions = stages.length ? [] : extractActions(text);
  if (actions.length >= 3) {
    subject ??= actions[0].object;
    stages = actions.map((a) => (a.object.toLowerCase() === subject!.toLowerCase() ? a.verb : `${a.verb} ${a.object}`));
    stageOwners = actions.map((a) => a.party);
  }
  const parts = extractParts(text);
  const detail = extractDetails(text, stages);
  if (!stageOwners && detail.owners) stageOwners = detail.owners;
  const partNames = new Set((parts?.types ?? []).map((t) => t.toLowerCase()));
  const named = detail.parties ?? [];
  const parties = [...new Set([...(stageOwners ?? []).filter(Boolean), ...named, ...(named.length ? [] : extractParties(`${productName}. ${text}`))])]
    .filter((p) => !partNames.has(p.toLowerCase())).slice(0, named.length ? 10 : 6);
  const { owners: _owners, parties: _parties, ...rest } = detail;
  return { subject, stages, parties, ...(stageOwners ? { stageOwners } : {}), ...(parts ? { parts } : {}), ...rest };
}
