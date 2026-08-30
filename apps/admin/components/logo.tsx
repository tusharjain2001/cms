/**
 * The Pagecraft mark — the p+c ligature.
 *
 * Built from the construction spec on the brand artboard rather than shipped
 * as a PNG, so it stays sharp at every size and re-colours with the theme.
 * Every number below is a ratio of the mark's height H, expressed here in a
 * 114x100 viewBox (H = 100), which is why the aspect ratio is 1.14:
 *
 *   stroke = 0.16H, shared by all three parts
 *   stem   rounded rect on the left edge, 0.16H x H, radius 0.09H
 *   bowl   circle ring in the top-left, outer diameter 0.68H
 *   hook   three-quarter ring on the right, outer diameter 0.35H, top offset
 *          0.16H, its open quadrant facing lower-right (the CSS original cut
 *          the right border and rotated 45 degrees)
 *
 * Rings are drawn as stroked arcs, so `r` here is the centreline radius —
 * outer radius minus half the stroke — not the outer radius from the spec.
 *
 * The mark is always paired with the "Pagecraft" wordmark in the markup
 * around it, so it is decorative and hidden from assistive tech.
 */

/** Centreline geometry, shared by this component and app/icon.svg. */
const STROKE = 16;

type Tone =
  /** Follows the theme: coral on light, lifted coral on dark. */
  | "auto"
  /** Fixed ink treatment, for surfaces that are dark whatever the theme. */
  | "ink"
  /** Single colour from the surrounding text — the hook keeps its shape. */
  | "mono";

const TONES: Record<Tone, { body: string; hook: string }> = {
  auto: { body: "var(--color-brand)", hook: "var(--color-brand-tint)" },
  ink: { body: "var(--color-brand-lift)", hook: "var(--color-brand-deep)" },
  mono: { body: "currentColor", hook: "currentColor" },
};

export function PagecraftMark({
  height = 24,
  tone = "auto",
  className,
}: {
  height?: number;
  tone?: Tone;
  className?: string;
}) {
  const { body, hook } = TONES[tone];

  return (
    <svg
      className={className}
      width={height * 1.14}
      height={height}
      viewBox="0 0 114 100"
      fill="none"
      aria-hidden
      focusable="false"
    >
      {/* stem */}
      <rect x="0" y="0" width={STROKE} height="100" rx="9" fill={body} />
      {/* bowl */}
      <circle cx="34" cy="34" r="26" stroke={body} strokeWidth={STROKE} />
      {/* hook — 270 degrees, open toward the lower right */}
      <path
        d="M96.5 43A9.5 9.5 0 1 1 106 33.5"
        stroke={hook}
        strokeWidth={STROKE}
      />
    </svg>
  );
}

/**
 * Mark + wordmark, the primary lockup. The gap is 0.28H per the spec.
 *
 * The wordmark stays in the site's own display face rather than the
 * artboard's Space Grotesk: swapping the typeface of every "Pagecraft" on the
 * site is a typographic decision well beyond adopting a logo, and Bricolage is
 * already the marketing display voice.
 */
export function PagecraftLockup({
  height = 24,
  tone = "auto",
  wordmark = 18,
  className,
}: {
  height?: number;
  tone?: Tone;
  wordmark?: number;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center ${className ?? ""}`}>
      <PagecraftMark height={height} tone={tone} />
      <span
        className="font-display font-bold tracking-[-0.02em]"
        style={{ fontSize: wordmark, marginLeft: height * 0.28 }}
      >
        Pagecraft
      </span>
    </span>
  );
}
