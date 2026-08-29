/**
 * Wire types, re-exported from the shared package so components have one short
 * import path — and so the dashboard can never drift from what the API sends.
 *
 * These are all TYPE-only re-exports: nothing from `@pagecraft/shared` ends up
 * in the browser bundle (which matters, because that package pulls in Zod for
 * server-side validation the dashboard does not need).
 */
export type {
  FieldDef,
  FieldKind,
  FileValue,
  ImageValue,
  ListDef,
  MediaDTO,
  PageDTO,
  PageStatus,
  PageSummaryDTO,
  ProjectDTO,
  SectionContent,
  SectionDTO,
  SectionTypeDef,
  UserDTO,
  WireKind,
} from "@pagecraft/shared";

import type { FieldDef, SectionContent, SectionTypeDef } from "@pagecraft/shared";

/**
 * A blank row for a list field, built from the field definitions so the
 * dashboard does not have to bundle Zod just to add an empty row. The API
 * re-validates whatever we send anyway.
 */
export function blankListItem(fields: FieldDef[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
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

/** The label shown on a collapsed list row, e.g. the button's own text. */
export function listItemLabel(
  def: { of: FieldDef[]; labelKey?: string; itemNoun: string },
  item: Record<string, unknown>
): string {
  const key =
    def.labelKey ?? def.of.find((f) => f.kind === "text" || f.kind === "para")?.key;
  const value = key ? item[key] : undefined;
  if (typeof value === "string" && value.trim()) return value;
  return `Untitled ${def.itemNoun}`;
}

/**
 * One line of plain English summarising a section for its card in the list —
 * the client's own words where possible, otherwise a count.
 */
export function sectionPreview(def: SectionTypeDef | undefined, content: SectionContent): string {
  if (!def) return "";

  for (const field of def.fields) {
    if (field.kind === "text" || field.kind === "para") {
      const value = content[field.key];
      if (typeof value === "string" && value.trim()) return value;
    }
  }

  for (const field of def.fields) {
    if (field.kind === "list") {
      const value = content[field.key];
      if (Array.isArray(value) && value.length > 0) {
        return `${value.length} ${field.itemNoun}${value.length === 1 ? "" : "s"}`;
      }
    }
  }

  return "Nothing filled in yet";
}
