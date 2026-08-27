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
  developers: "/#code",

  contact: "mailto:hello@pagecraft.dev",

  // Not written yet.
  docs: TODO,
  sdkReference: TODO,
  selfHosting: TODO,
  github: TODO,
  status: TODO,
  privacy: TODO,
} satisfies Record<string, string>;
