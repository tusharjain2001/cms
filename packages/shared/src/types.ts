import type { SectionContent } from "./fields.js";
import type { BillingPeriod, Currency, PlanId, SubscriptionStatus } from "./plans.js";

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

/**
 * What a page tells a search engine and a social network about itself.
 *
 * Every field is optional and every one has a sensible fallback, because a
 * client who never opens the SEO panel must still end up with a page that
 * indexes correctly: `metaTitle` falls back to the page title, `ogImage` to
 * whatever the site chooses, `canonicalUrl` to the page's own address. The
 * panel exists to let someone *improve* on those defaults, never to make a
 * page depend on being filled in.
 *
 * `noIndex` is the one field that changes behaviour rather than wording, which
 * is why it is stored rather than inferred: a thank-you page or a private
 * price list has to be publishable and unfindable at the same time.
 */
export interface SeoDTO {
  /** Overrides the page title in the <title> tag and in search results. */
  metaTitle?: string;
  /** The snippet under the result. Not a ranking factor; entirely a click factor. */
  metaDescription?: string;
  /** Absolute URL of the sharing card image (1200x630 reads best). */
  ogImage?: string;
  /**
   * The address this page should be credited as, when the same content is
   * reachable at more than one URL. Blank means "this page's own address",
   * which is right almost always.
   */
  canonicalUrl?: string;
  /**
   * Keep this page out of search results. It still publishes and still serves
   * — it is `noindex`, not unpublished.
   */
  noIndex?: boolean;
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
  /**
   * Carried on the summary so the pages list can flag a page whose search
   * listing is still empty, without fetching every page in full.
   */
  seo: SeoDTO;
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
   * How many websites this account may own right now — zero until a
   * subscription is live; without one it is the free allowance. The dashboard gates
   * "Add website" on this rather than on the plan name, so the ladder (₹999 per
   * website) needs no client-side arithmetic.
   */
  websiteAllowance: number;
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
export type ApiErrorCode =
  | "email_not_verified"
  | "email_not_configured"
  | "quota_exceeded"
  /** No live subscription, so this account may not own a website yet. */
  | "subscription_required"
  /** The server has no payment-provider credentials, so nobody can check out. */
  | "billing_not_configured";

/** Every API response uses this envelope. */
export type ApiResponse<T> =
  | { success: true; data: T }
  | {
      success: false;
      error: string;
      code?: ApiErrorCode;
      issues?: { path: string; message: string }[];
    };

// ------------------------------------------------------------------ billing

/**
 * The account's subscription, as the dashboard needs to see it.
 *
 * `websites` is the ceiling that was *paid for*; `websitesUsed` is how many
 * exist. The difference is what the "Add website" button is allowed to do —
 * see `websiteAllowance()` in `plans.ts`, which is the only place that decides.
 */
export interface SubscriptionDTO {
  plan: PlanId;
  planName: string;
  status: SubscriptionStatus;
  /** Websites this account may own right now. Zero until a subscription is live. */
  /**
   * Websites this account **pays for** — 0 on the free plan. This is the field
   * that says whether there is a subscription at all; do not put the allowance
   * here (see `paidWebsites` vs `websiteAllowance`).
   */
  websites: number;
  /**
   * Websites this account **may own**, free one included. What the "x of y"
   * counter shows, and always at least `FREE_WEBSITES`.
   */
  websitesAllowed: number;
  websitesUsed: number;
  period: BillingPeriod;
  /** ISO date the current cycle ends, or null when there is no subscription. */
  currentPeriodEnd: string | null;
  /** True once cancellation is scheduled — access lasts until the period ends. */
  cancelAtPeriodEnd: boolean;
  /**
   * Price per website in the currency's minor unit, so the dashboard never
   * hard-codes the ladder. Pair it with `currency` to render it — see
   * `formatMoney`.
   */
  pricePerWebsiteMinor: { monthly: number; yearly: number };
  currency: Currency;
  minWebsites: number;
  maxWebsites: number;
  /**
   * False when the server has no payment-provider credentials. The dashboard shows a
   * plain explanation instead of a checkout button that cannot work — the same
   * courtesy R2 and SMTP already get.
   */
  billingEnabled: boolean;
  /** The provider's hosted management page for this subscription, when it has one. */
  manageUrl?: string | null;
}

/**
 * One charge the provider actually took — the account's billing history.
 *
 * The amount is stored per row rather than derived from today's price list,
 * because prices change and a charge must always explain itself.
 */
export interface PaymentDTO {
  id: string;
  /** The provider's payment id — what support asks for to find or refund a charge. */
  providerPaymentId: string;
  /**
   * The charge, in the minor unit of **this row's** `currency` — not today's.
   * A history that spans a currency change (this one spans INR → USD) is only
   * honest if each row is formatted with the currency it was taken in.
   */
  amountMinor: number;
  currency: string;
  /** The provider's own state: succeeded, failed, refunded. */
  status: string;
  /** "card", "upi" — the method label, never the card itself. */
  method: string | null;
  /** Websites this charge covered, so an old row explains its own amount. */
  websites: number | null;
  period: string | null;
  paidAt: string;
}

/**
 * Where to send the customer to pay.
 *
 * Dodo hosts the payment page, so unlike the Razorpay modal this replaced there
 * are no keys or ids for the browser to assemble a widget from — just a URL to
 * navigate to. The consequence is that **nothing is granted in the browser**:
 * the webhook is the only thing that grants access, so the page the customer
 * returns to has to tolerate "paid, but not confirmed yet".
 */
export interface CheckoutDTO {
  /** Dodo's checkout session id, useful only for support and logs. */
  sessionId: string;
  /** Navigate here. Do not render it in an iframe — card pages refuse to load. */
  checkoutUrl: string;
  websites: number;
  period: BillingPeriod;
  amountMinor: number;
  currency: Currency;
}
