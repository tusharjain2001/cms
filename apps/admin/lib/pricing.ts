/**
 * The price, for everything the dashboard and the marketing pages say out loud.
 *
 * $7.99 per website per month, or $79.90 a year — twelve months for the price
 * of ten. Strictly linear: two websites cost exactly twice one.
 *
 * **To change the price, change the two numbers below and the matching two in
 * `packages/shared/src/plans.ts`** (`799` and `7_990` cents), then update the
 * two products in the Dodo Payments dashboard to match and run
 * `npm run verify:billing`, which asks Dodo whether they agree. The API refuses
 * checkout while they disagree, so a half-done reprice fails safe rather than
 * charging the wrong amount.
 *
 * Everything that quotes a figure derives from here, so those four numbers are
 * the entire change. That is the point of this file: the price used to be
 * written out in about thirty places across marketing copy, dashboard buttons
 * and legal pages, and changing it meant finding all of them.
 *
 * **These are dollars, not cents.** The API deals in cents (`amountMinor`,
 * `pricePerWebsiteMinor`) and `lib/billing.ts` formats those; this file is the
 * only place that holds a major-unit figure, which is why its formatter is
 * called `usd()` and that one is called `money()`. Two identically-named money
 * formatters with different units is how a bill ends up a hundredfold wrong.
 *
 * This mirrors `packages/shared/src/plans.ts` rather than importing it, for the
 * same reason `lib/dto.ts` re-exports types only: importing that package pulls
 * Zod into the browser bundle for validation the server already does. The two
 * must be changed together.
 */

export type BillingPeriod = "monthly" | "yearly";

/**
 * **The free tier, mirrored: one website, one page.**
 *
 * The API enforces this from `PLANS.free.maxPagesPerProject` and
 * `FREE_WEBSITES` in `packages/shared/src/plans.ts`; these copies exist only so
 * the dashboard can grey out a button before the request is refused. They are
 * a *courtesy*, never the enforcement — if they drift, the API still says no.
 */
export const FREE_PAGES_PER_WEBSITE = 1;
export const FREE_WEBSITES = 1;

/** Dollars per website, per billing period. */
export const PRICE_PER_WEBSITE: Record<BillingPeriod, number> = {
  monthly: 7.99,
  yearly: 79.9,
};

/**
 * Dollars → "$7.99", "$79.90", "$1,598.00".
 *
 * Always two decimals, because $79.90 written as "$79.9" reads like a typo and
 * a price list where some rows have cents and others do not looks broken.
 */
export const usd = (dollars: number): string =>
  `$${dollars.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/** What `websites` sites cost per cycle, as a number. Strictly linear. */
export const priceOf = (websites: number, period: BillingPeriod = "monthly"): number =>
  websites * PRICE_PER_WEBSITE[period];

/** What `websites` sites cost per cycle, formatted: "$7.99", "$15.98". */
export const price = (websites: number, period: BillingPeriod = "monthly"): string =>
  usd(priceOf(websites, period));

/** The headline figure — one website, per month. Used throughout the copy. */
export const ONE_MONTH = price(1, "monthly");

/** One website, per year. */
export const ONE_YEAR = price(1, "yearly");
