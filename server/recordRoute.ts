import type { Request, Response } from "express";
import { z } from "zod";
import { validateRecord } from "../src/services/validationEngine";
import { normalizeDefinitionConstraints } from "./constraints";
import type { DataEntityDefinition, ProductDefinition } from "../src/types";

/**
 * POST /api/validate-record - generic, stateless record validation.
 *
 * The caller sends an entity definition (from any generated product) and a
 * record; the shared validation engine returns the issues. The entity comes
 * from the client, so its constraints are sanitised before use (unsafe
 * patterns are dropped). Rules that need storage (uniqueness, capacity,
 * references) are not checked here; they are documented in the engineering
 * package for the real backend.
 */

const MAX_BODY_CHARS = 1_000_000;

const FieldIn = z
  .object({
    name: z.string().min(1).max(100),
    type: z.string().max(100).default("string"),
    required: z.boolean().default(false),
    notes: z.string().max(500).optional(),
    constraints: z.record(z.string(), z.unknown()).optional(),
    origin: z.enum(["BU", "INFERRED", "SYSTEM"]).optional(),
    source: z.enum(["user", "system", "derived"]).optional(),
  })
  .passthrough();

const EntityIn = z
  .object({
    id: z.string().max(100).default(""),
    name: z.string().min(1).max(100),
    description: z.string().max(1000).default(""),
    fields: z.array(FieldIn).min(1).max(200),
    lifecycle: z.record(z.string(), z.unknown()).optional(),
    rules: z.array(z.record(z.string(), z.unknown())).max(100).optional(),
    crossRecordRules: z.array(z.string().max(300)).max(50).optional(),
    relationships: z.array(z.string()).default([]),
    confidence: z.enum(["CONFIRMED", "INFERRED", "AMBIGUOUS", "MISSING"]).default("INFERRED"),
    evidence: z.array(z.string()).default([]),
  })
  .passthrough();

const BodyIn = z.object({
  entity: EntityIn,
  record: z.record(z.string(), z.unknown()),
  mode: z.enum(["create", "update"]).default("create"),
  existing: z.record(z.string(), z.unknown()).optional(),
});

export function validateRecordHandler(req: Request, res: Response) {
  try {
    if (JSON.stringify(req.body ?? {}).length > MAX_BODY_CHARS) {
      return res.status(413).json({ error: "Request body is too large." });
    }
    const parsed = BodyIn.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid request.",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    const { entity, record, mode, existing } = parsed.data;
    if (Object.keys(record).length > 300) {
      return res.status(400).json({ error: "Record has too many fields." });
    }

    // Untrusted constraints: sanitise (drops unsafe patterns) before the engine runs.
    const shell = { dataEntities: [entity as unknown as DataEntityDefinition] } as ProductDefinition;
    const safeEntity = normalizeDefinitionConstraints(shell).definition.dataEntities[0];

    const issues = validateRecord(safeEntity, record, mode, { existing });
    const valid = issues.length === 0;
    return res.status(valid ? 200 : 422).json({ valid, issues });
  } catch (err: any) {
    console.error("Error validating record:", err);
    return res.status(500).json({ error: err?.message || "Failed to validate record" });
  }
}
