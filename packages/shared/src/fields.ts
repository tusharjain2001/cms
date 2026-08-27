/**
 * Field primitives.
 *
 * These eight kinds are the entire vocabulary of the CMS. Every section type —
 * however elaborate its design — is described as a tree of these, which is why
 * adding a section type never requires new code in the API or the dashboard.
 *
 * `list` is the one that carries the weight: it is how a client decides how
 * many buttons, features, products or bullets a section has, inside limits the
 * developer sets so the design can never break.
 */

export type FieldKind =
  | "text"
  | "para"
  | "image"
  | "file"
  | "link"
  | "select"
  | "toggle"
  | "list";

interface Common {
  /** Key this field is stored under in the section's `content` object. */
  key: string;
  /** Plain-English label shown to the client. Never jargon. */
  label: string;
  help?: string;
  required?: boolean;
}

export interface TextDef extends Common {
  kind: "text";
  max?: number;
  placeholder?: string;
}

export interface ParaDef extends Common {
  kind: "para";
  max?: number;
  placeholder?: string;
}

export interface ImageDef extends Common {
  kind: "image";
}

export interface FileDef extends Common {
  kind: "file";
  /** Extensions the client may upload, e.g. [".pdf"]. */
  accept?: string[];
}

export interface LinkDef extends Common {
  kind: "link";
  placeholder?: string;
}

export interface SelectDef extends Common {
  kind: "select";
  options: string[];
}

export interface ToggleDef extends Common {
  kind: "toggle";
  default?: boolean;
}

export interface ListDef extends Common {
  kind: "list";
  /** Singular noun for the add button: "+ Add button", "+ Add feature". */
  itemNoun: string;
  min?: number;
  /** Hard cap, chosen to match what the design can physically fit. */
  max?: number;
  of: FieldDef[];
  /** Which child field titles the collapsed row. Defaults to the first text field. */
  labelKey?: string;
}

export type FieldDef =
  | TextDef
  | ParaDef
  | ImageDef
  | FileDef
  | LinkDef
  | SelectDef
  | ToggleDef
  | ListDef;

/* ------------------------------------------------------------- value shapes */

export interface ImageValue {
  /** Cloudinary public id, so transforms can be applied at render time. */
  publicId: string;
  url: string;
  width: number;
  height: number;
  alt?: string;
}

export interface FileValue {
  url: string;
  name: string;
  bytes: number;
}

export type FieldValue =
  | string
  | boolean
  | ImageValue
  | FileValue
  | null
  | Array<Record<string, FieldValue>>;

export type SectionContent = Record<string, FieldValue>;

/* ------------------------------------------------------------- constructors */

export const text = (key: string, label: string, opts: Omit<TextDef, "kind" | "key" | "label"> = {}): TextDef =>
  ({ kind: "text", key, label, ...opts });

export const para = (key: string, label: string, opts: Omit<ParaDef, "kind" | "key" | "label"> = {}): ParaDef =>
  ({ kind: "para", key, label, ...opts });

export const image = (key: string, label: string, opts: Omit<ImageDef, "kind" | "key" | "label"> = {}): ImageDef =>
  ({ kind: "image", key, label, ...opts });

export const file = (key: string, label: string, opts: Omit<FileDef, "kind" | "key" | "label"> = {}): FileDef =>
  ({ kind: "file", key, label, ...opts });

export const link = (key: string, label: string, opts: Omit<LinkDef, "kind" | "key" | "label"> = {}): LinkDef =>
  ({ kind: "link", key, label, ...opts });

export const select = (key: string, label: string, options: string[], opts: Omit<SelectDef, "kind" | "key" | "label" | "options"> = {}): SelectDef =>
  ({ kind: "select", key, label, options, ...opts });

export const toggle = (key: string, label: string, opts: Omit<ToggleDef, "kind" | "key" | "label"> = {}): ToggleDef =>
  ({ kind: "toggle", key, label, ...opts });

export const list = (
  key: string,
  label: string,
  of: FieldDef[],
  opts: Omit<ListDef, "kind" | "key" | "label" | "of" | "itemNoun"> & { itemNoun: string }
): ListDef => ({ kind: "list", key, label, of, ...opts });
