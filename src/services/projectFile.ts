// Project backup file: the whole saved session as one .json the user keeps (export) and loads back (import).
// Pure functions, no browser APIs except where noted, so they can be checked in Node.

export const PROJECT_FILE_KIND = 'ai-product-factory-project';
export const PROJECT_FILE_VERSION = 1;
/** Refuse files larger than this on import (the app's own session is far smaller). */
export const MAX_PROJECT_FILE_BYTES = 50 * 1024 * 1024;

export interface ProjectFile<S> {
  kind: typeof PROJECT_FILE_KIND;
  version: number;
  exportedAt: string;
  state: S;
}

export function buildProjectFile<S>(state: S, now = new Date()): ProjectFile<S> {
  return { kind: PROJECT_FILE_KIND, version: PROJECT_FILE_VERSION, exportedAt: now.toISOString(), state };
}

export function projectFileName(productName: string, now = new Date()): string {
  const slug = (productName || 'project').trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'project';
  return `${slug}_${now.toISOString().slice(0, 10)}.json`;
}

export type ParseResult<S> = { ok: true; state: S; exportedAt: string } | { ok: false; error: string };

/** Reads a backup file's text. Accepts only this app's file; checks the parts a restored session relies on. */
export function parseProjectFile<S extends object>(text: string): ParseResult<S> {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, error: 'This file is not valid JSON.' }; }
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'This is not a project file.' };
  const f = raw as Record<string, unknown>;
  if (f.kind !== PROJECT_FILE_KIND) return { ok: false, error: 'This is not an AI Product Factory project file.' };
  if (typeof f.version !== 'number' || f.version > PROJECT_FILE_VERSION) {
    return { ok: false, error: 'This file was saved by a newer version of the app. Update the app and try again.' };
  }
  const s = f.state as Record<string, unknown> | null;
  if (!s || typeof s !== 'object' || Array.isArray(s)) return { ok: false, error: 'The project file has no saved project in it.' };
  for (const k of ['productName', 'businessUnit', 'description']) {
    if (s[k] !== undefined && typeof s[k] !== 'string') return { ok: false, error: `The project file is damaged (${k}).` };
  }
  if (s.materials !== undefined && !Array.isArray(s.materials)) return { ok: false, error: 'The project file is damaged (materials).' };
  for (const k of ['businessUnderstanding', 'productDefinition', 'engineeringPackage']) {
    const v = s[k];
    if (v !== undefined && v !== null && (typeof v !== 'object' || Array.isArray(v))) return { ok: false, error: `The project file is damaged (${k}).` };
  }
  if (s.referenceImage !== undefined && s.referenceImage !== null && typeof s.referenceImage !== 'string') {
    return { ok: false, error: 'The project file is damaged (referenceImage).' };
  }
  return { ok: true, state: s as S, exportedAt: typeof f.exportedAt === 'string' ? f.exportedAt : '' };
}
