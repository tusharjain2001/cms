import { z } from "zod";
import type { FieldDef, SectionContent } from "./fields.js";
import { getSectionType, type SectionTypeDef } from "./registry.js";

/**
 * Turns a section definition into a Zod schema, so the API can validate
 * whatever the dashboard sends without ever hard-coding a section's shape.
 */

const LINK_PATTERN = /^(https?:\/\/|\/|#|tel:|mailto:)/i;

/**
 * Drafts and published content are held to different standards.
 *
 * A section the client just added is empty by definition, and they save
 * constantly as they type — so `draft` checks shape, limits and lengths but
 * tolerates blank required fields. `publish` is the gate where "you still need
 * a headline" becomes an error, because that is the moment it goes live.
 */
export type ValidationMode = "draft" | "publish";

const imageSchema = z
  .object({
    publicId: z.string().min(1),
    url: z.string().url(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    alt: z.string().max(300).optional(),
  })
  .nullable();

const fileSchema = z
  .object({
    url: z.string().url(),
    name: z.string().min(1).max(200),
    bytes: z.number().int().nonnegative(),
  })
  .nullable();

function fieldSchema(field: FieldDef, mode: ValidationMode): z.ZodTypeAny {
  const enforceRequired = mode === "publish" && field.required;

  switch (field.kind) {
    case "text":
    case "para": {
      let s = z.string().max(
        field.max ?? 5000,
        `Keep this under ${field.max ?? 5000} characters.`
      );
      if (enforceRequired) s = s.min(1, `${field.label} cannot be empty.`);
      return s.default("");
    }

    case "link": {
      const s = z
        .string()
        .max(2000)
        .refine(
          (v) => v === "" || LINK_PATTERN.test(v),
          "That does not look like a web address. Try starting with https://, / or tel:"
        )
        .refine(
          (v) => !enforceRequired || v !== "",
          `${field.label} cannot be empty.`
        );
      return s.default("");
    }

    case "select": {
      const options = field.options;
      return z
        .string()
        .refine((v) => options.includes(v), `Choose one of: ${options.join(", ")}`)
        .default(options[0] ?? "");
    }

    case "toggle":
      return z.boolean().default(field.default ?? false);

    case "image":
      return imageSchema.default(null);

    case "file":
      return fileSchema.default(null);

    case "list": {
      const item = z.object(
        Object.fromEntries(field.of.map((child) => [child.key, fieldSchema(child, mode)]))
      );
      let arr = z.array(item);
      // A minimum is a publish-time rule for the same reason required is.
      if (field.min !== undefined && mode === "publish") {
        arr = arr.min(field.min, `Add at least ${field.min} ${field.itemNoun}.`);
      }
      if (field.max !== undefined) {
        arr = arr.max(
          field.max,
          `Maximum ${field.max} ${field.itemNoun}s reached. Delete one to add another.`
        );
      }
      return arr.default([]);
    }
  }
}

const schemaCache = new Map<string, z.ZodTypeAny>();

/** Zod schema for one section type's `content` object. Cached per type and mode. */
export function sectionSchema(def: SectionTypeDef, mode: ValidationMode = "draft"): z.ZodTypeAny {
  const key = `${def.type}:${mode}`;
  const cached = schemaCache.get(key);
  if (cached) return cached;
  const schema = z
    .object(Object.fromEntries(def.fields.map((f) => [f.key, fieldSchema(f, mode)])))
    .strip(); // silently drop keys the registry no longer defines
  schemaCache.set(key, schema);
  return schema;
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export type ValidationResult =
  | { ok: true; data: SectionContent }
  | { ok: false; issues: ValidationIssue[] };

/**
 * Validate a section's content against its registered type.
 * Unknown types are rejected — a client can never invent a section.
 */
export function validateSectionContent(
  type: string,
  content: unknown,
  mode: ValidationMode = "draft"
): ValidationResult {
  const def = getSectionType(type);
  if (!def) {
    return { ok: false, issues: [{ path: "type", message: `Unknown section type "${type}".` }] };
  }

  const parsed = sectionSchema(def, mode).safeParse(content ?? {});
  if (parsed.success) return { ok: true, data: parsed.data as SectionContent };

  return {
    ok: false,
    issues: parsed.error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    })),
  };
}

/** An empty, valid `content` object for a freshly added section. */
export function defaultContent(def: SectionTypeDef): SectionContent {
  const out: SectionContent = {};
  for (const field of def.fields) {
    switch (field.kind) {
      case "text":
      case "para":
      case "link":
        out[field.key] = "";
        break;
      case "select":
        out[field.key] = field.options[0] ?? "";
        break;
      case "toggle":
        out[field.key] = field.default ?? false;
        break;
      case "image":
      case "file":
        out[field.key] = null;
        break;
      case "list":
        out[field.key] = [];
        break;
    }
  }
  return out;
}
