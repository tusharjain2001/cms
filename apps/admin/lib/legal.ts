/**
 * The business behind Pagecraft, in one place.
 *
 * **This is the only file you edit to complete the legal pages.** Terms,
 * Privacy, Refunds and Contact all read from here, so the registered name,
 * address and phone number are written once rather than four times and left to
 * drift apart.
 *
 * WHY THESE PAGES EXIST AT ALL: Razorpay will not verify a website for
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
 * Stands in for a detail only the operator can supply.
 *
 * Anything still set to this renders as a loud inline marker rather than
 * quietly shipping the word "undefined" to a payment provider's reviewer —
 * see `<Fill>` in `components/landing/legal.tsx`. Search the rendered pages
 * for "TO BE FILLED IN" before you submit anything to Razorpay.
 */
export const FILL_ME = "__FILL_ME__" as const;

export const isFilled = (value: string) => value !== FILL_ME && value.trim() !== "";

export const business = {
  /**
   * The legal entity that takes the money — exactly as registered, and exactly
   * as it appears on the Razorpay account and the bank account. A sole
   * proprietor puts their own name here, optionally as "Tushar Jain (sole
   * proprietor), trading as Pagecraft".
   */
  legalName: FILL_ME,

  /** The name customers know. Safe to leave as is. */
  tradingName: "Pagecraft",

  /**
   * The registered/operating address, as one line per array entry. Razorpay's
   * reviewer checks this against your KYC, and Indian consumer rules expect a
   * real, reachable postal address rather than a PO box.
   */
  address: [FILL_ME],

  /**
   * A phone number that a human answers, in international format
   * (+91 XXXXX XXXXX). A Contact page without one is the single most common
   * reason Razorpay sends a website back.
   */
  phone: FILL_ME,

  /** Where support mail actually lands. Must be a mailbox you read. */
  supportEmail: "hello@mypagecraft.com",

  /** Where privacy requests go. The same mailbox is fine for a small operation. */
  privacyEmail: "hello@mypagecraft.com",

  /** GSTIN, if you are registered. Leave as FILL_ME to omit the line entirely. */
  gstin: FILL_ME,

  /**
   * The city whose courts govern disputes — normally where you are registered.
   * "Bengaluru", "Mumbai", "New Delhi".
   */
  jurisdictionCity: FILL_ME,

  country: "India",

  /** Hours a person is actually reachable. Do not promise more than you keep. */
  supportHours: "Monday to Friday, 10:00–18:00 IST",

  /**
   * Bump this whenever you change the wording of any policy page — it is shown
   * on all four, and a policy with a stale date reads as an abandoned one.
   */
  lastUpdated: "30 August 2026",
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
  pricePerWebsiteMonthly: "₹999",
  pricePerWebsiteYearly: "₹9,990",
  currency: "Indian Rupees (INR)",
  maxWebsites: 20,
  /** Kept true by `websiteAllowance()` in packages/shared/src/plans.ts. */
  hasFreeTrial: false,
  /** Days a cancelled account's content stays readable before it may be removed. */
  contentRetentionDays: 30,
} as const;

/**
 * Third parties that necessarily see some customer data, and what each one is
 * for. Mirrors what the code actually calls — see `lib/r2.ts`, `lib/mailer.ts`,
 * `lib/razorpay.ts` and `db.ts`. Add a row here if you add a service; a privacy
 * policy that omits a processor is worse than none.
 */
export const subProcessors = [
  {
    name: "Razorpay Software Private Limited",
    purpose: "Payments and subscriptions",
    data: "Name, email address, payment details you enter on their checkout",
    where: "India",
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
