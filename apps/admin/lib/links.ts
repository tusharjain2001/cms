/**
 * Every destination the landing page points at, in one place.
 *
 * The landing page and the dashboard are one app on one domain, so these are
 * ordinary relative paths — there is no separate marketing site to configure.
 */

/**
 * Stands in for a page that does not exist yet.
 *
 * Anything still marked with this renders as plain muted text instead of a
 * link (see `MaybeLink`), because a footer full of links that go nowhere reads
 * as a broken site. Replace a value here and it silently becomes a real link
 * everywhere it appears — there is no other edit to make.
 */
export const TODO = "" as const;

export const links = {
  signIn: "/login",
  signUp: "/signup",
  pricing: "/pricing",

  /**
   * Anchors on the landing page, written with the leading `/` so they work
   * from the pricing page too. On the landing page itself the path already
   * matches, so the browser still treats these as plain fragment jumps.
   */
  how: "/#how",
  sections: "/#sections",
  owners: "/#owners",
  developers: "/#code",

  docs: "/docs",

  /**
   * The policy pages. A payment provider will not verify a website for payments without
   * all four, so these are load-bearing rather than decorative — see
   * `lib/legal.ts` for the one file that fills in the business details.
   *
   * `contact` is a page rather than a `mailto:` on purpose: a payment
   * provider's reviewer needs to see a postal address and a phone number, and
   * a mail client opening is not evidence of either.
   */
  contact: "/contact",
  terms: "/terms",
  privacy: "/privacy",
  refunds: "/refunds",

  /** The mailbox itself, for the places that genuinely want to open a mail client. */
  contactEmail: "mailto:hello@mypagecraft.com",

  // Not written yet.
  sdkReference: TODO,
  selfHosting: TODO,
  github: TODO,
  status: TODO,
} satisfies Record<string, string>;
