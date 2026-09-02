import { ImageResponse } from "next/og";

/**
 * The sharing card, drawn once and reused by every route that wants one.
 *
 * WHY GENERATE IT RATHER THAN SHIP A PNG. A static card would say the same
 * thing on every page, and the pages differ: a link to `/pricing` pasted into
 * a Slack channel should say Pricing. Rendering it here means a new public
 * page gets a correct card by adding four lines, with no trip through a design
 * tool and no 200KB binary in the repo.
 *
 * TWO CONSTRAINTS THIS FILE OBEYS, both of them non-obvious:
 *
 * 1. **No custom font.** Loading Bricolage here would mean fetching a woff
 *    on every card render and shipping the file to the edge. `next/og` has a
 *    perfectly good bundled sans, and a social card is read at thumbnail size
 *    by someone deciding whether to click — the typeface is not what decides
 *    it. (This is the one place the display face is deliberately absent.)
 *
 * 2. **Everything is flexbox with explicit `display`.** Satori — what `next/og`
 *    renders with — implements a subset of CSS and silently drops what it does
 *    not understand. A div with more than one child and no `display: flex`
 *    throws at render time, which shows up as a broken image on someone else's
 *    Twitter rather than as an error anyone here would see.
 */

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

/** The paper, ink and coral of the brand, literal because Satori has no tokens. */
const PAPER = "#f6f5f2";
const INK = "#1b1e24";
const CORAL = "#e8542e";
const CORAL_DEEP = "#8f3d24";
const MY_GREY = "#8b8e96";
const QUIET = "#5c6069";

/** The p+c mark, at the geometry `app/icon.svg` and `components/logo.tsx` share. */
function Mark({ height }: { height: number }) {
  const scale = height / 100;
  return (
    <svg width={114 * scale} height={height} viewBox="0 0 114 100" fill="none">
      <rect width="16" height="100" rx="9" fill={CORAL} />
      <circle cx="34" cy="34" r="26" stroke={CORAL} strokeWidth="16" />
      <path d="M96.5 43A9.5 9.5 0 1 1 106 33.5" stroke={CORAL_DEEP} strokeWidth="16" />
    </svg>
  );
}

export interface OgCardInput {
  /** The big line. Keep it under about 60 characters or it wraps to three. */
  title: string;
  /** One supporting line, or nothing. */
  subtitle?: string;
  /** The small label above the title — "Pricing", "Docs". */
  eyebrow?: string;
}

export function ogCard({ title, subtitle, eyebrow }: OgCardInput) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: PAPER,
          padding: "68px 76px",
          // The press: a coral band down the left edge, the same gesture the
          // landing page's bands make.
          borderLeft: `20px solid ${CORAL}`,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <Mark height={44} />
          <div style={{ display: "flex", fontSize: 34, letterSpacing: "-0.04em" }}>
            <span style={{ color: MY_GREY, fontWeight: 400 }}>my</span>
            <span style={{ color: INK, fontWeight: 700 }}>pagecraft</span>
          </div>
          {eyebrow && (
            <div
              style={{
                display: "flex",
                marginLeft: 8,
                padding: "6px 14px",
                borderRadius: 999,
                background: "#fdf0eb",
                border: `1px solid #f5c9b8`,
                color: "#b93f20",
                fontSize: 22,
                fontWeight: 600,
              }}
            >
              {eyebrow}
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", maxWidth: 900 }}>
          <div
            style={{
              display: "flex",
              fontSize: title.length > 46 ? 62 : 74,
              lineHeight: 1.06,
              fontWeight: 800,
              letterSpacing: "-0.03em",
              color: INK,
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div
              style={{
                display: "flex",
                marginTop: 26,
                fontSize: 30,
                lineHeight: 1.4,
                color: QUIET,
              }}
            >
              {subtitle}
            </div>
          )}
        </div>

        <div style={{ display: "flex", fontSize: 24, color: QUIET, letterSpacing: "-0.01em" }}>
          mypagecraft.com
        </div>
      </div>
    ),
    OG_SIZE
  );
}

/**
 * Every card the site can serve, keyed by the name `pageMeta({ card })` uses.
 *
 * Adding one here and naming it from a page is the whole job — the route at
 * `app/og/[card]` prerenders whatever is in this object.
 */
export const OG_CARDS = {
  default: {
    title: "Your client edits the words. You keep the code.",
    subtitle: "A content-only CMS for websites built in React and Next.js.",
    alt: "Pagecraft — a content-only CMS for React and Next.js websites",
  },
  pricing: {
    eyebrow: "Pricing",
    title: "One price per website, per month",
    subtitle:
      "Every website includes every feature. One free single-page website, no card needed.",
    alt: "Pagecraft pricing — one price per website, per month",
  },
  docs: {
    eyebrow: "Docs",
    title: "Wire a Next.js site to the content API",
    subtitle: "Four endpoints, one SDK, and an MCP server your coding agent can build with.",
    alt: "Pagecraft developer documentation",
  },
  signup: {
    eyebrow: "Free",
    title: "One website, one page, free forever",
    subtitle: "No card, nothing to expire. Upgrade the site you already built when you outgrow it.",
    alt: "Create a free Pagecraft account",
  },
  legal: {
    eyebrow: "Policies",
    title: "Terms, privacy and refunds",
    subtitle: "What we do with your data, and how to get your money back.",
    alt: "Pagecraft policies",
  },
} satisfies Record<string, OgCardInput & { alt: string }>;

export type OgCardName = keyof typeof OG_CARDS;
