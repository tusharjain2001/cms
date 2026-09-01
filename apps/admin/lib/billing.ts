import { api } from "./api";
import type { BillingPeriod, CheckoutDTO, PaymentDTO, SubscriptionDTO } from "./dto";

/**
 * Billing, from the browser's side.
 *
 * THE MODEL: one price per website per month (see `lib/pricing.ts`). Three
 * websites is quantity 3 of one subscription, not a third plan. There is **no
 * trial** — instead a new account gets one free website, capped at one page.
 *
 * Everything here is a thin wrapper over the API. Checkout is hosted by Dodo,
 * so paying is a whole-page navigation away and back — see `goToCheckout`.
 */

export const getSubscription = () => api<SubscriptionDTO>("/api/billing");

export interface StartResult {
  /** True when an existing subscription was amended — no checkout needed. */
  updated: boolean;
  subscription?: SubscriptionDTO | null;
  checkout?: CheckoutDTO;
}

/**
 * Buys, or changes, the number of websites this account covers.
 *
 * Returns `updated: true` when the account already had a live subscription and
 * the provider just changed its quantity — the customer is never sent back
 * through checkout to add a fourth website.
 */
export const startSubscription = (websites: number, period: BillingPeriod) =>
  api<StartResult>("/api/billing/subscription", {
    method: "POST",
    body: { websites, period },
  });

export const cancelSubscription = () =>
  api<SubscriptionDTO>("/api/billing/cancel", { method: "POST" });

/**
 * Every charge the provider actually took, newest first.
 *
 * Fetched separately from the subscription so a failure to load history never
 * blocks the screen that lets someone buy or cancel — the money matters more
 * than the receipt list.
 */
export const getPayments = () => api<PaymentDTO[]>("/api/billing/payments");

/**
 * A **minor-unit** amount from the API → the string a customer reads:
 * `money(799)` → "$7.99", `money(100, "INR")` → "₹1".
 *
 * The unit is in the name deliberately. `lib/pricing.ts` exports a `usd()`
 * that takes *dollars*, and two identically-named money formatters with
 * different units is precisely how a bill ends up a hundredfold wrong.
 * Everything the API sends is in minor units; everything in `lib/pricing.ts`
 * is in whole dollars.
 *
 * **Always pass the currency a stored amount was recorded in** — every
 * `PaymentDTO` carries its own. This product has already changed currency
 * once, and formatting an old row with today's would misstate what a customer
 * was actually billed. Only a price we are about to charge may take the
 * default.
 *
 * This mirrors `formatMoney` in `packages/shared/src/plans.ts` rather than
 * importing it, for the usual reason: that package pulls in Zod.
 */
const CURRENCIES: Record<string, { symbol: string; locale: string; fixedDecimals: boolean }> = {
  USD: { symbol: "$", locale: "en-US", fixedDecimals: true },
  INR: { symbol: "₹", locale: "en-IN", fixedDecimals: false },
};

export function money(minor: number, currency = "USD"): string {
  const c = CURRENCIES[currency] ?? CURRENCIES.USD;
  const major = minor / 100;
  const decimals = c.fixedDecimals || !Number.isInteger(major) ? 2 : 0;
  return `${c.symbol}${major.toLocaleString(c.locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

// ------------------------------------------------------------- checkout

/**
 * Sends the customer to Dodo's hosted payment page.
 *
 * **This is a whole-page navigation, not a modal**, and that is the biggest
 * user-visible change from the Razorpay integration it replaces. There is no
 * script to inject, no global to wait for, and no ad blocker to work around —
 * but also no callback: the customer leaves the app entirely and comes back to
 * `/billing?checkout=done` when they are finished.
 *
 * The consequence the billing screen has to handle: **returning proves
 * nothing**. That URL is a plain redirect anyone can visit, so access is
 * granted only when Dodo's webhook reaches the API, a second or two later. The
 * return handler waits for that rather than trusting the redirect.
 *
 * Never render `checkoutUrl` in an iframe — card pages set frame-ancestors and
 * will refuse to load.
 */
export function goToCheckout(checkout: CheckoutDTO): void {
  window.location.assign(checkout.checkoutUrl);
}
