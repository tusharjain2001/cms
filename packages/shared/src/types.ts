import type { SectionContent } from "./fields.js";

/**
 * Wire shapes shared by the API, the dashboard and the site SDK.
 * These are what actually travel over HTTP — Mongo documents are mapped to
 * them at the edge of the API so `_id` never leaks into client code.
 */

export type Role = "admin" | "client";
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

export interface SeoDTO {
  metaTitle?: string;
  metaDescription?: string;
  ogImage?: string;
}

export interface PageDTO {
  id: string;
  slug: string;
  title: string;
  order: number;
  status: PageStatus;
  seo: SeoDTO;
  sections: SectionDTO[];
  /** Only present on dashboard responses, never on the public content API. */
  draftSections?: SectionDTO[];
  hasDraftChanges?: boolean;
  updatedAt: string;
  publishedAt?: string;
}

/** Lightweight row used for page lists and site navigation. */
export interface PageSummaryDTO {
  id: string;
  slug: string;
  title: string;
  order: number;
  status: PageStatus;
  hasDraftChanges: boolean;
  updatedAt: string;
}

export interface ProjectDTO {
  id: string;
  name: string;
  slug: string;
  domain: string;
  apiKey: string;
  revalidateUrl?: string;
  hasRevalidateSecret: boolean;
  allowedSectionTypes: string[];
  createdAt: string;
}

/** One file in a project's media library. */
export interface MediaDTO {
  id: string;
  publicId: string;
  url: string;
  resourceType: "image" | "raw";
  format: string;
  width: number;
  height: number;
  bytes: number;
  originalName: string;
  alt: string;
  createdAt: string;
}

export interface UserDTO {
  id: string;
  email: string;
  name: string;
  role: Role;
  projectIds: string[];
}

/** Every API response uses this envelope. */
export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; issues?: { path: string; message: string }[] };
