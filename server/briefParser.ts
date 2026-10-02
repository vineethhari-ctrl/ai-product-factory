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
  for (const m of text.matchAll(/\b([A-Za-z]{4,})\s+(?:such as|e\.g\.|like)\s+([^.;:()]+)/gi)) {
    const items = m[2]
      .split(/,|\band\b|\bor\b|\//)
      .map((s) => s.trim().replace(/\betc\.?$/i, "").trim())
      .filter((s) => s && s.split(/\s+/).length <= 3 && !/^etc\.?$/i.test(s));
    if (items.length >= 3) return { name: titlePhrase(singular(m[1])), types: [...new Set(items.map(titlePhrase))].slice(0, 10) };
  }
  return undefined;
}

export function parseBrief(text: string, productName = ""): BlueprintBrief {
  const stages = extractStages(text);
  const subject = extractSubject(text, stages, productName);
  const parts = extractParts(text);
  const partNames = new Set((parts?.types ?? []).map((t) => t.toLowerCase()));
  const parties = extractParties(`${productName}. ${text}`).filter((p) => !partNames.has(p.toLowerCase()));
  return { subject, stages, parties, ...(parts ? { parts } : {}) };
}
