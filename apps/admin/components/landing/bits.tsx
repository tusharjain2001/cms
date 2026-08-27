import type { ReactNode } from "react";
import { TODO } from "@/lib/links";

/**
 * The small, repeated pieces of the landing page.
 *
 * Everything here is a server component — this whole site ships no JavaScript
 * beyond what Next needs, because a marketing page has nothing to be
 * interactive about.
 */

/** The 1160px column every band of the page sits in. */
export function Band({
  children,
  id,
  className = "",
}: {
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <section id={id} className={`mx-auto max-w-[1160px] px-5 sm:px-8 ${className}`}>
      {children}
    </section>
  );
}

export function Eyebrow({
  children,
  tone = "accent",
}: {
  children: ReactNode;
  tone?: "accent" | "muted";
}) {
  return (
    <p
      className={`text-[12px] font-semibold tracking-[0.1em] uppercase ${
        tone === "accent" ? "text-accent" : "text-muted"
      }`}
    >
      {children}
    </p>
  );
}

export function H2({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <h2
      className={`text-[30px] leading-[1.15] font-bold tracking-[-1px] sm:text-[38px] ${className}`}
    >
      {children}
    </h2>
  );
}

export function Lede({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`text-[15.5px] leading-[1.6] text-quiet sm:text-[16px] ${className}`}>
      {children}
    </p>
  );
}

type ButtonTone = "primary" | "outline" | "outline-accent";

const BUTTON_TONES: Record<ButtonTone, string> = {
  primary: "bg-accent text-white hover:bg-accent-dark",
  outline: "bg-surface border border-btn text-ink hover:border-btn-hover",
  "outline-accent": "bg-surface border border-accent-line text-ink hover:border-[#94aad9]",
};

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
  return (
    <a
      href={href}
      className={`inline-block rounded-lg px-5 py-3 text-[14.5px] font-semibold transition-colors ${BUTTON_TONES[tone]} ${className}`}
    >
      {children}
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
