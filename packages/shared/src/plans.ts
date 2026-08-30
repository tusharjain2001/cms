/**
 * Subscription plans and the per-tenant quotas they carry.
 *
 * THE MODEL (decided 30 Aug 2026, replacing the old free/pro/business tiers):
 * **you pay per website.** Two websites cost twice one, three cost three times
 * — a plain ladder, not a set of feature tiers. Everything the product can do
 * is on every paid account; the only thing money buys is how many websites you
 * may own.
 *
 * ⚠️ The price is currently set to a **temporary ₹1 test amount** so a real
 * payment can be put through end to end. The intended price is ₹999/month. See
 * the constants below.
 *
 * **The price is strictly linear, and it has to be.** Razorpay bills a
 * subscription as `plan amount × quantity`, so a ladder that bent — charging
 * ₹1,999 for two when one is ₹999 — could not be one plan bought twice. It would need a
 * separate plan per rung, and because Razorpay cannot swap the plan on a live
 * subscription, every change to a customer's website count would mean
 * cancelling and re-authorising their mandate. Nobody should re-enter their
 * card over ₹1.
 *
 * Two consequences that the rest of the codebase leans on:
 *
 *   1. **There is no free trial.** A brand-new account has an entitlement of
 *      **zero** websites and cannot create one until a subscription is active.
 *      Signing up, confirming an email and looking around are free; building
 *      is not. Do not re-add a trial clock — it was removed deliberately.
 *   2. **`maxProjects` is not a property of the plan.** It is the quantity the
 *      customer bought, which is why the ceiling comes from
 *      `websiteAllowance()` and never from a constant. A Razorpay subscription
 *      carries that number as its `quantity`.
 *
 * Per-website limits (pages, storage, API calls) are the *same on every paid
 * account*, because the price already scales with website count — charging
 * twice for the same growth would be dishonest.
 *
 * Free keeps modest per-website limits rather than zero on purpose: accounts
 * that owned a website before this model existed must keep being able to read
 * and edit it. What free cannot do is create *another* one.
 */

export type PlanId = "free" | "starter";

export type BillingPeriod = "monthly" | "yearly";

/**
 * Razorpay's own subscription states, mirrored so the API never has to invent
 * a parallel vocabulary. `none` is ours: an account that never subscribed.
 */
export type SubscriptionStatus =
  | "none"
  | "created"
  | "authenticated"
  | "active"
  | "pending"
  | "halted"
  | "paused"
  | "cancelled"
  | "completed"
  | "expired";

export interface Plan {
  id: PlanId;
  name: string;
  /** Pages per website. */
  maxPagesPerProject: number;
  /** Total media bytes stored per website. */
  maxStorageBytesPerProject: number;
  /** Content-API requests per website per calendar month. */
  maxApiCallsPerMonth: number;
}

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;

export const PLANS: Record<PlanId, Plan> = {
  /**
   * Not a trial and not an offer — the state of an account that has not paid.
   * The numbers here only ever govern a website that predates per-website
   * pricing; a free account cannot create a new one at all.
   */
  free: {
    id: "free",
    name: "Free",
    maxPagesPerProject: 10,
    maxStorageBytesPerProject: 500 * MB,
    maxApiCallsPerMonth: 50_000,
  },
  starter: {
    id: "starter",
    name: "Starter",
    maxPagesPerProject: 200,
    maxStorageBytesPerProject: 10 * GB,
    maxApiCallsPerMonth: 1_000_000,
  },
};

export const DEFAULT_PLAN: PlanId = "free";

/** The paid plan. There is exactly one — the ladder is its quantity. */
export const PAID_PLAN: PlanId = "starter";

// ---------------------------------------------------------------- the ladder

/**
 * Billed in **INR**, Razorpay's home currency — which is also why recurring
 * mandates work at all here. USD was considered and dropped: Razorpay's
 * auto-debit machinery (UPI AutoPay, e-NACH, card mandates under the RBI
 * e-mandate framework) is built for Indian rails, and USD recurring is not
 * something a standard account can rely on.
 *
 * Amounts are held in **paise** because that is what Razorpay's API takes, and
 * because a price should never be a float.
 */
export const CURRENCY = "INR" as const;

/**
 * ⚠️ **TEMPORARY TEST PRICE — ₹1, not ₹999.**
 *
 * Set deliberately low so a real payment can be made end to end to confirm the
 * money actually reaches the bank account. The intended price is ₹999 a month
 * and ₹9,990 a year; restore `99_900` and `999_000` here, mirror them in
 * `apps/admin/lib/pricing.ts`, and re-run `npm run setup:razorpay` to create
 * Razorpay plans at the real amounts.
 *
 * Razorpay plan amounts are immutable, so changing these means creating new
 * plans — the old ones cannot be repriced.
 */
export const PRICE_PER_WEBSITE_MONTHLY_PAISE = 100;

/** ⚠️ Temporary test price — ₹10, not ₹9,990. See above. */
export const PRICE_PER_WEBSITE_YEARLY_PAISE = 1_000;

export const MIN_WEBSITES = 1;

/**
 * The ceiling on one subscription. Not a technical limit — it is the point
 * past which someone should be talking to a human about a deal, and it stops a
 * mistyped quantity from raising a ₹20,000-a-month mandate.
 */
export const MAX_WEBSITES = 20;

export const pricePerWebsitePaise = (period: BillingPeriod): number =>
  period === "yearly" ? PRICE_PER_WEBSITE_YEARLY_PAISE : PRICE_PER_WEBSITE_MONTHLY_PAISE;

/** What a subscription for `websites` sites costs per billing cycle, in paise. */
export const pricePaise = (websites: number, period: BillingPeriod): number =>
  clampWebsites(websites) * pricePerWebsitePaise(period);

/**
 * Paise → a rupee figure with Indian digit grouping and no stray decimals:
 * 99_900 → "999", 199_800 → "1,998", 999_000 → "9,990".
 *
 * `en-IN` matters — rupees group as 1,00,000 rather than 100,000 past five
 * digits, and a price written the wrong way reads as a foreign site.
 */
export const formatInr = (paise: number): string => {
  const rupees = paise / 100;
  return rupees.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: Number.isInteger(rupees) ? 0 : 2,
  });
};

/** Keeps a requested quantity inside the ladder, rejecting nonsense outright. */
export const clampWebsites = (n: number): number =>
  Math.min(MAX_WEBSITES, Math.max(MIN_WEBSITES, Math.floor(Number.isFinite(n) ? n : MIN_WEBSITES)));

// ----------------------------------------------------------- entitlement

/**
 * The statuses that actually buy access.
 *
 * `pending` is included on purpose: Razorpay puts a subscription there while it
 * retries a failed charge, and locking a paying customer out of their own live
 * website over one bounced card is the wrong trade. `halted` — retries
 * exhausted — is where access stops.
 */
const ENTITLING: readonly SubscriptionStatus[] = ["authenticated", "active", "pending"];

export const isEntitled = (status: SubscriptionStatus | null | undefined): boolean =>
  Boolean(status && ENTITLING.includes(status));

export interface Entitlement {
  plan: PlanId;
  status: SubscriptionStatus;
  /** The quantity the subscription was bought with. */
  websites: number;
}

/**
 * **The single source of truth for "may this account own another website?"**
 *
 * Zero unless a subscription is live. Every quota check and every piece of UI
 * that offers to add a website goes through this, so there is exactly one
 * place where a free account could ever be handed a website by mistake.
 */
export function websiteAllowance(e: Entitlement | null | undefined): number {
  if (!e || e.plan === "free" || !isEntitled(e.status)) return 0;
  return clampWebsites(e.websites);
}

export const isPlanId = (v: unknown): v is PlanId =>
  typeof v === "string" && Object.prototype.hasOwnProperty.call(PLANS, v);

export const isBillingPeriod = (v: unknown): v is BillingPeriod =>
  v === "monthly" || v === "yearly";

/** The plan for an id, falling back to Free for anything unknown/missing. */
export const planFor = (id: string | null | undefined): Plan =>
  PLANS[isPlanId(id) ? id : DEFAULT_PLAN];
