/**
 * Subscription plans and the per-tenant quotas they carry.
 *
 * THE MODEL (decided 30 Aug 2026, replacing the old free/pro/business tiers):
 * **you pay per website.** Two websites cost twice one, three cost three times
 * — a plain ladder, not a set of feature tiers. Everything the product can do
 * is on every paid account; the only thing money buys is how many websites you
 * may own.
 *
 * The price is ₹999 per website per month, or ₹9,990 a year — twelve months
 * for the price of ten. See the constants below.
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
 *   1. **There is one free website, and it holds one page** (`FREE_WEBSITES`
 *      and `PLANS.free.maxPagesPerProject`). Decided 31 Aug 2026, reversing
 *      the earlier "no free trial" rule. It is **not a trial**: no clock runs
 *      and nothing expires. Do not re-add a trial clock — an expiring free
 *      tier was removed deliberately and this is not its return.
 *
 *      The cap is on **pages, not time**, because that is the limit a
 *      single-page site actually runs into on the day it needs a second page,
 *      rather than on an arbitrary Tuesday. It also means the free page can be
 *      a real published page on a real domain, which is the advertisement.
 *   2. **`maxProjects` is not a property of the plan.** It is the quantity the
 *      customer bought, which is why the ceiling comes from
 *      `websiteAllowance()` and never from a constant. A Razorpay subscription
 *      carries that number as its `quantity`.
 *
 * Per-website limits (storage, API calls) are the *same on every paid
 * account*, because the price already scales with website count — charging
 * twice for the same growth would be dishonest. Pages are the exception, and
 * the only thing free is short of.
 *
 * Free keeps generous storage and API limits rather than token ones on
 * purpose, and for two reasons: accounts that owned a website before
 * per-website pricing must keep working, and throttling a free page's traffic
 * breaks it in front of visitors instead of prompting an upgrade.
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
   * **The free website.** Every confirmed account gets exactly one, and that
   * one website may hold exactly **one page**. That single page is the whole
   * shape of the free tier: enough to build something real, publish it and
   * point a domain at it — not enough to run a site with a nav.
   *
   * The page cap is what makes the free website an invitation rather than a
   * product. It is deliberately a hard `1`, not "a few": two pages is a
   * website, and a free website nobody outgrows is a free product.
   *
   * Storage and API calls stay generous, because throttling those would break
   * a live page rather than prompt an upgrade — and a broken free page is a
   * worse advertisement than no free page.
   */
  free: {
    id: "free",
    name: "Free",
    maxPagesPerProject: 1,
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
 * Billed in **USD** (changed 31 Aug 2026, reversing an earlier INR decision).
 *
 * ⚠️ **This is the risky half of the pricing model, and the risk is Razorpay's,
 * not ours.** Razorpay's recurring machinery — UPI AutoPay, e-NACH, and card
 * mandates under the RBI e-mandate framework — is built for Indian rails, and
 * Subscriptions have historically been INR-only even on accounts that can take
 * one-off international payments. If Razorpay refuses a USD plan, it refuses it
 * at `npm run setup:razorpay`, loudly and with its own wording (we surface
 * provider errors verbatim for exactly this reason). Nothing downstream needs
 * changing to try it, and nothing downstream is currency-specific any more.
 *
 * Two consequences that follow from USD regardless of whether it works:
 *
 *   - **The zero-MDR rails are gone.** UPI and RuPay cost nothing to accept;
 *     international card payments cost noticeably more, and settle after
 *     conversion into an INR bank account.
 *   - **Stored money carries its own currency.** Every charge is recorded with
 *     the currency Razorpay took it in and is formatted with that, never with
 *     today's `CURRENCY` — otherwise a ₹999 row would read as "$9.99" the day
 *     the price list changes. Nothing needs migrating right now (the INR rows
 *     were a live-key test and were deleted), which is exactly the cheapest
 *     moment for the rule to already be true.
 *
 * Amounts are held in the currency's **minor unit** (cents here, paise before)
 * because that is what Razorpay's API takes, and because a price should never
 * be a float.
 */
export const CURRENCY: Currency = "USD";

/**
 * The price of one website, per month, in cents: $7.99.
 *
 * Razorpay plan amounts are **immutable**, so changing this number means
 * creating new plans — the old ones cannot be repriced. Change it here, mirror
 * it in `apps/admin/lib/pricing.ts` (which quotes in whole dollars), then
 * re-run `npm run setup:razorpay` and put the new plan ids in `.env`. Those are
 * the only four numbers; everything the product quotes derives from them.
 */
export const PRICE_PER_WEBSITE_MONTHLY_CENTS = 799;

/** One website for a year: $79.90 — twelve months for the price of ten. */
export const PRICE_PER_WEBSITE_YEARLY_CENTS = 7_990;

/**
 * **What a brand-new account gets for nothing: one website.**
 *
 * Changed 31 Aug 2026, reversing "there is no free trial". It is not a trial —
 * nothing expires and no clock runs — it is a permanently free single-page
 * website. The limit that makes it work is `PLANS.free.maxPagesPerProject`,
 * which is 1: you can publish a real page, you cannot build a real site.
 *
 * Set this to 0 to go back to paying for the first website. It is a constant
 * rather than a literal precisely so that reversal is one edit.
 */
export const FREE_WEBSITES = 1;

export const MIN_WEBSITES = 1;

/**
 * The ceiling on one subscription. Not a technical limit — it is the point
 * past which someone should be talking to a human about a deal, and it stops a
 * mistyped quantity from raising a ₹20,000-a-month mandate.
 */
export const MAX_WEBSITES = 20;

export const pricePerWebsiteMinor = (period: BillingPeriod): number =>
  period === "yearly" ? PRICE_PER_WEBSITE_YEARLY_CENTS : PRICE_PER_WEBSITE_MONTHLY_CENTS;

/**
 * What a subscription for `websites` sites costs per billing cycle, in the
 * currency's minor unit. Strictly linear: two websites cost exactly twice one.
 */
export const priceMinor = (websites: number, period: BillingPeriod): number =>
  clampWebsites(websites) * pricePerWebsiteMinor(period);

/** Currencies this product knows how to write down. */
export type Currency = "USD" | "INR";

/**
 * How each currency is written. Kept as data rather than branches so adding
 * one is a row, and so nothing anywhere else has to know a symbol.
 *
 * `fixedDecimals` is the whole reason this is not one `toLocaleString` call:
 * $79.90 must keep its trailing zero or it reads as $79.9, while ₹999 must not
 * grow ".00". And `en-IN` grouping matters for rupees — they group as
 * ₹1,00,000 rather than ₹100,000 past five digits.
 */
const CURRENCIES: Record<Currency, { symbol: string; locale: string; fixedDecimals: boolean }> = {
  USD: { symbol: "$", locale: "en-US", fixedDecimals: true },
  INR: { symbol: "₹", locale: "en-IN", fixedDecimals: false },
};

const isCurrency = (v: unknown): v is Currency =>
  typeof v === "string" && Object.prototype.hasOwnProperty.call(CURRENCIES, v);

/**
 * A stored minor-unit amount → the string a customer reads, symbol included:
 * `formatMoney(799)` → "$7.99", `formatMoney(100, "INR")` → "₹1".
 *
 * **Always pass the currency the amount was recorded in.** Defaulting to
 * today's `CURRENCY` is correct for a price we are about to charge and wrong
 * for anything already charged: the ₹1 settlement test is a real row in
 * `payments`, and rendering it with a dollar sign would be a hundredfold lie
 * about what a customer was billed.
 *
 * The symbol lives here rather than at each call site, because a stray
 * hard-coded "₹" in front of a USD amount is exactly the bug this is meant to
 * make impossible.
 */
export const formatMoney = (minor: number, currency: string = CURRENCY): string => {
  const c = CURRENCIES[isCurrency(currency) ? currency : CURRENCY];
  const major = minor / 100;
  const decimals = c.fixedDecimals || !Number.isInteger(major) ? 2 : 0;
  return `${c.symbol}${major.toLocaleString(c.locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
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
 * `FREE_WEBSITES` unless a subscription is live, and the paid quantity when
 * one is. Every quota check and every piece of UI that offers to add a website
 * goes through this, so there is exactly one place where the ceiling is
 * decided.
 *
 * The free website is **subsumed, not added**: someone paying for one website
 * gets one, not two. What their ₹999 buys is not a second site but the
 * removal of the one-page cap — see `PLANS.free`.
 */
export function websiteAllowance(e: Entitlement | null | undefined): number {
  if (!e || e.plan === "free" || !isEntitled(e.status)) return FREE_WEBSITES;
  return clampWebsites(e.websites);
}

/**
 * How many websites this account has actually **paid for** — 0 when nothing is
 * live. Deliberately not the same number as `websiteAllowance`.
 *
 * The two were identical until the free website existed, and collapsing them
 * back is a real bug rather than a tidy-up: the billing screen decides whether
 * someone already has a plan by asking whether this is above zero, so an
 * allowance here makes a free account look subscribed and refuses to sell it
 * the first website. Allowance answers "how many may I own?"; this answers
 * "how many am I paying for?", and only the second one is about money.
 */
export function paidWebsites(e: Entitlement | null | undefined): number {
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
