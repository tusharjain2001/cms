/**
 * The content wire-shapes this SDK exposes to a website.
 *
 * These mirror the same types in the CMS's internal `@pagecraft/shared`
 * package, and are owned here on purpose: the SDK is published to npm while
 * `@pagecraft/shared` is not, so a published package must not re-export types
 * from one an external install cannot resolve. Keep these in step with
 * `packages/shared/src/{fields,types}.ts` — they are the same HTTP shapes.
 */

export interface ImageValue {
  /** The storage object key. Identifies the asset for delete. */
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

export type PageStatus = "draft" | "published";

export interface SectionDTO {
  id: string;
  type: string;
  /** Client-entered nickname shown in the dashboard. Never rendered on the site. */
  name?: string;
  order: number;
  visible: boolean;
  content: SectionContent;
}
