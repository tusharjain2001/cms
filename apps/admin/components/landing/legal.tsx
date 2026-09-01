import type { ReactNode } from "react";
import { SiteFooter } from "./site-footer";
import { SiteNav } from "./site-nav";
import { business, isFilled } from "@/lib/legal";

/**
 * The shell and typography every policy page sits in.
 *
 * Deliberately plainer than the rest of the marketing site: no stages, no
 * print-wipes, no `<Print>`. These are documents — someone reading a refund
 * policy is looking for a fact, not a performance — and skipping
 * `components/landing/motion.tsx` keeps them **server components with zero
 * client JavaScript**, prerendered to static HTML. That matters beyond weight:
 * A payment provider's reviewer and any regulator must be able to read the text with
 * scripts blocked.
 */

/**
 * Renders a detail from `lib/legal.ts`, shouting if it has not been filled in.
 *
 * A blank address on a payments policy is worse than an ugly one: it silently
 * ships "undefined" to the reviewer who decides whether you may take money. So
 * an unfilled value is impossible to miss on the page itself, rather than
 * something you have to remember to check.
 */
export function Fill({ value }: { value: string }) {
  if (isFilled(value)) return <>{value}</>;
  return (
    <mark
      title="Set this in apps/admin/lib/legal.ts before publishing"
      className="rounded bg-draft-bg px-1.5 py-0.5 font-mono text-[0.85em] font-semibold text-draft-ink"
    >
      TO BE FILLED IN
    </mark>
  );
}

export function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-canvas">
      <SiteNav />

      <main className="mx-auto max-w-[760px] px-5 pt-14 pb-20 sm:px-8">
        <header className="border-b border-line pb-8">
          <h1 className="font-display text-[clamp(2.25rem,5vw,3rem)] font-extrabold leading-[0.98] tracking-[-0.025em]">
            {title}
          </h1>
          <p className="mt-4 text-[16px] leading-[1.6] text-quiet">{intro}</p>
          <p className="mt-5 font-mono text-helper tracking-[0.04em] text-muted uppercase">
            Last updated {business.lastUpdated}
          </p>
        </header>

        {/* One column, generous measure. Nested lists and tables inherit the
            same rhythm from the section components below. */}
        <div className="flex flex-col gap-9 pt-9">{children}</div>
      </main>

      <SiteFooter />
    </div>
  );
}

/** One numbered clause. `n` is passed rather than counted so clauses can be cited. */
export function Clause({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={`clause-${n}`} className="scroll-mt-24">
      <h2 className="text-[19px] font-bold tracking-[-0.3px] sm:text-[21px]">
        <span className="mr-2.5 font-mono text-[0.75em] font-semibold text-muted tabular-nums">
          {String(n).padStart(2, "0")}
        </span>
        {title}
      </h2>
      <div className="mt-3 flex flex-col gap-3 text-[15px] leading-[1.65] text-slate">
        {children}
      </div>
    </section>
  );
}

/** A bulleted list inside a clause, styled to match the body rhythm. */
export function Points({ items }: { items: ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-2 pl-1">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span aria-hidden className="mt-[0.55em] h-1 w-1 shrink-0 rounded-full bg-muted" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** A pulled-out statement — used where a clause carries the whole promise. */
export function Highlight({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-accent-line bg-accent-soft px-5 py-4 text-[15px] leading-[1.6] text-slate">
      {children}
    </p>
  );
}
