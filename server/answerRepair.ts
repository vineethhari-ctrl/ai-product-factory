import { z } from "zod";

/**
 * Makes a model's answer usable instead of rejecting it for one wrong detail.
 *
 * A model asked for a large JSON answer often gets a few small things wrong: a label outside the allowed list,
 * a number written as text, a missing optional block, an empty table cell. Rejecting the whole answer for that
 * wastes the call (it is billed anyway) and stops the BA. `repairToSchema` reads the validation errors and fixes
 * each one with the smallest change that makes it valid, then validates again:
 *   - a label outside the allowed list -> the closest allowed label, else left out, else the first allowed one
 *   - a value of the wrong type        -> converted (12 -> "12", "3" -> 3, "yes" -> true, x -> [x])
 *   - a missing or empty value         -> left out when allowed, else a neutral default ("", 0, false, [], {})
 *   - too many items / too long text   -> trimmed
 *   - an item that still cannot be fixed -> that one item is dropped from its list, the rest is kept
 * Every change is listed in `repairs`, so the log shows what was adjusted. Nothing here knows any business domain.
 */

type Path = PropertyKey[];
type Issue = z.core.$ZodIssue & Record<string, unknown>;

export type RepairResult<T> =
  | { success: true; data: T; repairs: string[] }
  | { success: false; issues: Issue[]; repairs: string[] };

const MAX_ROUNDS = 15;
const MAX_REPAIRS_LISTED = 40;

/** Parse a model's text as JSON: strips code fences and prose around it, and trailing commas. */
export function parseJsonLoose(text: string): unknown | undefined {
  let clean = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const first = clean.search(/[{[]/);
  const last = Math.max(clean.lastIndexOf("}"), clean.lastIndexOf("]"));
  if (first !== -1 && last > first) clean = clean.substring(first, last + 1);
  for (const candidate of [clean, clean.replace(/,\s*([}\]])/g, "$1")]) {
    try {
      return JSON.parse(candidate);
    } catch {
      /* try the next form */
    }
  }
  return undefined;
}

const show = (v: unknown) => {
  const s = typeof v === "string" ? JSON.stringify(v) : JSON.stringify(v) ?? String(v);
  return s.length > 40 ? `${s.slice(0, 37)}...` : s;
};
const pathText = (p: Path) => p.map(String).join(".") || "(root)";
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function getAt(root: unknown, path: Path): unknown {
  let cur: any = root;
  for (const k of path) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[k as any];
  }
  return cur;
}

function parentOf(root: unknown, path: Path): any {
  return path.length ? getAt(root, path.slice(0, -1)) : undefined;
}

/** The allowed label closest to `value`, if any is close enough. */
function closestOption(value: unknown, options: unknown[]): unknown | undefined {
  if (options.includes(value)) return value;
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const v = norm(String(value));
  if (!v) return undefined;
  const strings = options.filter((o): o is string | number => typeof o === "string" || typeof o === "number");
  const exact = strings.find((o) => norm(String(o)) === v);
  if (exact !== undefined) return exact;
  // One contains the other ("in progress" ~ "IN_PROGRESS_REVIEW"); prefer the longest overlap.
  const partial = strings
    .filter((o) => { const n = norm(String(o)); return n.length >= 3 && (n.includes(v) || v.includes(n)); })
    .sort((a, b) => String(b).length - String(a).length);
  return partial[0];
}

function defaultFor(expected: string): unknown {
  switch (expected) {
    case "string": return "";
    case "number": case "int": return 0;
    case "boolean": return false;
    case "array": return [];
    case "object": case "record": return {};
    default: return undefined;
  }
}

function convert(value: unknown, expected: string): { ok: boolean; value?: unknown } {
  if (value === undefined || value === null) return { ok: false };
  switch (expected) {
    case "string":
      if (typeof value === "number" || typeof value === "boolean") return { ok: true, value: String(value) };
      if (Array.isArray(value) && value.every((x) => typeof x === "string" || typeof x === "number")) return { ok: true, value: value.join(", ") };
      return { ok: false };
    case "number": case "int": {
      const n = typeof value === "string" ? Number(value.replace(/[,%\s]/g, "")) : typeof value === "boolean" ? Number(value) : NaN;
      return Number.isFinite(n) ? { ok: true, value: expected === "int" ? Math.round(n) : n } : { ok: false };
    }
    case "boolean":
      if (typeof value === "string" && /^(true|yes|y|1)$/i.test(value.trim())) return { ok: true, value: true };
      if (typeof value === "string" && /^(false|no|n|0)$/i.test(value.trim())) return { ok: true, value: false };
      if (typeof value === "number") return { ok: true, value: value !== 0 };
      return { ok: false };
    case "array":
      return { ok: true, value: [value] };
    default:
      return { ok: false };
  }
}

/**
 * Fix `data` until it matches `schema`, or until nothing more can be fixed. `data` is not modified.
 */
export function repairToSchema<S extends z.ZodType>(schema: S, data: unknown): RepairResult<z.infer<S>> {
  const first = schema.safeParse(data);
  if (first.success) return { success: true, data: first.data, repairs: [] };
  if (data === null || typeof data !== "object") return { success: false, issues: first.error.issues as Issue[], repairs: [] };

  const root: any = structuredClone(data);
  const repairs: string[] = [];
  const removedOnce = new Set<string>(); // paths already left out once (a required field comes back as missing)
  const allowed = new Map<string, unknown[]>(); // allowed labels seen per path, for when leaving out is not allowed
  let issues = first.error.issues as Issue[];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const drops: Array<{ list: unknown[]; index: number; at: string }> = [];
    let changed = false;

    const dropItem = (path: Path, why: string): boolean => {
      // The nearest list item that contains this path is dropped; the rest of the list is kept.
      for (let i = path.length - 1; i >= 0; i--) {
        if (typeof path[i] !== "number") continue;
        const list = getAt(root, path.slice(0, i));
        if (Array.isArray(list)) {
          drops.push({ list, index: path[i] as number, at: `${pathText(path.slice(0, i + 1))} (${why})` });
          return true;
        }
      }
      return false;
    };

    const leaveOutOrDefault = (path: Path, fallback: unknown, why: string) => {
      const parent = parentOf(root, path);
      const key = path[path.length - 1];
      const at = pathText(path);
      if (parent && typeof parent === "object" && !Array.isArray(parent) && !removedOnce.has(at)) {
        if (key in parent) {
          delete parent[key as any];
          removedOnce.add(at);
          repairs.push(`${at}: ${why}, left out`);
          changed = true;
          return;
        }
        removedOnce.add(at);
      }
      if (fallback !== undefined && parent && typeof parent === "object") {
        parent[key as any] = fallback;
        repairs.push(`${at}: ${why}, set to ${show(fallback)}`);
        changed = true;
      } else if (dropItem(path, why)) {
        changed = true;
      }
    };

    for (const issue of issues) {
      const path = issue.path as Path;
      const at = pathText(path);
      const value = getAt(root, path);
      const parent = parentOf(root, path);
      const key = path[path.length - 1];

      if (!path.length) continue; // the whole answer has the wrong shape: nothing sensible to repair

      switch (issue.code) {
        case "invalid_value": {
          const options = (issue.values as unknown[]) ?? [];
          allowed.set(at, options);
          const best = closestOption(value, options);
          if (best !== undefined && best !== value) {
            parent[key as any] = best;
            repairs.push(`${at}: ${show(value)} -> ${show(best)}`);
            changed = true;
          } else if (Array.isArray(parent)) {
            if (dropItem(path, `${show(value)} is not an allowed value`)) changed = true;
          } else {
            leaveOutOrDefault(path, options[0], `${show(value)} is not an allowed value`);
          }
          break;
        }
        case "invalid_type": {
          const expected = String(issue.expected ?? "");
          const conv = convert(value, expected);
          if (conv.ok) {
            parent[key as any] = conv.value;
            repairs.push(`${at}: ${show(value)} converted to ${expected}`);
            changed = true;
          } else if (Array.isArray(parent) && ["string", "number", "boolean"].includes(expected)) {
            // A cell or label inside a list: keep the list's length (table rows must keep their column count).
            parent[key as any] = defaultFor(expected);
            repairs.push(`${at}: ${show(value)} replaced by ${show(defaultFor(expected))}`);
            changed = true;
          } else if (Array.isArray(parent)) {
            if (dropItem(path, `expected ${expected}`)) changed = true;
          } else {
            const options = allowed.get(at);
            leaveOutOrDefault(path, options?.[0] ?? defaultFor(expected), value === undefined ? `missing ${expected}` : `expected ${expected}, got ${show(value)}`);
          }
          break;
        }
        case "too_big": {
          const max = Number(issue.maximum);
          if (Array.isArray(value) && Number.isFinite(max)) {
            parent[key as any] = value.slice(0, max);
            repairs.push(`${at}: trimmed to ${max} items`);
            changed = true;
          } else if (typeof value === "string" && Number.isFinite(max)) {
            parent[key as any] = value.slice(0, max);
            repairs.push(`${at}: text trimmed to ${max} characters`);
            changed = true;
          } else if (typeof value === "number" && Number.isFinite(max)) {
            parent[key as any] = max;
            repairs.push(`${at}: ${value} capped at ${max}`);
            changed = true;
          }
          break;
        }
        case "too_small": {
          const min = Number(issue.minimum);
          if (typeof value === "number" && Number.isFinite(min)) {
            parent[key as any] = min;
            repairs.push(`${at}: ${value} raised to ${min}`);
            changed = true;
          } else if (dropItem(path, "too short")) {
            changed = true;
          } else {
            leaveOutOrDefault(path, undefined, "too short");
          }
          break;
        }
        case "unrecognized_keys": {
          if (value && typeof value === "object") {
            for (const k of (issue.keys as string[]) ?? []) delete (value as any)[k];
            repairs.push(`${at}: unknown keys removed`);
            changed = true;
          }
          break;
        }
        default: {
          if (dropItem(path, issue.message)) changed = true;
          else leaveOutOrDefault(path, undefined, issue.message);
        }
      }
    }

    // Drop list items last, highest index first, so earlier indexes stay valid; an item is dropped once
    // even when several problems point into it.
    const byList = new Map<unknown[], Map<number, string>>();
    for (const d of drops) {
      const items = byList.get(d.list) ?? new Map<number, string>();
      if (!items.has(d.index)) items.set(d.index, d.at);
      byList.set(d.list, items);
    }
    for (const [list, items] of byList) {
      for (const [index, at] of [...items].sort((a, b) => b[0] - a[0])) {
        if (index >= list.length) continue;
        list.splice(index, 1);
        repairs.push(`${at.replace(/ \(/, ": item dropped (")}`);
      }
    }
    if (drops.length) changed = true;

    const next = schema.safeParse(root);
    if (next.success) return { success: true, data: next.data, repairs: repairs.slice(0, MAX_REPAIRS_LISTED) };
    issues = next.error.issues as Issue[];
    if (!changed) break;
  }
  return { success: false, issues, repairs: repairs.slice(0, MAX_REPAIRS_LISTED) };
}

/** The validation problems in a few readable lines, for logs and for asking the model to correct itself. */
export function describeIssues(issues: Issue[], data: unknown, max = 20): string[] {
  return issues.slice(0, max).map((i) => {
    const value = getAt(data, i.path as Path);
    return `${pathText(i.path as Path)}: ${i.message}${value === undefined ? "" : ` (got ${show(value)})`}`;
  });
}
