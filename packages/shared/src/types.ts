import type { SectionContent } from "./fields.js";
import type { PlanId } from "./plans.js";

/**
 * Wire shapes shared by the API, the dashboard and the site SDK.
 * These are what actually travel over HTTP — Mongo documents are mapped to
 * them at the edge of the API so `_id` never leaks into client code.
 */

/**
 * A user's relationship to ONE website — not a global power level.
 *
 * `owner` is whoever created the website (normally the developer): they alone
 * can change its settings, API key and who else has access. `editor` is someone
 * they invited (normally the client): they edit and publish content, nothing
 * more. The same person can own one website and merely edit another, which is
 * why this never lives on the user record.
 */
export type ProjectRole = "owner" | "editor";
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
  /** This signed-in user's relationship to this website. */
  role: ProjectRole;
  /** Who owns it — shown to an editor so they know who to ask. */
  ownerName: string;
}

/**
 * A write-scoped API token for ONE website, handed to that site's developer so
 * their tools (or the Pagecraft MCP) can author content on exactly that site —
 * without ever having the owner's account login, and without touching any other
 * website. The full secret is shown once at creation; only this summary travels
 * afterwards.
 */
export interface ProjectTokenDTO {
  id: string;
  label: string;
  /** A short, non-secret prefix so a token is recognisable in a list. */
  prefix: string;
  createdAt: string;
  /** Null until the token is first used to make a request. */
  lastUsedAt?: string;
}

/** Everything the dashboard needs to draw a website's usage against its plan. */
export interface QuotaUsageDTO {
  plan: PlanId;
  planName: string;
  /** Account-level: websites this owner has, against the plan's ceiling. */
  projects: { used: number; limit: number };
  pages: { used: number; limit: number };
  storageBytes: { used: number; limit: number };
  apiCallsThisMonth: { used: number; limit: number };
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
  /**
   * Anyone can sign up, so an unverified account exists but cannot sign in.
   * The dashboard only ever sees this as `true`; it is here for completeness.
   */
  emailVerified: boolean;
  /** Reserved for whoever runs this CMS instance. Never granted by signing up. */
  isPlatformAdmin: boolean;
  projectIds: string[];
  /** The account's subscription plan, which sets its quotas. */
  plan: PlanId;
  /**
   * Whether this account has finished (or skipped) the first-sign-in tour.
   * Kept on the account rather than in the browser so the tour does not replay
   * on a second device, and so clearing site data does not restart it.
   */
  onboardingComplete: boolean;
}

/**
 * A machine-readable tag on the errors the dashboard must react to rather than
 * merely display. Matching on the English message would break the first time
 * anyone rewords it.
 */
export type ApiErrorCode = "email_not_verified" | "email_not_configured" | "quota_exceeded";

/** Every API response uses this envelope. */
export type ApiResponse<T> =
  | { success: true; data: T }
  | {
      success: false;
      error: string;
      code?: ApiErrorCode;
      issues?: { path: string; message: string }[];
    };
