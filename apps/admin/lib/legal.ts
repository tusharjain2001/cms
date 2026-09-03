import { ONE_MONTH, ONE_YEAR } from "./pricing";

/**
 * The business behind mypagecraft, in one place.
 *
 * **This is the only file you edit to complete the legal pages.** Terms,
 * Privacy, Refunds and Contact all read from here, so the registered name,
 * name and contact details are written once rather than four times and left to
 * drift apart.
 *
 * WHY THESE PAGES EXIST AT ALL: a payment provider will not verify a website for
 * payments without Terms, a Privacy Policy, a Refund/Cancellation Policy, a
 * Contact page carrying a real address and phone number, and public pricing.
 * A missing one of these is the usual reason a verification request bounces.
 *
 * ⚠ **These documents are a careful draft, not legal advice.** They describe
 * what this codebase genuinely does, which is the hard part and the part a
 * template gets wrong — but the commercial terms (the refund window, the
 * liability cap, the governing jurisdiction) are business decisions. Have
 * someone qualified read them before you take real money.
 */

/**
 * Stands in for a detail only the operator can supply. Nothing is set to it
 * any more (everything was either filled in or deliberately omitted on
 * 4 Sep 2026), but it stays as the safety net for any future field.
 *
 * Anything set to this renders as a loud inline marker rather than
 * quietly shipping the word "undefined" to a payment provider's reviewer —
 * see `<Fill>` in `components/landing/legal.tsx`. Search the rendered pages
 * for "TO BE FILLED IN" before you submit anything to a payment provider.
 */
export const FILL_ME = "__FILL_ME__" as const;

export const isFilled = (value: string) => value !== FILL_ME && value.trim() !== "";

export const business = {
  /**
   * Who operates the service, as the policies name them. Decided 4 Sep 2026:
   * the team, not a registered entity or a person's name. If a payment
   * provider's reviewer asks for the registered legal name behind the account,
   * this is the line to change.
   */
  legalName: "mypagecraft team",

  /** The name customers know — the wordmark, lowercase. */
  tradingName: "mypagecraft",

  /**
   * Postal address, one line per array entry. **Deliberately empty** (4 Sep
   * 2026): no address is published. The Contact page and its structured data
   * omit the block entirely when this is empty. Be aware a payment provider's
   * website review usually wants one; add lines here if they ask.
   */
  address: [] as readonly string[],

  /** Where support mail actually lands. Must be a mailbox you read. */
  supportEmail: "mypagecraft01@gmail.com",

  /** Where privacy requests go. The same mailbox is fine for a small operation. */
  privacyEmail: "mypagecraft01@gmail.com",

  /** GSTIN, if registered. Empty omits the line entirely. */
  gstin: "",

  /**
   * The city whose courts govern disputes. Empty means the Terms fall back to
   * "the courts of India" with no city named.
   */
  jurisdictionCity: "",

  country: "India",

  /**
   * Hours a person is actually reading the inbox. There is no phone number —
   * decided 4 Sep 2026 — so these are email hours. Do not promise more than
   * you keep.
   */
  supportHours: "Monday to Friday, 10:00–18:00 IST",

  /**
   * Bump this whenever you change the wording of any policy page — it is shown
   * on all four, and a policy with a stale date reads as an abandoned one.
   */
  lastUpdated: "4 September 2026",
} as const;

/**
 * How quickly a refund request gets an answer, and the goodwill window on a
 * first payment.
 *
 * ⚠ **A business decision, not a technical one.** Seven days is a common,
 * defensible default for software billed monthly and it materially reduces
 * chargebacks — but it is your money. Change the number here and the Refunds
 * page follows.
 */
export const refunds = {
  /** Days after a *first* payment in which a full refund is given on request. */
  firstPaymentWindowDays: 7,
  /** How long a refund takes to reach the customer once approved. */
  settlementDays: "5–7 business days",
  /** How quickly you reply to a refund request. */
  responseTime: "2 working days",
} as const;

/** Everything a customer's money buys, restated so the policies stay accurate. */
export const commercials = {
  pricePerWebsiteMonthly: ONE_MONTH,
  pricePerWebsiteYearly: ONE_YEAR,
  currency: "US Dollars (USD)",
  maxWebsites: 20,
  /**
    * Not a trial — a permanent free tier: one website of one page. Kept true by
    * `FREE_WEBSITES` and `PLANS.free.maxPagesPerProject` in
    * packages/shared/src/plans.ts.
    */
  hasFreeTrial: false,
  freeTier: "one website with one page, free permanently and with no card",
  /** Days a cancelled account's content stays readable before it may be removed. */
  contentRetentionDays: 30,
} as const;

/**
 * Third parties that necessarily see some customer data, and what each one is
 * for. Mirrors what the code actually calls — see `lib/r2.ts`, `lib/mailer.ts`,
 * `lib/dodo.ts` and `db.ts`. Add a row here if you add a service; a privacy
 * policy that omits a processor is worse than none.
 */
export const subProcessors = [
  {
    name: "Dodo Payments",
    /**
     * Not merely a processor: as **merchant of record** Dodo is the seller on
     * the receipt, and the party that collects and remits sales tax. Saying
     * only "payments" would understate its role and mislead a reader trying to
     * work out who they actually bought from.
     */
    purpose: "Merchant of record — checkout, subscriptions, invoicing and sales tax",
    data: "Name, email address, billing country, payment details you enter on their checkout",
    where: "Processed internationally; see their privacy policy",
  },
  {
    name: "MongoDB Atlas",
    purpose: "The database holding accounts and website content",
    data: "Account details and everything you create in the CMS",
    where: "Cloud region chosen for the cluster",
  },
  {
    name: "Cloudflare R2",
    purpose: "Storing and delivering photos and files you upload",
    data: "The files themselves and their filenames",
    where: "Cloudflare's global network",
  },
  {
    name: "Our email provider (SMTP)",
    purpose: "Confirmation, password-reset and billing emails",
    data: "Your name and email address",
    where: "Depends on the mailbox provider configured",
  },
] as const;
