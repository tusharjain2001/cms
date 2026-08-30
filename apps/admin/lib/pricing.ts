/**
 * The price, for everything the dashboard and the marketing pages say out loud.
 *
 * ⚠️ **THE PRICE IS CURRENTLY A TEMPORARY ₹1 TEST AMOUNT**, set so a real
 * payment can be put through end to end and confirmed as landing in the bank
 * account. The intended price is ₹999 a month and ₹9,990 a year.
 *
 * **To put the real price back, change the two numbers below and the matching
 * two in `packages/shared/src/plans.ts`** (`99_900` and `999_000` paise), then
 * re-run `npm run setup:razorpay` — Razorpay plan amounts are immutable, so a
 * new price means new plans; the old ones cannot be repriced.
 *
 * Everything that quotes a figure derives from here, so those four numbers are
 * the entire change. That is the point of this file: the price used to be
 * written out in about thirty places across marketing copy, dashboard buttons
 * and legal pages, and putting it back would have meant finding all of them.
 *
 * This mirrors `packages/shared/src/plans.ts` rather than importing it, for the
 * same reason `lib/dto.ts` re-exports types only: importing that package pulls
 * Zod into the browser bundle for validation the server already does. The two
 * must be changed together.
 */

export type BillingPeriod = "monthly" | "yearly";

/** Rupees per website, per billing period. */
export const PRICE_PER_WEBSITE: Record<BillingPeriod, number> = {
  monthly: 1, // ⚠️ temporary test price. Real price: 999
  yearly: 10, // ⚠️ temporary test price. Real price: 9990
};

/**
 * Indian digit grouping: 1 → "1", 1998 → "1,998", 99900 → "99,900".
 *
 * `en-IN` matters — rupees group as 1,00,000 rather than 100,000 past five
 * digits, and the wrong grouping reads as a foreign site.
 */
export const inr = (rupees: number): string =>
  `₹${rupees.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: Number.isInteger(rupees) ? 0 : 2,
  })}`;

/** What `websites` sites cost per cycle, as a number. Strictly linear. */
export const priceOf = (websites: number, period: BillingPeriod = "monthly"): number =>
  websites * PRICE_PER_WEBSITE[period];

/** What `websites` sites cost per cycle, formatted: "₹1", "₹1,998". */
export const price = (websites: number, period: BillingPeriod = "monthly"): string =>
  inr(priceOf(websites, period));

/** The headline figure — one website, per month. Used throughout the copy. */
export const ONE_MONTH = price(1, "monthly");

/** One website, per year. */
export const ONE_YEAR = price(1, "yearly");
