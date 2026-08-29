import type { ReactNode } from "react";
import { TODO } from "@/lib/links";

/**
 * The small, repeated pieces of the marketing site.
 *
 * Everything here is a server component — the marketing pages ship no
 * JavaScript beyond `components/landing/motion.tsx`. The one animated thing in
 * this file, the Eyebrow's optional live dot, is a pure CSS keyframe
 * (`animate-heartbeat`), so it needs no client boundary and is neutralized by
 * the global reduced-motion block.
 *
 * Restyled for the v2 press-and-ink direction (cms-redesign/direction.md §A.4):
 * Press-Blue buttons, a mono display eyebrow, a crushed Bricolage H2, and a
 * `Band` that can declare a stage wash for the M1 stage-light choreography.
 * Every API stays backward-compatible.
 */

/** The stage washes a Band can sit on — drives M1 (`<StageController>`). */
export type Stage = "paper" | "sky" | "butter" | "lilac" | "mint" | "plate";

/**
 * The static, full-bleed background each staged band paints for itself. This is
 * the no-JS / reduced-motion fallback (a finished, multi-colour page); when
 * `<StageController>` is live it zeroes these so the wrapper's cross-fading
 * wash shows through instead. Plate additionally flips text to paper.
 */
const STAGE_BG: Record<Stage, string> = {
  paper: "bg-canvas",
  sky: "bg-wash-sky",
  butter: "bg-wash-butter",
  lilac: "bg-wash-lilac",
  mint: "bg-wash-mint",
  plate: "bg-plate text-canvas",
};

/**
 * The 1160px column every band of the page sits in.
 *
 * With no `stage` it is exactly that column (unchanged). With a `stage` it
 * becomes a full-bleed section carrying that stage's wash, with the column
 * nested inside — `className` still styles the column (padding/spacing), and
 * `data-stage` lets `<StageController>` drive the M1 cross-fade.
 */
export function Band({
  children,
  id,
  stage,
  className = "",
  bg,
}: {
  children: ReactNode;
  id?: string;
  stage?: Stage;
  className?: string;
  /**
   * A full-bleed decorative layer painted behind the column (e.g. drifting
   * `<SectionPapers>`). Positioned against the band, clipped to it, and sitting
   * beneath the content, which is lifted into its own stacking level.
   */
  bg?: ReactNode;
}) {
  const column = `mx-auto max-w-[1160px] px-5 sm:px-8`;

  if (!stage) {
    return (
      <section id={id} className={`${column} ${className}`}>
        {children}
      </section>
    );
  }

  return (
    <section
      id={id}
      data-stage={stage}
      // Clip only when a decorative layer needs containing — an overflow-hidden
      // ancestor would break `position: sticky` inside a band (the press run).
      className={`stage-band relative ${bg ? "overflow-hidden" : ""} ${STAGE_BG[stage]}`}
    >
      {bg}
      <div className={`relative ${column} ${className}`}>{children}</div>
    </section>
  );
}

export function Eyebrow({
  children,
  tone = "accent",
  live = false,
}: {
  children: ReactNode;
  tone?: "accent" | "muted";
  /** Prefix a Live-green heartbeat dot (M10). CSS-only; static under reduced motion. */
  live?: boolean;
}) {
  return (
    <p
      className={`flex items-center gap-2 font-mono text-[12px] font-normal tracking-[0.08em] uppercase ${
        tone === "accent" ? "text-accent" : "text-muted"
      }`}
    >
      {live && (
        <span
          aria-hidden
          className="inline-block h-[7px] w-[7px] shrink-0 rounded-full bg-published animate-heartbeat"
        />
      )}
      <span>{children}</span>
    </p>
  );
}

/** Marketing section heading — the crushed Bricolage display voice (>=32px). */
export function H2({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <h2
      className={`font-display text-[clamp(2.25rem,4.5vw,3.5rem)] font-extrabold leading-[0.92] tracking-[-0.025em] ${className}`}
    >
      {children}
    </h2>
  );
}

export function Lede({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`text-[19px] leading-[1.55] text-quiet sm:text-[20px] ${className}`}>{children}</p>
  );
}

type ButtonTone = "primary" | "outline" | "outline-accent";

/**
 * A marketing call to action.
 *
 * `primary` is a filled Press-Blue stamp that darkens and presses 1px on hover.
 * `outline` / `outline-accent` are ghost buttons: an ink hairline whose fill
 * wipes in from the left on hover (design-4's ink-stamp), inverting the text to
 * paper. Tones kept for backward compatibility.
 */
export function ButtonLink({
  href,
  tone = "primary",
  children,
  className = "",
}: {
  href: string;
  tone?: ButtonTone;
  children: ReactNode;
  className?: string;
}) {
  const base =
    "relative inline-block overflow-hidden rounded-lg px-5 py-3 text-[14.5px] font-semibold transition-[background-color,color,transform] duration-150 active:translate-y-px";

  if (tone === "primary") {
    return (
      <a href={href} className={`${base} bg-accent text-white hover:bg-accent-dark ${className}`}>
        <span className="relative z-10">{children}</span>
      </a>
    );
  }

  // Ghost: ink hairline; ink fill wipes in from the left, text inverts to paper.
  return (
    <a
      href={href}
      className={`${base} border border-ink text-ink hover:text-canvas before:absolute before:inset-0 before:origin-left before:scale-x-0 before:bg-ink before:transition-transform before:duration-150 before:content-[''] hover:before:scale-x-100 ${className}`}
    >
      <span className="relative z-10">{children}</span>
    </a>
  );
}

/**
 * A link whose destination may not exist yet.
 *
 * When `href` is still the TODO sentinel this renders as plain muted text, so
 * the page never ships a link that goes nowhere. Fill the value in
 * `lib/links.ts` and it becomes a real link with no other change.
 *
 * `className` carries only shape — size, weight, borders. Colour and hover
 * belong to this component, because handing it a text colour from outside
 * would leave two competing `text-*` utilities on the placeholder and let
 * stylesheet order decide which one showed.
 */
export function MaybeLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  if (href === TODO) {
    return (
      <span aria-disabled className={`${className} cursor-default text-faint`}>
        {children}
      </span>
    );
  }
  return (
    <a href={href} className={`${className} text-slate hover:text-accent`}>
      {children}
    </a>
  );
}

export function Check({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span aria-hidden className="mt-px shrink-0 text-published">
        ✓
      </span>
      <span className="text-body leading-[1.5] sm:text-[14px]">{children}</span>
    </li>
  );
}

export function Cross({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span aria-hidden className="mt-px shrink-0 text-[13px] text-faint">
        ✕
      </span>
      <span className="text-body leading-[1.5] text-quiet sm:text-[14px]">{children}</span>
    </li>
  );
}

/** The Pagecraft mark, at whatever size the surrounding chrome needs. */
export function Logo({ size = 26 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-[7px] bg-accent font-bold text-white"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}
    >
      P
    </span>
  );
}
